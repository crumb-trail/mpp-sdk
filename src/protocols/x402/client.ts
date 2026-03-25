import {
  createWalletClient,
  http,
  type Account,
  type Address,
  type Hex,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type {
  X402ClientConfig,
  X402PaymentRequired,
  X402PaymentRequirements,
  X402PaymentPayload,
} from './types.js';
import { CHAIN_IDS, X402_EXACT_PROXY } from '../../constants.js';
import { buildPermit2TypedData } from '../../utils/permit2.js';
import { getChain } from '../../utils/chain.js';

export class X402Client {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private chainId: number;

  constructor(options: X402ClientConfig) {
    this.chainId = options.chainId ?? CHAIN_IDS.mainnet;
    const chain = getChain(this.chainId);

    if (!options.privateKey) {
      throw new Error('Private key is required for x402 client');
    }

    const account = privateKeyToAccount(options.privateKey);
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(options.rpcUrl),
    });
  }

  get address(): Address {
    return this.walletClient.account.address;
  }

  /**
   * Detect if a 402 response contains x402 payment requirements
   */
  static is402(response: Response): boolean {
    return response.status === 402;
  }

  /**
   * Parse x402 payment requirements from 402 response body
   */
  static async parsePaymentRequired(response: Response): Promise<X402PaymentRequired> {
    if (!X402Client.is402(response)) {
      throw new Error('Response is not a 402 Payment Required');
    }

    const body = await response.json();
    
    // Check for x402 format
    if (body.x402Version && body.accepts) {
      return body as X402PaymentRequired;
    }

    // Legacy format compatibility  
    if (body.paymentRequirements) {
      const req = Array.isArray(body.paymentRequirements) 
        ? body.paymentRequirements[0] 
        : body.paymentRequirements;

      return {
        x402Version: 2,
        resource: { url: response.url },
        accepts: [req],
      };
    }

    throw new Error('Invalid x402 response format');
  }

  /**
   * Create payment payload for x402 requirements
   */
  async createPayment(requirements: X402PaymentRequirements): Promise<X402PaymentPayload> {
    const amount = BigInt(requirements.amount);
    const nonce = BigInt(Date.now());
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + requirements.maxTimeoutSeconds
    );

    // Use exact proxy for now (could also support upto)
    const typedData = buildPermit2TypedData({
      token: requirements.asset as Address,
      amount,
      spender: X402_EXACT_PROXY,
      nonce,
      deadline,
      to: requirements.payTo as Address,
      validAfter: 0n,
      chainId: this.chainId,
    });

    const signature = await this.walletClient.signTypedData(typedData);

    return {
      x402Version: 2,
      accepted: requirements,
      payload: {
        signature,
        permit: {
          permitted: {
            token: requirements.asset,
            amount: amount.toString(),
          },
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        },
        witness: {
          to: requirements.payTo,
          validAfter: '0',
        },
        owner: this.address,
      },
    };
  }

  /**
   * Make a payment and retry the original request
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    // First request
    const response = await fetch(url, init);

    if (!X402Client.is402(response)) {
      return response;
    }

    // Parse payment requirements
    const paymentRequired = await X402Client.parsePaymentRequired(response);
    
    if (paymentRequired.accepts.length === 0) {
      throw new Error('No payment methods available');
    }

    // Use first available payment method
    const requirements = paymentRequired.accepts[0];
    
    // Create payment
    const payment = await this.createPayment(requirements);

    // Retry with payment
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    
    return fetch(url, {
      ...init,
      method: 'POST',
      headers,
      body: JSON.stringify(payment),
    });
  }
}