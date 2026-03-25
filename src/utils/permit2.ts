import type { Address, Hex } from 'viem';
import { encodeAbiParameters, keccak256, encodePacked } from 'viem';
import { EXACT_PROXY, PERMIT2 } from '../constants.js';

// ── EIP-712 Domain ─────────────────────────────────────────────────

export function getPermit2Domain(chainId: number) {
  return {
    name: 'Permit2',
    chainId,
    verifyingContract: PERMIT2 as Address,
  } as const;
}

// ── Permit2 PermitWitnessTransferFrom types ────────────────────────

export const PERMIT_WITNESS_TRANSFER_FROM_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'Witness' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  Witness: [
    { name: 'to', type: 'address' },
    { name: 'validAfter', type: 'uint256' },
  ],
} as const;

// ── Build typed data for signing ───────────────────────────────────

export interface Permit2SigningParams {
  token: Address;
  amount: bigint;
  spender?: Address;
  nonce: bigint;
  deadline: bigint;
  to: Address;
  validAfter?: bigint;
  chainId: number;
}

export function buildPermit2TypedData(params: Permit2SigningParams) {
  const {
    token,
    amount,
    spender = EXACT_PROXY,
    nonce,
    deadline,
    to,
    validAfter = 0n,
    chainId,
  } = params;

  return {
    domain: getPermit2Domain(chainId),
    types: PERMIT_WITNESS_TRANSFER_FROM_TYPES,
    primaryType: 'PermitWitnessTransferFrom' as const,
    message: {
      permitted: { token, amount },
      spender,
      nonce,
      deadline,
      witness: { to, validAfter },
    },
  };
}

// ── Permit2Proxy ABIs ──────────────────────────────────────────────

export const EXACT_PROXY_ABI = [
  {
    name: 'settle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'owner', type: 'address' },
      {
        name: 'witness',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'validAfter', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'settleWithPermit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'owner', type: 'address' },
      {
        name: 'witness',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'validAfter', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
      {
        name: 'permitSingle',
        type: 'tuple',
        components: [
          { name: 'value', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: 'Settled',
    type: 'event',
    inputs: [],
  },
  {
    name: 'SettledWithPermit',
    type: 'event',
    inputs: [],
  },
] as const;
