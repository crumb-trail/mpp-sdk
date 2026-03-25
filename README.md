# @megaeth/payments

Unified payments SDK for MegaETH. Supports both [x402](https://github.com/coinbase/x402) (Coinbase, live today) and [MPP](https://paymentauth.org) (Machine Payments Protocol, coming soon).

One API. Two protocols. Auto-detection.

> [!IMPORTANT]
> Under active development. The [MegaETH MPP spec](https://github.com/tempoxyz/mpp-specs) is pending approval — MPP wire formats may change. x402 support is stable.

## Install

```bash
npm install @megaeth/payments
```

## Why Two Protocols?

- **x402** works today — Coinbase SDK, CDP facilitators, live ecosystem
- **MPP** is the next standard — HTTP-native, IETF-style spec, growing adoption

This SDK handles both so you don't have to pick a winner. Your server serves both, your client pays either.

## Quick Start

### Client (auto-detects protocol)

```typescript
import { PaymentClient } from '@megaeth/payments/client';

const client = new PaymentClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Automatically handles x402 or MPP based on server response
const response = await client.fetch('https://api.example.com/resource');
const data = await response.json();
```

### Server (serves both protocols)

```typescript
import { PaymentServer } from '@megaeth/payments/server';

const server = new PaymentServer({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  recipient: '0xYourWallet',
  asset: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', // USDm
  decimals: 18,
  protocols: ['x402', 'mpp'],
});

// Express middleware
app.get('/api/resource', async (req, res) => {
  // Creates challenges for both protocols
  const challenges = server.createChallenge('1000000000000000000', {
    realm: req.hostname,
    description: '1 USDm for API access',
    resource: {
      url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    },
  });

  // Check for payment
  const payment = req.headers['x-payment']
    || req.headers['authorization'];

  if (!payment) {
    return res.status(402)
      .set(challenges.headers)
      .json(challenges.body);
  }

  // Settle (auto-detects protocol from payload)
  const receipt = await server.settle(payment);
  res.json({ data: 'protected content' });
});
```

### Use a single protocol

```typescript
// x402 only
import { X402Client } from '@megaeth/payments/protocols/x402';
const client = new X402Client({ privateKey: '0x...' });

// MPP only
import { MPPClient } from '@megaeth/payments/protocols/mpp';
const client = new MPPClient({ privateKey: '0x...' });
```

## Architecture

```
@megaeth/payments
├── src/
│   ├── index.ts              # Shared exports
│   ├── constants.ts          # Addresses, chain IDs, RPCs
│   ├── client/
│   │   └── PaymentClient.ts  # Unified client (auto-detects protocol)
│   ├── server/
│   │   └── PaymentServer.ts  # Unified server (serves both)
│   ├── protocols/
│   │   ├── x402/             # x402 client + server
│   │   └── mpp/              # MPP client + server
│   └── utils/
│       ├── permit2.ts        # Shared Permit2 EIP-712 + ABIs
│       ├── encoding.ts       # Base64url (RFC 4648)
│       └── chain.ts          # MegaETH viem chain definitions
```

Both protocols share the same Permit2 signing and settlement layer. The difference is HTTP framing:

| | x402 | MPP |
|---|---|---|
| **Challenge** | JSON body with `accepts[]` | `WWW-Authenticate: Payment` header |
| **Payment** | `X-PAYMENT` header (JSON) | `Authorization: Payment` header (base64url) |
| **Receipt** | JSON in response | `Payment-Receipt` header |
| **Settlement** | Same (Permit2Proxy) | Same (Permit2Proxy) |

## Deployed Contracts

Same canonical addresses on mainnet and testnet (deterministic CREATE2):

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

> **Note:** USDm uses 18 decimals, not 6. `1 USDm = 1e18` base units.

## Protocol Detection

The client auto-detects which protocol the server speaks:

1. **MPP** — 402 response has `WWW-Authenticate: Payment` header
2. **x402** — 402 response body has `x402Version`, `accepts`, or `paymentRequirements`

No configuration needed. The client tries the right one automatically.

## License

MIT
