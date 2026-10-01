# Known limitations

Last reviewed: 2026-10-01

This document records known limitations of the current testnet MVP. Repository publication must not be interpreted as production readiness.

## Release status

- The system remains testnet-first and is not independently security audited.
- The core end-to-end path has been exercised on the current Aztec 5.2-era implementation, but public-beta readiness still depends on deployment configuration, wallet reliability, verifier/runner operation and finalization hardening.
- Local smoke/build success is not equivalent to production security validation.

## Wallet and onboarding UX

The current respondent flow uses AzGuard and Aztec wallet/PXE tooling. This still creates wallet/onboarding friction for non-crypto respondents.

Embedded/passkey-style account abstraction is being evaluated but should not be described as part of the current public MVP until implemented and validated.

## Hybrid / centralized operational components

The current MVP includes trusted Cloudflare, D1, runner and issuer/orchestration components. D-Scope should therefore not be described as fully decentralized today.

The long-term direction is progressive decentralization where doing so improves integrity, resilience or censorship resistance without degrading usability.

## Rewards

Reward distribution is deferred and disabled in the current release. `RewardVaultMVP` is experimental and must not be presented as an active incentive system.

## Predicate scope

The MVP primarily focuses on age and geography-related eligibility predicates. Broader predicates such as gender (where safely supported), on-chain activity, asset/community membership and optional KYC-derived attributes are future work.

## Dependency / proving stack risk

D-Scope depends on a rapidly evolving Aztec wallet/proving stack plus third-party wallet and identity dependencies. Protocol or wallet upgrades can require migrations and retesting.

The current `package.json` targets Aztec 5.2.0 while retaining a 5.1 `noir-contracts` compatibility alias for the current SponsoredFPC path. This should be treated as deliberate compatibility debt and revisited during future wallet/fee-stack upgrades.

## Package lock

This cleaned staging snapshot does **not** contain the previous GitHub `apps/backend/package-lock.json`, because that lockfile pins the old Aztec 5.1 dependency set. A current lockfile matching the 5.2 `package.json` must be generated/restored before the repository update is merged.

## Frontend performance

Aztec/proving dependencies produce large browser bundles. Code splitting, loading performance and respondent UX remain optimization areas.

## Deployment configuration

Production/public-beta operation requires reviewed secrets, verifier configuration, runner isolation, Cloudflare configuration, database migrations and operational monitoring. Environment files, local D1 state, wallet state, generated bundles and proof artifacts must remain outside Git.
