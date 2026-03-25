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
  MPPClientConfig,
  MPPChallenge,
  MPPCredential,
  MPPChargeRequest,
  MPPPermit2Payload,
} from './types.js';
import { CHAIN_IDS, X402_EXACT_PROXY } from '../../constants.js';
import { buildPermit2TypedData } from '../../utils/permit2.js';
import { base64urlEncode, base64urlDecode, encodeRequest } from '../../utils/encoding.js';
import { getChain } from '../../utils/chain.js';

export class MPPClient {
  private walletClient: WalletClient<Transport, Chain, Account>;
  private chainId: number;

  constructor(options: MPPClientConfig) {
    this.chainId = options.chainId ?? CHAIN_IDS.mainnet;
    const chain = getChain(this.chainId);

    if (!options.privateKey) {
      throw new Error('Private key is required for MPP client');
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
   * Detect if a 402 response contains MPP challenge
   */
  static is402(response: Response): boolean {
    return response.status === 402 && response.headers.has('WWW-Authenticate');
  }

  /**
   * Parse MPP challenge from WWW-Authenticate header
   */
  static parseChallenge(response: Response): MPPChallenge {
    if (!MPPClient.is402(response)) {
      throw new Error('Response is not a 402 with WWW-Authenticate header');
    }

    const authHeader = response.headers.get('WWW-Authenticate');
    if (!authHeader || !authHeader.startsWith('Payment ')) {
      throw new Error('Invalid WWW-Authenticate header');
    }

    // Parse challenge parameters
    const params = new Map<string, string>();
    const paramStr = authHeader.substring(8); // Remove 'Payment '
    
    // Simple parser for key="value" pairs
    const matches = paramStr.matchAll(/(\w+)="([^"]+)"/g);
    for (const [, key, value] of matches) {
      params.set(key, value);
    }

    const id = params.get('id');
    const realm = params.get('realm');
    const method = params.get('method');
    const intent = params.get('intent');
    const request = params.get('request');
    const expires = params.get('expires');

    if (!id || !realm || !method || !intent || !request || !expires) {
      throw new Error('Missing required challenge parameters');
    }

    return { id, realm, method: method as 'megaeth', intent: intent as 'charge', request, expires };
  }

  /**
   * Sign MPP challenge
   */
  async signChallenge(challenge: MPPChallenge): Promise<MPPCredential> {
    // Decode the charge request
    const requestData = base64urlDecode(challenge.request);
    const chargeRequest: MPPChargeRequest = JSON.parse(requestData);

    const amount = BigInt(chargeRequest.amount);
    const nonce = BigInt(Date.now());
    const deadline = BigInt(
      Math.floor(new Date(challenge.expires).getTime() / 1000)
    );

    // Sign Permit2
    const typedData = buildPermit2TypedData({
      token: chargeRequest.currency,
      amount,
      spender: X402_EXACT_PROXY,
      nonce,
      deadline,
      to: chargeRequest.recipient,
      validAfter: 0n,
      chainId: this.chainId,
    });

    const signature = await this.walletClient.signTypedData(typedData);

    const payload: MPPPermit2Payload = {
      type: 'permit2',
      permit: {
        permitted: {
          token: chargeRequest.currency,
          amount: amount.toString(),
        },
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      witness: {
        to: chargeRequest.recipient,
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
        request: challenge.request,
        expires: challenge.expires,
      },
      payload,
      source: `did:pkh:eip155:${this.chainId}:${this.address}`,
    };
  }

  /**
   * Fetch with automatic MPP payment handling
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    // First request
    const response = await fetch(url, init);

    if (!MPPClient.is402(response)) {
      return response;
    }

    // Parse MPP challenge
    const challenge = MPPClient.parseChallenge(response);
    
    // Sign challenge
    const credential = await this.signChallenge(challenge);
    
    // Encode credential
    const credentialEncoded = base64urlEncode(JSON.stringify(credential));

    // Retry with authorization
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Payment ${credentialEncoded}`);

    return fetch(url, { ...init, headers });
  }
}