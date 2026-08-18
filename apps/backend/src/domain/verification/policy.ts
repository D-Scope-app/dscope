import type {
  NormalizedPredicateOutcome,
  PolicyDecision,
  SurveyPredicatePolicy,
} from "./types";

function includesIgnoreCase(values: string[], target: string): boolean {
  const normalizedTarget = target.trim().toUpperCase();
  return values.some(
    (value) => value.trim().toUpperCase() === normalizedTarget,
  );
}

export function matchPredicateOutcomeToPolicy(
  outcome: NormalizedPredicateOutcome,
  policy: SurveyPredicatePolicy,
): PolicyDecision {
  if (!outcome.verified) {
    return {
      eligible: false,
      reasonCode: "predicate_verification_failed",
    };
  }

  if (
    Array.isArray(policy.allowedCountries) &&
    policy.allowedCountries.length > 0 &&
    !includesIgnoreCase(policy.allowedCountries, outcome.countryBucket)
  ) {
    return {
      eligible: false,
      reasonCode: "country_not_allowed",
    };
  }

  if (
    Array.isArray(policy.allowedWorldRegions) &&
    policy.allowedWorldRegions.length > 0 &&
    !policy.allowedWorldRegions.includes(outcome.worldRegion)
  ) {
    return {
      eligible: false,
      reasonCode: "world_region_not_allowed",
    };
  }

  if (
    Array.isArray(policy.allowedAgeBuckets) &&
    policy.allowedAgeBuckets.length > 0 &&
    !policy.allowedAgeBuckets.includes(outcome.ageBucket)
  ) {
    return {
      eligible: false,
      reasonCode: "age_bucket_not_allowed",
    };
  }

  return {
    eligible: true,
    reasonCode: "verified_and_policy_matched",
  };
}
