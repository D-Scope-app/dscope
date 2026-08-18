export const AGE_BUCKETS = [
  "18_25",
  "26_30",
  "31_35",
  "36_45",
  "46_50",
  "51_55",
  "56_60",
  "61_plus",
  "other_unknown",
] as const;

export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const WORLD_REGIONS = [
  "EUROPE",
  "EECA",
  "NORTH_AMERICA",
  "LATIN_AMERICA",
  "MENA",
  "SUB_SAHARAN_AFRICA",
  "SOUTH_ASIA",
  "SOUTHEAST_ASIA",
  "EAST_ASIA",
  "OCEANIA",
  "OTHER_UNKNOWN",
] as const;

export type WorldRegion = (typeof WORLD_REGIONS)[number];

export const VERIFICATION_SESSION_STATUSES = [
  "created",
  "request_issued",
  "proof_pending",
  "result_received",
  "verified",
  "rejected",
  "failed",
  "expired",
  "reused",
] as const;

export type VerificationSessionStatus =
  (typeof VERIFICATION_SESSION_STATUSES)[number];

export const ELIGIBILITY_STATUSES = [
  "eligible",
  "rejected",
  "consumed",
  "expired",
] as const;

export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const DECISION_SOURCES = [
  "fresh_verification",
  "reused_outcome",
] as const;

export type DecisionSource = (typeof DECISION_SOURCES)[number];

export interface RawVerificationResult {
  verified: boolean;
  uniqueIdentifier?: string | null;
  result?: unknown;
}

export interface NormalizedPredicateOutcome {
  verified: boolean;
  subjectHash: string;
  ageBucket: AgeBucket;
  countryBucket: string;
  worldRegion: WorldRegion;
  validUntil: string | null;
  providerPayloadVersion?: string | null;
}

export interface SurveyPredicatePolicy {
  allowedCountries?: string[] | null;
  allowedWorldRegions?: WorldRegion[] | null;
  allowedAgeBuckets?: AgeBucket[] | null;
  minAge?: number | null;
  requireFreshVerification?: boolean;
}

export interface PolicyDecision {
  eligible: boolean;
  reasonCode: string;
}

export interface ReuseDecision {
  reusable: boolean;
  reasonCode: string;
}

export function isAgeBucket(value: unknown): value is AgeBucket {
  return typeof value === "string" && AGE_BUCKETS.includes(value as AgeBucket);
}

export function isWorldRegion(value: unknown): value is WorldRegion {
  return (
    typeof value === "string" && WORLD_REGIONS.includes(value as WorldRegion)
  );
}

export function isVerificationSessionStatus(
  value: unknown,
): value is VerificationSessionStatus {
  return (
    typeof value === "string" &&
    VERIFICATION_SESSION_STATUSES.includes(value as VerificationSessionStatus)
  );
}

export function isEligibilityStatus(
  value: unknown,
): value is EligibilityStatus {
  return (
    typeof value === "string" &&
    ELIGIBILITY_STATUSES.includes(value as EligibilityStatus)
  );
}
