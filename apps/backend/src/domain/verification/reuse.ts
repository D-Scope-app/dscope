import { matchPredicateOutcomeToPolicy } from "./policy";
import type {
  NormalizedPredicateOutcome,
  ReuseDecision,
  SurveyPredicatePolicy,
} from "./types";

function isExpired(
  validUntil: string | null | undefined,
  now = new Date(),
): boolean {
  if (!validUntil) {
    return false;
  }

  const parsed = new Date(validUntil);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  return parsed.getTime() <= now.getTime();
}

export function evaluateOutcomeReuse(
  outcome: NormalizedPredicateOutcome,
  policy: SurveyPredicatePolicy,
  now = new Date(),
): ReuseDecision {
  if (!outcome.verified) {
    return {
      reusable: false,
      reasonCode: "outcome_not_verified",
    };
  }

  if (policy.requireFreshVerification) {
    return {
      reusable: false,
      reasonCode: "fresh_verification_required",
    };
  }

  if (isExpired(outcome.validUntil, now)) {
    return {
      reusable: false,
      reasonCode: "outcome_expired",
    };
  }

  const policyDecision = matchPredicateOutcomeToPolicy(outcome, policy);

  if (!policyDecision.eligible) {
    return {
      reusable: false,
      reasonCode: policyDecision.reasonCode,
    };
  }

  return {
    reusable: true,
    reasonCode: "reused_outcome_allowed",
  };
}
