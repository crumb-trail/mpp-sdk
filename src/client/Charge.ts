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
  Challenge,
  ChargeCredential,
  ClientConfig,
  Permit2Payload,
} from '../types.js';
import { CHAIN_IDS, EXACT_PROXY } from '../constants.js';
import { buildPermit2TypedData } from '../utils/permit2.js';
import { base64urlEncode, encodeRequest } from '../utils/encoding.js';
import { getChain } from '../utils/chain.js';

export interface ChargeClientOptions {
  /** viem WalletClient (takes precedence over privateKey) */
  walletClient?: WalletClient<Transport, Chain, Account>;
  /** Private key hex (used if walletClient not provided) */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
}

export class ChargeClient {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private chainId: number;

  constructor(options: ChargeClientOptions) {
    this.chainId = options.chainId ?? CHAIN_IDS.mainnet;
    const chain = getChain(this.chainId);

    if (options.walletClient) {
      this.walletClient = options.walletClient;
    } else if (options.privateKey) {
      const account = privateKeyToAccount(options.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain,
        transport: http(options.rpcUrl),
      });
    } else {
      throw new Error('Either walletClient or privateKey is required');
    }
  }

  get address(): Address {
    return this.walletClient.account.address;
  }

  /**
   * Sign a Permit2 authorization for a charge challenge.
   *
   * @returns A ChargeCredential ready to send in the Authorization header.
   */
  async sign(challenge: Challenge): Promise<ChargeCredential> {
    const { request } = challenge;
    const amount = BigInt(request.amount);
    const nonce = BigInt(Date.now());
    const deadline = BigInt(
      Math.floor(new Date(challenge.expires).getTime() / 1000)
    );

    const typedData = buildPermit2TypedData({
      token: request.currency,
      amount,
      spender: EXACT_PROXY,
      nonce,
      deadline,
      to: request.recipient,
      validAfter: 0n,
      chainId: this.chainId,
    });

    const signature = await this.walletClient.signTypedData(typedData);

    const payload: Permit2Payload = {
      type: 'permit2',
      permit: {
        permitted: {
          token: request.currency,
          amount: amount.toString(),
        },
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      witness: {
        to: request.recipient,
        validAfter: '0',
      },
      signature,
    };

    return {
      challenge: {
        id: challenge.id,
        realm: challenge.realm,
        method: 'megaeth',
        intent: 'charge',
        request: encodeRequest(request),
        expires: challenge.expires,
      },
      payload,
      source: `did:pkh:eip155:${this.chainId}:${this.address}`,
    };
  }

  /**
   * Fetch a resource, automatically handling 402 payment challenges.
   *
   * @param url - The protected resource URL
   * @param init - Additional fetch options
   * @returns The response (after payment if required)
   */
  async fetch(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    // First request
    let response = await fetch(url, init);

    if (response.status !== 402) {
      return response;
    }

    // Parse challenge from 402
    const body = await response.json();
    const challenge = this.parseChallenge(body, url);

    // Sign and retry
    const credential = await this.sign(challenge);
    const credentialEncoded = base64urlEncode(
      JSON.stringify(credential)
    );

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Payment ${credentialEncoded}`);

    return fetch(url, { ...init, headers });
  }

  private parseChallenge(body: any, url: string): Challenge {
    // Support both MPP format and simple paymentRequirements
    if (body.paymentRequirements) {
      const req = Array.isArray(body.paymentRequirements)
        ? body.paymentRequirements[0]
        : body.paymentRequirements;

      return {
        id: req.id ?? crypto.randomUUID(),
        realm: new URL(url).host,
        method: 'megaeth',
        intent: 'charge',
        request: {
          amount: req.maxAmountRequired ?? req.amount,
          currency: req.asset ?? req.currency,
          recipient: req.payTo ?? req.recipient,
          description: req.description,
          externalId: req.externalId,
          methodDetails: req.methodDetails ?? {
            chainId: this.chainId,
          },
        },
        expires:
          req.expires ??
          new Date(
            Date.now() + (req.maxTimeoutSeconds ?? 300) * 1000
          ).toISOString(),
      };
    }

    throw new Error('Unable to parse 402 challenge');
  }
}
