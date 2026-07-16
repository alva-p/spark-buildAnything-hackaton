<p align="center">
  <img src="apps/web/public/icon.png" alt="AuditSplit logo" width="140" />
</p>

<h1 align="center">AuditSplit</h1>

<p align="center">
  <strong>Pact before payout.</strong><br />
  Immutable payout agreements for collaborative bug bounty research, built on Monad.
</p>

<p align="center">
  <a href="https://auditsplit.alva-p.xyz/"><strong>Live App</strong></a> ·
  <a href="https://www.youtube.com/watch?v=PogF8xJEYdI"><strong>Video Demo</strong></a> ·
  <a href="https://github.com/alva-p/spark-buildAnything-hackaton/actions/workflows/ci.yml"><img src="https://github.com/alva-p/spark-buildAnything-hackaton/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

AuditSplit gives every private collaborative report its own payout vault. Researchers agree on exact shares before submission, every recipient accepts onchain, and each person claims independently when the bounty arrives.

Vulnerability details never go onchain. The browser sends only recipient addresses, shares, and a salted `bytes32` commitment.

## Why it exists

Collaborative bounties are often paid to one personal wallet and split later using messages, spreadsheets, and trust. AuditSplit replaces that manual promise with one immutable vault address accepted by everyone before payout.

## How it works

1. Create a vault with 2–10 recipients and shares totaling exactly 100%.
2. Every recipient accepts the immutable pact.
3. Give the active vault address to the bounty payer.
4. The vault allocates the payment and each recipient claims independently.

The contract uses pull-based claims: one recipient never needs to wait for, or depend on, another.

## Hackathon MVP

- Dedicated non-upgradeable vault for every report.
- Unanimous activation and immutable shares.
- Native MON and ERC-20 accounting, including fee-on-transfer tokens.
- Real Monad transactions with pending, confirmed, and reverted states.
- Browser-only commitment generation; no backend or database.
- Responsive create, accept, payout, and claim flow.
- 25 passing Foundry tests plus frontend lint and production build checks.

## Monad deployments

### Mainnet

| Item | Deployment |
|---|---|
| Network | Monad Mainnet · chain ID `143` |
| Frontend | [auditsplit.alva-p.xyz](https://auditsplit.alva-p.xyz/) |
| Factory | [`0x0ccbe83afD8423baE0094857B3D97cAec9B52D0C`](https://monadscan.com/address/0x0ccbe83afD8423baE0094857B3D97cAec9B52D0C) |
| Factory deployment | [`0x7e6492…86ed8`](https://monadscan.com/tx/0x7e6492ad87d575bea55fe53249b012d4e3177aae711755d56f68b6e637d86ed8) |
| Deployer | [`0xC56a071b9363F29B18538747b59670b7e6A3558b`](https://monadscan.com/address/0xC56a071b9363F29B18538747b59670b7e6A3558b) |
| Verified source | [`exact_match` on Sourcify](https://sourcify-api-monad.blockvision.org/v2/verify/8ea28860-3aed-411c-bfaf-e3e29eb1dde1) |

### Testnet

| Item | Deployment |
|---|---|
| Network | Monad Testnet · chain ID `10143` |
| Factory | [`0xe3335E3Ea2DbFe0aff7e92331f86AB3C53314536`](https://testnet.monadscan.com/address/0xe3335E3Ea2DbFe0aff7e92331f86AB3C53314536) |
| Factory deployment | [`0x26b26f…5c891be`](https://testnet.monadscan.com/tx/0x26b26f52422aa2328c2a829dde594b6458ae6aedd6d5fa55d8f24cb6e5c891be) |
| Deployer | [`0xB2ca5438D2C30624FC19c9206F41B550d4A502E8`](https://testnet.monadscan.com/address/0xB2ca5438D2C30624FC19c9206F41B550d4A502E8) |
| Verified source | [`exact_match` on Sourcify](https://sourcify-api-monad.blockvision.org/v2/verify/472b0616-7ae6-4eb8-98a6-e111b5a8d014) |

The verified factory runtime bytecode matches the local build exactly.

## Verified end-to-end demo

A live two-recipient payout completed successfully on Monad Testnet with a 75% / 25% split:

| Step | Onchain evidence |
|---|---|
| Demo vault | [`0xF104A4…67Aa82`](https://testnet.monadscan.com/address/0xF104A45b93E6129BDe6676F271eD5b58E067Aa82) |
| Vault creation | [`0x2fd3d2…3052a6`](https://testnet.monadscan.com/tx/0x2fd3d24bc1a4f0f3c5a1d4909d36d3a5db35685163a7ac8ccc34fa500b3052a6) |
| 5 MON payout | [`0x7bb995…cf520a`](https://testnet.monadscan.com/tx/0x7bb995afe15b1041bce0a11fb4e9daaa23fbebc675c06e2cccad9cdd18cf520a) |
| 75% claim · 3.75 MON | [`0xc5693e…ec5d0a`](https://testnet.monadscan.com/tx/0xc5693e4cd27c1fe6c6da6943732b2e50dd4fca6b3260b073a3e86bf775ec5d0a) |
| 25% claim · 1.25 MON | [`0xaffe5b…c3bda8`](https://testnet.monadscan.com/tx/0xaffe5b6e70a2b8da38365d173e36fa37d93c5790361a958d409888d01dc3bda8) |

Both recipients finished with zero claimable balance and the vault finished with zero MON held.

## Security choices

- Shares cannot change after creation.
- Every recipient must accept before deposits are enabled.
- Claims follow Checks-Effects-Interactions and use `ReentrancyGuard`.
- ERC-20 transfers use `SafeERC20` and measured balance deltas.
- No administrator can rewrite terms or withdraw user funds.
- No report title, PoC, platform identifier, or vulnerability detail is stored onchain.

This is hackathon software and has not received a production audit. Use small amounts and proceed at your own risk.

## Run locally

Requirements: Node.js 22+, npm, and Foundry.

```bash
git clone https://github.com/alva-p/spark-buildAnything-hackaton.git
cd spark-buildAnything-hackaton/apps/web
npm ci
npm run dev
```

The frontend points to Monad Mainnet and the verified factory. Never add a private key to frontend environment files.

## Verify the repository

```bash
cd contracts
forge install --no-git OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
cd ..
make verify
npm run check:create --prefix apps/web
```

## Stack

Solidity 0.8.24 · Foundry · OpenZeppelin v5 · Next.js · TypeScript · wagmi · viem · TanStack Query · Vercel Web Analytics
