import type { ClientConfig } from '../types.js';
import { X402Client } from '../protocols/x402/client.js';
import { MPPClient } from '../protocols/mpp/client.js';

/**
 * Unified payment client that auto-detects x402 vs MPP protocols
 */
export class PaymentClient {
  private x402Client: X402Client;
  private mppClient: MPPClient;

  constructor(config: ClientConfig) {
    if (!config.privateKey) {
      throw new Error('Private key is required for PaymentClient');
    }

    this.x402Client = new X402Client({
      privateKey: config.privateKey,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    });

    this.mppClient = new MPPClient({
      privateKey: config.privateKey,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    });
  }

  /**
   * Get the wallet address
   */
  get address() {
    return this.x402Client.address;
  }

  /**
   * Auto-detecting fetch that handles both x402 and MPP protocols
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    // First request
    const response = await fetch(url, init);

    if (response.status !== 402) {
      return response;
    }

    // Clone response since we might need to read the body
    const clonedResponse = response.clone();

    // Check for MPP (WWW-Authenticate header)
    if (MPPClient.is402(response)) {
      console.debug('Detected MPP protocol');
      return this.mppClient.fetch(url, init);
    }

    // Check for x402 (payment requirements in body)
    try {
      const body = await clonedResponse.json();
      if (body.x402Version || body.accepts || body.paymentRequirements) {
        console.debug('Detected x402 protocol');
        return this.x402Client.fetch(url, init);
      }
    } catch (error) {
      // Body not JSON, might be different error
    }

    // Unknown 402 format
    throw new Error('Unsupported payment protocol in 402 response');
  }

  /**
   * Get the underlying x402 client for advanced usage
   */
  getX402Client(): X402Client {
    return this.x402Client;
  }

  /**
   * Get the underlying MPP client for advanced usage
   */
  getMPPClient(): MPPClient {
    return this.mppClient;
  }
}