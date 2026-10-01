import {
  hashVerificationClientToken as hashResponseVerificationToken,
  safeStringEqual as responseSafeStringEqual,
} from "../domain/verification/trusted-zkpassport";
import { D1MvpRunnerStore } from "../domain/runner/d1-mvp-runner-store";
import type { D1DatabaseLike } from "../domain/runner/d1-mvp-runner-store";
import type { SurveyPolicyV1 } from "../domain/policy/types";
import { hasValidBearerToken } from "../security/internal-auth";
import {
  buildAnalyticsMvpResultEnvelope,
  buildAnalyticsMvpResultPayload,
  type AnalyticsMvpParticipationRecord,
  type AnalyticsMvpQuestionDefinition,
  type SurveyAnswerRecord,
} from "../domain/analytics/analytics-mvp";
import {
  FIRST_PUBLIC_RELEASE_REWARDS_ENABLED,
  isPublicParticipationSubmissionPath,
  isRewardEndpointPath,
  validateRewardsDisabledPayload,
} from "../security/public-launch-policy";

export type MvpSurveyRoutesEnv = {
  dscope_db: D1DatabaseLike;
  INTERNAL_RUNNER_TOKEN?: string;
  MVP_ENABLE_TEST_DURATION?: string;
};

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

type MvpSurveyRow = {
  id: string;
  survey_key: string;
  sponsor: string | null;
  title: string | null;
  status: string;
  metadata_hash: string | null;
  predicate_policy_hash: string | null;
  creator_workspace_id?: string | null;
  creator_display_name?: string | null;
  operator_address?: string | null;
  created_by_operator?: number | null;
  created_at: string;
  updated_at: string;
};

type MvpSurveyMetadataRow = {
  survey_id: string;
  survey_key: string;
  title: string;
  description: string | null;
  questions_json: string;
  created_at: string;
  updated_at: string;
};

type SurveyQuestionType = "single_choice" | "multiple_choice" | "short_text";

type SurveyQuestion = {
  id: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[];
};

type MvpSurveyContractsRow = {
  survey_id: string;
  survey_key: string;
  survey_factory_address: string | null;
  dscope_core_address: string | null;
  participation_gate_address: string | null;
  reward_vault_address: string | null;
  created_at: string;
  updated_at: string;
};

type MvpSurveyRewardRow = {
  survey_id: string;
  survey_key: string;
  reward_enabled: number;
  reward_pool_amount: string;
  claim_deadline: string | null;
  reward_status: string | null;
  reward_per_participant: string | null;
  total_allocated: string | null;
  dust_return_to_sponsor: string | null;
  distribution_hash: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

type MvpSurveyResultRow = {
  survey_id: string;
  survey_key: string;
  result_hash: string | null;
  distribution_hash: string | null;
  final_participant_count: string | null;
  analytics_payload_json: string | null;
  reward_payload_json: string | null;
  finalization_payload_json: string | null;
  created_at: string;
  updated_at: string;
};

type MvpSurveyListRow = MvpSurveyRow & {
  metadata_title: string | null;
  metadata_description: string | null;
  metadata_questions_json: string | null;
  reward_enabled: number | null;
  reward_pool_amount: string | null;
  claim_deadline: string | null;
  reward_status: string | null;
  final_participant_count: string | null;
  participants_count: number | null;
  creator_workspace_id: string | null;
  creator_display_name: string | null;
  operator_address: string | null;
  created_by_operator: number | null;
  legacy_start_time: string | number | null;
  legacy_end_time: string | number | null;
  legacy_network: string | null;
};

type MvpRewardClaimRow = {
  id: string;
  survey_id: string;
  survey_key: string;
  participant_ref: string;
  claim_status: string;
  claim_amount: string;
  claim_deadline: string | null;
  claim_tx_hash: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MvpParticipationRecordRow = {
  id: string;
  survey_id: string;
  survey_key: string;
  participant_ref: string;
  participation_status: string;
  eligible_for_reward: number;
  participated_at: string | null;
  participation_tx_hash: string | null;
  predicate_snapshot_json: string | null;
  answer_snapshot_json: string | null;
  created_at: string;
  updated_at: string;
};

type AnalyticsParticipationRecordRow = {
  participant_ref: string;
  survey_key: string;
  participation_status: string;
  predicate_snapshot_json: string | null;
  answer_snapshot_json: string | null;
};

type SurveyAnalyticsSettingsRow = {
  analytics_min_total_sample: string | number | null;
  analytics_min_segment_sample: string | number | null;
};

type SurveyParticipationEligibilityRow = {
  id: string;
  survey_id: string;
  wallet_address: string;
  subject_hash: string;
  predicate_outcome_id: string;
  eligibility_status: string;
  reason_code: string | null;
  decision_source: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PredicateOutcomeRow = {
  id: string;
  verification_session_id: string;
  subject_hash: string;
  source: string;
  verified: number;
  age_bucket: string;
  country_bucket: string;
  world_region: string | null;
  valid_until: string | null;
  provider_payload_version: string | null;
  created_at: string;
};

type LegacyParticipationRecordRow = {
  id: string;
  survey_id: string;
  wallet_address: string;
  subject_hash: string;
  eligibility_id: string;
  created_at: string;
};

type SubmittedSurveyAnswer = {
  questionId: string;
  type: SurveyQuestionType | "unknown";
  title: string | null;
  value: string | string[];
};

type SubmitMvpSurveyResponseBody = {
  participantRef?: string;
  answers?: unknown;
  answerSnapshot?: unknown;
  participationTxHash?: string | null;
};

type MvpRunnerJobRow = {
  id: string;
  type: string;
  status: string;
  survey_id: string | null;
  survey_key: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  locked_by: string | null;
  finished_at: string | null;
};

type CredentialBacklogLevel = "normal" | "queued" | "high_demand";

type CredentialQueueStatsRow = {
  pending_jobs: number | null;
  running_jobs: number | null;
  oldest_pending_at: string | null;
};

type CredentialIssuerHeartbeatRow = {
  status: string | null;
  last_seen_at: string | null;
};

type OpsPauseRow = {
  id: string;
  scope: string;
  survey_id: string | null;
  is_paused: number;
  reason: string | null;
  message: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type ParticipationPauseStatus = {
  paused: boolean;
  scope: "global" | "survey" | null;
  reason: string | null;
  message: string | null;
  globalPaused: boolean;
  surveyPaused: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
};

type MvpRunnerEventRow = {
  id: string;
  job_id: string;
  type: string;
  message: string;
  data_json: string | null;
  created_at: string;
};

type MvpCreatorWorkspaceRow = {
  id: string;
  creator_account_id?: string | null;
  organization_name: string;
  contact_email: string;
  owner_wallet_address: string | null;
  status: string;
};

type CreatorSessionWorkspaceRow = {
  account_id: string;
  email: string;
  workspace_id: string | null;
  organization_name: string | null;
  contact_email: string | null;
  owner_wallet_address: string | null;
  workspace_status: string | null;
};

type CreateMvpSurveyBody = {
  surveyId?: string;
  surveyKey?: string;
  onChainSurveyKey?: string;
  sponsor?: string;
  creatorWorkspaceId?: string | null;
  creatorDisplayName?: string | null;
  operatorAddress?: string | null;
  createdByOperator?: boolean;
  title?: string;
  description?: string;
  questions?: unknown;

  network?: string;
  treasury?: string;
  systemFinalizer?: string;

  metadataHash?: string;
  predicatePolicyHash?: string;
  predicatePolicyJson?: SurveyPolicyV1 | null;

  startTime?: number;
  endTime?: number;
  durationPreset?: string;
  testMode?: boolean;

  ageBuckets?: string[] | "ANY";
  countries?: string[] | "ANY";
  regions?: string[] | "ANY";

  // Newer/public MVP frontend shape. Keep nested analytics/reward below too.
  analyticsMinTotalSample?: string;
  analyticsMinSegmentSample?: string;
  analyticsVisibilityMode?: string;

  rewardEnabled?: boolean;
  rewardPoolAmount?: string;
  claimDeadline?: string | null;

  analytics?: {
    minTotalSample?: string;
    minSegmentSample?: string;
    visibilityMode?: string;
  };

  reward?: {
    rewardEnabled?: boolean;
    rewardPoolAmount?: string;
    claimDeadline?: string | null;
  };
};

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function safeJsonParse(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown> | null,
  keys: string[],
  fallback = "OTHER_UNKNOWN",
): string {
  for (const key of keys) {
    const raw = record?.[key];
    const value = String(raw ?? "").trim();

    if (value) {
      return value;
    }
  }

  return fallback;
}

function normalizePrivacyThreshold(value: unknown, minimum: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return minimum;
  }

  return Math.max(minimum, Math.floor(numeric));
}

function normalizeAnalyticsAnswerValue(
  value: unknown,
): string | number | boolean | string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value ?? "").trim();
}

function answersFromSnapshot(answerSnapshot: unknown): SurveyAnswerRecord[] {
  const snapshot = asObject(answerSnapshot);
  const rawAnswers = snapshot?.answers;

  if (!Array.isArray(rawAnswers)) {
    return [];
  }

  const answers: SurveyAnswerRecord[] = [];

  for (const item of rawAnswers) {
    const answer = asObject(item);
    const questionId = String(answer?.questionId ?? answer?.id ?? "").trim();

    if (!questionId) {
      continue;
    }

    answers.push({
      questionId,
      answer: normalizeAnalyticsAnswerValue(
        answer?.value ?? answer?.answer ?? "",
      ),
    });
  }

  return answers;
}

async function buildFinalizedAnalyticsSnapshot(input: {
  db: D1DatabaseLike;
  surveyId: string;
  surveyKey: string;
  policyHash: string;
}) {
  const settings = await getFirst<SurveyAnalyticsSettingsRow>(
    input.db,
    `
    SELECT analytics_min_total_sample, analytics_min_segment_sample
    FROM surveys
    WHERE id = ?
    LIMIT 1
    `,
    input.surveyId,
  );

  const privacy = {
    minTotalSample: normalizePrivacyThreshold(
      settings?.analytics_min_total_sample,
      10,
    ),
    minSegmentSample: normalizePrivacyThreshold(
      settings?.analytics_min_segment_sample,
      5,
    ),
  };

  const metadata = await getFirst<MvpSurveyMetadataRow>(
    input.db,
    `
    SELECT *
    FROM mvp_survey_metadata
    WHERE survey_id = ?
    LIMIT 1
    `,
    input.surveyId,
  );
  const questions = safeParseQuestions(metadata?.questions_json ?? null).map(
    (question): AnalyticsMvpQuestionDefinition => ({
      id: question.id,
      type: question.type,
      title: question.title,
      options: question.options ?? [],
    }),
  );

  const rows = await getAll<AnalyticsParticipationRecordRow>(
    input.db,
    `
    SELECT
      participant_ref,
      survey_key,
      participation_status,
      predicate_snapshot_json,
      answer_snapshot_json
    FROM mvp_participation_records
    WHERE survey_id = ?
      AND participation_status = 'participated'
    ORDER BY participated_at ASC, created_at ASC
    `,
    input.surveyId,
  );

  const records: AnalyticsMvpParticipationRecord[] = rows.map((row) => {
    const predicateSnapshot = asObject(
      safeJsonParse(row.predicate_snapshot_json),
    );
    const answerSnapshot = safeJsonParse(row.answer_snapshot_json);

    return {
      participantRef: row.participant_ref,
      surveyKey: row.survey_key || input.surveyKey,
      valid: row.participation_status === "participated",
      ageBucket: stringField(predicateSnapshot, ["ageBucket", "age_bucket"]),
      country: stringField(predicateSnapshot, [
        "countryBucket",
        "country",
        "country_bucket",
      ]),
      region: stringField(predicateSnapshot, [
        "worldRegion",
        "region",
        "world_region",
      ]),
      answers: answersFromSnapshot(answerSnapshot),
    };
  });

  const analyticsPayload = buildAnalyticsMvpResultPayload({
    surveyKey: input.surveyKey,
    records,
    questions,
    privacy,
  });
  const generatedAt = nowIso();
  const finalizationPayload = buildAnalyticsMvpResultEnvelope({
    surveyKey: input.surveyKey,
    policyHash: input.policyHash,
    generatedAt,
    payload: analyticsPayload,
  });

  return {
    analyticsPayload,
    finalizationPayload,
    finalParticipantCount: String(analyticsPayload.totalValidParticipants),
    generatedAt,
  };
}

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

function secondsSinceIso(
  value: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor((nowMs - parsed) / 1000));
}

