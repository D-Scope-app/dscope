# D-Scope

Privacy-preserving infrastructure for eligibility-gated surveys and aggregate analytics.

D-Scope combines privacy-preserving identity predicates, private Aztec contract state, off-chain orchestration, and thresholded reporting. Its goal is to verify that respondents satisfy survey criteria without turning identity documents or personal attributes into public data.

> Status: active testnet development. This repository has not been independently audited and is not production-ready.

## Why D-Scope

Online surveys face two competing requirements:

- researchers need credible eligibility and Sybil resistance;
- participants should not have to expose their identity or personal data.

D-Scope separates eligibility verification from survey responses. The current implementation uses zkPassport-derived predicates, Aztec private state, per-survey participation controls, and aggregate-only result publication.

## Current capabilities

- Creator registration and controlled survey creation.
- Age and country eligibility policies.
- Trusted zkPassport verification sessions.
- Private participation credentials.
- Per-survey participation consumption.
- Canonical contract-time enforcement.
- Restricted deployment and finalization runner.
- Aggregate analytics with minimum-sample thresholds.
- Public-launch containment and verification rate limiting.
- Cloudflare Worker and D1 orchestration.

## Repository structure

| Path | Purpose |
| --- | --- |
| `apps/backend/src` | Cloudflare Worker API and domain logic |
| `apps/backend/frontend/src/app` | React survey and creator application |
| `apps/backend/frontend/src/verify-real.ts` | zkPassport verification frontend |
| `apps/backend/migrations` | D1 schema and migration history |
| `apps/backend/scripts` | Runner, validation and operational scripts |
| `contracts` | Aztec Noir contracts and TypeScript bindings |
| `docs` | Architecture and known limitations |

Generated bundles, local databases, environment files, compiler targets, snapshots and dependency directories are excluded from Git.

## Architecture

D-Scope currently consists of five cooperating layers:

1. A browser application for creators and respondents.
2. A wallet and PXE boundary for private Aztec state.
3. A Cloudflare Worker API backed by D1.
4. A restricted runner for contract orchestration and finalization.
5. Aztec contracts for policy enforcement and participation state.

Detailed documentation is available in `docs/ARCHITECTURE.md`.

## Local validation

Requirements:

- Node.js and npm.
- Aztec CLI 5.1.0 for contract compilation.
- Nargo 1.0.0-beta.22 for the current Noir contracts.

Install backend dependencies:

    npm run backend:install

Run the non-E2E security and regression suite:

    npm test

Build both frontend applications:

    npm run build

Validate the Worker package without deploying:

    npm run worker:dry-run

The authoritative JavaScript lockfile is `apps/backend/package-lock.json`.

## Security and limitations

Do not commit credentials, wallet state, proof material, local databases or production environment files.

See `SECURITY.md` for vulnerability reporting and `docs/KNOWN_LIMITATIONS.md` for current testnet limitations.

## License

D-Scope is licensed under the Apache License 2.0. See `LICENSE`.
