import type { Address, Hex } from 'viem';

// ── x402 Protocol Types (based on Coinbase SDK) ───────────────────

/**
 * x402 Payment requirements in 402 response body
 */
export interface X402PaymentRequirements {
  /** Payment scheme: "exact" or "upto" */
  scheme: string;
  /** Network identifier in CAIP-2 format (e.g. "eip155:4326") */
  network: string;
  /** Token contract address */
  asset: string;
  /** Amount in base units (decimal string) */
  amount: string;
  /** Recipient address */
  payTo: string;
  /** Maximum timeout in seconds */
  maxTimeoutSeconds: number;
  /** Additional protocol-specific data */
  extra: Record<string, unknown>;
}

/**
 * x402 PaymentRequired response (full 402 response body)
 */
export interface X402PaymentRequired {
  /** x402 protocol version (should be 2) */
  x402Version: number;
  /** Error message if payment failed */
  error?: string;
  /** Resource information */
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  /** Array of acceptable payment methods */
  accepts: X402PaymentRequirements[];
  /** Protocol extensions */
  extensions?: Record<string, unknown>;
}

/**
 * x402 Payment payload sent by client
 */
export interface X402PaymentPayload {
  /** x402 protocol version */
  x402Version: number;
  /** Resource reference (optional) */
  resource?: {
    url: string;
  };
  /** Selected payment requirements from accepts array */
  accepted: X402PaymentRequirements;
  /** Payment proof data */
  payload: {
    /** Permit2 signature */
    signature: string;
    /** Permit2 permit data */
    permit: {
      permitted: {
        token: string;
        amount: string;
      };
      nonce: string;
      deadline: string;
    };
    /** Permit2 witness data */
    witness: {
      to: string;
      validAfter: string;
    };
    /** Permit owner address */
    owner: string;
  };
}

/**
 * x402 client configuration
 */
export interface X402ClientConfig {
  /** Private key for signing */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
}

/**
 * x402 server configuration
 */
export interface X402ServerConfig {
  /** Private key for settlement */
  privateKey: Hex;
  /** Recipient address */
  recipient: Address;
  /** Token address */
  asset: Address;
  /** Token decimals */
  decimals: number;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
  /** Sponsor gas for clients */
  feePayer?: boolean;
  /** Payment timeout in seconds */
  timeoutSeconds?: number;
}