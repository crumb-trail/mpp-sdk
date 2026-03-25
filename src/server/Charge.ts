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
  ChargeRequest,
  ChargeCredential,
  ChargeReceipt,
  Permit2Payload,
  ServerConfig,
} from '../types.js';
import { CHAIN_IDS, EXACT_PROXY, PERMIT2 } from '../constants.js';
import { EXACT_PROXY_ABI } from '../utils/permit2.js';
import { encodeRequest, decodeRequest } from '../utils/encoding.js';
import { getChain } from '../utils/chain.js';

// ── ERC-20 ABI fragments ──────────────────────────────────────────

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ── Server configuration ───────────────────────────────────────────

export interface ChargeServerOptions {
  /** Private key for the settlement hot wallet */
  privateKey: Hex;
  /** Recipient address for payments */
  recipient: Address;
  /** Token address */
  asset: Address;
  /** Token decimals (for display/validation) */
  decimals: number;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
  /** Sponsor gas for clients (default: true) */
  feePayer?: boolean;
  /** Challenge expiry in seconds (default: 300) */
  challengeTimeoutSeconds?: number;
}

export class ChargeServer {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;
  private config: Required<
    Pick<
      ChargeServerOptions,
      'recipient' | 'asset' | 'decimals' | 'chainId' | 'feePayer' | 'challengeTimeoutSeconds'
    >
  >;

  // Track consumed tx hashes to prevent replay
  private consumedHashes = new Set<string>();

  constructor(options: ChargeServerOptions) {
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
      challengeTimeoutSeconds: options.challengeTimeoutSeconds ?? 300,
    };
  }

  /**
   * Create a 402 challenge for a charge request.
   */
  createChallenge(
    amount: string,
    options?: {
      realm?: string;
      description?: string;
      externalId?: string;
      splits?: Array<{ recipient: Address; amount: string; memo?: string }>;
    }
  ) {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 22);
    const expires = new Date(
      Date.now() + this.config.challengeTimeoutSeconds * 1000
    ).toISOString();

    const request: ChargeRequest = {
      amount,
      currency: this.config.asset,
      recipient: this.config.recipient,
      description: options?.description,
      externalId: options?.externalId,
      methodDetails: {
        chainId: this.config.chainId,
        feePayer: this.config.feePayer,
        splits: options?.splits,
      },
    };

    const requestEncoded = encodeRequest(request);

    // WWW-Authenticate header value
    const wwwAuthenticate = [
      `Payment id="${id}"`,
      `realm="${options?.realm ?? 'megaeth'}"`,
      `method="megaeth"`,
      `intent="charge"`,
      `request="${requestEncoded}"`,
      `expires="${expires}"`,
    ].join(', ');

    return {
      id,
      request,
      requestEncoded,
      expires,
      wwwAuthenticate,
      statusCode: 402 as const,
      headers: {
        'WWW-Authenticate': wwwAuthenticate,
        'Cache-Control': 'no-store',
      },
    };
  }

  /**
   * Verify and settle a charge credential.
   *
   * @returns Receipt on success, or throws on failure.
   */
  async settle(credential: ChargeCredential): Promise<ChargeReceipt> {
    const { challenge, payload } = credential;

    // Decode and validate challenge request
    const request = decodeRequest<ChargeRequest>(challenge.request);

    // Check expiry
    if (new Date(challenge.expires) < new Date()) {
      throw new ChargeError('challenge-expired', 'Challenge has expired');
    }

    // Validate request matches our config
    if (request.currency.toLowerCase() !== this.config.asset.toLowerCase()) {
      throw new ChargeError('asset-mismatch', 'Token address mismatch');
    }
    if (request.recipient.toLowerCase() !== this.config.recipient.toLowerCase()) {
      throw new ChargeError('recipient-mismatch', 'Recipient address mismatch');
    }

    if (payload.type === 'permit2') {
      return this.settlePermit2(challenge.id, request, payload, credential.source);
    } else if (payload.type === 'hash') {
      return this.settleHash(challenge.id, request, payload.hash);
    }

    throw new ChargeError('unknown-payload-type', `Unknown payload type`);
  }

  private async settlePermit2(
    challengeId: string,
    request: ChargeRequest,
    payload: Permit2Payload,
    source?: string
  ): Promise<ChargeReceipt> {
    const { permit, witness, signature } = payload;

    // Verify amounts match
    if (permit.permitted.amount !== request.amount) {
      throw new ChargeError(
        'amount-mismatch',
        'Permit amount does not match challenge'
      );
    }

    // Verify recipient matches
    if (witness.to.toLowerCase() !== request.recipient.toLowerCase()) {
      throw new ChargeError(
        'recipient-mismatch',
        'Witness recipient does not match challenge'
      );
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
    try {
      await this.publicClient.simulateContract({
        address: EXACT_PROXY,
        abi: EXACT_PROXY_ABI,
        functionName: 'settle',
        args: settleArgs,
        account: this.walletClient.account,
      });
    } catch (err: any) {
      throw new ChargeError(
        'simulation-failed',
        `Transaction simulation failed: ${err.message}`
      );
    }

    // Submit settlement tx
    const hash = await this.walletClient.writeContract({
      address: EXACT_PROXY,
      abi: EXACT_PROXY_ABI,
      functionName: 'settle',
      args: settleArgs,
    });

    // Wait for receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    if (receipt.status !== 'success') {
      throw new ChargeError(
        'settlement-failed',
        'Settlement transaction reverted'
      );
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

  private async settleHash(
    challengeId: string,
    request: ChargeRequest,
    hash: Hex
  ): Promise<ChargeReceipt> {
    // Prevent replay
    if (this.consumedHashes.has(hash)) {
      throw new ChargeError('hash-consumed', 'Transaction hash already used');
    }

    // Fetch both tx and receipt
    const [tx, receipt] = await Promise.all([
      this.publicClient.getTransaction({ hash }),
      this.publicClient.getTransactionReceipt({ hash }),
    ]);

    if (!receipt || receipt.status !== 'success') {
      throw new ChargeError(
        'hash-verification-failed',
        'Transaction not found or failed'
      );
    }

    // Mark as consumed
    this.consumedHashes.add(hash);

    return {
      method: 'megaeth',
      challengeId,
      reference: hash,
      status: 'success',
      timestamp: new Date().toISOString(),
      externalId: request.externalId,
    };
  }
}

export class ChargeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ChargeError';
  }
}
