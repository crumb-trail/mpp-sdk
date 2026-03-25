import type { Address, Hex } from 'viem';

// ── Request (server → client in 402 challenge) ─────────────────────

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

// ── Credential payload (client → server in Authorization header) ───

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

// ── Credential (full Authorization header content) ─────────────────

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

// ── Receipt (server → client after settlement) ─────────────────────

export interface ChargeReceipt {
  method: 'megaeth';
  challengeId: string;
  reference: Hex;
  status: 'success';
  timestamp: string;
  externalId?: string;
}

// ── Challenge (402 response) ───────────────────────────────────────

export interface Challenge {
  id: string;
  realm: string;
  method: 'megaeth';
  intent: 'charge';
  request: ChargeRequest;
  expires: string;
}

// ── SDK configuration ──────────────────────────────────────────────

export interface ServerConfig {
  /** Private key or viem account for submitting settlement txs */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
  /** Recipient address for payments */
  recipient: Address;
  /** Token address */
  asset: Address;
  /** Token decimals */
  decimals: number;
  /** Sponsor gas for clients */
  feePayer?: boolean;
}

export interface ClientConfig {
  /** Private key or viem account for signing Permit2 messages */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
}
