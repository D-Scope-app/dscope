import type {
  AgeBucket,
  NormalizedPredicateOutcome,
  PolicyMatchResult,
  SurveyPolicyV1,
} from "./types";

const AGE_BUCKET_ORDER: Record<AgeBucket, number> = {
  "18_25": 18,
  "26_30": 26,
  "31_35": 31,
  "36_45": 36,
  "46_50": 46,
  "51_55": 51,
  "56_60": 56,
  "61_plus": 61,
  other_unknown: -1,
};

function matchesAge(
  outcome: NormalizedPredicateOutcome,
  policy: SurveyPolicyV1,
): boolean {
  const agePolicy = policy.age;

  if (agePolicy.mode === "any") {
    return true;
  }

  if (agePolicy.mode === "min_age") {
    const minKnownAge = AGE_BUCKET_ORDER[outcome.ageBucket];
    if (minKnownAge < 0) return false;
    return minKnownAge >= agePolicy.min;
  }

  if (agePolicy.mode === "bucket_in") {
    return agePolicy.buckets.includes(outcome.ageBucket);
  }

  return false;
}

function matchesListPolicy(
  value: string,
  mode: "any" | "allow_list" | "deny_list",
  values: string[],
): boolean {
  if (mode === "any") return true;

  const normalizedValue = value.trim().toUpperCase();
  const normalizedList = values.map((v) => v.trim().toUpperCase());

  if (mode === "allow_list") {
    return normalizedList.includes(normalizedValue);
  }

  if (mode === "deny_list") {
    return !normalizedList.includes(normalizedValue);
  }

  return false;
}

function matchesFreshness(
  outcome: NormalizedPredicateOutcome,
  policy: SurveyPolicyV1,
  now = new Date(),
): boolean {
  const freshness = policy.freshness;

  if (freshness.mode === "any") {
    return true;
  }

  if (freshness.mode === "max_age_days") {
    if (!outcome.validUntil) {
      return false;
    }

    const validUntilMs = Date.parse(outcome.validUntil);
    if (Number.isNaN(validUntilMs)) {
      return false;
    }

    return validUntilMs >= now.getTime();
  }

  return false;
}

export function matchPolicy(
  outcome: NormalizedPredicateOutcome,
  policy: SurveyPolicyV1,
  now = new Date(),
): PolicyMatchResult {
  if (!outcome.verified) {
    return {
      eligible: false,
      reasonCode: "verification_failed",
    };
  }

  if (!matchesAge(outcome, policy)) {
    return {
      eligible: false,
      reasonCode: "age_policy_mismatch",
    };
  }

  if (
    !matchesListPolicy(
      outcome.countryBucket,
      policy.countries.mode,
      policy.countries.values,
    )
  ) {
    return {
      eligible: false,
      reasonCode: "country_policy_mismatch",
    };
  }

  if (
    !matchesListPolicy(
      outcome.worldRegion,
      policy.regions.mode,
      policy.regions.values,
    )
  ) {
    return {
      eligible: false,
      reasonCode: "region_policy_mismatch",
    };
  }

  if (!matchesFreshness(outcome, policy, now)) {
    return {
      eligible: false,
      reasonCode: "freshness_expired",
    };
  }

  return {
    eligible: true,
    reasonCode: "verified_and_policy_matched",
  };
}