function credentialBacklogLevel(pendingJobs: number): CredentialBacklogLevel {
  if (pendingJobs >= 100) return "high_demand";
  if (pendingJobs >= 20) return "queued";
  return "normal";
}

function isInternalAuthorized(
  request: Request,
  env: MvpSurveyRoutesEnv,
): boolean {
  return hasValidBearerToken(request, env.INTERNAL_RUNNER_TOKEN);
}

function requireInternalAuthorization(
  request: Request,
  env: MvpSurveyRoutesEnv,
): Response | null {
  if (isInternalAuthorized(request, env)) {
    return null;
  }

  return errorResponse(
    401,
    "internal_endpoint_unauthorized",
    "Missing or invalid internal runner token",
  );
}

function buildClaimId(surveyId: string, participantRef: string): string {
  const safeParticipantRef = participantRef
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  return `claim_${surveyId}_${safeParticipantRef}`;
}

function buildParticipationRecordId(
  surveyId: string,
  participantRef: string,
): string {
  const safeParticipantRef = participantRef
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  return `participation_${surveyId}_${safeParticipantRef}`;
}

function normalizeSelection(value: unknown): string[] | "ANY" {
  if (value === "ANY" || value === undefined || value === null) {
    return "ANY";
  }

  if (!Array.isArray(value)) {
    return "ANY";
  }

  const normalized = value.map((item) => String(item).trim()).filter(Boolean);

  return normalized.length > 0 ? normalized : "ANY";
}

function validatePredicatePolicyAllowLists(
  policy: unknown,
): string | null {
  if (policy === undefined || policy === null) return null;

  const root = asObject(policy);
  if (!root) return "predicatePolicyJson must be an object";

  const age = asObject(root.age);
  if (age?.mode === "bucket_in") {
    const buckets = Array.isArray(age.buckets)
      ? age.buckets.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (buckets.length === 0) {
      return "age bucket_in policy must include at least one bucket";
    }
  }

  for (const field of ["countries", "regions"] as const) {
    const selection = asObject(root[field]);
    if (selection?.mode !== "allow_list") continue;

    const values = Array.isArray(selection.values)
      ? selection.values.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (values.length === 0) {
      return `${field} allow_list policy must include at least one value`;
    }
  }

  return null;
}

function selectionFromPolicyAge(
  policy: SurveyPolicyV1 | null | undefined,
): string[] | "ANY" | undefined {
  if (!policy || !policy.age || policy.age.mode === "any") {
    return undefined;
  }

  if (policy.age.mode === "bucket_in") {
    return normalizeSelection(policy.age.buckets);
  }

  return undefined;
}

function selectionFromPolicyCountries(
  policy: SurveyPolicyV1 | null | undefined,
): string[] | "ANY" | undefined {
  if (!policy || !policy.countries || policy.countries.mode === "any") {
    return undefined;
  }

  if (policy.countries.mode === "allow_list") {
    return normalizeSelection(policy.countries.values);
  }

  return undefined;
}

function selectionFromPolicyRegions(
  policy: SurveyPolicyV1 | null | undefined,
): string[] | "ANY" | undefined {
  if (!policy || !policy.regions || policy.regions.mode === "any") {
    return undefined;
  }

  if (policy.regions.mode === "allow_list") {
    return normalizeSelection(policy.regions.values);
  }

  return undefined;
}

function isRewardEnabled(body: CreateMvpSurveyBody): boolean {
  if (typeof body.reward?.rewardEnabled === "boolean") {
    return body.reward.rewardEnabled;
  }

  if (typeof body.rewardEnabled === "boolean") {
    return body.rewardEnabled;
  }

  return false;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isNonZeroFieldString(value: unknown): value is string {
  const normalized = optionalString(value);
  if (!normalized) return false;

  try {
    return BigInt(normalized) !== 0n;
  } catch {
    return false;
  }
}

function stableNonZeroFieldHash(input: unknown, salt: string): string {
  const serialized = JSON.stringify({ salt, input });
  let hash = 1469598103934665603n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;

  for (let i = 0; i < serialized.length; i += 1) {
    hash ^= BigInt(serialized.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  if (hash === 0n) return "1";
  return hash.toString();
}

type SurveyDurationPreset =
  | "1h"
  | "24h"
  | "3d"
  | "7d"
  | "14d"
  | "30d"
  | "15m_test";

type ResolvedSurveySchedule = {
  durationPreset: SurveyDurationPreset | "custom";
  startTime: number;
  endTime: number;
  durationSeconds: number;
  isTestDuration: boolean;
};

const PUBLIC_SURVEY_DURATION_SECONDS: Record<
  Exclude<SurveyDurationPreset, "15m_test">,
  number
> = {
  "1h": 60 * 60,
  "24h": 24 * 60 * 60,
  "3d": 3 * 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "14d": 14 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

function asPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveSurveySchedule(
  body: CreateMvpSurveyBody,
  env: MvpSurveyRoutesEnv,
  nowSeconds: number,
  network: string,
): ResolvedSurveySchedule {
  const rawPreset = optionalString(body.durationPreset) || "7d";
  const allowTestDuration =
    body.testMode === true ||
    env.MVP_ENABLE_TEST_DURATION === "1" ||
    network === "aztec-local";

  if (rawPreset === "15m_test") {
    if (!allowTestDuration) {
      throw new Error("15m_test duration is available only in test/dev mode");
    }

    const durationSeconds = 15 * 60;
    return {
      durationPreset: "15m_test",
      startTime: nowSeconds,
      endTime: nowSeconds + durationSeconds,
      durationSeconds,
      isTestDuration: true,
    };
  }

  if (rawPreset in PUBLIC_SURVEY_DURATION_SECONDS) {
    const preset = rawPreset as Exclude<SurveyDurationPreset, "15m_test">;
    const durationSeconds = PUBLIC_SURVEY_DURATION_SECONDS[preset];
    return {
      durationPreset: preset,
      startTime: nowSeconds,
      endTime: nowSeconds + durationSeconds,
      durationSeconds,
      isTestDuration: false,
    };
  }

  const explicitStartTime = asPositiveInteger(body.startTime);
  const explicitEndTime = asPositiveInteger(body.endTime);

  if (explicitStartTime !== null && explicitEndTime !== null) {
    const durationSeconds = explicitEndTime - explicitStartTime;
    if (durationSeconds <= 0) {
      throw new Error("Survey endTime must be greater than startTime");
    }

    return {
      durationPreset: "custom",
      startTime: explicitStartTime,
      endTime: explicitEndTime,
      durationSeconds,
      isTestDuration: durationSeconds <= 15 * 60,
    };
  }

  throw new Error(
    "Unsupported survey duration. Use one of: 1h, 24h, 3d, 7d, 14d, 30d, 15m_test",
  );
}

function isSurveyQuestionType(value: unknown): value is SurveyQuestionType {
  return (
    value === "single_choice" ||
    value === "multiple_choice" ||
    value === "short_text"
  );
}

function normalizeSurveyQuestions(
  value: unknown,
  settings: { allowShortText?: boolean } = {},
): SurveyQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rawQuestion, index): SurveyQuestion | null => {
      if (!rawQuestion || typeof rawQuestion !== "object") {
        return null;
      }

      const question = rawQuestion as Record<string, unknown>;
      const title = String(question.title ?? "").trim();

      if (!title) {
        return null;
      }

      const rawType = isSurveyQuestionType(question.type)
        ? question.type
        : "single_choice";
      const type =
        rawType === "short_text" && settings.allowShortText === false
          ? "single_choice"
          : rawType;

      const id =
        String(question.id ?? `q_${index + 1}`).trim() || `q_${index + 1}`;
      const description = String(question.description ?? "").trim();

      const questionOptions = Array.isArray(question.options)
        ? question.options
            .map((option) => String(option).trim())
            .filter(Boolean)
        : [];

      return {
        id,
        type,
        title,
        ...(description ? { description } : {}),
        required: question.required !== false,
        ...(type === "short_text" ? {} : { options: questionOptions }),
      };
    })
    .filter((question): question is SurveyQuestion => question !== null);
}

function safeParseQuestions(value: string | null): SurveyQuestion[] {
  const parsed = safeJsonParse(value);

  return normalizeSurveyQuestions(parsed);
}

function isBlankAnswerValue(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return value.trim().length === 0;
}

function normalizeAnswerValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value ?? "").trim();
}

function normalizeSubmittedAnswers(
  rawAnswers: unknown,
  questions: SurveyQuestion[],
):
  | { ok: true; answers: SubmittedSurveyAnswer[] }
  | { ok: false; code: string; message: string } {
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const entries: Array<{ questionId: string; value: unknown }> = [];

  if (Array.isArray(rawAnswers)) {
    for (const item of rawAnswers) {
      if (!item || typeof item !== "object") {
        return {
          ok: false,
          code: "invalid_answer_item",
          message: "Each answer must be an object",
        };
      }

      const answer = item as Record<string, unknown>;
      const questionId = String(answer.questionId ?? answer.id ?? "").trim();

      if (!questionId) {
        return {
          ok: false,
          code: "missing_question_id",
          message: "Each answer must include questionId",
        };
      }

      entries.push({
        questionId,
        value: answer.value ?? answer.answer ?? "",
      });
    }
  } else if (rawAnswers && typeof rawAnswers === "object") {
    for (const [questionId, value] of Object.entries(
      rawAnswers as Record<string, unknown>,
    )) {
      entries.push({ questionId, value });
    }
  } else {
    return {
      ok: false,
      code: "invalid_answers_payload",
      message: "answers must be an array or an object keyed by question id",
    };
  }

  const seen = new Set<string>();
  const normalizedByQuestionId = new Map<string, SubmittedSurveyAnswer>();

  for (const entry of entries) {
    if (seen.has(entry.questionId)) {
      return {
        ok: false,
        code: "duplicate_answer",
        message: `Duplicate answer for question '${entry.questionId}'`,
      };
    }

    seen.add(entry.questionId);

    const question = questionById.get(entry.questionId);

    if (!question && questions.length > 0) {
      return {
        ok: false,
        code: "unknown_question_id",
        message: `Unknown question id '${entry.questionId}'`,
      };
    }

    const type = question?.type ?? "unknown";
    const value = normalizeAnswerValue(entry.value);

    if (question?.type === "single_choice") {
      if (Array.isArray(value)) {
        return {
          ok: false,
          code: "invalid_single_choice_answer",
          message: `Question '${entry.questionId}' expects a single value`,
        };
      }

      if (question.options && question.options.length > 0 && value) {
        if (!question.options.includes(value)) {
          return {
            ok: false,
            code: "answer_option_not_allowed",
            message: `Answer '${value}' is not an allowed option for question '${entry.questionId}'`,
          };
        }
      }
    }

    if (question?.type === "multiple_choice") {
      if (!Array.isArray(value)) {
        return {
          ok: false,
          code: "invalid_multiple_choice_answer",
          message: `Question '${entry.questionId}' expects an array of values`,
        };
      }

      if (question.options && question.options.length > 0) {
        for (const selected of value) {
          if (!question.options.includes(selected)) {
            return {
              ok: false,
              code: "answer_option_not_allowed",
              message: `Answer '${selected}' is not an allowed option for question '${entry.questionId}'`,
            };
          }
        }
      }
    }

    if (question?.type === "short_text") {
      if (Array.isArray(value)) {
        return {
          ok: false,
          code: "invalid_short_text_answer",
          message: `Question '${entry.questionId}' expects text`,
        };
      }

      if (value.length > 5000) {
        return {
          ok: false,
          code: "answer_too_long",
          message: `Question '${entry.questionId}' answer is too long`,
        };
      }
    }

    normalizedByQuestionId.set(entry.questionId, {
      questionId: entry.questionId,
      type,
      title: question?.title ?? null,
      value,
    });
  }

  for (const question of questions) {
    const answer = normalizedByQuestionId.get(question.id);

    if (question.required && (!answer || isBlankAnswerValue(answer.value))) {
      return {
        ok: false,
        code: "required_answer_missing",
        message: `Required question '${question.id}' is missing an answer`,
      };
    }
  }

  return {
    ok: true,
    answers: Array.from(normalizedByQuestionId.values()),
  };
}

