// Types
export type {
  ChargeRequest,
  ChargeMethodDetails,
  Split,
  ChargeCredentialPayload,
  Permit2Payload,
  HashPayload,
  ChargeCredential,
  ChargeReceipt,
  Challenge,
  ServerConfig,
  ClientConfig,
} from './types.js';

// Constants
export {
  CHAIN_IDS,
  RPC_URLS,
  PERMIT2,
  EXACT_PROXY,
  UPTO_PROXY,
  USDM,
} from './constants.js';

// Chain definitions
export {
  megaethMainnet,
  megaethTestnet,
  getChain,
} from './utils/chain.js';

// Permit2 utilities
export {
  getPermit2Domain,
  buildPermit2TypedData,
  PERMIT_WITNESS_TRANSFER_FROM_TYPES,
  EXACT_PROXY_ABI,
} from './utils/permit2.js';
export type { Permit2SigningParams } from './utils/permit2.js';

// Encoding
export {
  base64urlEncode,
  base64urlDecode,
  encodeRequest,
  decodeRequest,
} from './utils/encoding.js';
