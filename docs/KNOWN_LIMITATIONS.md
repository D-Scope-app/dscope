# Known limitations

Last reviewed: 2026-08-18

This document records known limitations of the current testnet implementation. Repository publication must not be interpreted as production readiness.

## Release status

- The system is testnet-only.
- The contracts and backend have not received an independent security audit.
- A complete end-to-end run with the current Aztec 5.1.0 stack and current Azguard integration remains pending.
- Production deployment and public participation should not be enabled solely on the basis of the existing smoke tests.

## Wallet compatibility

Aztec 5.1.0 introduced current HandshakeRegistry authorization requirements.

The Azguard integration must be verified against a wallet and PXE release supporting the corresponding registry and `authorizeUtilityCall` behavior.

## Participation timestamp metadata

Survey-window authorization uses the canonical Aztec context timestamp.

A legacy caller-provided `current_time` argument remains in the private participation ABI for receipt and consumption-note metadata. It is not authoritative for window authorization, but should be removed or explicitly renamed before the next participation-gate deployment.

## Dependency advisories

The current npm audit reports unresolved high-severity advisories in transitive dependencies, primarily through the Aztec, Azguard and OpenTelemetry dependency trees.

No forced downgrade or incompatible major-version replacement has been applied. Dependency upgrades must preserve compatibility with the selected Aztec protocol version.

## Database deployment state

The complete D1 migration chain has been validated against a clean local database.

Migration `0022_verification_session_rate_limits.sql` still needs to be applied to the intended remote D1 environment before the corresponding production rate-limit path is enabled.

## Rewards

Reward distribution is deferred and disabled for the current release.

`RewardVaultMVP` remains experimental and should not be described as an active incentive system.

## Frontend bundle size

The current Aztec and proving dependencies produce large browser bundles. Builds complete successfully, but code splitting and loading performance remain optimization work.

## Operational configuration

A real deployment still requires reviewed production secrets, verifier configuration, email configuration, runner isolation and Cloudflare environment validation.

Environment files, local D1 state, wallet state and generated bundles are intentionally excluded from the repository.
