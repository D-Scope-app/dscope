export type PredicateSource = "zkpassport";

export type AgeBucket =
  | "18_25"
  | "26_30"
  | "31_35"
  | "36_45"
  | "46_50"
  | "51_55"
  | "56_60"
  | "61_plus"
  | "other_unknown";

export type WorldRegion =
  | "EUROPE"
  | "EECA"
  | "NORTH_AMERICA"
  | "LATIN_AMERICA"
  | "MENA"
  | "SUB_SAHARAN_AFRICA"
  | "SOUTH_ASIA"
  | "SOUTHEAST_ASIA"
  | "EAST_ASIA"
  | "OCEANIA"
  | "OTHER_UNKNOWN";

export type AgePolicy =
  | {
      mode: "any";
      min: null;
      buckets: [];
    }
  | {
      mode: "min_age";
      min: number;
      buckets: [];
    }
  | {
      mode: "bucket_in";
      min: null;
      buckets: AgeBucket[];
    };

export type ListPolicyMode = "any" | "allow_list" | "deny_list";

export interface CountryPolicy {
  mode: ListPolicyMode;
  values: string[];
}

export interface RegionPolicy {
  mode: ListPolicyMode;
  values: WorldRegion[];
}

export type FreshnessPolicy =
  | {
      mode: "any";
      days: null;
    }
  | {
      mode: "max_age_days";
      days: number;
    };

export interface SurveyPolicyV1 {
  version: 1;
  predicateSource: PredicateSource;
  age: AgePolicy;
  countries: CountryPolicy;
  regions: RegionPolicy;
  freshness: FreshnessPolicy;
}

export interface NormalizedPredicateOutcome {
  verified: boolean;
  subjectHash: string;
  ageBucket: AgeBucket;
  countryBucket: string;
  worldRegion: WorldRegion;
  validUntil: string | null;
  providerPayloadVersion: string | null;
}

export type PolicyReasonCode =
  | "verified_and_policy_matched"
  | "verification_failed"
  | "age_policy_mismatch"
  | "country_policy_mismatch"
  | "region_policy_mismatch"
  | "freshness_expired";

export interface PolicyMatchResult {
  eligible: boolean;
  reasonCode: PolicyReasonCode;
}
