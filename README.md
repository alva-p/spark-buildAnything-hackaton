# AuditSplit

**Pact before payout.**

AuditSplit is an onchain payout agreement for collaborative bug bounty research, built for Monad. Researchers agree on immutable percentages before submitting a report; once everyone accepts, a dedicated vault can receive the reward and let each collaborator claim independently.

The vulnerability stays private. The chain receives only a salted `bytes32` commitment generated in the browser—never a report title, private platform ID, proof of concept, or exploit detail.

## The problem

Collaborative findings are commonly submitted by one researcher and paid weeks later to one wallet. The eventual split is enforced through messages, spreadsheets, memory, and manual transfers. AuditSplit turns that informal promise into a small, auditable workflow created before the payout exists.

## How it works

1. The creator selects 2–10 wallet addresses and shares totaling exactly 100%.
2. Every listed researcher accepts those exact terms onchain.
3. The vault activates only after unanimous acceptance.
4. It receives native MON or ERC-20 rewards and allocates the funds by the agreed shares.
5. Every researcher claims their own balance independently.

The final recipient receives any integer-rounding remainder, so every deposit is fully allocated. ERC-20 deposits use the amount actually received, including fee-on-transfer behavior. Funds transferred directly to an active vault can be accounted for once through synchronization functions.

## Current MVP

- Real factory deployment of one dedicated vault per report.
- Immutable recipients, shares, and report commitment.
- Unanimous activation and creator-only cancellation while pending.
- Native MON and ERC-20 allocation with pull-based claims.
- Browser-only salt generation and commitment hashing with viem.
- Live `/create` transaction lifecycle with receipt-based `VaultCreated` parsing.
- Live vault reads, recipient acceptance, Testnet MON deposits, claimable balances, and native claims.
- Explicit wrong-network handling for Monad Testnet.
- No backend, database, upgradeable proxy, admin withdrawal, or mocked transaction state.

ERC-20 interaction controls, cancellation controls, and indexed event history are intentionally outside the current frontend slice; the Solidity functionality is covered by tests.

## Stack

- Solidity 0.8.24, Foundry, OpenZeppelin v5
- Next.js App Router and strict TypeScript
- wagmi, viem, and TanStack Query
- Monad Testnet (`chainId 10143`)

## Repository

```text
.
├── apps/web/       # Next.js application
├── contracts/      # Solidity contracts, tests, and deployment script
├── scripts/        # ABI export and create-flow verification helpers
└── Makefile        # Combined verification commands
```

## Run locally

Requirements: Node.js 22+, npm, and Foundry.

Install and test the contracts:

```bash
cd contracts
forge install --no-git OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge fmt --check
forge build
forge test -vvv
```

Generate the frontend ABIs and start the web app:

```bash
cd ..
node scripts/export-abis.mjs
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Configure `apps/web/.env.local`:

```bash
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_FACTORY_ADDRESS=0xYOUR_DEPLOYED_FACTORY
```

Do not commit private keys or local environment files.

## Verification

```bash
cd contracts && forge fmt --check && forge build && forge test -vvv
cd ../apps/web && npm ci && npm run lint && npm run check:create && npm run build
```

The contract suite covers constructor validation, acceptance and cancellation restrictions, native and token allocation, direct-transfer synchronization, claims, deterministic rounding, fee-on-transfer tokens, and double-sync prevention.

## Deploy to Monad Testnet

Import a Foundry keystore instead of placing a private key in the repository or shell history:

```bash
cast wallet import monad-deployer

cd contracts
forge script script/Deploy.s.sol:DeployAuditSplit \
  --rpc-url monad_testnet \
  --account monad-deployer \
  --broadcast
```

After deployment, set the resulting factory address in the web environment, verify the source on the explorer, and test create → accept → fund → claim using faucet-issued Testnet MON.

## Security model

- Terms are immutable and vaults are non-upgradeable.
- Activation requires every recipient; no administrator can override acceptance.
- Claims follow checks-effects-interactions and use `ReentrancyGuard`.
- ERC-20 transfers use `SafeERC20` and actual balance deltas.
- Local labels and commitment metadata are conveniences only and never control funds.
- A salted commitment protects casual disclosure, but users must still use a high-entropy random salt and keep private report information offchain.

This is hackathon software and has not received a production audit. Use only Monad Testnet for the MVP.

## Why Monad

The product is naturally multi-step—create, accept, fund, and claim. Monad offers fast, inexpensive EVM-compatible confirmations while preserving familiar Solidity tooling, making the full agreement lifecycle practical to demonstrate onchain.

## Links

- [Monad documentation](https://docs.monad.xyz/)
- [Monad Testnet explorer](https://testnet.monadscan.com/)
- [Monad faucet](https://faucet.monad.xyz/)
