import { handleMvpSurveyRoutes } from "./routes/mvp-survey-routes";
import { handleMvpReferenceRoutes } from "./routes/mvp-reference-routes";
import { handleInternalRunnerRoutes } from "./routes/internal-runner-routes";
import { handleVerificationRoutes } from "./routes/verification";
import { handleMvpCreatorRoutes } from "./routes/mvp-creator-routes";
import { handleMvpParticipantRoutes } from "./routes/mvp-participant-routes";
import { handleInternalAdminRoutes } from "./routes/internal-admin-routes";
import { handlePublicReportRoutes } from "./routes/public-report-routes";
import { safeStringEqual } from "./domain/verification/trusted-zkpassport";
import type { SurveyPolicyV1 } from "./domain/policy/types";
import {
  FIRST_PUBLIC_RELEASE_REWARDS_ENABLED,
  isDisabledLegacyOrchestrationPath,
  isUnauthenticatedParticipantReadPath,
  isUnsafeClientVerificationCompletionPath,
  isUnsafeRewardsRuntimeConfig,
} from "./security/public-launch-policy";

export interface Env {
  dscope_db: D1Database;

  INTERNAL_RUNNER_TOKEN?: string;
  INTERNAL_ADMIN_TOKEN?: string;
  INTERNAL_ZKPASSPORT_VERIFIER_TOKEN?: string;
  REWARDS_ENABLED?: string;

  ZKPASSPORT_VERIFIER_PUBLIC_URL?: string;
  VERIFICATION_RATE_LIMIT_SECRET?: string;
  VERIFICATION_SESSION_WALLET_LIMIT_PER_HOUR?: string;
  VERIFICATION_SESSION_IP_LIMIT_PER_HOUR?: string;

  AZTEC_NODE_URL?: string;
  AZTEC_FROM_ALIAS?: string;

  MVP_ISSUER_SERVICE_URL?: string;
  ISSUER_SERVICE_URL?: string;
  D_SCOPE_ISSUER_SERVICE_URL?: string;
  MVP_AUTO_ISSUE_CREDENTIALS?: string;

  PARTICIPATION_GATE_ARTIFACT?: string;
  DSCOPE_CORE_ARTIFACT?: string;
  SURVEY_FACTORY_ARTIFACT?: string;

  PARTICIPATION_GATE_ADDRESS?: string;
  SURVEY_FACTORY_ADDRESS?: string;

  RESEND_API_KEY?: string;
  CREATOR_EMAIL_FROM?: string;
  APP_ORIGIN?: string;
}

type SurveyStatus = "active" | "finalized" | "cancelled";
type SurveyJobStatus = "pending" | "running" | "done" | "failed";
type CreateFlowStatus =
  | "pending"
  | "deploying_gate"
  | "registering_policy"
  | "deploying_core"
  | "created"
  | "failed";

interface CreateSurveyBody {
  id: string;
  network: string;

  sponsor: string;
  treasury: string;
  systemFinalizer: string;

  metadataHash: string;
  predicatePolicyHash: string;
  predicatePolicyJson?: SurveyPolicyV1 | null;

  surveyKey: string;

  startTime: number;
  endTime: number;

  rewardPoolAmount: string;
  claimDeadline: string;
  rewardEnabled: string;
  minimumSampleTarget: string;

  analyticsMinTotalSample: string;
  analyticsMinSegmentSample: string;
  analyticsVisibilityMode: string;

  participationGateAddress?: string | null;
  dscopeCoreAddress?: string | null;
  factoryAddress?: string | null;

  status?: SurveyStatus;
}

interface UpdateCreateStatusBody {
  createFlowStatus: CreateFlowStatus;

  participationGateAddress?: string | null;
  dscopeCoreAddress?: string | null;
  factoryAddress?: string | null;
  surveyKey?: string | null;
  registryId?: string | null;

  deployGateTxHash?: string | null;
  registerPolicyTxHash?: string | null;
  deployCoreTxHash?: string | null;
  factoryRegisterTxHash?: string | null;

  createError?: string | null;
}

interface ApplySyncBody {
  status: SurveyStatus;
  resultHash?: string | null;
  distributionHash?: string | null;
  finalParticipantCount?: string | null;
  finalizedAt?: number | null;
}

interface RequestFinalizeBody {
  resultHash: string;
  distributionHash: string;
  finalParticipantCount: string;
  finalizedAt: number;
  currentTime: number;
}

interface UpdateJobBody {
  status: SurveyJobStatus;
  lastError?: string | null;
}

