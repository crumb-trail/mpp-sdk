import type { Address, Hex } from 'viem';

// ── MPP Protocol Types ─────────────────────────────────────────────

/**
 * MPP Payment challenge (from WWW-Authenticate header)
 */
export interface MPPChallenge {
  /** Challenge ID */
  id: string;
  /** Realm identifier */
  realm: string;
  /** Payment method */
  method: 'megaeth';
  /** Payment intent */
  intent: 'charge';
  /** Base64url-encoded charge request */
  request: string;
  /** Challenge expiry timestamp */
  expires: string;
}

/**
 * MPP Credential (Authorization header content)
 */
export interface MPPCredential {
  /** Challenge data copied from WWW-Authenticate */
  challenge: {
    id: string;
    realm: string;
    method: 'megaeth';
    intent: 'charge';
    request: string;
    expires: string;
  };
  /** Payment proof payload */
  payload: MPPCredentialPayload;
  /** Source identifier (DID) */
  source?: string;
}

/**
 * MPP Credential payload types
 */
export type MPPCredentialPayload = MPPPermit2Payload | MPPHashPayload;

/**
 * MPP Permit2 payload
 */
export interface MPPPermit2Payload {
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

/**
 * MPP Hash payload (pre-paid transaction)
 */
export interface MPPHashPayload {
  type: 'hash';
  hash: Hex;
}

/**
 * MPP Payment receipt
 */
export interface MPPReceipt {
  method: 'megaeth';
  challengeId: string;
  reference: Hex;
  status: 'success';
  timestamp: string;
  externalId?: string;
}

/**
 * MPP Charge request (decoded from challenge.request)
 */
export interface MPPChargeRequest {
  /** Amount in base units */
  amount: string;
  /** Token address */
  currency: Address;
  /** Recipient address */
  recipient: Address;
  /** Payment description */
  description?: string;
  /** External reference ID */
  externalId?: string;
  /** Method-specific details */
  methodDetails: MPPChargeMethodDetails;
}

/**
 * MPP Method details
 */
export interface MPPChargeMethodDetails {
  /** Chain ID */
  chainId?: number;
  /** Use testnet */
  testnet?: boolean;
  /** Server pays gas */
  feePayer?: boolean;
  /** Permit2 contract override */
  permit2Address?: Address;
  /** Payment splits */
  splits?: MPPSplit[];
}

/**
 * MPP Payment split
 */
export interface MPPSplit {
  recipient: Address;
  amount: string;
  memo?: string;
}

/**
 * MPP client configuration
 */
export interface MPPClientConfig {
  /** Private key for signing */
  privateKey?: Hex;
  /** Chain ID (default: 4326) */
  chainId?: number;
  /** RPC URL override */
  rpcUrl?: string;
}

/**
 * MPP server configuration  
 */
export interface MPPServerConfig {
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
  /** Challenge timeout in seconds */
  timeoutSeconds?: number;
}