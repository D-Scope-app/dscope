# D-Scope architecture

## Objective

D-Scope is designed to collect eligibility-gated survey responses while minimizing the personal information revealed to survey creators, backend infrastructure and public observers.

The system separates four concerns:

- identity predicate verification;
- private participation authorization;
- survey orchestration;
- thresholded aggregate reporting.

## System components

### Web application

The React application provides:

- creator registration and authentication;
- survey creation and operational status;
- respondent verification and participation;
- finalized aggregate results.

Operational status may be visible before finalization. Answer distributions and segment analytics are intended to remain unavailable until finalization and privacy-threshold checks are complete.

### Verification boundary

zkPassport verification establishes selected predicates such as age bucket and country eligibility.

The architecture does not require raw passport documents to be committed to Aztec or exposed in public survey results. Verification sessions are short-lived, rate-limited and bound to the configured verifier.

### Worker and D1

The Cloudflare Worker provides public and internal APIs. D1 stores application and orchestration state, including:

- creator accounts and approval state;
- survey metadata and lifecycle state;
- verification sessions;
- runner jobs and checkpoints;
- participation and aggregate records;
- operational heartbeats and pauses.

D1 is not the authority for private contract state.

### Restricted runner

The runner performs privileged operations that should not execute directly inside a public request:

- contract deployment;
- policy registration;
- lifecycle synchronization;
- survey finalization;
- checkpoint recovery.

Administrative and runner authorization use separate credentials. Public-launch containment can disable sensitive operations independently.

### Aztec contracts

| Contract | Responsibility |
| --- | --- |
| `ParticipationGateV2` | Private credential storage, policy checks, canonical window enforcement and participation consumption |
| `DScopeCore` | Survey anchors, lifecycle data and finalized aggregate commitments |
| `SurveyFactory` | Registration of survey instances |
| `RewardVaultMVP` | Experimental reward accounting, currently disabled |

Generated TypeScript bindings required by the frontend and runner are committed. Compiler target directories are excluded.

## Survey lifecycle

1. A creator is approved and authenticated.
2. The creator submits survey metadata, duration and eligibility policy.
3. The Worker creates orchestration jobs.
4. The runner deploys or registers the required Aztec contracts and policy.
5. A respondent completes the configured zkPassport verification.
6. An eligible private credential becomes available to the wallet flow.
7. The respondent submits a private participation transaction.
8. The participation gate validates the credential, policy, canonical time and previous consumption.
9. After the survey end time, the runner finalizes the survey.
10. Aggregate results become visible only after finalization and configured sample thresholds.

## Trust boundaries

### Browser and wallet

Private wallet state belongs at the wallet and PXE boundary. Browser-provided timestamps, eligibility fields and transaction claims are not authoritative.

### Verification service

The backend accepts eligibility only through the configured verifier boundary. Client-submitted verification claims are insufficient.

### Worker API

Public endpoints are rate-limited and constrained. Internal administration and runner endpoints require separate authorization.

### Runner

The runner is operationally privileged. Its token and execution environment must not be exposed to the browser, repository or public logs.

### Contracts

Contract authorization must rely on canonical Aztec context and stored policy state rather than caller-provided assertions.

## Intended privacy and integrity properties

The current architecture aims to provide:

- policy-bound participation credentials;
- per-survey participation consumption;
- canonical survey-window checks;
- separation of identity predicates from answers;
- aggregate-only result publication;
- minimum total and segment sample thresholds;
- delayed analytics visibility until finalization;
- explicit operational containment controls.

These are architectural objectives, not a claim of formal verification or independent security audit.
