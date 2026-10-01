# D-Scope architecture

## Objective

D-Scope collects eligibility-gated survey responses while minimizing the personal information revealed to survey creators, backend infrastructure and public observers.

The current MVP separates four concerns:

- identity predicate verification;
- private participation authorization;
- survey orchestration and lifecycle management;
- thresholded aggregate reporting.

## System overview

```text
Creator / Respondent Web App
          |
          +--> zkPassport verification boundary
          |       -> age / country / region predicates
          |
          +--> Aztec wallet / PXE boundary
          |       -> private credential
          |       -> survey-specific participation
          |
          +--> Cloudflare Worker + D1
                  -> survey metadata
                  -> verification sessions
                  -> orchestration jobs / checkpoints
                  -> aggregate application state
                          |
                          +--> restricted runner / issuer services
                                   |
                                   +--> Aztec contracts
                                         ParticipationGateV2
                                         DScopeCore
                                         SurveyFactory
```

## Web application

The React/Vite application provides creator and respondent flows, including survey creation, eligibility verification, private participation, lifecycle status and finalized aggregate results.

The current MVP entry path is `frontend/mvp.html` -> `frontend/src/app/main.tsx` -> `frontend/src/app/App.tsx`.

## Verification boundary

zkPassport verification establishes selected predicates such as age bucket and geographic eligibility. Raw passport documents are not intended to be committed to Aztec or exposed in public survey results.

Verification sessions are short-lived, rate-limited and tied to the configured verifier boundary. Client-provided eligibility claims alone are not authoritative.

## Wallet and private execution

The current respondent flow uses AzGuard with Aztec 5.2-era wallet tooling. Eligible respondents receive/use private credential state through the Aztec wallet/PXE boundary and submit private participation transactions.

The wallet/PXE boundary owns private wallet state. Browser-provided timestamps, eligibility fields and transaction claims are not authoritative for contract authorization.

D-Scope is evaluating lower-friction embedded/passkey-style onboarding, but that is not yet the public MVP architecture.

## Worker and D1

The Cloudflare Worker provides public and internal APIs. D1 stores application and orchestration state such as:

- creator accounts and approval state;
- survey metadata and lifecycle state;
- verification sessions;
- runner jobs and checkpoints;
- participation/application records used for orchestration;
- aggregate records;
- operational heartbeats and pauses.

D1 is not the authority for private Aztec contract state.

## Restricted runner / issuer path

The current MVP uses trusted operational components for actions that should not execute directly inside a public request, including contract orchestration, policy registration, lifecycle synchronization, credential issuance coordination and finalization.

This means the current MVP is a **hybrid architecture**, not a fully decentralized service. Progressive reduction of these trusted components is a longer-term direction rather than a claim about the present system.

## Aztec contracts

| Contract | Responsibility |
| --- | --- |
| `ParticipationGateV2` | Private credential storage, eligibility-policy checks, survey-window enforcement and participation consumption |
| `DScopeCore` | Survey anchors, lifecycle data and finalized aggregate commitments |
| `SurveyFactory` | Survey-instance registration |
| `RewardVaultMVP` | Experimental reward accounting; currently disabled |

The current Noir dependency line targets Aztec `v5.2.0`. Generated TypeScript bindings required by the frontend and runner are committed; compiler `target/` directories are not.

## Survey lifecycle

1. A creator is approved and authenticated.
2. The creator defines survey metadata, duration and eligibility policy.
3. The Worker creates orchestration state/jobs.
4. The restricted runner registers/deploys the required Aztec survey components and policy.
5. A respondent completes zkPassport verification for the configured predicates.
6. An eligible private credential becomes available to the wallet flow.
7. The respondent submits a private participation transaction.
8. `ParticipationGateV2` validates the credential, configured policy, canonical survey window and prior consumption state.
9. The application records the survey answer for aggregate processing without publishing respondent identity attributes as raw public data.
10. After the survey closes, the runner finalizes the survey and the result commitments/aggregate outputs become available subject to sample thresholds.

## Current trust boundaries

### Browser / wallet

Private wallet state belongs at the wallet/PXE boundary. The browser UI is not trusted to assert eligibility or canonical chain time.

### Verification service

The application trusts its configured verification boundary to accept zkPassport-derived eligibility claims. A future architecture may reduce or distribute this trust further.

### Worker API / D1

The Worker is an application orchestration component, not the private-state authority. Public endpoints are rate-limited; internal administration and runner endpoints use separate authorization.

### Runner / issuer

The runner and issuer are operationally privileged in the MVP. Their credentials and execution environment must remain outside the browser and public repository.

### Contracts

Contract authorization relies on Aztec context and stored policy/private state rather than caller-supplied assertions.

## Privacy and integrity objectives

The current architecture aims to provide:

- policy-bound private participation credentials;
- survey-specific participation consumption;
- canonical survey-window checks;
- separation of eligibility predicates from answers;
- aggregate-oriented result publication;
- minimum total/segment sample thresholds;
- delayed analytics visibility until finalization;
- explicit operational containment controls.

These are engineering objectives, not claims of formal verification or an independent security audit.
