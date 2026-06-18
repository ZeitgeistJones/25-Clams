# 25 Clams

**Live URL:** https://bafybeighicki72flstc4aygaadclxjve4frl5ny63de52wneymtcs6xzzu.ipfs.community.bgipfs.com/

A fully onchain Deal or No Deal-style game on Base, powered by CLAWD tokens and Chainlink VRF.

## How It Works

25 clams sit on the board. Each hides a CLAWD value. Before the game starts, pick the clam you think holds the most — that's yours to keep if you never deal. Play 8 rounds, eliminating clams and hearing the banker's offers. Deal when the price is right, or hold out for your clam's true value.

## Contracts (Base Mainnet)

| Contract | Address | Basescan |
|---|---|---|
| ClamsPool (Investor Vault) | `0x94a312581269433d52F83c8FFd34097370627E2a` | [View](https://basescan.org/address/0x94a312581269433d52F83c8FFd34097370627E2a) |
| ClamsGame (Game Logic) | `0x5E91944DB001C70435E2425DF14430829d4fBc06` | [View](https://basescan.org/address/0x5E91944DB001C70435E2425DF14430829d4fBc06) |
| CLAWD Token | `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` | [View](https://basescan.org/address/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) |

## Live App

Deploy via IPFS — see `DEPLOYMENT.md` after first BGIPFS upload.

## Architecture

- **ClamsPool** — ERC4626-style CLAWD investor vault. Investors deposit CLAWD, receive proportional shares. Pool earns the house edge over time. Locked during active games.
- **ClamsGame** — Core game contract. One active game at a time. Chainlink VRF V2.5 shuffles the 25 clam values at game start via Fisher-Yates algorithm.

## Entry Fee and Fee Split

- Entry fee: 1,000 CLAWD
- 2% burned (deflationary)
- 2% to CLAWD treasury
- 96% enters the prize pool

## Prerequisites Before First Game

1. **VRF Subscription**: Create a VRF subscription at vrf.chain.link, fund it with LINK, add `ClamsGame` as consumer. The current deploy uses `subscriptionId = 0` (placeholder). Redeploy with the real subscription ID.
2. **Pool Seeding**: Deposit CLAWD into `ClamsPool` to backstop the jackpot (minimum 5,000 CLAWD for the smallest jackpot tier).

## Local Development

```bash
yarn install
yarn chain          # local anvil fork
yarn deploy         # deploy to local fork
yarn start          # frontend at localhost:3000
```

## Tech Stack

- Scaffold-ETH 2 — SE2 monorepo with Foundry and Next.js
- Chainlink VRF V2.5 — verifiable randomness on Base
- BGIPFS — decentralized frontend hosting
- CLAWD — native game token on Base
 
