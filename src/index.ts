// ── Unified API ────────────────────────────────────────────────────

export { PaymentClient } from './client/index.js';
export { PaymentServer } from './server/index.js';

// ── Shared types ───────────────────────────────────────────────────

export type {
  PaymentProtocol,
  PaymentConfig,
  ClientConfig,
  ServerConfig,
  PaymentSplit,
  ChargeRequest,
  ChargeMethodDetails,
  Split,
  ChargeCredentialPayload,
  Permit2Payload,
  HashPayload,
  ChargeCredential,
  ChargeReceipt,
  Challenge,
} from './types.js';

// ── Protocol-specific exports ──────────────────────────────────────

export * as x402 from './protocols/x402/index.js';
export * as mpp from './protocols/mpp/index.js';

// ── Constants ──────────────────────────────────────────────────────

export {
  CHAIN_IDS,
  RPC_URLS,
  PERMIT2,
  X402_EXACT_PROXY,
  X402_UPTO_PROXY,
  EXACT_PROXY,
  UPTO_PROXY,
  USDM,
  USDM_DECIMALS,
} from './constants.js';

// ── Chain definitions ──────────────────────────────────────────────

export {
  megaethMainnet,
  megaethTestnet,
  getChain,
} from './utils/chain.js';

// ── Permit2 utilities ──────────────────────────────────────────────

export {
  getPermit2Domain,
  buildPermit2TypedData,
  PERMIT_WITNESS_TRANSFER_FROM_TYPES,
  EXACT_PROXY_ABI,
} from './utils/permit2.js';
export type { Permit2SigningParams } from './utils/permit2.js';

// ── Encoding utilities ─────────────────────────────────────────────

export {
  base64urlEncode,
  base64urlDecode,
  encodeRequest,
  decodeRequest,
} from './utils/encoding.js';
