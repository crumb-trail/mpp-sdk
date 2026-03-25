import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type {
  MPPServerConfig,
  MPPChallenge,
  MPPCredential,
  MPPChargeRequest,
  MPPPermit2Payload,
  MPPReceipt,
} from './types.js';
import { CHAIN_IDS, X402_EXACT_PROXY } from '../../constants.js';
import { EXACT_PROXY_ABI } from '../../utils/permit2.js';
import { encodeRequest, base64urlDecode } from '../../utils/encoding.js';
import { getChain } from '../../utils/chain.js';

export class MPPServer {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;
  private config: Required<
    Pick<
      MPPServerConfig,
      'recipient' | 'asset' | 'decimals' | 'chainId' | 'feePayer' | 'timeoutSeconds'
    >
  >;

  constructor(options: MPPServerConfig) {
    const chainId = options.chainId ?? CHAIN_IDS.mainnet;
    const chain = getChain(chainId);
    const account = privateKeyToAccount(options.privateKey);

    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(options.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(options.rpcUrl),
    });

    this.config = {
      recipient: options.recipient,
      asset: options.asset,
      decimals: options.decimals,
      chainId,
      feePayer: options.feePayer ?? true,
      timeoutSeconds: options.timeoutSeconds ?? 300,
    };
  }

  /**
   * Create MPP payment challenge
   */
  createChallenge(
    amount: string,
    options?: {
      realm?: string;
      description?: string;
      externalId?: string;
    }
  ): {
    statusCode: 402;
    headers: Record<string, string>;
    challenge: MPPChallenge;
  } {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 22);
    const expires = new Date(
      Date.now() + this.config.timeoutSeconds * 1000
    ).toISOString();
    const realm = options?.realm ?? 'megaeth';

    const chargeRequest: MPPChargeRequest = {
      amount,
      currency: this.config.asset,
      recipient: this.config.recipient,
      description: options?.description,
      externalId: options?.externalId,
      methodDetails: {
        chainId: this.config.chainId,
        feePayer: this.config.feePayer,
      },
    };

    const requestEncoded = encodeRequest(chargeRequest);

    // Build WWW-Authenticate header
    const wwwAuthenticate = [
      `Payment id="${id}"`,
      `realm="${realm}"`,
      `method="megaeth"`,
      `intent="charge"`,
      `request="${requestEncoded}"`,
      `expires="${expires}"`,
    ].join(', ');

    const challenge: MPPChallenge = {
      id,
      realm,
      method: 'megaeth',
      intent: 'charge',
      request: requestEncoded,
      expires,
    };

    return {
      statusCode: 402,
      headers: {
        'WWW-Authenticate': wwwAuthenticate,
        'Cache-Control': 'no-store',
      },
      challenge,
    };
  }

  /**
   * Verify and settle MPP credential
   */
  async settleCredential(credential: MPPCredential): Promise<MPPReceipt> {
    const { challenge, payload } = credential;

    // Decode challenge request
    const requestData = base64urlDecode(challenge.request);
    const chargeRequest: MPPChargeRequest = JSON.parse(requestData);

    // Check expiry
    if (new Date(challenge.expires) < new Date()) {
      throw new Error('Challenge has expired');
    }

    // Verify request matches our config
    if (chargeRequest.currency.toLowerCase() !== this.config.asset.toLowerCase()) {
      throw new Error('Asset mismatch');
    }

    if (chargeRequest.recipient.toLowerCase() !== this.config.recipient.toLowerCase()) {
      throw new Error('Recipient mismatch');
    }

    if (payload.type !== 'permit2') {
      throw new Error('Only permit2 payload supported');
    }

    return this.settlePermit2(challenge.id, chargeRequest, payload, credential.source);
  }

  private async settlePermit2(
    challengeId: string,
    request: MPPChargeRequest,
    payload: MPPPermit2Payload,
    source?: string
  ): Promise<MPPReceipt> {
    const { permit, witness, signature } = payload;

    // Verify amounts match
    if (permit.permitted.amount !== request.amount) {
      throw new Error('Permit amount does not match challenge');
    }

    // Verify recipient matches
    if (witness.to.toLowerCase() !== request.recipient.toLowerCase()) {
      throw new Error('Witness recipient does not match challenge');
    }

    // Extract owner from DID source
    const owner = source
      ? (source.split(':').pop() as Address)
      : ('0x0000000000000000000000000000000000000000' as Address);

    const settleArgs = [
      {
        permitted: {
          token: permit.permitted.token,
          amount: BigInt(permit.permitted.amount),
        },
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      },
      owner,
      {
        to: witness.to,
        validAfter: BigInt(witness.validAfter),
      },
      signature,
    ] as const;

    // Simulate before submitting
    await this.publicClient.simulateContract({
      address: X402_EXACT_PROXY,
      abi: EXACT_PROXY_ABI,
      functionName: 'settle',
      args: settleArgs,
      account: this.walletClient.account,
    });

    // Execute settlement
    const hash = await this.walletClient.writeContract({
      address: X402_EXACT_PROXY,
      abi: EXACT_PROXY_ABI,
      functionName: 'settle',
      args: settleArgs,
    });

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    if (receipt.status !== 'success') {
      throw new Error('Settlement transaction reverted');
    }

    return {
      method: 'megaeth',
      challengeId,
      reference: hash,
      status: 'success',
      timestamp: new Date().toISOString(),
      externalId: request.externalId,
    };
  }

  /**
   * Express.js middleware for handling MPP payments
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      
      // Check if this is a payment attempt
      if (authHeader && authHeader.startsWith('Payment ')) {
        try {
          const credentialEncoded = authHeader.substring(8); // Remove 'Payment '
          const credentialData = base64urlDecode(credentialEncoded);
          const credential: MPPCredential = JSON.parse(credentialData);
          
          const receipt = await this.settleCredential(credential);
          
          // Payment successful, continue to protected resource
          req.paymentReceipt = receipt;
          return next();
        } catch (error: any) {
          // Payment failed
          return res.status(402).json({
            error: error.message,
          });
        }
      }

      // No payment attempt, require payment
      const amount = req.query.amount || req.body?.amount;
      if (!amount) {
        return res.status(400).json({ error: 'Amount required' });
      }

      const { statusCode, headers } = this.createChallenge(amount, {
        description: req.query.description,
      });

      return res.status(statusCode).set(headers).json({
        error: 'Payment required',
      });
    };
  }
}