# D-Scope

Privacy-preserving infrastructure for eligibility-gated surveys and aggregate analytics.

D-Scope is designed to let organizations verify that respondents satisfy survey criteria without turning identity documents or personal attributes into public survey data. The current MVP combines zkPassport-derived eligibility predicates, Aztec private state, per-survey participation controls, off-chain orchestration, and aggregate reporting.

> **Status:** active testnet MVP on the Aztec 5.2 stack. The core end-to-end flow has been exercised in the current testnet environment. The system has not been independently audited and is not production-ready.

## Why D-Scope

Online research has two competing requirements:

- organizations need credible eligibility, Sybil resistance and higher-quality samples;
- respondents should not have to expose unnecessary identity or personal data.

D-Scope separates eligibility verification from survey answers. A respondent proves required predicates, receives a private participation credential, and participates through a survey-specific privacy flow. Survey creators receive aggregate results rather than raw identity data.

## Current MVP capabilities

- Controlled creator onboarding and survey creation.
- Age, country and region eligibility policies.
- zkPassport verification sessions through a trusted verification boundary.
- Private participation credentials on Aztec.
- Per-survey participation consumption / duplicate-participation protection.
- Canonical contract-time enforcement.
- Restricted runner for deployment, policy registration, synchronization and finalization.
- Aggregate analytics with minimum-sample thresholds.
- Public-launch containment and verification rate limiting.
- Cloudflare Worker + D1 orchestration.
- Current wallet flow through AzGuard while lower-friction embedded onboarding is being evaluated.

## Current architecture

D-Scope currently has five cooperating layers:

1. **Web application** — React/Vite interfaces for creators and respondents.
2. **Identity / eligibility boundary** — zkPassport-derived predicates such as age and geography.
3. **Private execution boundary** — Aztec wallet/PXE flow, private credentials and participation state.
4. **Application orchestration** — Cloudflare Worker + D1 plus a restricted runner/issuer path.
5. **Result layer** — finalized aggregate reporting and on-chain result commitments.

The MVP is intentionally **not fully decentralized**. Backend orchestration, issuer operations and finalization currently include trusted components. The privacy-critical participation state and policy checks are enforced through Aztec contracts.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the detailed flow and trust boundaries.

## Contracts

| Contract | Responsibility |
| --- | --- |
| `ParticipationGateV2` | Private credential storage, eligibility-policy checks, survey window checks and participation consumption |
| `DScopeCore` | Survey anchors, lifecycle data and finalized result commitments |
| `SurveyFactory` | Survey instance registration |
| `RewardVaultMVP` | Experimental reward architecture; disabled in the current MVP |

## Repository structure

| Path | Purpose |
| --- | --- |
| `apps/backend/src` | Cloudflare Worker API and application/domain logic |
| `apps/backend/frontend/src/app` | Current React survey/creator application |
| `apps/backend/frontend/src/verify-real.ts` | zkPassport verification frontend |
| `apps/backend/migrations` | D1 schema and migration history |
| `apps/backend/scripts` | Runner, issuer, validation and operational scripts |
| `contracts` | Aztec Noir contracts and committed TypeScript bindings |
| `docs` | Architecture, limitations and long-term direction |

Generated application bundles, local databases, environment files, compiler caches, snapshots and dependency directories are excluded from Git. The exact compiled contract JSON artifacts imported by the committed TypeScript bindings are retained so a fresh checkout has a complete JavaScript/TypeScript contract artifact set.

## Toolchain snapshot

- Aztec JS / Wallet SDK: `5.2.0`
- Aztec Noir dependencies: tag `v5.2.0`
- zkPassport SDK/UI: `0.16.1`
- Frontend: React + Vite
- Backend: Cloudflare Workers + D1

The current wallet integration also retains a compatibility alias to `@aztec/noir-contracts.js@5.1.0` for the SponsoredFPC path used by the current implementation. This should be revisited as the wallet/fee stack evolves.

## Local validation

The authoritative JavaScript lockfile is `apps/backend/package-lock.json` and is aligned with the current Aztec 5.2 dependency set.

For local validation:

```bash
npm run backend:install
npm test
npm run build
npm run worker:dry-run
```

Network E2E testing requires the appropriate Aztec testnet, wallet, verifier and runner configuration and should not be inferred from local smoke tests alone.

## Security and limitations

Do not commit credentials, wallet state, proof material, local databases or production environment files.

See [`SECURITY.md`](SECURITY.md) and [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).

## Direction

The current MVP deliberately keeps rewards disabled and uses a limited predicate set. Longer-term work includes reward pools, progressive decentralization, broader privacy predicates, and lower-friction account/wallet abstraction. See [`docs/FUTURE_DIRECTION.md`](docs/FUTURE_DIRECTION.md).

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
