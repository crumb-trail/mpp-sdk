import { defineChain } from 'viem';
import { CHAIN_IDS, RPC_URLS } from '../constants.js';

export const megaethMainnet = defineChain({
  id: CHAIN_IDS.mainnet,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URLS.mainnet] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://mega.etherscan.io' },
  },
});

export const megaethTestnet = defineChain({
  id: CHAIN_IDS.testnet,
  name: 'MegaETH Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URLS.testnet] },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://testnet-mega.etherscan.io',
    },
  },
  testnet: true,
});

export function getChain(chainId: number) {
  switch (chainId) {
    case CHAIN_IDS.mainnet:
      return megaethMainnet;
    case CHAIN_IDS.testnet:
      return megaethTestnet;
    default:
      throw new Error(`Unknown MegaETH chain ID: ${chainId}`);
  }
}
