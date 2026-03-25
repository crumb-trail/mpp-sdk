// MegaETH chain configuration
export const CHAIN_IDS = {
  mainnet: 4326,
  testnet: 6343,
} as const;

export const RPC_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.megaeth.com/rpc',
  testnet: 'https://carrot.megaeth.com/rpc',
};

// Canonical contract addresses (same on mainnet + testnet via CREATE2)
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

// x402 Permit2 Proxy contracts
export const X402_EXACT_PROXY = '0x402085c248EeA27D92E8b30b2C58ed07f9E20001' as const;
export const X402_UPTO_PROXY = '0x402039b3d6E6BEC5A02c2C9fd937ac17A6940002' as const;

// Legacy exports for backwards compatibility
export const EXACT_PROXY = X402_EXACT_PROXY;
export const UPTO_PROXY = X402_UPTO_PROXY;

// Known tokens
export const USDM = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' as const;
export const USDM_DECIMALS = 18 as const;

// Permit2 witness types for EIP-712 signing
export const EXACT_WITNESS_TYPE_STRING =
  'Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)' as const;

export const EXACT_WITNESS_TYPEHASH =
  '0xd97b3239a7f32295517bd14cb074edfdd188dfe5eb42f802bb26d4fd1eb12c37' as const;

export const UPTO_WITNESS_TYPE_STRING =
  'Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)' as const;
