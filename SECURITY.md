# Security policy

## Supported version

Security fixes currently target the `main` branch.

D-Scope is in active testnet development and has not been independently audited.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public GitHub issue, discussion, social post or shared testnet transaction.

Preferred reporting process:

1. Open a private vulnerability report through the repository's GitHub Security tab.
2. Identify the affected component and version.
3. Describe the impact and required preconditions.
4. Provide minimal reproduction steps or a proof of concept.
5. Remove real credentials, identity documents, wallet state and personal data.

If private vulnerability reporting is unavailable, contact a repository maintainer through GitHub and request a private communication channel. Do not include exploit details in the initial public message.

## Sensitive material

Never include the following in a report or commit:

- production API, administration or runner tokens;
- wallet private keys, seed phrases or PXE state;
- Cloudflare credentials or local D1 databases;
- real passport data or reusable proof material;
- email-provider credentials;
- unredacted user records.

## Scope notes

Known engineering limitations are documented in `docs/KNOWN_LIMITATIONS.md`.

A documented limitation may still warrant a private report if it enables impact beyond what is described there.

There is currently no public bug-bounty program or guaranteed response-time SLA.