interface RetryJobBody {
  runAt?: string | null;
}

type JsonInit = ResponseInit & { headers?: Record<string, string> };

const ALLOWED_ORIGINS = new Set([
  "https://app.dscope.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.dscope.app";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Verification-Token",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonWithCors(
  data: unknown,
  request: Request,
  init: JsonInit = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...buildCorsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSurveyStatus(value: unknown): value is SurveyStatus {
  return value === "active" || value === "finalized" || value === "cancelled";
}

function isValidJobStatus(value: unknown): value is SurveyJobStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "done" ||
    value === "failed"
  );
}

function isValidCreateFlowStatus(value: unknown): value is CreateFlowStatus {
  return (
    value === "pending" ||
    value === "deploying_gate" ||
    value === "registering_policy" ||
    value === "deploying_core" ||
    value === "created" ||
    value === "failed"
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTrustedVerifierRequest(request: Request, env: Env): boolean {
  const token = env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN;
  if (!token || token.length < 32) return false;
  return safeStringEqual(
    request.headers.get("authorization") ?? "",
    `Bearer ${token}`,
  );
}

function defaultSurveyPolicy(): SurveyPolicyV1 {
  return {
    version: 1,
    predicateSource: "zkpassport",
    age: {
      mode: "min_age",
      min: 18,
      buckets: [],
    },
    countries: {
      mode: "any",
      values: [],
    },
    regions: {
      mode: "any",
      values: [],
    },
    freshness: {
      mode: "any",
      days: null,
    },
  };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function isHexField(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

function hasPlaceholderText(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("новый") ||
    normalized.includes("placeholder") ||
    normalized.includes("put_current") ||
    normalized.includes("адрес") ||
    normalized.includes("0xtx_") ||
    normalized.includes("tx_") ||
    normalized === "0x" ||
    normalized === "0x..."
  );
}

function validateNoPlaceholderStrings(
  body: Record<string, unknown>,
): string | null {
  for (const [field, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;

    if (hasPlaceholderText(value)) {
      return `Field '${field}' contains placeholder value: ${value}`;
    }
  }

  return null;
}

function validateOptionalHexField(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return `Field '${field}' must be a string or null`;
  }

  if (!isHexField(value)) {
    return `Field '${field}' must be a 0x-prefixed 32-byte hex string`;
  }

  return null;
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validateCreateSurveyBody(
  body: unknown,
): { ok: true; data: CreateSurveyBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  if (!isNonEmptyString(body.id)) {
    return { ok: false, error: "Field 'id' is required" };
  }
  if (!isNonEmptyString(body.network)) {
    return { ok: false, error: "Field 'network' is required" };
  }

  if (!isNonEmptyString(body.sponsor)) {
    return { ok: false, error: "Field 'sponsor' is required" };
  }
  if (!isNonEmptyString(body.treasury)) {
    return { ok: false, error: "Field 'treasury' is required" };
  }
  if (!isNonEmptyString(body.systemFinalizer)) {
    return { ok: false, error: "Field 'systemFinalizer' is required" };
  }

  if (!isNonEmptyString(body.metadataHash)) {
    return { ok: false, error: "Field 'metadataHash' is required" };
  }
  if (!isNonEmptyString(body.predicatePolicyHash)) {
    return { ok: false, error: "Field 'predicatePolicyHash' is required" };
  }
  if (!isNonEmptyString(body.surveyKey)) {
    return { ok: false, error: "Field 'surveyKey' is required" };
  }

  if (!isNumber(body.startTime)) {
    return { ok: false, error: "Field 'startTime' must be a number" };
  }
  if (!isNumber(body.endTime)) {
    return { ok: false, error: "Field 'endTime' must be a number" };
  }

  if (!isNonEmptyString(body.rewardPoolAmount)) {
    return { ok: false, error: "Field 'rewardPoolAmount' is required" };
  }
  if (!isNonEmptyString(body.claimDeadline)) {
    return { ok: false, error: "Field 'claimDeadline' is required" };
  }
  if (!isNonEmptyString(body.rewardEnabled)) {
    return { ok: false, error: "Field 'rewardEnabled' is required" };
  }
  if (!isNonEmptyString(body.minimumSampleTarget)) {
    return { ok: false, error: "Field 'minimumSampleTarget' is required" };
  }

  if (!isNonEmptyString(body.analyticsMinTotalSample)) {
    return { ok: false, error: "Field 'analyticsMinTotalSample' is required" };
  }
  if (!isNonEmptyString(body.analyticsMinSegmentSample)) {
    return {
      ok: false,
      error: "Field 'analyticsMinSegmentSample' is required",
    };
  }
  if (!isNonEmptyString(body.analyticsVisibilityMode)) {
    return { ok: false, error: "Field 'analyticsVisibilityMode' is required" };
  }

  if (body.status !== undefined && !isValidSurveyStatus(body.status)) {
    return {
      ok: false,
      error: "Field 'status' must be one of: active, finalized, cancelled",
    };
  }

  const participationGateAddress = asOptionalString(
    body.participationGateAddress,
  );
  if (
    body.participationGateAddress !== undefined &&
    participationGateAddress === undefined
  ) {
    return {
      ok: false,
      error: "Field 'participationGateAddress' must be a string or null",
    };
  }

  const dscopeCoreAddress = asOptionalString(body.dscopeCoreAddress);
  if (body.dscopeCoreAddress !== undefined && dscopeCoreAddress === undefined) {
    return {
      ok: false,
      error: "Field 'dscopeCoreAddress' must be a string or null",
    };
  }

  const factoryAddress = asOptionalString(body.factoryAddress);
  if (body.factoryAddress !== undefined && factoryAddress === undefined) {
    return {
      ok: false,
      error: "Field 'factoryAddress' must be a string or null",
    };
  }

  let predicatePolicyJson: SurveyPolicyV1 | null = null;
  if (
    body.predicatePolicyJson !== undefined &&
    body.predicatePolicyJson !== null
  ) {
    if (!isRecord(body.predicatePolicyJson)) {
      return {
        ok: false,
        error: "Field 'predicatePolicyJson' must be an object or null",
      };
    }
    predicatePolicyJson = body.predicatePolicyJson as SurveyPolicyV1;
  }

  return {
    ok: true,
    data: {
      id: body.id,
      network: body.network,
      sponsor: body.sponsor,
      treasury: body.treasury,
      systemFinalizer: body.systemFinalizer,
      metadataHash: body.metadataHash,
      predicatePolicyHash: body.predicatePolicyHash,
      predicatePolicyJson,
      surveyKey: body.surveyKey,
      startTime: body.startTime,
      endTime: body.endTime,
      rewardPoolAmount: body.rewardPoolAmount,
      claimDeadline: body.claimDeadline,
      rewardEnabled: body.rewardEnabled,
      minimumSampleTarget: body.minimumSampleTarget,
      analyticsMinTotalSample: body.analyticsMinTotalSample,
      analyticsMinSegmentSample: body.analyticsMinSegmentSample,
      analyticsVisibilityMode: body.analyticsVisibilityMode,
      participationGateAddress,
      dscopeCoreAddress,
      factoryAddress,
      status: body.status ?? "active",
    },
  };
}

function validateUpdateCreateStatusBody(
  body: unknown,
): { ok: true; data: UpdateCreateStatusBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const placeholderError = validateNoPlaceholderStrings(body);
  if (placeholderError) {
    return { ok: false, error: placeholderError };
  }

  if (!isValidCreateFlowStatus(body.createFlowStatus)) {
    return {
      ok: false,
      error:
        "Field 'createFlowStatus' must be one of: pending, deploying_gate, registering_policy, deploying_core, created, failed",
    };
  }

  const optionalFields: Array<[unknown, string]> = [
    [body.participationGateAddress, "participationGateAddress"],
    [body.dscopeCoreAddress, "dscopeCoreAddress"],
    [body.factoryAddress, "factoryAddress"],
    [body.surveyKey, "surveyKey"],
    [body.registryId, "registryId"],
    [body.deployGateTxHash, "deployGateTxHash"],
    [body.registerPolicyTxHash, "registerPolicyTxHash"],
    [body.deployCoreTxHash, "deployCoreTxHash"],
    [body.factoryRegisterTxHash, "factoryRegisterTxHash"],
    [body.createError, "createError"],
  ];

  for (const [value, field] of optionalFields) {
    if (value !== undefined && value !== null && typeof value !== "string") {
      return {
        ok: false,
        error: `Field '${field}' must be a string or null`,
      };
    }
  }

  const hexFields = [
    "participationGateAddress",
    "dscopeCoreAddress",
    "contractAddress",
    "factoryAddress",
    "deployGateTxHash",
    "registerPolicyTxHash",
    "deployCoreTxHash",
    "factoryRegisterTxHash",
  ];

  for (const field of hexFields) {
    const hexError = validateOptionalHexField(body, field);
    if (hexError) {
      return { ok: false, error: hexError };
    }
  }

  return {
    ok: true,
    data: {
      createFlowStatus: body.createFlowStatus,
      participationGateAddress: asOptionalString(body.participationGateAddress),
      dscopeCoreAddress: asOptionalString(body.dscopeCoreAddress),
      factoryAddress: asOptionalString(body.factoryAddress),
      surveyKey: asOptionalString(body.surveyKey),
      registryId: asOptionalString(body.registryId),
      deployGateTxHash: asOptionalString(body.deployGateTxHash),
      registerPolicyTxHash: asOptionalString(body.registerPolicyTxHash),
      deployCoreTxHash: asOptionalString(body.deployCoreTxHash),
      factoryRegisterTxHash: asOptionalString(body.factoryRegisterTxHash),
      createError: asOptionalString(body.createError),
    },
  };
}

function validateApplySyncBody(
  body: unknown,
): { ok: true; data: ApplySyncBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  if (!isValidSurveyStatus(body.status)) {
    return {
      ok: false,
      error: "Field 'status' must be one of: active, finalized, cancelled",
    };
  }

  const resultHash = asOptionalString(body.resultHash);
  const distributionHash = asOptionalString(body.distributionHash);
  const finalParticipantCount = asOptionalString(body.finalParticipantCount);

  if (body.resultHash !== undefined && resultHash === undefined) {
    return { ok: false, error: "Field 'resultHash' must be a string or null" };
  }
  if (body.distributionHash !== undefined && distributionHash === undefined) {
    return {
      ok: false,
      error: "Field 'distributionHash' must be a string or null",
    };
  }
  if (
    body.finalParticipantCount !== undefined &&
    finalParticipantCount === undefined
  ) {
    return {
      ok: false,
      error: "Field 'finalParticipantCount' must be a string or null",
    };
  }
  if (
    body.finalizedAt !== undefined &&
    body.finalizedAt !== null &&
    !isNumber(body.finalizedAt)
  ) {
    return { ok: false, error: "Field 'finalizedAt' must be a number or null" };
  }

  return {
    ok: true,
    data: {
      status: body.status,
      resultHash,
      distributionHash,
      finalParticipantCount,
      finalizedAt:
        typeof body.finalizedAt === "number" || body.finalizedAt === null
          ? body.finalizedAt
          : undefined,
    },
  };
}

function validateRequestFinalizeBody(
  body: unknown,
): { ok: true; data: RequestFinalizeBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  if (!isNonEmptyString(body.resultHash)) {
    return { ok: false, error: "Field 'resultHash' is required" };
  }
  if (!isNonEmptyString(body.distributionHash)) {
    return { ok: false, error: "Field 'distributionHash' is required" };
  }
  if (!isNonEmptyString(body.finalParticipantCount)) {
    return { ok: false, error: "Field 'finalParticipantCount' is required" };
  }
  if (!isNumber(body.finalizedAt)) {
    return { ok: false, error: "Field 'finalizedAt' must be a number" };
  }
  if (!isNumber(body.currentTime)) {
    return { ok: false, error: "Field 'currentTime' must be a number" };
  }

  return {
    ok: true,
    data: {
      resultHash: body.resultHash,
      distributionHash: body.distributionHash,
      finalParticipantCount: body.finalParticipantCount,
      finalizedAt: body.finalizedAt,
      currentTime: body.currentTime,
    },
  };
}

function validateUpdateJobBody(
  body: unknown,
): { ok: true; data: UpdateJobBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  if (!isValidJobStatus(body.status)) {
    return {
      ok: false,
      error: "Field 'status' must be one of: pending, running, done, failed",
    };
  }

  const lastError = asOptionalString(body.lastError);
  if (body.lastError !== undefined && lastError === undefined) {
    return { ok: false, error: "Field 'lastError' must be a string or null" };
  }

  return {
    ok: true,
    data: {
      status: body.status,
      lastError,
    },
  };
}

function validateRetryJobBody(
  body: unknown,
): { ok: true; data: RetryJobBody } | { ok: false; error: string } {
  if (body === undefined || body === null) {
    return { ok: true, data: {} };
  }

  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const runAt = asOptionalString(body.runAt);
  if (body.runAt !== undefined && runAt === undefined) {
    return { ok: false, error: "Field 'runAt' must be a string or null" };
  }

  return {
    ok: true,
    data: { runAt },
  };
}

async function getSurveyById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first<any>();
}

async function listSurveys(db: D1Database) {
  return db
    .prepare(
      `
      SELECT *
      FROM surveys
      ORDER BY created_at DESC
    `,
    )
    .all<any>();
}

async function getJobById(db: D1Database, jobId: string) {
  return db
    .prepare("SELECT * FROM survey_jobs WHERE id = ?")
    .bind(jobId)
    .first<any>();
}

async function listSurveyJobs(db: D1Database, surveyId: string) {
  return db
    .prepare(
      `
      SELECT *
      FROM survey_jobs
      WHERE survey_id = ?
      ORDER BY created_at DESC
    `,
    )
    .bind(surveyId)
    .all<any>();
}

async function listSurveyEvents(db: D1Database, surveyId: string) {
  return db
    .prepare(
      `
      SELECT *
      FROM survey_events
      WHERE survey_id = ?
      ORDER BY created_at DESC
    `,
    )
    .bind(surveyId)
    .all<any>();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request),
      });
    }

    if (isUnsafeRewardsRuntimeConfig(env.REWARDS_ENABLED)) {
      return jsonWithCors(
        {
          ok: false,
          error: {
            code: "unsafe_rewards_configuration",
            message:
              "Rewards must remain disabled for the first public release",
          },
        },
        request,
        { status: 503 },
      );
    }

    if (
      url.pathname === "/verify-real" ||
      url.pathname.startsWith("/verify-real/")
    ) {
      return jsonWithCors(
        {
          ok: false,
          error: {
            code: "development_surface_disabled",
            message: "This development verification surface is not public",
          },
        },
        request,
        { status: 404 },
      );
    }

    if (request.method === "GET" && url.pathname === "/mvp/health") {
      return jsonWithCors(
        {
          ok: true,
          service: "dscope-backend",
          mode: "mvp-public-worker",
          appOrigin: "https://app.dscope.app",
          checks: {
            d1Binding: Boolean(env.dscope_db),
            internalRunnerTokenConfigured: Boolean(env.INTERNAL_RUNNER_TOKEN),
            internalAdminTokenConfigured: Boolean(env.INTERNAL_ADMIN_TOKEN),
            rewardsEnabled: FIRST_PUBLIC_RELEASE_REWARDS_ENABLED,
            publicParticipationEnabled: false,
            participantActivityEnabled: false,
            serverValidatedVerification: Boolean(
              env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN &&
                env.ZKPASSPORT_VERIFIER_PUBLIC_URL,
            ),
            autoIssueCredentials:
              env.MVP_AUTO_ISSUE_CREDENTIALS === "1" ||
              env.MVP_AUTO_ISSUE_CREDENTIALS === "true",
            issuerServiceConfigured: Boolean(
              env.MVP_ISSUER_SERVICE_URL ||
              env.ISSUER_SERVICE_URL ||
              env.D_SCOPE_ISSUER_SERVICE_URL,
            ),
          },
        },
        request,
      );
    }

    if (request.method === "GET" && url.pathname === "/mvp/config") {
      return jsonWithCors(
        {
          ok: true,
          appOrigin: "https://app.dscope.app",
          zkPassportDomain: "app.dscope.app",
          apiMode: "same-origin",
          publicSurveyDurations: ["1h", "24h", "3d", "7d", "14d", "30d"],
          devSurveyDurations: ["15m_test"],
          features: {
            creatorApplications: true,
            mvpSurveys: true,
            rewards: FIRST_PUBLIC_RELEASE_REWARDS_ENABLED,
            zkPassportVerification: Boolean(
              env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN &&
                env.ZKPASSPORT_VERIFIER_PUBLIC_URL,
            ),
            publicParticipation: false,
            participantActivity: false,
            serverValidatedVerification: Boolean(
              env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN &&
                env.ZKPASSPORT_VERIFIER_PUBLIC_URL,
            ),
            credentialAutoIssue:
              env.MVP_AUTO_ISSUE_CREDENTIALS === "1" ||
              env.MVP_AUTO_ISSUE_CREDENTIALS === "true",
          },
        },
        request,
      );
    }

    if (isDisabledLegacyOrchestrationPath(url.pathname)) {
      return jsonWithCors(
        {
          ok: false,
          error: {
            code: "legacy_endpoint_disabled",
            message:
              "This legacy orchestration endpoint is disabled for the public release",
          },
        },
        request,
        { status: 410 },
      );
    }

    if (
      request.method === "POST" &&
      isUnsafeClientVerificationCompletionPath(url.pathname) &&
      !isTrustedVerifierRequest(request, env)
    ) {
      return jsonWithCors(
        {
          ok: false,
          error: {
            code: "server_verification_required",
            message:
              "Client-completed verification is disabled until zkPassport results are validated server-side",
          },
        },
        request,
        { status: 503 },
      );
    }

    if (
      request.method === "GET" &&
      isUnauthenticatedParticipantReadPath(url.pathname)
    ) {
      return jsonWithCors(
        {
          ok: false,
          error: {
            code: "participant_wallet_auth_required",
            message:
              "Participant activity is disabled until wallet-ownership authentication is implemented",
          },
        },
        request,
        { status: 503 },
      );
    }

    const internalRunnerResponse = await handleInternalRunnerRoutes(
      request,
      env as any,
    );

    const internalAdminResponse = await handleInternalAdminRoutes(
      request,
      env as any,
    );

    const mvpReferenceResponse = await handleMvpReferenceRoutes(request);

    if (mvpReferenceResponse) {
      return mvpReferenceResponse;
    }

    if (internalAdminResponse) {
      return internalAdminResponse;
    }

    const mvpCreatorResponse = await handleMvpCreatorRoutes(
      request,
      env as any,
    );

    if (mvpCreatorResponse) {
      return mvpCreatorResponse;
    }

    const mvpParticipantResponse = await handleMvpParticipantRoutes(
      request,
      env as any,
    );

    if (mvpParticipantResponse) {
      return mvpParticipantResponse;
    }

    const publicReportResponse = await handlePublicReportRoutes(
      request,
      env as any,
    );

    if (publicReportResponse) {
      return publicReportResponse;
    }

    const mvpSurveyResponse = await handleMvpSurveyRoutes(request, env as any);

    if (mvpSurveyResponse) {
      return mvpSurveyResponse;
    }

    if (internalRunnerResponse) {
      return internalRunnerResponse;
    }

    try {
      const verificationResponse = await handleVerificationRoutes(
        request,
        env,
        url,
      );

      if (verificationResponse) {
        const text = await verificationResponse.text();
        const data = text ? JSON.parse(text) : {};
        return jsonWithCors(data, request, {
          status: verificationResponse.status,
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonWithCors(
          {
            ok: true,
            service: "dscope-backend",
            mode: "orchestrator-v1",
          },
          request,
        );
      }

      if (request.method === "GET" && url.pathname === "/db-check") {
        const tables = await env.dscope_db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
          )
          .all();

        return jsonWithCors(
          {
            ok: true,
            tables: tables.results,
          },
          request,
        );
      }

      if (request.method === "GET" && url.pathname === "/surveys") {
        const result = await listSurveys(env.dscope_db);
        return jsonWithCors(
          {
            ok: true,
            surveys: result.results,
          },
          request,
        );
      }

      if (request.method === "POST" && url.pathname === "/surveys") {
        const body = await parseJsonBody(request);
        const validated = validateCreateSurveyBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const survey = validated.data;
        const now = nowIso();

        const existing = await getSurveyById(env.dscope_db, survey.id);
        if (existing) {
          return jsonWithCors(
            {
              ok: false,
              error: `Survey with id '${survey.id}' already exists`,
            },
            request,
            { status: 409 },
          );
        }

        const jobId = crypto.randomUUID();

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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .bind(
            survey.id,
            survey.network,
            survey.dscopeCoreAddress ?? "",
            survey.sponsor,
            survey.treasury,
            survey.factoryAddress ?? env.SURVEY_FACTORY_ADDRESS ?? "",
            survey.systemFinalizer,
            survey.participationGateAddress ?? null,
            survey.surveyKey,
            survey.metadataHash,
            survey.predicatePolicyHash,
            JSON.stringify(survey.predicatePolicyJson ?? defaultSurveyPolicy()),
            survey.startTime,
            survey.endTime,
            survey.rewardPoolAmount,
            survey.claimDeadline,
            survey.rewardEnabled,
            survey.minimumSampleTarget,
            survey.analyticsMinTotalSample,
            survey.analyticsMinSegmentSample,
            survey.analyticsVisibilityMode,
            survey.status ?? "active",
            "pending",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            survey.dscopeCoreAddress ?? null,
            now,
            now,
          )
          .run();

        await env.dscope_db
          .prepare(
            `
            INSERT INTO survey_jobs (
              id,
              survey_id,
              job_type,
              run_at,
              status,
              attempts,
              last_error,
              payload_json,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .bind(
            jobId,
            survey.id,
            "create_survey",
            now,
            "pending",
            0,
            null,
            JSON.stringify(survey),
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
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            survey.id,
            "survey_create_requested",
            JSON.stringify({
              surveyId: survey.id,
              surveyKey: survey.surveyKey,
              predicatePolicyHash: survey.predicatePolicyHash,
              participationGateAddress: survey.participationGateAddress,
              dscopeCoreAddress: survey.dscopeCoreAddress,
              createJobId: jobId,
            }),
            now,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            survey: await getSurveyById(env.dscope_db, survey.id),
            job: await getJobById(env.dscope_db, jobId),
          },
          request,
          { status: 201 },
        );
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/surveys/") &&
        url.pathname.endsWith("/create-status")
      ) {
        const surveyId = url.pathname
          .replace("/surveys/", "")
          .replace("/create-status", "")
          .trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        const body = await parseJsonBody(request);
        const validated = validateUpdateCreateStatusBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const now = nowIso();
        const payload = validated.data;

        await env.dscope_db
          .prepare(
            `
            UPDATE surveys
            SET create_flow_status = ?,
                participation_gate_address = COALESCE(?, participation_gate_address),
                dscope_core_address = COALESCE(?, dscope_core_address),
                contract_address = COALESCE(?, contract_address),
                factory_address = COALESCE(?, factory_address),
                survey_key = COALESCE(?, survey_key),
                registry_id = COALESCE(?, registry_id),
                deploy_gate_tx_hash = COALESCE(?, deploy_gate_tx_hash),
                register_policy_tx_hash = COALESCE(?, register_policy_tx_hash),
                deploy_core_tx_hash = COALESCE(?, deploy_core_tx_hash),
                factory_register_tx_hash = COALESCE(?, factory_register_tx_hash),
                deploy_tx_hash = COALESCE(?, deploy_tx_hash),
                register_tx_hash = COALESCE(?, register_tx_hash),
                create_error = ?,
                updated_at = ?
            WHERE id = ?
          `,
          )
          .bind(
            payload.createFlowStatus,
            payload.participationGateAddress ?? null,
            payload.dscopeCoreAddress ?? null,
            payload.dscopeCoreAddress ?? null,
            payload.factoryAddress ?? null,
            payload.surveyKey ?? null,
            payload.registryId ?? null,
            payload.deployGateTxHash ?? null,
            payload.registerPolicyTxHash ?? null,
            payload.deployCoreTxHash ?? null,
            payload.factoryRegisterTxHash ?? null,
            payload.deployCoreTxHash ?? payload.deployGateTxHash ?? null,
            payload.factoryRegisterTxHash ??
              payload.registerPolicyTxHash ??
              null,
            payload.createError ?? null,
            now,
            surveyId,
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
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            surveyId,
            "survey_create_status_updated",
            JSON.stringify(payload),
            now,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            survey: await getSurveyById(env.dscope_db, surveyId),
          },
          request,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/surveys/") &&
        url.pathname.endsWith("/request-finalize")
      ) {
        const surveyId = url.pathname
          .replace("/surveys/", "")
          .replace("/request-finalize", "")
          .trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        const body = await parseJsonBody(request);
        const validated = validateRequestFinalizeBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const now = nowIso();
        const jobId = crypto.randomUUID();

        await env.dscope_db
          .prepare(
            `
            INSERT INTO survey_jobs (
              id,
              survey_id,
              job_type,
              run_at,
              status,
              attempts,
              last_error,
              payload_json,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .bind(
            jobId,
            surveyId,
            "finalize_survey",
            now,
            "pending",
            0,
            null,
            JSON.stringify(validated.data),
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
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            surveyId,
            "survey_finalize_requested",
            JSON.stringify({ ...validated.data, jobId }),
            now,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            job: await getJobById(env.dscope_db, jobId),
          },
          request,
          { status: 201 },
        );
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/surveys/") &&
        url.pathname.endsWith("/apply-sync")
      ) {
        const surveyId = url.pathname
          .replace("/surveys/", "")
          .replace("/apply-sync", "")
          .trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        const body = await parseJsonBody(request);
        const validated = validateApplySyncBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const now = nowIso();
        const payload = validated.data;

        await env.dscope_db
          .prepare(
            `
            UPDATE surveys
            SET status = ?,
                result_hash = ?,
                distribution_hash = ?,
                final_participant_count = ?,
                finalized_at = ?,
                updated_at = ?
            WHERE id = ?
          `,
          )
          .bind(
            payload.status,
            payload.resultHash ?? null,
            payload.distributionHash ?? null,
            payload.finalParticipantCount ?? null,
            payload.finalizedAt ?? null,
            now,
            surveyId,
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
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            surveyId,
            "survey_sync_applied",
            JSON.stringify(payload),
            now,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            survey: await getSurveyById(env.dscope_db, surveyId),
          },
          request,
        );
      }

      if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
        const jobId = url.pathname.replace("/jobs/", "").trim();

        if (!jobId) {
          return jsonWithCors(
            { ok: false, error: "Job id is required" },
            request,
            { status: 400 },
          );
        }

        const job = await getJobById(env.dscope_db, jobId);
        if (!job) {
          return jsonWithCors({ ok: false, error: "Job not found" }, request, {
            status: 404,
          });
        }

        return jsonWithCors({ ok: true, job }, request);
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/jobs/") &&
        url.pathname.endsWith("/status")
      ) {
        const jobId = url.pathname
          .replace("/jobs/", "")
          .replace("/status", "")
          .trim();

        if (!jobId) {
          return jsonWithCors(
            { ok: false, error: "Job id is required" },
            request,
            { status: 400 },
          );
        }

        const job = await getJobById(env.dscope_db, jobId);
        if (!job) {
          return jsonWithCors({ ok: false, error: "Job not found" }, request, {
            status: 404,
          });
        }

        const body = await parseJsonBody(request);
        const validated = validateUpdateJobBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const now = nowIso();

        await env.dscope_db
          .prepare(
            `
            UPDATE survey_jobs
            SET status = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `,
          )
          .bind(
            validated.data.status,
            validated.data.lastError ?? null,
            now,
            jobId,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            job: await getJobById(env.dscope_db, jobId),
          },
          request,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/jobs/") &&
        url.pathname.endsWith("/retry")
      ) {
        const jobId = url.pathname
          .replace("/jobs/", "")
          .replace("/retry", "")
          .trim();

        if (!jobId) {
          return jsonWithCors(
            { ok: false, error: "Job id is required" },
            request,
            { status: 400 },
          );
        }

        const job = await getJobById(env.dscope_db, jobId);
        if (!job) {
          return jsonWithCors({ ok: false, error: "Job not found" }, request, {
            status: 404,
          });
        }

        const body = await parseJsonBody(request);
        const validated = validateRetryJobBody(body);

        if (!validated.ok) {
          return jsonWithCors({ ok: false, error: validated.error }, request, {
            status: 400,
          });
        }

        const now = nowIso();

        await env.dscope_db
          .prepare(
            `
            UPDATE survey_jobs
            SET status = 'pending',
                run_at = ?,
                last_error = NULL,
                updated_at = ?
            WHERE id = ?
          `,
          )
          .bind(validated.data.runAt ?? now, now, jobId)
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
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            job.survey_id,
            "survey_job_retried",
            JSON.stringify({ jobId, runAt: validated.data.runAt ?? now }),
            now,
          )
          .run();

        return jsonWithCors(
          {
            ok: true,
            job: await getJobById(env.dscope_db, jobId),
          },
          request,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/surveys/") &&
        url.pathname.endsWith("/events")
      ) {
        const surveyId = url.pathname
          .replace("/surveys/", "")
          .replace("/events", "")
          .trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        const events = await listSurveyEvents(env.dscope_db, surveyId);
        return jsonWithCors({ ok: true, events: events.results }, request);
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/surveys/") &&
        url.pathname.endsWith("/jobs")
      ) {
        const surveyId = url.pathname
          .replace("/surveys/", "")
          .replace("/jobs", "")
          .trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        const jobs = await listSurveyJobs(env.dscope_db, surveyId);
        return jsonWithCors({ ok: true, jobs: jobs.results }, request);
      }

      if (request.method === "GET" && url.pathname.startsWith("/surveys/")) {
        const surveyId = url.pathname.replace("/surveys/", "").trim();

        if (!surveyId) {
          return jsonWithCors(
            { ok: false, error: "Survey id is required" },
            request,
            { status: 400 },
          );
        }

        const survey = await getSurveyById(env.dscope_db, surveyId);
        if (!survey) {
          return jsonWithCors(
            { ok: false, error: "Survey not found" },
            request,
            { status: 404 },
          );
        }

        return jsonWithCors({ ok: true, survey }, request);
      }

      return jsonWithCors(
        {
          ok: false,
          error: "Not found",
        },
        request,
        { status: 404 },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";

      return jsonWithCors(
        {
          ok: false,
          error: message,
        },
        request,
        { status: 500 },
      );
    }
  },
};
