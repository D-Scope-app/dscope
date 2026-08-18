export const FIRST_PUBLIC_RELEASE_REWARDS_ENABLED = false;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function isExplicitlyEnabled(value: unknown): boolean {
  return ENABLED_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function isNonZeroOrInvalidNumericField(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  try {
    return BigInt(String(value).trim()) !== 0n;
  } catch {
    return true;
  }
}

function isEnabledOrInvalidBooleanField(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (value === false || value === 0) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return !new Set(["0", "false", "no", "off", "disabled"]).has(normalized);
}

export function isUnsafeRewardsRuntimeConfig(value: unknown): boolean {
  return isExplicitlyEnabled(value);
}

export function validateRewardsDisabledPayload(value: unknown):
  | { ok: true }
  | { ok: false; fields: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: true };
  }

  const body = value as Record<string, unknown>;
  const nestedReward =
    body.reward && typeof body.reward === "object" && !Array.isArray(body.reward)
      ? (body.reward as Record<string, unknown>)
      : {};
  const fields: string[] = [];

  if (
    isEnabledOrInvalidBooleanField(body.rewardEnabled) ||
    isEnabledOrInvalidBooleanField(nestedReward.rewardEnabled)
  ) {
    fields.push("rewardEnabled");
  }

  if (
    isNonZeroOrInvalidNumericField(body.rewardPoolAmount) ||
    isNonZeroOrInvalidNumericField(nestedReward.rewardPoolAmount)
  ) {
    fields.push("rewardPoolAmount");
  }

  if (
    isNonZeroOrInvalidNumericField(body.claimDeadline) ||
    isNonZeroOrInvalidNumericField(nestedReward.claimDeadline)
  ) {
    fields.push("claimDeadline");
  }

  return fields.length > 0 ? { ok: false, fields } : { ok: true };
}

export function isRewardEndpointPath(pathname: string): boolean {
  return (
    /^\/mvp\/surveys\/[^/]+\/(?:reward-claims|reward-status|claim)$/.test(
      pathname,
    ) || pathname.startsWith("/mvp/rewards/")
  );
}

export function isUnsafeClientVerificationCompletionPath(
  pathname: string,
): boolean {
  return /^\/verification-sessions\/[^/]+\/complete$/.test(pathname);
}

export function isPublicParticipationSubmissionPath(pathname: string): boolean {
  return /^\/mvp\/surveys\/[^/]+\/responses$/.test(pathname);
}

export function isUnauthenticatedParticipantReadPath(pathname: string): boolean {
  return (
    /^\/mvp\/participants\/[^/]+\/activity$/.test(pathname) ||
    /^\/mvp\/surveys\/[^/]+\/participant-view$/.test(pathname)
  );
}

export function isDisabledLegacyOrchestrationPath(pathname: string): boolean {
  if (pathname === "/db-check" || pathname === "/surveys") {
    return true;
  }

  if (pathname === "/jobs" || pathname.startsWith("/jobs/")) {
    return true;
  }

  if (!pathname.startsWith("/surveys/")) {
    return false;
  }

  // This is the only legacy-shaped route retained temporarily because the
  // current zkPassport flow still creates sessions under /surveys/:id.
  return !/^\/surveys\/[^/]+\/verification-sessions$/.test(pathname);
}