function buildPredicateSnapshot(
  eligibility: SurveyParticipationEligibilityRow,
  predicateOutcome: PredicateOutcomeRow | null,
): Record<string, unknown> {
  if (predicateOutcome) {
    return {
      predicateOutcomeId: predicateOutcome.id,
      source: predicateOutcome.source,
      verified: Number(predicateOutcome.verified) === 1,
      ageBucket: predicateOutcome.age_bucket,
      countryBucket: predicateOutcome.country_bucket,
      worldRegion: predicateOutcome.world_region,
      validUntil: predicateOutcome.valid_until,
      providerPayloadVersion: predicateOutcome.provider_payload_version,
    };
  }

  return {
    predicateOutcomeId: eligibility.predicate_outcome_id,
    eligibilityId: eligibility.id,
  };
}

function buildLegacySurveyPolicy(input: {
  ageBuckets: string[] | "ANY";
  countries: string[] | "ANY";
  regions: string[] | "ANY";
}): SurveyPolicyV1 {
  return {
    version: 1,
    predicateSource: "zkpassport",
    age:
      input.ageBuckets === "ANY"
        ? {
            mode: "any",
            min: null,
            buckets: [],
          }
        : {
            mode: "bucket_in",
            min: null,
            buckets: input.ageBuckets as SurveyPolicyV1["age"]["buckets"],
          },
    countries:
      input.countries === "ANY"
        ? {
            mode: "any",
            values: [],
          }
        : {
            mode: "allow_list",
            values: input.countries as SurveyPolicyV1["countries"]["values"],
          },
    regions:
      input.regions === "ANY"
        ? {
            mode: "any",
            values: [],
          }
        : {
            mode: "allow_list",
            values: input.regions as SurveyPolicyV1["regions"]["values"],
          },
    freshness: {
      mode: "any",
      days: null,
    },
  };
}

async function getFirst<T>(
  db: D1DatabaseLike,
  query: string,
  ...values: unknown[]
): Promise<T | null> {
  return db
    .prepare(query)
    .bind(...values)
    .first<T>();
}

const CREATOR_SESSION_COOKIE_NAME = "dscope_creator_session";

function parseCookieHeader(value: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value) return result;

  for (const part of value.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    result[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return result;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getCreatorSessionWorkspace(
  request: Request,
  db: D1DatabaseLike,
): Promise<CreatorSessionWorkspaceRow | null> {
  const token = parseCookieHeader(request.headers.get("cookie"))[
    CREATOR_SESSION_COOKIE_NAME
  ];
  if (!token) return null;

  const now = nowIso();
  const sessionHash = await sha256Hex(token);

  return getFirst<CreatorSessionWorkspaceRow>(
    db,
    `
    SELECT
      a.id AS account_id,
      a.email AS email,
      w.id AS workspace_id,
      w.organization_name AS organization_name,
      w.contact_email AS contact_email,
      w.owner_wallet_address AS owner_wallet_address,
      w.status AS workspace_status
    FROM mvp_creator_sessions sess
    JOIN mvp_creator_accounts a ON a.id = sess.creator_account_id
    LEFT JOIN mvp_creator_workspaces w
      ON w.contact_email = a.email
     AND w.status = 'active'
    WHERE sess.session_hash = ?
      AND sess.revoked_at IS NULL
      AND sess.expires_at > ?
    LIMIT 1
    `,
    sessionHash,
    now,
  );
}

async function getAll<T>(
  db: D1DatabaseLike,
  query: string,
  ...values: unknown[]
): Promise<T[]> {
  const result = (await db
    .prepare(query)
    .bind(...values)
    .all<T>()) as D1Result<T>;
  return result.results ?? [];
}

function buildPauseStatus(
  globalPause: OpsPauseRow | null,
  surveyPause: OpsPauseRow | null,
): ParticipationPauseStatus {
  const activePause = globalPause ?? surveyPause ?? null;

  return {
    paused: activePause !== null,
    scope:
      activePause?.scope === "global" || activePause?.scope === "survey"
        ? activePause.scope
        : null,
    reason: activePause?.reason ?? null,
    message:
      activePause?.message ??
      (activePause
        ? "D-Scope participation is temporarily paused by the operator. Your verification state is saved; please try again later."
        : null),
    globalPaused: globalPause !== null,
    surveyPaused: surveyPause !== null,
    updatedAt: activePause?.updated_at ?? null,
    expiresAt: activePause?.expires_at ?? null,
  };
}

async function getParticipationPauseStatus(
  db: D1DatabaseLike,
  surveyId: string,
): Promise<ParticipationPauseStatus> {
  const now = nowIso();

  const globalPause = await getFirst<OpsPauseRow>(
    db,
    `
    SELECT *
    FROM mvp_ops_pauses
    WHERE id = 'global'
      AND is_paused = 1
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
    `,
    now,
  );

  const surveyPause = await getFirst<OpsPauseRow>(
    db,
    `
    SELECT *
    FROM mvp_ops_pauses
    WHERE id = ?
      AND is_paused = 1
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
    `,
    `survey:${surveyId}`,
    now,
  );

  return buildPauseStatus(globalPause, surveyPause);
}

function pauseErrorResponse(pauseStatus: ParticipationPauseStatus): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "mvp_participation_paused",
        message:
          pauseStatus.message ||
          "D-Scope participation is temporarily paused by the operator. Your verification state is saved; please try again later.",
        details: {
          pauseStatus,
        },
      },
    },
    { status: 423 },
  );
}

function normalizeListStatusFilter(value: string | null): string {
  const normalized = String(value ?? "active")
    .trim()
    .toLowerCase();

  if (
    normalized === "all" ||
    normalized === "draft" ||
    normalized === "active" ||
    normalized === "ended" ||
    normalized === "finalizing" ||
    normalized === "finalized" ||
    normalized === "cancelled" ||
    normalized === "failed"
  ) {
    return normalized;
  }

  return "active";
}

function normalizeListLimit(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? "20"), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(parsed, 50);
}

