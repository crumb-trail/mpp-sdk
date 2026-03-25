import type { Address, Hex } from 'viem';

// ── Shared types across protocols ──────────────────────────────────

/**
 * Supported payment protocols
 */
export type PaymentProtocol = 'x402' | 'mpp';

/**
 * Base payment configuration
 */
export interface PaymentConfig {
  /** Private key or viem account */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
}

/**
 * Client configuration for unified PaymentClient
 */
export interface ClientConfig extends PaymentConfig {}

/**
 * Server configuration for unified PaymentServer
 */
export interface ServerConfig extends PaymentConfig {
  /** Recipient address for payments */
  recipient: Address;
  /** Token address */
  asset: Address;
  /** Token decimals */
  decimals: number;
  /** Protocols to support (default: ['x402', 'mpp']) */
  protocols?: PaymentProtocol[];
  /** Sponsor gas for clients */
  feePayer?: boolean;
  /** Challenge/payment timeout in seconds (default: 300) */
  timeoutSeconds?: number;
}

/**
 * Payment splits for complex payment routing
 */
export interface PaymentSplit {
  /** Split recipient address */
  recipient: Address;
  /** Amount in base units */
  amount: string;
  /** Human-readable label */
  memo?: string;
}

// ── Legacy MPP types (keep for backwards compatibility) ────────────

export interface ChargeRequest {
  /** Amount in base units (decimal string) */
  amount: string;
  /** ERC-20 token address */
  currency: Address;
  /** Recipient address */
  recipient: Address;
  /** Human-readable payment description */
  description?: string;
  /** Merchant reference (order ID, invoice number) */
  externalId?: string;
  /** Method-specific details */
  methodDetails: ChargeMethodDetails;
}

export interface ChargeMethodDetails {
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** Use testnet (chain 6343) */
  testnet?: boolean;
  /** Server pays gas (default: false) */
  feePayer?: boolean;
  /** Permit2 contract override */
  permit2Address?: Address;
  /** Payment splits (max 8) */
  splits?: Split[];
}

export interface Split {
  /** Split recipient address */
  recipient: Address;
  /** Amount in base units */
  amount: string;
  /** Human-readable label */
  memo?: string;
}

export type ChargeCredentialPayload =
  | Permit2Payload
  | HashPayload;

export interface Permit2Payload {
  type: 'permit2';
  permit: {
    permitted: {
      token: Address;
      amount: string;
    };
    nonce: string;
    deadline: string;
  };
  witness: {
    to: Address;
    validAfter: string;
  };
  signature: Hex;
}

export interface HashPayload {
  type: 'hash';
  hash: Hex;
}

export interface ChargeCredential {
  challenge: {
    id: string;
    realm: string;
    method: 'megaeth';
    intent: 'charge';
    request: string;
    expires: string;
  };
  payload: ChargeCredentialPayload;
  source?: string;
}

export interface ChargeReceipt {
  method: 'megaeth';
  challengeId: string;
  reference: Hex;
  status: 'success';
  timestamp: string;
  externalId?: string;
}

export interface Challenge {
  id: string;
  realm: string;
  method: 'megaeth';
  intent: 'charge';
  request: ChargeRequest;
  expires: string;
}