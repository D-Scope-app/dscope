import type { AnalyticsMvpResultPayload } from "../analytics/analytics-mvp";
import type { RewardMvpAccounting } from "../rewards/reward-mvp";

export type FinalizationMvpInput = {
  surveyKey: string;
  policyHash: string;
  generatedAt: string;
  analyticsPayload: AnalyticsMvpResultPayload;
  rewardAccounting: RewardMvpAccounting;
};

export type FinalizationMvpPayload = {
  version: 1;
  kind: "dscope_finalization_mvp";
  surveyKey: string;
  policyHash: string;
  generatedAt: string;
  finalParticipantCount: string;
  resultPayload: AnalyticsMvpResultPayload;
  rewardDistributionPayload: {
    version: 1;
    kind: "dscope_reward_distribution_mvp";
    surveyKey: string;
    policyHash: string;
    finalParticipantCount: string;
    rewardAccounting: RewardMvpAccounting;
  };
};

export type FinalizationMvpContractArgs = {
  surveyKey: string;
  policyHash: string;
  resultHash: string;
  distributionHash: string;
  finalParticipantCount: string;
  finalizedAt: string;
  currentTime: string;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}

// MVP deterministic hash placeholder.
// Not cryptographic. Replace later with canonical hash compatible with protocol requirements.
export function computeMvpNumericHash(value: unknown): string {
  const input = stableStringify(value);

  let hash = 2166136261n;
  const prime = 16777619n;
  const modulo = 2n ** 64n;

  for (let i = 0; i < input.length; i += 1) {
    hash = hash ^ BigInt(input.charCodeAt(i));
    hash = (hash * prime) % modulo;
  }

  if (hash === 0n) {
    return "1";
  }

  return hash.toString();
}

export function buildFinalizationMvpPayload(
  input: FinalizationMvpInput,
): FinalizationMvpPayload {
  const finalParticipantCount =
    input.analyticsPayload.totalValidParticipants.toString();

  return {
    version: 1,
    kind: "dscope_finalization_mvp",
    surveyKey: input.surveyKey,
    policyHash: input.policyHash,
    generatedAt: input.generatedAt,
    finalParticipantCount,
    resultPayload: input.analyticsPayload,
    rewardDistributionPayload: {
      version: 1,
      kind: "dscope_reward_distribution_mvp",
      surveyKey: input.surveyKey,
      policyHash: input.policyHash,
      finalParticipantCount,
      rewardAccounting: input.rewardAccounting,
    },
  };
}

export function buildFinalizationMvpContractArgs(input: {
  payload: FinalizationMvpPayload;
  finalizedAt: string;
  currentTime?: string;
}): FinalizationMvpContractArgs {
  const resultHash = computeMvpNumericHash(input.payload.resultPayload);
  const distributionHash = computeMvpNumericHash(
    input.payload.rewardDistributionPayload,
  );

  return {
    surveyKey: input.payload.surveyKey,
    policyHash: input.payload.policyHash,
    resultHash,
    distributionHash,
    finalParticipantCount: input.payload.finalParticipantCount,
    finalizedAt: input.finalizedAt,
    currentTime: input.currentTime ?? input.finalizedAt,
  };
}
