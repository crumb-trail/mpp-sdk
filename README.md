# @megaeth/mpp

MegaETH payment method for the [Machine Payments Protocol](https://mpp.dev).

**MPP** is [an open protocol proposal](https://paymentauth.org) that lets any HTTP API accept payments using the `402 Payment Required` flow.

> [!IMPORTANT]
> This repository is under active development. The [MegaETH MPP spec](https://github.com/tempoxyz/mpp-specs) is not yet finalized — APIs and wire formats are subject to change.

## Install

```bash
npm install @megaeth/mpp
```

## Features

**Charge** (one-time payments)
- ERC-20 token transfers via Permit2 (works with any token)
- Two settlement modes: Permit2 signature (default) and tx hash
- Fee sponsorship: server pays gas (<$0.001 on MegaETH)
- Split payments: distribute one charge across multiple recipients
- Sub-50ms settlement with MegaETH's 10ms block times

## Architecture

```
@megaeth/mpp
├── src/
│   ├── index.ts          # Shared types, constants, chain defs
│   ├── types.ts          # TypeScript interfaces
│   ├── constants.ts      # Addresses, chain IDs, RPCs
│   ├── client/
│   │   └── Charge.ts     # Client: sign Permit2, auto-pay 402s
│   ├── server/
│   │   └── Charge.ts     # Server: challenge, verify, settle
│   └── utils/
│       ├── permit2.ts    # Permit2 EIP-712 helpers + ABIs
│       ├── encoding.ts   # Base64url encoding (RFC 4648)
│       └── chain.ts      # MegaETH chain definitions (viem)
```

**Exports:**
- `@megaeth/mpp` — shared types, constants, chain definitions, and Permit2 utilities
- `@megaeth/mpp/server` — server-side charge (challenge + settle)
- `@megaeth/mpp/client` — client-side charge (sign + auto-pay)

## Quick Start

### Server

```typescript
import { ChargeServer } from '@megaeth/mpp/server';

const server = new ChargeServer({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  recipient: '0xYourWalletAddress',
  asset: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', // USDm
  decimals: 18,
});

// In your request handler:
app.get('/api/resource', async (req, res) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Payment ')) {
    // Return 402 challenge
    const challenge = server.createChallenge('1000000000000000000', {
      description: '1 USDm for API access',
    });
    return res.status(402).set(challenge.headers).json({
      paymentRequirements: [challenge.request],
    });
  }

  // Verify and settle payment
  const credential = JSON.parse(atob(authHeader.slice(8)));
  const receipt = await server.settle(credential);
  
  res.set('Payment-Receipt', btoa(JSON.stringify(receipt)));
  res.json({ data: 'protected content' });
});
```

### Client

```typescript
import { ChargeClient } from '@megaeth/mpp/client';

const client = new ChargeClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Automatic 402 handling
const response = await client.fetch('https://api.example.com/resource');
const data = await response.json();
```

### Manual Signing

```typescript
import { ChargeClient } from '@megaeth/mpp/client';
import type { Challenge } from '@megaeth/mpp';

const client = new ChargeClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Sign a challenge manually
const credential = await client.sign(challenge);

// Send with custom logic
const response = await fetch(url, {
  headers: {
    Authorization: `Payment ${btoa(JSON.stringify(credential))}`,
  },
});
```

## Deployed Contracts

All contracts are deployed to the same canonical addresses on mainnet and testnet via deterministic CREATE2.

| Contract | Address |
|----------|---------|
| x402ExactPermit2Proxy | `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` |
| x402UptoPermit2Proxy | `0x402039b3d6E6BEC5A02c2C9fd937ac17A6940002` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

| Network | Chain ID | RPC |
|---------|----------|-----|
| Mainnet | 4326 | `https://mainnet.megaeth.com/rpc` |
| Testnet | 6343 | `https://carrot.megaeth.com/rpc` |

## Known Tokens

| Token | Address | Decimals |
|-------|---------|----------|
| USDm | `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7` | 18 |

> **Note:** USDm uses 18 decimals, not 6. `1 USDm = 1000000000000000000` base units.

## License

MIT