function normalizeListOffset(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function buildEligibilitySummary(row: MvpSurveyListRow): {
  mode: string;
  policyHash: string | null;
} {
  return {
    mode:
      row.predicate_policy_hash && row.predicate_policy_hash !== "0"
        ? "policy_hash_available"
        : "mvp_policy_pending",
    policyHash: row.predicate_policy_hash,
  };
}

function toUnixSeconds(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function isoFromSeconds(value: number | null): string | null {
  if (value === null) return null;
  try {
    return new Date(value * 1000).toISOString();
  } catch {
    return null;
  }
}

type SurveyLifecycle = {
  storedStatus: string;
  effectiveStatus: string;
  startTime: number | null;
  endTime: number | null;
  startTimeIso: string | null;
  endTimeIso: string | null;
  timeRemainingSeconds: number | null;
  hasStarted: boolean;
  hasEnded: boolean;
  canParticipate: boolean;
  canRequestFinalization: boolean;
  canViewResults: boolean;
};

function deriveSurveyLifecycle(input: {
  status: string;
  startTime?: unknown;
  endTime?: unknown;
  nowSeconds?: number;
}): SurveyLifecycle {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const startTime = toUnixSeconds(input.startTime);
  const endTime = toUnixSeconds(input.endTime);
  const storedStatus = String(input.status || "draft");

  const hasStarted = startTime === null || nowSeconds >= startTime;
  const hasEnded = endTime !== null && nowSeconds >= endTime;
  let effectiveStatus = storedStatus;

  if (storedStatus === "active" && hasEnded) {
    effectiveStatus = "ended";
  }

  const canParticipate =
    effectiveStatus === "active" &&
    hasStarted &&
    (endTime === null || nowSeconds < endTime);
  const canRequestFinalization = effectiveStatus === "ended";
  const canViewResults = effectiveStatus === "finalized";

  return {
    storedStatus,
    effectiveStatus,
    startTime,
    endTime,
    startTimeIso: isoFromSeconds(startTime),
    endTimeIso: isoFromSeconds(endTime),
    timeRemainingSeconds:
      canParticipate && endTime !== null
        ? Math.max(0, endTime - nowSeconds)
        : null,
    hasStarted,
    hasEnded,
    canParticipate,
    canRequestFinalization,
    canViewResults,
  };
}

function publicCreatorDisplayName(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && !normalized.includes("@")
    ? normalized
    : "D-Scope Creator";
}

async function listMvpSurveys(db: D1DatabaseLike, url: URL): Promise<Response> {
  const status = normalizeListStatusFilter(url.searchParams.get("status"));
  const limit = normalizeListLimit(url.searchParams.get("limit"));
  const offset = normalizeListOffset(url.searchParams.get("offset"));
  const nowSeconds = Math.floor(Date.now() / 1000);

  const rows = await getAll<MvpSurveyListRow>(
    db,
    `
    SELECT
      s.id,
      s.survey_key,
      s.sponsor,
      s.title,
      s.status,
      s.metadata_hash,
      s.predicate_policy_hash,
      s.creator_workspace_id,
      s.creator_display_name,
      s.operator_address,
      s.created_by_operator,
      s.created_at,
      s.updated_at,
      m.title AS metadata_title,
      m.description AS metadata_description,
      m.questions_json AS metadata_questions_json,
      r.reward_enabled,
      r.reward_pool_amount,
      r.claim_deadline,
      r.reward_status,
      res.final_participant_count,
      COALESCE(p.participants_count, 0) AS participants_count,
      legacy.start_time AS legacy_start_time,
      legacy.end_time AS legacy_end_time,
      legacy.network AS legacy_network
    FROM mvp_surveys s
    LEFT JOIN mvp_survey_metadata m
      ON m.survey_id = s.id
    LEFT JOIN mvp_survey_rewards r
      ON r.survey_id = s.id
    LEFT JOIN mvp_survey_results res
      ON res.survey_id = s.id
    LEFT JOIN surveys legacy
      ON legacy.id = s.id
    LEFT JOIN (
      SELECT survey_id, COUNT(*) AS participants_count
      FROM mvp_participation_records
      WHERE participation_status = 'participated'
      GROUP BY survey_id
    ) p
      ON p.survey_id = s.id
    WHERE (
      ? = 'all'
      OR (
        ? = 'active'
        AND s.status = 'active'
        AND (
          legacy.end_time IS NULL
          OR CAST(legacy.end_time AS INTEGER) <= 0
          OR CAST(legacy.end_time AS INTEGER) > ?
        )
      )
      OR (
        ? = 'ended'
        AND s.status = 'active'
        AND legacy.end_time IS NOT NULL
        AND CAST(legacy.end_time AS INTEGER) > 0
        AND CAST(legacy.end_time AS INTEGER) <= ?
      )
      OR (
        ? NOT IN ('all', 'active', 'ended')
        AND s.status = ?
      )
    )
    ORDER BY
      CASE s.status
        WHEN 'active' THEN 0
        WHEN 'draft' THEN 1
        WHEN 'finalized' THEN 2
        ELSE 3
      END,
      s.created_at DESC
    LIMIT ? OFFSET ?
    `,
    status,
    status,
    nowSeconds,
    status,
    nowSeconds,
    status,
    status,
    limit,
    offset,
  );
  const surveys = rows
    .map((row) => {
      const questions = safeParseQuestions(row.metadata_questions_json);
      const lifecycle = deriveSurveyLifecycle({
        status: row.status,
        startTime: row.legacy_start_time,
        endTime: row.legacy_end_time,
        nowSeconds,
      });

      return {
        id: row.id,
        surveyKey: row.survey_key,
        sponsor: null,
        creator: {
          workspaceId: null,
          displayName: publicCreatorDisplayName(row.creator_display_name),
          createdByOperator: row.created_by_operator !== 0,
          operatorAddress: row.operator_address,
        },
        title: row.metadata_title || row.title || row.id,
        description: row.metadata_description || null,
        status: row.status,
        effectiveStatus: lifecycle.effectiveStatus,
        schedule: {
          startTime: lifecycle.startTime,
          endTime: lifecycle.endTime,
          startTimeIso: lifecycle.startTimeIso,
          endTimeIso: lifecycle.endTimeIso,
          timeRemainingSeconds: lifecycle.timeRemainingSeconds,
        },
        lifecycle: {
          storedStatus: lifecycle.storedStatus,
          effectiveStatus: lifecycle.effectiveStatus,
          hasStarted: lifecycle.hasStarted,
          hasEnded: lifecycle.hasEnded,
          canParticipate: false,
          participationBlockedReason: "server_verification_required",
          canRequestFinalization: lifecycle.canRequestFinalization,
          canViewResults: lifecycle.canViewResults,
        },
        metadataHash: row.metadata_hash,
        predicatePolicyHash: row.predicate_policy_hash,
        questionsCount: questions.length,
        reward: {
          rewardEnabled: false,
          rewardPoolAmount: "0",
          claimDeadline: "0",
          rewardStatus: "DISABLED",
        },
        eligibilitySummary: buildEligibilitySummary(row),
        participantCount: Number(row.participants_count ?? 0),
        finalParticipantCount: row.final_participant_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    })
    .filter((survey) => {
      if (status === "all") return true;
      return survey.effectiveStatus === status;
    });

  return jsonResponse({
    ok: true,
    filters: {
      status,
      limit,
      offset,
    },
    count: surveys.length,
    surveys,
  });
}

async function buildMvpSurveyCard(
  db: D1DatabaseLike,
  surveyId: string,
): Promise<Response> {
  const survey = await getFirst<MvpSurveyRow>(
    db,
    `
    SELECT *
    FROM mvp_surveys
    WHERE id = ?
    LIMIT 1
    `,
    surveyId,
  );

  if (!survey) {
    return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
  }

  const metadata = await getFirst<MvpSurveyMetadataRow>(
    db,
    `
    SELECT *
    FROM mvp_survey_metadata
    WHERE survey_id = ?
    LIMIT 1
    `,
    surveyId,
  );

  const contracts = await getFirst<MvpSurveyContractsRow>(
    db,
    `
    SELECT *
    FROM mvp_survey_contracts
    WHERE survey_id = ?
    LIMIT 1
    `,
    surveyId,
  );

  const reward = await getFirst<MvpSurveyRewardRow>(
    db,
    `
    SELECT *
    FROM mvp_survey_rewards
    WHERE survey_id = ?
    LIMIT 1
    `,
    surveyId,
  );

  const result = await getFirst<MvpSurveyResultRow>(
    db,
    `
    SELECT *
    FROM mvp_survey_results
    WHERE survey_id = ?
    LIMIT 1
    `,
    surveyId,
  );

  const legacySurvey = await getFirst<{
    id: string;
    status: string;
    network: string;
    start_time: string | number | null;
    end_time: string | number | null;
    predicate_policy_json: string | null;
  }>(
    db,
    `
    SELECT id, status, network, start_time, end_time, predicate_policy_json
    FROM surveys
    WHERE id = ?
    LIMIT 1
    `,
    surveyId,
  );

  const lifecycle = deriveSurveyLifecycle({
    status: survey.status,
    startTime: legacySurvey?.start_time,
    endTime: legacySurvey?.end_time,
  });

  return jsonResponse({
    ok: true,
    survey: {
      id: survey.id,
      surveyKey: survey.survey_key,
      sponsor: null,
      creator: {
        workspaceId: null,
        displayName: publicCreatorDisplayName(survey.creator_display_name),
        createdByOperator: survey.created_by_operator !== 0,
        operatorAddress: survey.operator_address ?? null,
      },
      title: survey.title,
      status: survey.status,
      effectiveStatus: lifecycle.effectiveStatus,
      schedule: {
        startTime: lifecycle.startTime,
        endTime: lifecycle.endTime,
        startTimeIso: lifecycle.startTimeIso,
        endTimeIso: lifecycle.endTimeIso,
        timeRemainingSeconds: lifecycle.timeRemainingSeconds,
      },
      lifecycle: {
        storedStatus: lifecycle.storedStatus,
        effectiveStatus: lifecycle.effectiveStatus,
        hasStarted: lifecycle.hasStarted,
        hasEnded: lifecycle.hasEnded,
        canParticipate: false,
        participationBlockedReason: "server_verification_required",
        canRequestFinalization: lifecycle.canRequestFinalization,
        canViewResults: lifecycle.canViewResults,
      },
      metadataHash: survey.metadata_hash,
      predicatePolicyHash: survey.predicate_policy_hash,
      predicatePolicyJson: safeJsonParse(
        legacySurvey?.predicate_policy_json ?? null,
      ),
      legacyCompatibility: {
        exists: !!legacySurvey,
        legacySurveyId: legacySurvey?.id ?? null,
        legacyStatus: legacySurvey?.status ?? null,
        network: legacySurvey?.network ?? null,
      },
      createdAt: survey.created_at,
      updatedAt: survey.updated_at,
    },
    metadata: metadata
      ? {
          title: metadata.title,
          description: metadata.description,
          questions: safeParseQuestions(metadata.questions_json),
          createdAt: metadata.created_at,
          updatedAt: metadata.updated_at,
        }
      : {
          title: survey.title,
          description: null,
          questions: [],
          createdAt: survey.created_at,
          updatedAt: survey.updated_at,
        },
    contracts: contracts
      ? {
          surveyFactoryAddress: contracts.survey_factory_address,
          dscopeCoreAddress: contracts.dscope_core_address,
          participationGateAddress: contracts.participation_gate_address,
          rewardVaultAddress: contracts.reward_vault_address,
          createdAt: contracts.created_at,
          updatedAt: contracts.updated_at,
        }
      : null,
    reward: reward
      ? {
          rewardEnabled: false,
          rewardPoolAmount: "0",
          claimDeadline: "0",
          rewardStatus: "DISABLED",
          rewardPerParticipant: "0",
          totalAllocated: "0",
          dustReturnToSponsor: "0",
          distributionHash: null,
          finalizedAt: null,
          createdAt: reward.created_at,
          updatedAt: reward.updated_at,
        }
      : null,
    result:
      lifecycle.canViewResults && result
        ? {
            resultHash: result.result_hash,
            distributionHash: result.distribution_hash,
            finalParticipantCount: result.final_participant_count,
            analyticsPayload: safeJsonParse(result.analytics_payload_json),
            rewardPayload: null,
            finalizationPayload: null,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
          }
        : null,
    resultAccess: {
      locked: !lifecycle.canViewResults,
      effectiveStatus: lifecycle.effectiveStatus,
      reason: lifecycle.canViewResults
        ? null
        : "Results are available only after finalization",
    },
  });
}

export async function handleMvpSurveyRoutes(
  request: Request,
  env: MvpSurveyRoutesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/mvp/surveys")) {
    return null;
  }

  const parts = getPathParts(url);

  if (isRewardEndpointPath(url.pathname)) {
    return errorResponse(
      410,
      "rewards_unavailable_in_v1",
      "Rewards and claims are not available in the first public release",
    );
  }

  if (
    request.method === "POST" &&
    isPublicParticipationSubmissionPath(url.pathname)
  ) {
    const verificationSessionId =
      request.headers.get("x-verification-session-id")?.trim() ?? "";
    const verificationToken =
      request.headers.get("x-verification-token")?.trim() ?? "";

    if (!verificationSessionId || !verificationToken) {
      return errorResponse(
        503,
        "server_verification_required",
        "A server-verified zkPassport session is required",
      );
    }

    const publicBody = (await request
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null;

    const participantRef = String(
      publicBody?.participantRef ?? "",
    ).trim();
    const participationTxHash = String(
      publicBody?.participationTxHash ?? "",
    ).trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "participant_ref_required",
        "Participant wallet address is required",
      );
    }

    if (!/^0x[a-f0-9]{64}$/i.test(participationTxHash)) {
      return errorResponse(
        400,
        "participation_tx_hash_required",
        "A valid Aztec participation transaction hash is required",
      );
    }

    const verifiedSession = await getFirst<{
      id: string;
      client_token_hash: string;
      subject_hash: string;
    }>(
      env.dscope_db,
      `
      SELECT id, client_token_hash, subject_hash
      FROM verification_sessions
      WHERE id = ? AND survey_id = ? AND wallet_address = ?
        AND status = 'verified'
      LIMIT 1
      `,
      verificationSessionId,
      parts[2],
      participantRef,
    );

    if (!verifiedSession) {
      return errorResponse(
        403,
        "verification_session_mismatch",
        "Verification session does not match this survey and wallet",
      );
    }

    const tokenHash = await hashResponseVerificationToken(
      verificationToken,
    );

    if (
      !responseSafeStringEqual(
        tokenHash,
        String(verifiedSession.client_token_hash),
      )
    ) {
      return errorResponse(
        401,
        "invalid_verification_token",
        "Verification token is invalid",
      );
    }

    const issuedCredential = await getFirst<{ id: string }>(
      env.dscope_db,
      `
      SELECT id
      FROM mvp_credential_issue_jobs
      WHERE survey_id = ? AND wallet_address = ? AND subject_hash = ?
        AND status = 'issued' AND tx_hash IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      parts[2],
      participantRef,
      verifiedSession.subject_hash,
    );

    if (!issuedCredential) {
      return errorResponse(
        409,
        "credential_not_issued",
        "Aztec eligibility credential has not been issued",
      );
    }
  }

  // GET /mvp/surveys?status=active|draft|finalized|cancelled|failed|all&limit=20&offset=0
  if (
    request.method === "GET" &&
    parts.length === 2 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys"
  ) {
    return listMvpSurveys(env.dscope_db, url);
  }

  // POST /mvp/surveys
  if (
    request.method === "POST" &&
    parts.length === 2 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys"
  ) {
    const body = await readJsonBody<CreateMvpSurveyBody>(request);
    const rewardValidation = validateRewardsDisabledPayload(body);

    if (!rewardValidation.ok) {
      return errorResponse(
        400,
        "rewards_not_supported_in_v1",
        `Rewards must remain disabled for the first public release. Invalid fields: ${rewardValidation.fields.join(", ")}`,
      );
    }

    const predicatePolicyError = validatePredicatePolicyAllowLists(
      body.predicatePolicyJson,
    );
    if (predicatePolicyError) {
      return errorResponse(
        400,
        "invalid_predicate_policy",
        predicatePolicyError,
      );
    }

    const createdAt = nowIso();
    const surveyKeyInput =
      body.onChainSurveyKey ?? body.surveyKey ?? String(Date.now());
    const surveyKey = String(surveyKeyInput).trim();

    if (!/^\d+$/.test(surveyKey)) {
      return errorResponse(
        400,
        "invalid_survey_key",
        `Invalid surveyKey '${surveyKey}'. Aztec contracts expect a Field-compatible numeric string. ` +
          `Use surveyId for public/human-readable ids and surveyKey/onChainSurveyKey for the on-chain numeric key.`,
      );
    }

    const surveyId = optionalString(body.surveyId) || `survey_${surveyKey}`;
    const requestedCreatorWorkspaceId = optionalString(body.creatorWorkspaceId);
    let creatorWorkspace: MvpCreatorWorkspaceRow | null = null;
    const sessionCreator = await getCreatorSessionWorkspace(
      request,
      env.dscope_db,
    );

    if (!sessionCreator?.workspace_id) {
      return errorResponse(
        401,
        "creator_login_required",
        "An authenticated creator with an active workspace is required to create a survey",
      );
    }

    if (
      requestedCreatorWorkspaceId &&
      sessionCreator?.workspace_id &&
      requestedCreatorWorkspaceId !== sessionCreator.workspace_id
    ) {
      return errorResponse(
        403,
        "creator_workspace_mismatch",
        "Creator session cannot create surveys for another workspace",
      );
    }

    creatorWorkspace = {
      id: sessionCreator.workspace_id,
      creator_account_id: sessionCreator.account_id,
      organization_name:
        sessionCreator.organization_name || sessionCreator.email,
      contact_email: sessionCreator.contact_email || sessionCreator.email,
      owner_wallet_address: sessionCreator.owner_wallet_address,
      status: sessionCreator.workspace_status || "active",
    };

    const creatorWorkspaceId = creatorWorkspace?.id ?? null;
    const creatorDisplayName =
      optionalString(body.creatorDisplayName) ||
      creatorWorkspace?.organization_name ||
      optionalString(body.sponsor) ||
      "D-Scope Creator";
    const sponsor =
      body.sponsor ||
      creatorWorkspace?.contact_email ||
      creatorDisplayName ||
      "unknown_sponsor";
    const operatorAddress = null;
    const createdByOperator = 0;
    const title = body.title || `D-Scope MVP Survey ${surveyKey}`;
    const description = String(body.description ?? "").trim();
    const shortTextRequested = Array.isArray(body.questions)
      ? body.questions.some(
          (question) =>
            question &&
            typeof question === "object" &&
            (question as Record<string, unknown>).type === "short_text",
        )
      : false;

    if (shortTextRequested) {
      throw new Error(
        "Short text questions are disabled for the public MVP. Use single-choice or multiple-choice questions.",
      );
    }

    const questions = normalizeSurveyQuestions(body.questions, {
      allowShortText: false,
    });

    if (questions.length === 0) {
      throw new Error("At least one survey question is required");
    }

    for (const question of questions) {
      if ((question.options ?? []).length < 2) {
        throw new Error(
          `Question '${question.id}' must have at least two answer options`,
        );
      }
    }

    const metadataHash = isNonZeroFieldString(body.metadataHash)
      ? String(body.metadataHash)
      : stableNonZeroFieldHash(
          {
            surveyId,
            surveyKey,
            title,
            description,
            questions,
          },
          "dscope:mvp:metadata:v1",
        );

    const predicatePolicyHash = isNonZeroFieldString(body.predicatePolicyHash)
      ? String(body.predicatePolicyHash)
      : stableNonZeroFieldHash(
          {
            surveyId,
            surveyKey,
            ageBuckets: body.ageBuckets ?? "ANY",
            countries: body.countries ?? "ANY",
            regions: body.regions ?? "ANY",
            predicatePolicyJson: body.predicatePolicyJson ?? null,
          },
          "dscope:mvp:policy:v1",
        );

    const network = body.network || "aztec-local";
    const treasury = body.treasury || sponsor;
    const systemFinalizer = body.systemFinalizer || sponsor;

    const nowSeconds = Math.floor(Date.now() / 1000);
    let schedule: ResolvedSurveySchedule;

    try {
      schedule = resolveSurveySchedule(body, env, nowSeconds, network);
    } catch (error) {
      return errorResponse(
        400,
        "invalid_survey_duration",
        error instanceof Error ? error.message : "Invalid survey duration",
      );
    }

    const startTime = schedule.startTime;
    const endTime = schedule.endTime;

    const analyticsMinTotalSample = String(
      normalizePrivacyThreshold(
        body.analytics?.minTotalSample ?? body.analyticsMinTotalSample,
        10,
      ),
    );
    const analyticsMinSegmentSample = String(
      normalizePrivacyThreshold(
        body.analytics?.minSegmentSample ?? body.analyticsMinSegmentSample,
        5,
      ),
    );
    const analyticsVisibilityMode =
      body.analytics?.visibilityMode ||
      body.analyticsVisibilityMode ||
      "public_mvp";

    const incomingPredicatePolicyJson = body.predicatePolicyJson ?? null;

    const ageBuckets =
      normalizeSelection(body.ageBuckets) !== "ANY"
        ? normalizeSelection(body.ageBuckets)
        : (selectionFromPolicyAge(incomingPredicatePolicyJson) ?? "ANY");
    const countries =
      normalizeSelection(body.countries) !== "ANY"
        ? normalizeSelection(body.countries)
        : (selectionFromPolicyCountries(incomingPredicatePolicyJson) ?? "ANY");
    const regions =
      normalizeSelection(body.regions) !== "ANY"
        ? normalizeSelection(body.regions)
        : (selectionFromPolicyRegions(incomingPredicatePolicyJson) ?? "ANY");

    const legacyPredicatePolicyJson =
      incomingPredicatePolicyJson ||
      buildLegacySurveyPolicy({
        ageBuckets,
        countries,
        regions,
      });

    const rewardEnabled = FIRST_PUBLIC_RELEASE_REWARDS_ENABLED;
    const rewardPoolAmount = "0";
    const claimDeadline = "0";

    const existingMvpSurvey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (existingMvpSurvey) {
      return errorResponse(
        409,
        "mvp_survey_already_exists",
        `MVP survey with id '${surveyId}' already exists`,
      );
    }

    const existingLegacySurvey = await getFirst(
      env.dscope_db,
      `
      SELECT id
      FROM surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (existingLegacySurvey) {
      return errorResponse(
        409,
        "legacy_survey_already_exists",
        `Legacy survey with id '${surveyId}' already exists`,
      );
    }

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_surveys (
          id,
          survey_key,
          sponsor,
          title,
          status,
          metadata_hash,
          predicate_policy_hash,
          creator_workspace_id,
          creator_display_name,
          operator_address,
          created_by_operator,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        surveyId,
        surveyKey,
        sponsor,
        title,
        metadataHash,
        predicatePolicyHash,
        creatorWorkspaceId,
        creatorDisplayName,
        operatorAddress,
        createdByOperator,
        createdAt,
        createdAt,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_survey_metadata (
          survey_id,
          survey_key,
          title,
          description,
          questions_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        surveyId,
        surveyKey,
        title,
        description || null,
        JSON.stringify(questions),
        createdAt,
        createdAt,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_survey_contracts (
          survey_id,
          survey_key,
          survey_factory_address,
          dscope_core_address,
          participation_gate_address,
          reward_vault_address,
          created_at,
          updated_at
        )
        VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?)
        `,
      )
      .bind(surveyId, surveyKey, createdAt, createdAt)
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_survey_rewards (
          survey_id,
          survey_key,
          reward_enabled,
          reward_pool_amount,
          claim_deadline,
          reward_status,
          reward_per_participant,
          total_allocated,
          dust_return_to_sponsor,
          distribution_hash,
          finalized_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'DISABLED', NULL, NULL, NULL, NULL, NULL, ?, ?)
        `,
      )
      .bind(
        surveyId,
        surveyKey,
        rewardEnabled ? 1 : 0,
        rewardPoolAmount,
        claimDeadline,
        createdAt,
        createdAt,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO surveys (
          id,
          network,
          contract_address,
          sponsor,
          treasury,
          factory_address,
          system_finalizer,
          participation_gate_address,
          survey_key,
          metadata_hash,
          predicate_policy_hash,
          predicate_policy_json,
          start_time,
          end_time,
          reward_pool_amount,
          claim_deadline,
          reward_enabled,
          minimum_sample_target,
          analytics_min_total_sample,
          analytics_min_segment_sample,
          analytics_visibility_mode,
          status,
          create_flow_status,
          create_error,
          registry_id,
          deploy_tx_hash,
          register_tx_hash,
          deploy_gate_tx_hash,
          register_policy_tx_hash,
          deploy_core_tx_hash,
          factory_register_tx_hash,
          dscope_core_address,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        surveyId,
        network,
        "",
        sponsor,
        treasury,
        "",
        systemFinalizer,
        null,
        surveyKey,
        metadataHash,
        predicatePolicyHash,
        JSON.stringify(legacyPredicatePolicyJson),
        startTime,
        endTime,
        rewardPoolAmount,
        claimDeadline || "0",
        rewardEnabled ? "1" : "0",
        "0",
        analyticsMinTotalSample,
        analyticsMinSegmentSample,
        analyticsVisibilityMode,
        "active",
        "pending",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        createdAt,
        createdAt,
      )
      .run();

    const runnerStore = new D1MvpRunnerStore(env.dscope_db);
    const createJobId = `job_create_${surveyId}_${Date.now()}`;

    await runnerStore.createJob({
      id: createJobId,
      type: "create_survey_mvp",
      surveyId,
      surveyKey,
      maxAttempts: 3,
      payload: {
        surveyId,
        surveyKey,
        sponsor,
        metadataHash,
        predicatePolicyHash,
        ageBuckets,
        countries,
        regions,
        metadata: {
          title,
          description: description || null,
          questions,
        },
        durationPreset: schedule.durationPreset,
        startTime,
        endTime,
        durationSeconds: schedule.durationSeconds,
        testMode: schedule.isTestDuration,
        reward: {
          rewardEnabled,
          rewardPoolAmount,
          claimDeadline,
        },
      },
    });

    const job = await runnerStore.getJob(createJobId);

    return jsonResponse(
      {
        ok: true,
        survey: {
          id: surveyId,
          surveyKey,
          sponsor,
          title,
          status: "draft",
          metadataHash,
          predicatePolicyHash,
          ageBuckets,
          countries,
          regions,
          schedule: {
            durationPreset: schedule.durationPreset,
            startTime,
            endTime,
            durationSeconds: schedule.durationSeconds,
            testMode: schedule.isTestDuration,
          },
          metadata: {
            title,
            description: description || null,
            questions,
          },
          reward: {
            rewardEnabled,
            rewardPoolAmount,
            claimDeadline,
          },
          legacyCompatibility: {
            created: true,
            legacySurveyId: surveyId,
            legacyStatus: "active",
            network,
          },
          createdAt,
          updatedAt: createdAt,
        },
        job,
      },
      { status: 201 },
    );
  }

  // POST /mvp/surveys/:surveyId/request-finalize
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "request-finalize"
  ) {
    const surveyId = parts[2];
    const body = await readJsonBody<{
      finalizedAt?: string;
      currentTime?: string;
      rewardPoolAmount?: string;
      claimDeadline?: string;
      policyHash?: string;
    }>(request);
    const rewardValidation = validateRewardsDisabledPayload(body);

    if (!rewardValidation.ok) {
      return errorResponse(
        400,
        "rewards_not_supported_in_v1",
        `Rewards must remain disabled for the first public release. Invalid fields: ${rewardValidation.fields.join(", ")}`,
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    if (!isInternalAuthorized(request, env)) {
      const sessionCreator = await getCreatorSessionWorkspace(
        request,
        env.dscope_db,
      );

      if (!sessionCreator?.workspace_id) {
        return errorResponse(
          401,
          "creator_login_required",
          "An authenticated creator with an active workspace is required to finalize a survey",
        );
      }

      if (
        !survey.creator_workspace_id ||
        survey.creator_workspace_id !== sessionCreator.workspace_id
      ) {
        return errorResponse(
          403,
          "creator_workspace_mismatch",
          "Creator session cannot finalize a survey owned by another workspace",
        );
      }
    }

    if (survey.status === "finalizing") {
      return errorResponse(
        409,
        "mvp_survey_already_finalizing",
        "Survey finalization is already in progress",
      );
    }

    if (survey.status === "finalized") {
      return errorResponse(
        409,
        "mvp_survey_already_finalized",
        "Survey is already finalized",
      );
    }

    if (survey.status !== "active" && survey.status !== "ended") {
      return errorResponse(
        409,
        "mvp_survey_not_finalizable",
        "Only ended MVP surveys can request finalization",
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    const legacySchedule = await getFirst<{
      start_time: string | number | null;
      end_time: string | number | null;
      network: string | null;
    }>(
      env.dscope_db,
      `
      SELECT start_time, end_time, network
      FROM surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const lifecycle = deriveSurveyLifecycle({
      status: survey.status,
      startTime: legacySchedule?.start_time,
      endTime: legacySchedule?.end_time,
      nowSeconds,
    });

    if (!lifecycle.canRequestFinalization) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "mvp_survey_not_ended",
            message: "Survey has not ended yet",
          },
          surveyId,
          surveyKey: survey.survey_key,
          currentTime: nowSeconds,
          endTime: lifecycle.endTime,
          retryAfterSeconds:
            lifecycle.endTime === null
              ? null
              : Math.max(0, lifecycle.endTime - nowSeconds),
          endTimeIso: lifecycle.endTimeIso,
          effectiveStatus: lifecycle.effectiveStatus,
        },
        { status: 409 },
      );
    }

    const contracts = await getFirst<MvpSurveyContractsRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_contracts
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const analyticsSnapshot = await buildFinalizedAnalyticsSnapshot({
      db: env.dscope_db,
      surveyId,
      surveyKey: survey.survey_key,
      policyHash: body.policyHash || survey.predicate_policy_hash || "0",
    });

    const runnerStore = new D1MvpRunnerStore(env.dscope_db);
    const jobId = `job_finalize_${surveyId}_${Date.now()}`;
    const createdAt = nowIso();

    await runnerStore.createJob({
      id: jobId,
      type: "finalize_survey_mvp",
      surveyId,
      surveyKey: survey.survey_key,
      maxAttempts: 3,
      payload: {
        surveyId,
        surveyKey: survey.survey_key,
        policyHash: body.policyHash || survey.predicate_policy_hash || "0",
        participationGateAddress:
          contracts?.participation_gate_address ||
          "0xPARTICIPATION_GATE_PENDING",
        dscopeCoreAddress:
          contracts?.dscope_core_address || "0xDSCOPE_CORE_PENDING",
        rewardVaultAddress:
          contracts?.reward_vault_address ?? null,
        rewardPoolAmount: "0",
        claimDeadline: "0",
        finalizedAt: String(nowSeconds),
        currentTime: String(nowSeconds),
        finalParticipantCount: analyticsSnapshot.finalParticipantCount,
        analyticsPayload: analyticsSnapshot.analyticsPayload,
        analyticsGeneratedAt: analyticsSnapshot.generatedAt,
        finalizationPayload: analyticsSnapshot.finalizationPayload,
      },
    });

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_surveys
        SET status = 'finalizing', updated_at = ?
        WHERE id = ?
        `,
      )
      .bind(createdAt, surveyId)
      .run();

    await runnerStore.appendEvent({
      id: `${jobId}_finalize.requested_${crypto.randomUUID()}`,
      jobId,
      type: "finalize.requested",
      message: "MVP survey finalization requested",
      data: {
        surveyId,
        surveyKey: survey.survey_key,
        status: survey.status,
      },
      createdAt,
    });

    const job = await runnerStore.getJob(jobId);

    return jsonResponse(
      {
        ok: true,
        surveyId,
        surveyKey: survey.survey_key,
        job,
        analytics: {
          finalParticipantCount: analyticsSnapshot.finalParticipantCount,
          totalRecords: analyticsSnapshot.analyticsPayload.totalRecords,
          totalValidParticipants:
            analyticsSnapshot.analyticsPayload.totalValidParticipants,
          privacy: analyticsSnapshot.analyticsPayload.privacy,
        },
      },
      { status: 202 },
    );
  }

  // GET /mvp/surveys/:surveyId/results
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "results"
  ) {
    const surveyId = parts[2];
    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    const schedule = await getFirst<{
      start_time: string | number | null;
      end_time: string | number | null;
    }>(
      env.dscope_db,
      `
      SELECT start_time, end_time
      FROM surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const lifecycle = deriveSurveyLifecycle({
      status: survey.status,
      startTime: schedule?.start_time,
      endTime: schedule?.end_time,
    });

    if (!lifecycle.canViewResults) {
      return jsonResponse(
        {
          ok: false,
          resultAccess: {
            locked: true,
            effectiveStatus: lifecycle.effectiveStatus,
            reason: "Results are available only after finalization",
          },
        },
        { status: 423 },
      );
    }

    const result = await getFirst<MvpSurveyResultRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_results
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!result) {
      return errorResponse(
        404,
        "mvp_results_not_ready",
        "Finalized results are not available yet",
      );
    }

    return jsonResponse({
      ok: true,
      surveyId,
      surveyKey: survey.survey_key,
      result: {
        resultHash: result.result_hash,
        distributionHash: result.distribution_hash,
        finalParticipantCount: result.final_participant_count,
        analyticsPayload: safeJsonParse(result.analytics_payload_json),
        rewardPayload: null,
        finalizationPayload: null,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      },
    });
  }

  // POST /mvp/surveys/:surveyId/responses
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "responses"
  ) {
    const surveyId = parts[2];

    const body = await readJsonBody<SubmitMvpSurveyResponseBody>(request);
    const participantRef = String(body.participantRef || "").trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    const responseSchedule = await getFirst<{
      start_time: string | number | null;
      end_time: string | number | null;
    }>(
      env.dscope_db,
      `
      SELECT start_time, end_time
      FROM surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const responseLifecycle = deriveSurveyLifecycle({
      status: survey.status,
      startTime: responseSchedule?.start_time,
      endTime: responseSchedule?.end_time,
    });

    if (!responseLifecycle.canParticipate) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code:
              responseLifecycle.effectiveStatus === "ended"
                ? "mvp_survey_ended"
                : "mvp_survey_not_active",
            message:
              responseLifecycle.effectiveStatus === "ended"
                ? "This survey has ended and no longer accepts responses"
                : "Only active MVP surveys can accept responses",
          },
          surveyId,
          surveyKey: survey.survey_key,
          effectiveStatus: responseLifecycle.effectiveStatus,
          endTime: responseLifecycle.endTime,
          endTimeIso: responseLifecycle.endTimeIso,
        },
        { status: 409 },
      );
    }

    const pauseStatus = await getParticipationPauseStatus(
      env.dscope_db,
      surveyId,
    );
    if (pauseStatus.paused) {
      return pauseErrorResponse(pauseStatus);
    }

    const metadata = await getFirst<MvpSurveyMetadataRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_metadata
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const questions = metadata
      ? safeParseQuestions(metadata.questions_json)
      : [];

    const normalizedAnswers = normalizeSubmittedAnswers(
      body.answers ?? body.answerSnapshot,
      questions,
    );

    if (!normalizedAnswers.ok) {
      return errorResponse(
        400,
        normalizedAnswers.code,
        normalizedAnswers.message,
      );
    }

    const existingMvpParticipation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    if (existingMvpParticipation) {
      return errorResponse(
        409,
        "already_responded",
        "Participant has already submitted a response for this survey",
      );
    }

    const eligibility = await getFirst<SurveyParticipationEligibilityRow>(
      env.dscope_db,
      `
      SELECT *
      FROM survey_participation_eligibility
      WHERE survey_id = ?
        AND wallet_address = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    if (!eligibility) {
      return errorResponse(
        409,
        "eligibility_required",
        "Participant must pass eligibility before submitting survey responses",
      );
    }

    if (eligibility.eligibility_status !== "eligible") {
      return errorResponse(
        409,
        "not_eligible",
        "Participant is not eligible for this survey",
      );
    }

    if (eligibility.consumed_at) {
      return errorResponse(
        409,
        "participation_right_already_consumed",
        "Participation right has already been consumed",
      );
    }

    const existingLegacyParticipation =
      await getFirst<LegacyParticipationRecordRow>(
        env.dscope_db,
        `
      SELECT *
      FROM survey_participation_records
      WHERE survey_id = ?
        AND wallet_address = ?
      LIMIT 1
      `,
        surveyId,
        participantRef,
      );

    if (existingLegacyParticipation) {
      return errorResponse(
        409,
        "already_participated",
        "Legacy participation record already exists for this participant",
      );
    }

    const predicateOutcome = await getFirst<PredicateOutcomeRow>(
      env.dscope_db,
      `
      SELECT *
      FROM predicate_outcomes
      WHERE id = ?
      LIMIT 1
      `,
      eligibility.predicate_outcome_id,
    );

    const now = nowIso();
    const participationId = crypto.randomUUID();
    const mvpRecordId = buildParticipationRecordId(surveyId, participantRef);
    const participationTxHash =
      body.participationTxHash || `mvp_response_${participationId}`;

    const predicateSnapshot = buildPredicateSnapshot(
      eligibility,
      predicateOutcome,
    );
    const answerSnapshot = {
      source: "mvp_public_response_endpoint",
      surveyId,
      surveyKey: survey.survey_key,
      metadataUpdatedAt: metadata?.updated_at ?? null,
      submittedAt: now,
      answers: normalizedAnswers.answers,
    };

    const rewardStateForPublicResponseParticipation = await getFirst<{
      reward_enabled: number | null;
    }>(
      env.dscope_db,
      `
      SELECT reward_enabled
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const eligibleForReward =
      rewardStateForPublicResponseParticipation?.reward_enabled === 1 ? 1 : 0;

    await env.dscope_db
      .prepare(
        `
        INSERT INTO survey_participation_records (
          id,
          survey_id,
          wallet_address,
          subject_hash,
          eligibility_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        participationId,
        surveyId,
        participantRef,
        eligibility.subject_hash,
        eligibility.id,
        now,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        UPDATE survey_participation_eligibility
        SET consumed_at = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .bind(now, now, eligibility.id)
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_participation_records (
          id,
          survey_id,
          survey_key,
          participant_ref,
          participation_status,
          eligible_for_reward,
          participated_at,
          participation_tx_hash,
          predicate_snapshot_json,
          answer_snapshot_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'participated', ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        mvpRecordId,
        surveyId,
        survey.survey_key,
        participantRef,
        eligibleForReward,
        now,
        participationTxHash,
        JSON.stringify(predicateSnapshot),
        JSON.stringify(answerSnapshot),
        now,
        now,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO survey_events (
          id,
          survey_id,
          event_type,
          payload_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        surveyId,
        "mvp_survey_response_submitted",
        JSON.stringify({
          participantRef,
          participationId,
          mvpRecordId,
          answersCount: normalizedAnswers.answers.length,
        }),
        now,
      )
      .run();

    const participation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    return jsonResponse(
      {
        ok: true,
        response: {
          surveyId,
          surveyKey: survey.survey_key,
          participantRef,
          answersCount: normalizedAnswers.answers.length,
          submittedAt: now,
          participationTxHash,
        },
        eligibility: {
          eligibilityId: eligibility.id,
          status: "consumed",
          consumedAt: now,
        },
        participation: participation
          ? {
              id: participation.id,
              surveyId: participation.survey_id,
              surveyKey: participation.survey_key,
              participantRef: participation.participant_ref,
              participationStatus: participation.participation_status,
              eligibleForReward: participation.eligible_for_reward === 1,
              participatedAt: participation.participated_at,
              participationTxHash: participation.participation_tx_hash,
              predicateSnapshot: safeJsonParse(
                participation.predicate_snapshot_json,
              ),
              answerSnapshot: safeJsonParse(participation.answer_snapshot_json),
              createdAt: participation.created_at,
              updatedAt: participation.updated_at,
            }
          : null,
      },
      { status: 201 },
    );
  }

  // POST /mvp/surveys/:surveyId/participation-records
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "participation-records"
  ) {
    const authError = requireInternalAuthorization(request, env);
    if (authError) {
      return authError;
    }

    const surveyId = parts[2];

    const body = await readJsonBody<{
      participantRef?: string;
      participationStatus?: string;
      eligibleForReward?: boolean;
      participatedAt?: string | null;
      participationTxHash?: string | null;
      predicateSnapshot?: unknown;
      answerSnapshot?: unknown;
      allowWhenPaused?: boolean;
    }>(request);

    const participantRef = String(body.participantRef || "").trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    if (!body.allowWhenPaused) {
      const pauseStatus = await getParticipationPauseStatus(
        env.dscope_db,
        surveyId,
      );
      if (pauseStatus.paused) {
        return pauseErrorResponse(pauseStatus);
      }
    }

    const now = nowIso();
    const recordId = buildParticipationRecordId(surveyId, participantRef);

    const participationStatus = body.participationStatus || "participated";
    const rewardStateForManualParticipation = await getFirst<{
      reward_enabled: number | null;
    }>(
      env.dscope_db,
      `
      SELECT reward_enabled
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const eligibleForReward =
      body.eligibleForReward === true &&
      rewardStateForManualParticipation?.reward_enabled === 1
        ? 1
        : 0;

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_participation_records (
          id,
          survey_id,
          survey_key,
          participant_ref,
          participation_status,
          eligible_for_reward,
          participated_at,
          participation_tx_hash,
          predicate_snapshot_json,
          answer_snapshot_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(survey_id, participant_ref) DO UPDATE SET
          participation_status = excluded.participation_status,
          eligible_for_reward = excluded.eligible_for_reward,
          participated_at = excluded.participated_at,
          participation_tx_hash = excluded.participation_tx_hash,
          predicate_snapshot_json = excluded.predicate_snapshot_json,
          answer_snapshot_json = excluded.answer_snapshot_json,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        recordId,
        surveyId,
        survey.survey_key,
        participantRef,
        participationStatus,
        eligibleForReward,
        body.participatedAt ?? now,
        body.participationTxHash ?? null,
        JSON.stringify(body.predicateSnapshot ?? null),
        JSON.stringify(body.answerSnapshot ?? null),
        now,
        now,
      )
      .run();

    const participation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    return jsonResponse(
      {
        ok: true,
        participation: participation
          ? {
              id: participation.id,
              surveyId: participation.survey_id,
              surveyKey: participation.survey_key,
              participantRef: participation.participant_ref,
              participationStatus: participation.participation_status,
              eligibleForReward: participation.eligible_for_reward === 1,
              participatedAt: participation.participated_at,
              participationTxHash: participation.participation_tx_hash,
              predicateSnapshot: safeJsonParse(
                participation.predicate_snapshot_json,
              ),
              answerSnapshot: safeJsonParse(participation.answer_snapshot_json),
              createdAt: participation.created_at,
              updatedAt: participation.updated_at,
            }
          : null,
      },
      { status: 201 },
    );
  }

  // POST /mvp/surveys/:surveyId/reward-claims
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "reward-claims"
  ) {
    const authError = requireInternalAuthorization(request, env);
    if (authError) {
      return authError;
    }

    const surveyId = parts[2];

    const body = await readJsonBody<{
      participantRef?: string;
      claimStatus?: string;
      claimAmount?: string;
      claimDeadline?: string;
      claimTxHash?: string | null;
      claimedAt?: string | null;
    }>(request);

    const participantRef = String(body.participantRef || "").trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    const reward = await getFirst<MvpSurveyRewardRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const now = nowIso();
    const claimId = buildClaimId(surveyId, participantRef);

    const claimStatus = body.claimStatus || "not_claimed";
    const claimAmount =
      body.claimAmount || reward?.reward_per_participant || "0";

    const claimDeadline = body.claimDeadline || reward?.claim_deadline || null;

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_reward_claims (
          id,
          survey_id,
          survey_key,
          participant_ref,
          claim_status,
          claim_amount,
          claim_deadline,
          claim_tx_hash,
          claimed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(survey_id, participant_ref) DO UPDATE SET
          claim_status = excluded.claim_status,
          claim_amount = excluded.claim_amount,
          claim_deadline = excluded.claim_deadline,
          claim_tx_hash = excluded.claim_tx_hash,
          claimed_at = excluded.claimed_at,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        claimId,
        surveyId,
        survey.survey_key,
        participantRef,
        claimStatus,
        claimAmount,
        claimDeadline,
        body.claimTxHash ?? null,
        body.claimedAt ?? null,
        now,
        now,
      )
      .run();

    const claim = await getFirst<MvpRewardClaimRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_reward_claims
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    return jsonResponse(
      {
        ok: true,
        claim: claim
          ? {
              id: claim.id,
              surveyId: claim.survey_id,
              surveyKey: claim.survey_key,
              participantRef: claim.participant_ref,
              claimStatus: claim.claim_status,
              claimAmount: claim.claim_amount,
              claimDeadline: claim.claim_deadline,
              claimTxHash: claim.claim_tx_hash,
              claimedAt: claim.claimed_at,
              createdAt: claim.created_at,
              updatedAt: claim.updated_at,
            }
          : null,
      },
      { status: 201 },
    );
  }

  // POST /mvp/surveys/:surveyId/claim
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "claim"
  ) {
    const surveyId = parts[2];

    const body = await readJsonBody<{
      participantRef?: string;
      claimTxHash?: string | null;
      claimedAt?: string | null;
    }>(request);

    const participantRef = String(body.participantRef || "").trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    if (survey.status !== "finalized") {
      return errorResponse(
        409,
        "mvp_survey_not_finalized",
        "Only finalized MVP surveys can be claimed",
      );
    }

    const reward = await getFirst<MvpSurveyRewardRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!reward || reward.reward_enabled !== 1) {
      return errorResponse(
        409,
        "reward_disabled",
        "Reward is disabled for this survey",
      );
    }

    if (reward.reward_status !== "FINALIZED") {
      return errorResponse(
        409,
        "reward_not_finalized",
        "Reward distribution is not finalized yet",
      );
    }

    const participation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const hasValidParticipation =
      participation?.participation_status === "participated" &&
      participation.eligible_for_reward === 1;

    if (!hasValidParticipation) {
      return errorResponse(
        409,
        "not_eligible_for_reward",
        "Participant is not eligible for reward claim",
      );
    }

    const existingClaim = await getFirst<MvpRewardClaimRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_reward_claims
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    if (existingClaim?.claim_status === "claimed") {
      return errorResponse(
        409,
        "already_claimed",
        "Reward has already been claimed",
      );
    }

    const now = nowIso();
    const claimId = buildClaimId(surveyId, participantRef);

    const claimAmount =
      existingClaim?.claim_amount || reward.reward_per_participant || "0";
    const claimDeadline =
      existingClaim?.claim_deadline || reward.claim_deadline || null;
    const claimTxHash =
      body.claimTxHash ||
      `mock_claim_${surveyId}_${participantRef.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}`;
    const claimedAt = body.claimedAt || now;

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_reward_claims (
          id,
          survey_id,
          survey_key,
          participant_ref,
          claim_status,
          claim_amount,
          claim_deadline,
          claim_tx_hash,
          claimed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'claimed', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(survey_id, participant_ref) DO UPDATE SET
          claim_status = 'claimed',
          claim_amount = excluded.claim_amount,
          claim_deadline = excluded.claim_deadline,
          claim_tx_hash = excluded.claim_tx_hash,
          claimed_at = excluded.claimed_at,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        claimId,
        surveyId,
        survey.survey_key,
        participantRef,
        claimAmount,
        claimDeadline,
        claimTxHash,
        claimedAt,
        now,
        now,
      )
      .run();

    const claim = await getFirst<MvpRewardClaimRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_reward_claims
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    return jsonResponse(
      {
        ok: true,
        claim: claim
          ? {
              id: claim.id,
              surveyId: claim.survey_id,
              surveyKey: claim.survey_key,
              participantRef: claim.participant_ref,
              claimStatus: claim.claim_status,
              claimAmount: claim.claim_amount,
              claimDeadline: claim.claim_deadline,
              claimTxHash: claim.claim_tx_hash,
              claimedAt: claim.claimed_at,
              createdAt: claim.created_at,
              updatedAt: claim.updated_at,
            }
          : null,
      },
      { status: 201 },
    );
  }

  // GET /mvp/surveys/:surveyId/reward-status?participantRef=...
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "reward-status"
  ) {
    const surveyId = parts[2];
    const participantRef = String(
      url.searchParams.get("participantRef") || "",
    ).trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef query param is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    const reward = await getFirst<MvpSurveyRewardRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const claim = await getFirst<MvpRewardClaimRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_reward_claims
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const participation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const surveyFinalized = survey.status === "finalized";
    const rewardFinalized = reward?.reward_status === "FINALIZED";
    const rewardEnabled = reward?.reward_enabled === 1;

    const hasValidParticipation =
      participation?.participation_status === "participated" &&
      participation.eligible_for_reward === 1;

    const derivedClaimStatus = !rewardEnabled
      ? "reward_disabled"
      : !surveyFinalized || !rewardFinalized
        ? "not_available_yet"
        : !hasValidParticipation
          ? "not_eligible"
          : claim?.claim_status || "not_claimed";

    return jsonResponse({
      ok: true,
      survey: {
        id: survey.id,
        surveyKey: survey.survey_key,
        status: survey.status,
      },
      reward: reward
        ? {
            rewardEnabled,
            rewardStatus: reward.reward_status,
            rewardPoolAmount: reward.reward_pool_amount,
            rewardPerParticipant: reward.reward_per_participant,
            claimDeadline: reward.claim_deadline,
            finalizedAt: reward.finalized_at,
          }
        : null,
      participant: {
        participantRef,
        hasParticipated: participation?.participation_status === "participated",
        eligibleForReward: participation?.eligible_for_reward === 1,
        participationStatus: participation?.participation_status || "none",
        participatedAt: participation?.participated_at || null,
        participationTxHash: participation?.participation_tx_hash || null,
      },
      claim: {
        claimStatus: derivedClaimStatus,
        claimAmount:
          claim?.claim_amount || reward?.reward_per_participant || "0",
        claimDeadline: claim?.claim_deadline || reward?.claim_deadline || null,
        claimTxHash: claim?.claim_tx_hash || null,
        claimedAt: claim?.claimed_at || null,
        source: claim ? "stored_claim_record" : "derived_from_reward_state",
      },
    });
  }

  // GET /mvp/surveys/:surveyId/participant-view?participantRef=...
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys" &&
    parts[3] === "participant-view"
  ) {
    const surveyId = parts[2];
    const participantRef = String(
      url.searchParams.get("participantRef") || "",
    ).trim();

    if (!participantRef) {
      return errorResponse(
        400,
        "missing_participant_ref",
        "participantRef query param is required",
      );
    }

    const survey = await getFirst<MvpSurveyRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    if (!survey) {
      return errorResponse(404, "mvp_survey_not_found", "MVP survey not found");
    }

    const contracts = await getFirst<MvpSurveyContractsRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_contracts
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const reward = await getFirst<MvpSurveyRewardRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_rewards
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const result = await getFirst<MvpSurveyResultRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_survey_results
      WHERE survey_id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const claim = await getFirst<MvpRewardClaimRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_reward_claims
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const participation = await getFirst<MvpParticipationRecordRow>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const latestCredentialIssueJob = await getFirst<any>(
      env.dscope_db,
      `
      SELECT *
      FROM mvp_credential_issue_jobs
      WHERE survey_id = ?
        AND wallet_address = ?
      ORDER BY
        CASE
          WHEN status = 'issued' AND tx_hash IS NOT NULL THEN 0
          WHEN status IN ('pending', 'running') THEN 1
          WHEN status = 'failed' THEN 2
          ELSE 3
        END ASC,
        updated_at DESC,
        created_at DESC
      LIMIT 1
      `,
      surveyId,
      participantRef,
    );

    const credentialQueueStats = await getFirst<CredentialQueueStatsRow>(
      env.dscope_db,
      `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_jobs,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_jobs,
        MIN(CASE WHEN status = 'pending' THEN created_at ELSE NULL END) AS oldest_pending_at
      FROM mvp_credential_issue_jobs
      `,
    );

    const credentialIssuerHeartbeat =
      await getFirst<CredentialIssuerHeartbeatRow>(
        env.dscope_db,
        `
      SELECT status, last_seen_at
      FROM mvp_ops_heartbeats
      WHERE service_name = 'credential-issuer'
      ORDER BY last_seen_at DESC
      LIMIT 1
      `,
      );

    const latestJob = await getFirst<MvpRunnerJobRow>(
      env.dscope_db,
      `
      SELECT
        id,
        type,
        status,
        survey_id,
        survey_key,
        attempts,
        max_attempts,
        last_error,
        created_at,
        updated_at,
        locked_at,
        locked_by,
        finished_at
      FROM mvp_runner_jobs
      WHERE survey_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      surveyId,
    );

    const participantSchedule = await getFirst<{
      start_time: string | number | null;
      end_time: string | number | null;
    }>(
      env.dscope_db,
      `
      SELECT start_time, end_time
      FROM surveys
      WHERE id = ?
      LIMIT 1
      `,
      surveyId,
    );

    const participantLifecycle = deriveSurveyLifecycle({
      status: survey.status,
      startTime: participantSchedule?.start_time,
      endTime: participantSchedule?.end_time,
    });

    const surveyFinalized =
      participantLifecycle.effectiveStatus === "finalized";
    const surveyActive = participantLifecycle.canParticipate;
    const participationPause = await getParticipationPauseStatus(
      env.dscope_db,
      surveyId,
    );
    const rewardEnabled = reward?.reward_enabled === 1;
    const rewardFinalized = reward?.reward_status === "FINALIZED";

    const hasValidParticipation =
      participation?.participation_status === "participated" &&
      participation.eligible_for_reward === 1;

    const derivedClaimStatus = !rewardEnabled
      ? "reward_disabled"
      : !surveyFinalized || !rewardFinalized
        ? "not_available_yet"
        : !hasValidParticipation
          ? "not_eligible"
          : claim?.claim_status || "not_claimed";

    const canParticipate = surveyActive && !participationPause.paused;
    const canViewResults = surveyFinalized && result !== null;
    const canClaim =
      surveyFinalized &&
      rewardEnabled &&
      rewardFinalized &&
      hasValidParticipation &&
      derivedClaimStatus === "not_claimed";

    const credentialPendingJobs = Number(
      credentialQueueStats?.pending_jobs ?? 0,
    );
    const credentialRunningJobs = Number(
      credentialQueueStats?.running_jobs ?? 0,
    );
    const credentialIssuerAgeSeconds = secondsSinceIso(
      credentialIssuerHeartbeat?.last_seen_at,
    );
    const credentialServiceAlive =
      credentialIssuerAgeSeconds !== null && credentialIssuerAgeSeconds <= 30;

    const systemStatus = {
      credentialBacklogLevel: credentialBacklogLevel(credentialPendingJobs),
      credentialPendingJobs,
      credentialRunningJobs,
      oldestPendingCredentialJobAt:
        credentialQueueStats?.oldest_pending_at ?? null,
      credentialServiceAlive,
      credentialServiceStatus: credentialIssuerHeartbeat?.status ?? null,
      credentialServiceLastSeenAt:
        credentialIssuerHeartbeat?.last_seen_at ?? null,
      credentialServiceAgeSeconds: credentialIssuerAgeSeconds,
      participationPause,
    };

    const credentialIssue = latestCredentialIssueJob
      ? {
          status:
            latestCredentialIssueJob.status === "issued" &&
            latestCredentialIssueJob.tx_hash
              ? "issued"
              : latestCredentialIssueJob.status,
          reason:
            latestCredentialIssueJob.last_error ||
            (latestCredentialIssueJob.status === "pending"
              ? "credential_issue_queued"
              : latestCredentialIssueJob.status === "running"
                ? "credential_issue_running"
                : latestCredentialIssueJob.status === "issued"
                  ? "credential_issued"
                  : null),
          jobId: latestCredentialIssueJob.id,
          txHash: latestCredentialIssueJob.tx_hash || null,
          participationGateAddress:
            latestCredentialIssueJob.participation_gate_address ||
            contracts?.participation_gate_address ||
            null,
          to: latestCredentialIssueJob.wallet_address || participantRef,
          issuer: latestCredentialIssueJob.issuer || null,
          issuedAt: latestCredentialIssueJob.issued_at || null,
          updatedAt: latestCredentialIssueJob.updated_at || null,
        }
      : null;

    const currentTime = Math.floor(Date.now() / 1000).toString();

    const participationPlan = (() => {
      if (participation?.participation_status === "participated") {
        return {
          nextAction: "already_participated",
          reason: "participation_already_recorded",
          contractCall: null,
        };
      }

      if (participationPause.paused) {
        return {
          nextAction: "not_ready",
          reason: "participation_paused",
          contractCall: null,
        };
      }

      if (!surveyActive) {
        return {
          nextAction: "not_ready",
          reason: "survey_not_active",
          contractCall: null,
        };
      }

      if (!contracts?.participation_gate_address) {
        return {
          nextAction: "not_ready",
          reason: "participation_gate_not_ready",
          contractCall: null,
        };
      }

      if (!latestCredentialIssueJob) {
        return {
          nextAction: "verify_eligibility",
          reason: "credential_not_requested",
          contractCall: null,
        };
      }

      if (
        latestCredentialIssueJob.status === "issued" &&
        latestCredentialIssueJob.tx_hash
      ) {
        return {
          nextAction: "wallet_participate",
          reason: "credential_issued",
          contractCall: {
            target: contracts.participation_gate_address,
            method: "participate",
            args: {
              surveyKey: survey.survey_key,
              policyHash: survey.predicate_policy_hash,
              currentTime,
            },
          },
        };
      }

      if (
        latestCredentialIssueJob.status === "pending" ||
        latestCredentialIssueJob.status === "running"
      ) {
        return {
          nextAction: "credential_pending",
          reason:
            latestCredentialIssueJob.status === "running"
              ? "credential_issue_running"
              : "credential_issue_queued",
          contractCall: null,
        };
      }

      if (latestCredentialIssueJob.status === "failed") {
        return {
          nextAction: "not_ready",
          reason: "credential_failed",
          contractCall: null,
        };
      }

      return {
        nextAction: "not_ready",
        reason: "credential_not_ready",
        contractCall: null,
      };
    })();

    return jsonResponse({
      ok: true,
      participant: {
        participantRef,
        hasParticipated: participation?.participation_status === "participated",
        eligibleForReward: participation?.eligible_for_reward === 1,
        participationStatus: participation?.participation_status || "none",
        participatedAt: participation?.participated_at || null,
        participationTxHash: participation?.participation_tx_hash || null,
      },
      survey: {
        id: survey.id,
        surveyKey: survey.survey_key,
        title: survey.title,
        status: survey.status,
        effectiveStatus: participantLifecycle.effectiveStatus,
        schedule: {
          startTime: participantLifecycle.startTime,
          endTime: participantLifecycle.endTime,
          startTimeIso: participantLifecycle.startTimeIso,
          endTimeIso: participantLifecycle.endTimeIso,
          timeRemainingSeconds: participantLifecycle.timeRemainingSeconds,
        },
        lifecycle: {
          storedStatus: participantLifecycle.storedStatus,
          effectiveStatus: participantLifecycle.effectiveStatus,
          hasStarted: participantLifecycle.hasStarted,
          hasEnded: participantLifecycle.hasEnded,
          canParticipate: participantLifecycle.canParticipate,
          canRequestFinalization: participantLifecycle.canRequestFinalization,
          canViewResults: participantLifecycle.canViewResults,
        },
        sponsor: survey.sponsor,
        metadataHash: survey.metadata_hash,
        predicatePolicyHash: survey.predicate_policy_hash,
        createdAt: survey.created_at,
        updatedAt: survey.updated_at,
      },
      availability: {
        canParticipate,
        canViewResults,
        canClaim,
      },
      systemStatus,
      contracts: contracts
        ? {
            dscopeCoreAddress: contracts.dscope_core_address,
            participationGateAddress: contracts.participation_gate_address,
            rewardVaultAddress: contracts.reward_vault_address,
          }
        : null,
      credentialIssue,
      participationPlan,
      reward: reward
        ? {
            rewardEnabled,
            rewardStatus: reward.reward_status,
            rewardPoolAmount: reward.reward_pool_amount,
            rewardPerParticipant: reward.reward_per_participant,
            totalAllocated: reward.total_allocated,
            dustReturnToSponsor: reward.dust_return_to_sponsor,
            claimDeadline: reward.claim_deadline,
            finalizedAt: reward.finalized_at,
          }
        : null,
      claim: {
        claimStatus: derivedClaimStatus,
        claimAmount:
          claim?.claim_amount || reward?.reward_per_participant || "0",
        claimDeadline: claim?.claim_deadline || reward?.claim_deadline || null,
        claimTxHash: claim?.claim_tx_hash || null,
        claimedAt: claim?.claimed_at || null,
        source: claim ? "stored_claim_record" : "derived_from_reward_state",
      },
      result: result
        ? {
            resultHash: result.result_hash,
            distributionHash: result.distribution_hash,
            finalParticipantCount: result.final_participant_count,
            analyticsPayload: safeJsonParse(result.analytics_payload_json),
          }
        : null,
      runner: latestJob
        ? {
            latestJob: {
              id: latestJob.id,
              type: latestJob.type,
              status: latestJob.status,
              attempts: latestJob.attempts,
              maxAttempts: latestJob.max_attempts,
              lastError: latestJob.last_error,
              updatedAt: latestJob.updated_at,
              finishedAt: latestJob.finished_at,
            },
          }
        : {
            latestJob: null,
          },
    });
  }

  // GET /mvp/surveys/:surveyId
  if (
    request.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "mvp" &&
    parts[1] === "surveys"
  ) {
    const surveyId = parts[2];
    return buildMvpSurveyCard(env.dscope_db, surveyId);
  }

  return errorResponse(
    404,
    "mvp_survey_route_not_found",
    "MVP survey route not found",
  );
}
