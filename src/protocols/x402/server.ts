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
  X402ServerConfig,
  X402PaymentRequired,
  X402PaymentRequirements,
  X402PaymentPayload,
} from './types.js';
import { CHAIN_IDS, X402_EXACT_PROXY } from '../../constants.js';
import { EXACT_PROXY_ABI } from '../../utils/permit2.js';
import { getChain } from '../../utils/chain.js';

export class X402Server {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private publicClient: PublicClient;
  private config: Required<
    Pick<
      X402ServerConfig,
      'recipient' | 'asset' | 'decimals' | 'chainId' | 'feePayer' | 'timeoutSeconds'
    >
  >;

  constructor(options: X402ServerConfig) {
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
   * Create x402 PaymentRequired response
   */
  createPaymentRequired(
    amount: string,
    options?: {
      description?: string;
      url?: string;
      scheme?: 'exact' | 'upto';
    }
  ): {
    statusCode: 402;
    headers: Record<string, string>;
    body: X402PaymentRequired;
  } {
    const scheme = options?.scheme ?? 'exact';
    const url = options?.url ?? 'https://api.example.com/resource';

    const requirements: X402PaymentRequirements = {
      scheme,
      network: `eip155:${this.config.chainId}`,
      asset: this.config.asset,
      amount,
      payTo: this.config.recipient,
      maxTimeoutSeconds: this.config.timeoutSeconds,
      extra: {
        feePayer: this.config.feePayer,
      },
    };

    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url,
        description: options?.description,
      },
      accepts: [requirements],
    };

    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: paymentRequired,
    };
  }

  /**
   * Verify and settle an x402 payment
   */
  async settlePayment(payment: X402PaymentPayload): Promise<{
    success: boolean;
    transactionHash: Hex;
    error?: string;
  }> {
    try {
      const { accepted, payload } = payment;

      // Verify payment matches our requirements
      if (accepted.asset.toLowerCase() !== this.config.asset.toLowerCase()) {
        throw new Error('Asset mismatch');
      }

      if (accepted.payTo.toLowerCase() !== this.config.recipient.toLowerCase()) {
        throw new Error('Recipient mismatch');
      }

      // Prepare settlement arguments
      const settleArgs = [
        {
          permitted: {
            token: payload.permit.permitted.token as Address,
            amount: BigInt(payload.permit.permitted.amount),
          },
          nonce: BigInt(payload.permit.nonce),
          deadline: BigInt(payload.permit.deadline),
        },
        payload.owner as Address,
        {
          to: payload.witness.to as Address,
          validAfter: BigInt(payload.witness.validAfter),
        },
        payload.signature as Hex,
      ] as const;

      // Simulate transaction
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
        throw new Error('Transaction reverted');
      }

      return {
        success: true,
        transactionHash: hash,
      };
    } catch (error: any) {
      return {
        success: false,
        transactionHash: '0x' as Hex,
        error: error.message,
      };
    }
  }

  /**
   * Express.js middleware for handling x402 payments
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      // Check if this is a payment attempt
      if (req.method === 'POST' && req.body?.x402Version) {
        const payment = req.body as X402PaymentPayload;
        const result = await this.settlePayment(payment);

        if (result.success) {
          // Payment successful, continue to protected resource
          req.paymentResult = result;
          return next();
        } else {
          // Payment failed
          return res.status(402).json({
            x402Version: 2,
            error: result.error,
          });
        }
      }

      // No payment attempt, require payment
      const amount = req.query.amount || req.body?.amount;
      if (!amount) {
        return res.status(400).json({ error: 'Amount required' });
      }

      const paymentRequired = this.createPaymentRequired(amount, {
        url: req.originalUrl || req.url,
        description: req.query.description,
      });

      return res.status(402).json(paymentRequired.body);
    };
  }
}