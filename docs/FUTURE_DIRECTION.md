# Future direction

This document describes architectural direction, not committed delivery dates or current MVP capabilities.

## 1. Reward architecture

The current MVP keeps rewards disabled. A later phase may let survey sponsors fund respondent reward pools and distribute rewards after valid participation.

The reward layer should also support a sustainable commercial model without requiring respondents to understand gas or protocol mechanics.

## 2. Progressive decentralization

D-Scope currently combines privacy-preserving on-chain components with trusted application/orchestration infrastructure.

Potential longer-term decentralization areas include:

- reducing single-operator dependence in issuer/orchestration paths;
- distributing selected lifecycle/finalization responsibilities;
- making result integrity less dependent on a single backend operator;
- separating protocol-level guarantees from replaceable application services.

Decentralization is a direction, not an MVP checkbox: changes should be adopted where they materially improve trust, resilience or verifiability.

## 3. Expanded predicates

The initial predicate set focuses on age and geography. Future eligibility sources may include, where technically and legally appropriate:

- additional demographic predicates such as gender;
- on-chain activity or asset ownership;
- DAO/community membership;
- reputation/social activity signals;
- optional KYC-derived attestations;
- additional privacy-preserving credentials.

The goal is to let a survey define a verifiable audience without exposing unnecessary raw identity data.

## 4. Wallet and account abstraction

A major product goal is to hide Web3 infrastructure from ordinary respondents.

Future UX work may include embedded accounts, passkeys/email-assisted onboarding, sponsored transactions and other approaches that remove the need for respondents to understand wallets, PXE or fees.

## 5. Modular privacy layer

D-Scope is currently Aztec-first. The application/business layer should remain modular enough to evaluate other privacy or attestation technologies where they provide a clear product advantage.

This does not imply a planned migration or multichain commitment. It is an architectural principle intended to avoid coupling the entire product to one implementation detail.

## 6. Commercial product layer

After free MVP pilots validate demand, D-Scope may evolve toward:

- paid B2B research engagements;
- usage-based pricing linked to respondent volume and service scope;
- contract/subscription models for repeat customers;
- richer aggregate analytics and segmentation;
- reusable organization workflows and pilot/customer integrations.
