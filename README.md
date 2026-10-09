# HeirVault-app

A Stellar/Soroban frontend for HeirVault: an on-chain inheritance vault where assets (e.g. USDC) are released to beneficiaries after the owner misses a periodic check-in and a grace period elapses.

This repository is the **frontend web application** for HeirVault. It is a Next.js app that connects to Stellar/Soroban via a Freighter wallet, reads a deployed HeirVault Soroban contract, and lets owners create vaults, configure beneficiaries and guardians, perform check-ins, and let beneficiaries claim once activation conditions are met.

> **Separation of concerns.** The Soroban Vault *contract* (Rust/Soroban) is maintained separately. This repo contains the web app that talks to a deployed contract. If you are looking for the contract source, it lives in a separate repository.

---

## Project snapshot (this repository)

- **Type:** Next.js web application (App Router, React 19, TypeScript).
- **Current branch state:** `main` is currently at commit `0893cd1e` ("Implement Soroban Vault read mapping in the repository"). That is the **restored, intact frontend** for this session.
- **Remote divergence:** `origin/main` currently points at a later commit (`14d23830`). Local `main` is ahead by 3 and behind by 9 relative to `origin/main` as of this write-up. The remote still contains the cleanup commits that were stripped from local history during restore. If you want `origin/main` to match this restored frontend, that requires a force push and should only be done with explicit approval.
- **Deploy status:** This frontend has been deployed to Vercel as a **production** deployment. See [Deployment](#deployment) for the live URL.

---

## What this app does

- **Vault creation:** Owners build a vault through a wizard (info, asset, beneficiaries, guardians, activation, review) and then sign a single Soroban transaction that deploys/initializes the vault and moves the asset into it.
- **Read vaults:** The app reads vault state from the HeirVault contract (`get_vault` / `list_vaults_by_owner`) and maps the contract return value into the frontend domain model. Contract reads are simulated locally only when there is no deployed contract configured — the app does not fabricate on-chain state.
- **Check-ins:** Owners can record check-ins to reset the activation timer.
- **Beneficiaries:** Named beneficiaries are shown their eligibility/claim status and can claim once the vault is activated and conditions are met.
- **Guardians:** Guardians can approve/reject as required by the vault configuration.
- **Verification:** A vault/identity can be looked up by identifier to see what the app can read for it in the current environment.

---

## Repositories / components

This project is the **frontend**. A full HeirVault system also includes:

- **Soroban contract** — the on-chain vault logic (Rust/Soroban). Separate repository.
- **This frontend** — the Next.js web app (`heirvault-app`) that wallet-users interact with.

If a piece is missing (for example the contract repo), treat it as out of scope for this repository.

---

## Tech stack

- **Framework:** Next.js 15 (App Router).
- **UI:** React 19 + TypeScript, Tailwind CSS, custom UI component library under `src/components/ui`.
- **Blockchain:** Stellar/Soroban via `@stellar/stellar-sdk` and `@stellar/freighter-api`. Wallet connection via Freighter.
- **Testing:** Vitest for unit tests; React Testing Library for component/hook tests.
- **Lint/Type:** ESLint + TypeScript (`tsc --noEmit`).

### Key workspace areas

- `src/app/` — Next.js App Router pages: home, dashboard, beneficiaries, vault list/detail/new, inherit, verify.
- `src/components/` — UI primitives plus domain components for beneficiaries, claims, dashboard, guardians, layout, vault (including the multi-step vault wizard), and wallet connection.
- `src/hooks/` — `useVault`, `useWallet`, `useBeneficiaries`, `useCountdown`.
- `src/lib/` — shared helpers (`cn`, `format`), Stellar/Soroban client/contract/explorer/network/transactions/wallet, and vault domain logic (`types`, `calculations`, `validation`, `repository`, `mock-data`, `strkey`, `test-factories`).

---

## Repository restore note

This frontend was restored from an earlier intact commit during this session because the working tree had been emptied by a series of cleanup commits. Restoring did **not** change the app code itself — it recovered the files that existed at the last intact commit.

If you are reading this README as the single source of truth for repo state, treat the git history as authoritative for what changed and when. The notes here about "current branch state" and "remote divergence" reflect the state at the time of writing and may differ after further pushes or resets.

---

## Getting started (local)

### Prerequisites

- Node.js (this project was built/tested with a recent Node version; Vercel built it successfully with the CLI-built image). If you want to pin a Node version for local reproducibility, add `engines.node` to `package.json` or a `.nvmrc`.
- npm (used by this project's lockfile).

### Install

```bash
git clone <repo-url>
cd <project-root>
npm install
```

### Configure environment

Copy `.env.example` to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

**Minimal config to run the app locally (no real contract):**

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID=
NEXT_PUBLIC_USDC_CONTRACT_ID=
NEXT_PUBLIC_USDC_SYMBOL=USDC
NEXT_PUBLIC_USDC_DECIMALS=7
NEXT_PUBLIC_EXPLORER_BASE_URL=https://stellar.expert/explorer/testnet
NEXT_PUBLIC_EXPLORER_TX_PATH=/tx
NEXT_PUBLIC_EXPLORER_ACCOUNT_PATH=/account
NEXT_PUBLIC_EXPLORER_CONTRACT_PATH=/contract
NEXT_PUBLIC_ENABLE_DEV_FIXTURES=true
```

With `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` left blank and `NEXT_PUBLIC_ENABLE_DEV_FIXTURES=true`, the app runs in a clearly-labelled development-data mode using in-memory/localStorage fixtures. On-chain actions are disabled until a contract is configured.

**To enable real on-chain actions**, set `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` (and `NEXT_PUBLIC_USDC_CONTRACT_ID` for the supported asset) to real deployed contract IDs for the network you selected.

### Run locally

```bash
npm run dev
```

The app runs locally for development. The default port is the Next.js default (`http://localhost:3000`).

### Verify the codebase

```bash
npm run verify
# runs: typecheck && lint && test

# or run individually:
npm run typecheck
npm run lint
npm run test
npm run test:watch
```

### Build

```bash
npm run build
npm run start   # serve the production build locally
```

---

## Environment variables

All environment variables used by the app are **public** (prefixed with `NEXT_PUBLIC_`). None of them are secrets. Do **not** put private keys, seed phrases, or RPC auth tokens in `.env.local` unless you understand the exposure risk and the app's build-time/runtime behavior.

| Variable | Purpose | Example | Required? |
|---|---|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Stellar network id (`testnet`, `mainnet`, `futurenet`, `standalone`). | `testnet` | Yes (defaults wired for testnet) |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | Soroban RPC endpoint used to read contract state and submit transactions. | `https://soroban-testnet.stellar.org` | Yes for on-chain actions |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | Horizon endpoint for account/balance reads and explorer-style lookups. | `https://horizon-testnet.stellar.org` | Recommended |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Stellar network passphrase. Leave blank to use the default for the selected network. | (blank) | Only for standalone/custom networks |
| `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` | Contract ID (starts with `C`) of the deployed HeirVault contract. Blank = on-chain actions disabled. | `C...` | Required for real contract features |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | Stellar Asset Contract (SAC) wrapper id for the supported asset. | `C...` | Required to select an asset |
| `NEXT_PUBLIC_USDC_SYMBOL` | Human-readable symbol shown in the UI. | `USDC` | Yes (UI label) |
| `NEXT_PUBLIC_USDC_DECIMALS` | Asset decimals shown in the UI. | `7` | Yes (UI math) |
| `NEXT_PUBLIC_EXPLORER_BASE_URL` | Base URL used to build transaction/account/contract explorer links. | `https://stellar.expert/explorer/testnet` | Recommended |
| `NEXT_PUBLIC_EXPLORER_TX_PATH` | Path segment for transaction links. | `/tx` | Yes if using explorer links |
| `NEXT_PUBLIC_EXPLORER_ACCOUNT_PATH` | Path segment for account links. | `/account` | Yes if using explorer links |
| `NEXT_PUBLIC_EXPLORER_CONTRACT_PATH` | Path segment for contract links. | `/contract` | Yes if using explorer links |
| `NEXT_PUBLIC_ENABLE_DEV_FIXTURES` | `true` enables clearly-labelled development fixtures for UI development/demo. `false` requires a configured contract for blockchain actions. | `true` | Recommended for local dev |

See `.env.example` for the full template.

**Important:** committing `.env.local` (or any file containing real secrets) is prevented by `.gitignore`. The repo ships only `.env.example`.

---

## Networks

The app supports Stellar networks. The default is **Testnet**.

- **Testnet** — for development and demos. Use the canonical Testnet RPC/Horizon/explorer endpoints.
- **Mainnet** — for real value. Requires a mainnet-deployed HeirVault contract and mainnet asset contract IDs.
- **Standalone / local** — for local Soroban development (e.g. a local RPC at `http://localhost:8000/soroban/rpc`). Set the passphrase explicitly if needed.

Switching networks is done via `NEXT_PUBLIC_STELLAR_NETWORK` plus the matching RPC/Horizon/explorer URLs. Nothing in the app is hard-coded to one network except defaults.

---

## Wallet

The app connects to a Stellar wallet that supports Soroban, primarily **Freighter**. Wallet connection is used to:

- Identify the connected account.
- Sign deployment and other Soroban transactions.

If no wallet is connected, the app still renders read-centric UI (and development fixtures when enabled), but signed on-chain actions are unavailable.

---

## Vault lifecycle (user-facing)

1. **Configure** the environment with a Stellar network and (optionally) a deployed contract ID.
2. **Create a vault** via the wizard: name/info, choose the supported asset, add beneficiaries and their allocations, add guardians, set activation conditions.
3. **Deploy** the vault by signing the transaction from the connected wallet. The app reports status from RPC; it does not mark a transaction confirmed unless the network does.
4. **Maintain** the vault with periodic check-ins.
5. **Claim** — once activation conditions are met, beneficiaries can claim their allocation.

---

## Development fixtures

For UI development and demos without a deployed contract, the app can render **development fixtures**:

- Clearly labelled with a "Development data" banner.
- Intended for UI development only — not real on-chain data.
- Controlled by `NEXT_PUBLIC_ENABLE_DEV_FIXTURES`.

When a real contract is configured, the app surfaces contract-backed state instead of pretending simulated data is on-chain.

---

## Deployment

### Vercel (current production deployment)

This frontend is deployed on Vercel under the project **`heir-vault-app`**.

- **Production URL:** `https://heir-vault-app.vercel.app` (note the hyphen; `heirvault-app.vercel.app` (no hyphen) does not resolve)
- **Latest production deployment (this session):** `https://heir-vault-ltraax2fh-adelakunoluwaseyi1996-8385.vercel.app`
- **Vercel dashboard:** `https://vercel.com/adelakunoluwaseyi1996-8385/heir-vault-app`

Production deployments are triggered from the `main` branch of this repository (or manually via the Vercel CLI).

### Deploy from the CLI

With the Vercel CLI installed and authenticated:

```bash
# preview deployment
vercel

# production deployment
vercel --prod
```

If a project is already linked, `vercel --prod` deploys to production for the linked project. If you need to target a specific project, use `--project <name-or-id>`.

### Environment variables on Vercel

Set the same `NEXT_PUBLIC_*` variables on the Vercel project (in the dashboard or via `vercel env`) as you would locally in `.env.local`. For production with real contract features, at minimum set:

- `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID`
- `NEXT_PUBLIC_USDC_CONTRACT_ID`
- `NEXT_PUBLIC_USDC_SYMBOL`
- `NEXT_PUBLIC_USDC_DECIMALS`
- the network/RPC/Horizon/explorer values for the target network

### Custom domain

If a custom domain is configured on the Vercel project, the app is available there in addition to the `*.vercel.app` production URL.

---

## Contract configuration

The frontend does not deploy the Soroban contract from this repo. It expects a **deployed HeirVault contract** to already exist on the network you are targeting.

To enable contract-backed features:

1. Deploy (or locate) the HeirVault Soroban contract on the chosen network.
2. Set `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` to the deployed contract ID.
3. Set the supported asset's SAC contract ID in `NEXT_PUBLIC_USDC_CONTRACT_ID` (and symbol/decimals).

Until `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` is configured, the app intentionally shows a "contract not configured" state rather than pretending blockchain calls succeeded.

---

## Testing strategy

- **Unit tests** with Vitest cover vault calculations, validation, contract decode logic, Stellar network/config helpers, format helpers, and some hook/component behavior.
- Run with `npm run test` (or `npm run test:watch`).

Tests are intended to protect domain logic (calculations, validation, contract decoding). UI integration coverage is limited to the hooks/components that have explicit tests.

---

## Linting and types

- `npm run lint` — ESLint.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run verify` — runs typecheck, lint, and tests together.

---

## Project structure (top-level)

```
./README.md
./.env.example
./.gitignore
./package.json
./package-lock.json
./tsconfig.json
./tailwind.config.ts
./next.config.ts
./vitest.config.ts
./vitest.setup.ts
./postcss.config.mjs
./eslint.config.mjs
./src/
  app/            # Next.js App Router pages
  components/     # UI + domain components
  hooks/          # React hooks
  lib/            # shared helpers + Stellar/Soroban + vault domain
```

---

## Contributing / workflow notes

- Keep secrets out of the repository. `.env.local` and similar are gitignored.
- Prefer editing existing files over creating new ones where possible.
- Run `npm run verify` before pushing if you touch domain logic, validation, calculations, or contract decoding.
- Be careful with git history operations. This repository was recently restored from an earlier intact commit; rewriting shared history (force push to `origin/main`) should only be done with explicit agreement.

---

## License

MIT.
