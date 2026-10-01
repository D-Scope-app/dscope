import { matchPolicy } from "../domain/policy/match";
import type { SurveyPolicyV1 } from "../domain/policy/types";
import {
  deriveWorldRegionFromCountry,
  normalizeCountryBucket,
} from "../domain/verification/normalize";
import {
  isKnownCountryAlpha2,
  normalizeCountryAlpha2,
} from "../domain/predicate/predicate-codes";
import type { NormalizedPredicateOutcome } from "../domain/verification/types";
import {
  addSecondsIso,
  buildExpectedZkPassportQuery,
  buildZkPassportBinding,
  buildZkPassportScope,
  canonicalJson,
  createVerificationClientToken,
  hashVerificationClientToken,
  safeStringEqual,
  sha256Hex,
  TRUSTED_AGE_BUCKETS,
  ZKPASSPORT_DOMAIN,
  ZKPASSPORT_SESSION_TTL_SECONDS,
  ZKPASSPORT_VALIDITY_SECONDS,
  ZKPASSPORT_VERIFIER_STALE_SECONDS,
} from "../domain/verification/trusted-zkpassport";
import {
  consumeVerificationSessionRateLimit,
  parseVerificationRateLimit,
} from "../security/verification-rate-limit";

type JsonInit = ResponseInit & { headers?: Record<string, string> };

interface CreateVerificationSessionBody {
  walletAddress: string;
}

interface CompleteVerificationSessionBody {
  jobId: string;
  proofDigest: string;
  scope: string;
  queryHash: string;
  verified: true;
  subjectHash: string;
  ageBucket: string;
  countryBucket: string;
  worldRegion?: string | null;
  uniqueIdentifierType?: string | null;
  providerPayloadVersion?: string | null;
}

interface ClaimVerificationSessionBody {
  clientToken: string;
  jobId: string;
  proofDigest: string;
}

interface FailVerificationSessionBody {
  jobId: string;
  proofDigest: string;
  errorCode: string;
}

interface CreateParticipationBody {
  walletAddress: string;
}

interface VerificationRouteEnv {
  dscope_db: D1Database;
  /**
   * Optional local/VPS issuer service.
   * When configured, successful eligible verification can immediately issue
   * a ParticipationGateV2 credential to the participant Aztec address.
   */
  MVP_ISSUER_SERVICE_URL?: string;
  ISSUER_SERVICE_URL?: string;
  D_SCOPE_ISSUER_SERVICE_URL?: string;
  MVP_ISSUER_SERVICE_TOKEN?: string;
  ISSUER_SERVICE_TOKEN?: string;
  D_SCOPE_ISSUER_SERVICE_TOKEN?: string;
  MVP_AUTO_ISSUE_CREDENTIALS?: string;
  INTERNAL_ZKPASSPORT_VERIFIER_TOKEN?: string;
  ZKPASSPORT_VERIFIER_PUBLIC_URL?: string;
  VERIFICATION_RATE_LIMIT_SECRET?: string;
  VERIFICATION_SESSION_WALLET_LIMIT_PER_HOUR?: string;
  VERIFICATION_SESSION_IP_LIMIT_PER_HOUR?: string;
}

function json(data: unknown, init: JsonInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCountryBucket(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = normalizeCountryAlpha2(value);

  return normalized === "OTHER_UNKNOWN" || isKnownCountryAlpha2(normalized);
}

function validateCreateVerificationSessionBody(
  body: unknown,
):
  | { ok: true; data: CreateVerificationSessionBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  const forbiddenTrustFields = [
    "verified",
    "subjectHash",
    "ageBucket",
    "countryBucket",
    "worldRegion",
    "validUntil",
    "rawResult",
    "proofDigest",
  ];
  const suppliedTrustField = forbiddenTrustFields.find((field) => field in b);
  if (suppliedTrustField) {
    return {
      ok: false,
      error: `Field '${suppliedTrustField}' is not accepted from the browser`,
    };
  }

  if (!isNonEmptyString(b.walletAddress)) {
    return { ok: false, error: "Field 'walletAddress' is required" };
  }

  const walletAddress = b.walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(walletAddress)) {
    return {
      ok: false,
      error: "Field 'walletAddress' must be a 0x-prefixed Aztec address",
    };
  }

  return {
    ok: true,
    data: {
      walletAddress,
    },
  };
}

function validateCompleteVerificationSessionBody(
  body: unknown,
):
  | { ok: true; data: CompleteVerificationSessionBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  for (const field of ["jobId", "proofDigest", "scope", "queryHash"] as const) {
    if (!isNonEmptyString(b[field])) {
      return { ok: false, error: `Field '${field}' is required` };
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(String(b.proofDigest))) {
    return { ok: false, error: "Field 'proofDigest' is invalid" };
  }
  if (!/^[a-f0-9]{64}$/i.test(String(b.queryHash))) {
    return { ok: false, error: "Field 'queryHash' is invalid" };
  }

  if (b.verified !== true) {
    return { ok: false, error: "Only a verified server result is accepted" };
  }

  if (
    !isNonEmptyString(b.subjectHash) ||
    !/^[a-f0-9]{64}$/i.test(b.subjectHash.trim())
  ) {
    return { ok: false, error: "Field 'subjectHash' is required" };
  }

  if (!isNonEmptyString(b.ageBucket) || !TRUSTED_AGE_BUCKETS.has(b.ageBucket)) {
    return {
      ok: false,
      error: "Field 'ageBucket' is invalid",
    };
  }

  if (!isValidCountryBucket(b.countryBucket)) {
    return { ok: false, error: "Field 'countryBucket' is invalid" };
  }

  if (
    b.providerPayloadVersion !== undefined &&
    b.providerPayloadVersion !== null &&
    typeof b.providerPayloadVersion !== "string"
  ) {
    return {
      ok: false,
      error: "Field 'providerPayloadVersion' must be a string or null",
    };
  }

  return {
    ok: true,
    data: {
      jobId: String(b.jobId).trim(),
      proofDigest: String(b.proofDigest).trim(),
      scope: String(b.scope).trim(),
      queryHash: String(b.queryHash).trim(),
      verified: true,
      subjectHash: String(b.subjectHash).trim().toLowerCase(),
      ageBucket: String(b.ageBucket),
      countryBucket: normalizeCountryBucket(b.countryBucket),
      worldRegion:
        typeof b.worldRegion === "string" ? b.worldRegion.trim() : null,
      uniqueIdentifierType:
        typeof b.uniqueIdentifierType === "string"
          ? b.uniqueIdentifierType.trim()
          : null,
      providerPayloadVersion:
        typeof b.providerPayloadVersion === "string" ||
        b.providerPayloadVersion === null
          ? b.providerPayloadVersion
          : undefined,
    },
  };
}

function validateClaimVerificationSessionBody(
  body: unknown,
):
  | { ok: true; data: ClaimVerificationSessionBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const value = body as Record<string, unknown>;
  for (const field of ["clientToken", "jobId", "proofDigest"] as const) {
    if (!isNonEmptyString(value[field])) {
      return { ok: false, error: `Field '${field}' is required` };
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(String(value.proofDigest))) {
    return { ok: false, error: "Field 'proofDigest' is invalid" };
  }
  return {
    ok: true,
    data: {
      clientToken: String(value.clientToken),
      jobId: String(value.jobId).trim(),
      proofDigest: String(value.proofDigest).trim().toLowerCase(),
    },
  };
}

function validateFailVerificationSessionBody(
  body: unknown,
):
  | { ok: true; data: FailVerificationSessionBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const value = body as Record<string, unknown>;
  for (const field of ["jobId", "proofDigest", "errorCode"] as const) {
    if (!isNonEmptyString(value[field])) {
      return { ok: false, error: `Field '${field}' is required` };
    }
  }
  return {
    ok: true,
    data: {
      jobId: String(value.jobId).trim(),
      proofDigest: String(value.proofDigest).trim().toLowerCase(),
      errorCode: String(value.errorCode)
        .trim()
        .replace(/[^a-z0-9_-]/gi, "_")
        .slice(0, 80),
    },
  };
}

function isTrustedVerifierAuthorized(
  request: Request,
  env: VerificationRouteEnv,
): boolean {
  const token = env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  return Boolean(
    token &&
      token.length >= 32 &&
      safeStringEqual(authorization, `Bearer ${token}`),
  );
}

function validateCreateParticipationBody(
  body: unknown,
): { ok: true; data: CreateParticipationBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.walletAddress)) {
    return { ok: false, error: "Field 'walletAddress' is required" };
  }

  return {
    ok: true,
    data: {
      walletAddress: b.walletAddress,
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function buildMvpParticipationRecordId(
  surveyId: string,
  participantRef: string,
): string {
  const safeParticipantRef = participantRef
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  return `participation_${surveyId}_${safeParticipantRef}`;
}

async function getMvpSurveyById(db: D1Database, id: string) {
  return db
    .prepare("SELECT * FROM mvp_surveys WHERE id = ?")
    .bind(id)
    .first<any>();
}

async function getPredicateOutcomeById(db: D1Database, id: string | null) {
  if (!id) return null;

  return db
    .prepare("SELECT * FROM predicate_outcomes WHERE id = ?")
    .bind(id)
    .first<any>();
}

type MvpCredentialIssueResult =
  | {
      status: "issued";
      txHash: string | null;
      participationGateAddress: string;
      to: string;
      issuer?: string | null;
      credential: unknown;
      normalized?: unknown;
    }
  | {
      status: "skipped";
      reason: string;
      participationGateAddress?: string | null;
      to?: string | null;
    }
  | {
      status: "failed";
      reason: string;
      participationGateAddress?: string | null;
      to?: string | null;
    };

async function getMvpContractsBySurveyId(db: D1Database, surveyId: string) {
  return db
    .prepare(
      `
      SELECT *
      FROM mvp_survey_contracts
      WHERE survey_id = ?
      LIMIT 1
      `,
    )
    .bind(surveyId)
    .first<any>();
}

function getIssuerServiceUrl(env: VerificationRouteEnv): string | null {
  const explicit =
    env.MVP_ISSUER_SERVICE_URL ||
    env.ISSUER_SERVICE_URL ||
    env.D_SCOPE_ISSUER_SERVICE_URL;

  if (explicit?.trim()) {
    return explicit.trim().replace(/\/+$/, "");
  }

  if (env.MVP_AUTO_ISSUE_CREDENTIALS === "1") {
    return "http://127.0.0.1:8790";
  }

  return null;
}

function validUntilToUnixSeconds(value: string | null | undefined): string {
  if (value?.trim()) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric) && numeric > 0) {
      return String(numeric);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return String(Math.floor(parsed / 1000));
    }
  }

  // MVP default: keep the credential fresh for one year from issuance.
  return String(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
}

function getIssuerServiceToken(env: VerificationRouteEnv): string | null {
  return (
    env.MVP_ISSUER_SERVICE_TOKEN ||
    env.ISSUER_SERVICE_TOKEN ||
    env.D_SCOPE_ISSUER_SERVICE_TOKEN ||
    null
  );
}



function buildMvpParticipationPlan(input: {
  surveyId: string;
  surveyKey: string | null;
  policyHash: string | null;
  participantAddress: string;
  credentialIssue: any;
  eligible: boolean;
}) {
  const issue = input.credentialIssue ?? {};
  const participationGateAddress = issue.participationGateAddress ?? null;
  const credentialIssued = issue.status === "issued";
  const currentTime = Math.floor(Date.now() / 1000);

  const ready =
    input.eligible === true &&
    credentialIssued &&
    Boolean(input.surveyKey) &&
    Boolean(input.policyHash) &&
    Boolean(participationGateAddress);

  const reason = ready
    ? null
    : !input.eligible
      ? "not_eligible"
      : !credentialIssued
        ? `credential_${String(issue.status ?? "not_issued")}`
        : !participationGateAddress
          ? "participation_gate_not_ready"
          : !input.surveyKey
            ? "missing_survey_key"
            : !input.policyHash
              ? "missing_policy_hash"
              : "not_ready";

  return {
    surveyId: input.surveyId,
    surveyKey: input.surveyKey,
    policyHash: input.policyHash,
    participantAddress: input.participantAddress,
    participationGateAddress,
    credentialIssued,
    credentialTxHash: issue.txHash ?? null,
    nextAction: ready ? "wallet_participate" : "not_ready",
    reason,
    contractCall: ready
      ? {
          contract: "ParticipationGateV2",
          method: "participate",
          args: [
            String(input.surveyKey),
            String(input.policyHash),
            String(currentTime),
          ],
          currentTime,
        }
      : null,
  };
}


function v22ValidUntilUnix(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.length > 0) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      return Math.floor(ms / 1000);
    }
  }

  return Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
}

async function enqueueMvpCredentialIssueJobV22(input: {
  env: VerificationRouteEnv;
  surveyId: string;
  walletAddress: string;
  normalized: NormalizedPredicateOutcome;
  participationGateAddress: string;
}): Promise<any> {
  const now = new Date().toISOString();
  const subjectHash = input.normalized.subjectHash || null;

  const existing = await (input.env.dscope_db as any)
    .prepare(
      `
      SELECT *
      FROM mvp_credential_issue_jobs
      WHERE survey_id = ?
        AND wallet_address = ?
        AND subject_hash = ?
        AND status IN ('pending', 'running', 'issued')
      ORDER BY created_at DESC
      LIMIT 1
      `,
    )
    .bind(input.surveyId, input.walletAddress, subjectHash)
    .first<any>();

  if (existing?.status === "issued") {
    return {
      status: "issued",
      txHash: existing.tx_hash ?? null,
      participationGateAddress:
        existing.participation_gate_address ?? input.participationGateAddress,
      to: existing.wallet_address ?? input.walletAddress,
      issuer: existing.issuer ?? null,
      credential: existing.credential_json
        ? JSON.parse(existing.credential_json)
        : null,
      normalized: existing.normalized_json
        ? JSON.parse(existing.normalized_json)
        : input.normalized,
    };
  }

  if (existing) {
    return {
      status: "queued",
      reason:
        existing.status === "running"
          ? "credential_issue_running"
          : "credential_issue_queued",
      jobId: existing.id,
      participationGateAddress:
        existing.participation_gate_address ?? input.participationGateAddress,
      to: input.walletAddress,
    };
  }

  const validUntilUnix = v22ValidUntilUnix(input.normalized.validUntil);

  const payload = {
    participationGateAddress: input.participationGateAddress,

    to: input.walletAddress,
    walletAddress: input.walletAddress,
    recipient: input.walletAddress,

    normalized: input.normalized,

    subjectHash: input.normalized.subjectHash,

    ageBucket: input.normalized.ageBucket,
    age_bucket: input.normalized.ageBucket,

    countryBucket: input.normalized.countryBucket,
    country: input.normalized.countryBucket,
    country_bucket: input.normalized.countryBucket,

    worldRegion: input.normalized.worldRegion,
    world_region: input.normalized.worldRegion,

    validUntil: validUntilUnix,
    valid_until: validUntilUnix,
    validUntilIso: input.normalized.validUntil,

    sourceTag: "1",
    source_tag: "1",

    credentialVersion: "2",
    credential_version: "2",
  };

  const jobId = `job_issue_credential_${input.surveyId}_${Date.now()}_${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)}`;

  await (input.env.dscope_db as any)
    .prepare(
      `
      INSERT INTO mvp_credential_issue_jobs (
        id,
        survey_id,
        wallet_address,
        subject_hash,
        predicate_outcome_id,
        status,
        participation_gate_address,
        payload_json,
        attempts,
        max_attempts,
        last_error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?, 0, 3, NULL, ?, ?)
      `,
    )
    .bind(
      jobId,
      input.surveyId,
      input.walletAddress,
      subjectHash,
      input.participationGateAddress,
      JSON.stringify(payload),
      now,
      now,
    )
    .run();

  return {
    status: "queued",
    reason: "credential_issue_queued",
    jobId,
    participationGateAddress: input.participationGateAddress,
    to: input.walletAddress,
  };
}

async function issueMvpCredentialIfPossible(input: {
  env: VerificationRouteEnv;
  surveyId: string;
  walletAddress: string;
  normalized: NormalizedPredicateOutcome;
  eligible: boolean;
}): Promise<MvpCredentialIssueResult> {
  if (!input.eligible) {
    return {
      status: "skipped",
      reason: "not_eligible",
      to: input.walletAddress,
    };
  }

  if (!input.normalized.verified) {
    return {
      status: "skipped",
      reason: "predicate_not_verified",
      to: input.walletAddress,
    };
  }

  const contracts = await getMvpContractsBySurveyId(
    input.env.dscope_db,
    input.surveyId,
  );
  const participationGateAddress =
    contracts?.participation_gate_address ?? null;

  if (!participationGateAddress) {
    return {
      status: "skipped",
      reason: "participation_gate_not_ready",
      participationGateAddress,
      to: input.walletAddress,
    };
  }

  if ((input.env as any).MVP_CREDENTIAL_ISSUE_MODE !== "direct") {
    return enqueueMvpCredentialIssueJobV22({
      env: input.env,
      surveyId: input.surveyId,
      walletAddress: input.walletAddress,
      normalized: input.normalized,
      participationGateAddress,
    }) as unknown as MvpCredentialIssueResult;
  }

  const issuerServiceUrl = getIssuerServiceUrl(input.env);
  if (!issuerServiceUrl) {
    return {
      status: "skipped",
      reason: "issuer_service_not_configured",
      participationGateAddress,
      to: input.walletAddress,
    };
  }

  try {
    const issuerServiceToken = getIssuerServiceToken(input.env);
    const response = await fetch(
      `${issuerServiceUrl}/issuer/issue-credential`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(issuerServiceToken
            ? { authorization: `Bearer ${issuerServiceToken}` }
            : {}),
        },
        body: JSON.stringify({
          to: input.walletAddress,
          participationGateAddress,
          ageBucket: input.normalized.ageBucket,
          country: input.normalized.countryBucket,
          worldRegion: input.normalized.worldRegion,
          validUntil: validUntilToUnixSeconds(input.normalized.validUntil),
          sourceTag: "1",
          credentialVersion: "2",
        }),
      },
    );

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok || data?.ok === false) {
      return {
        status: "failed",
        reason:
          data?.error ||
          data?.message ||
          `issuer_service_http_${response.status}`,
        participationGateAddress,
        to: input.walletAddress,
      };
    }

    return {
      status: "issued",
      txHash: data?.txHash ?? null,
      participationGateAddress:
        data?.participationGateAddress ?? participationGateAddress,
      to: data?.to ?? input.walletAddress,
      issuer: data?.issuer ?? null,
      credential: data?.credential ?? null,
      normalized: data?.normalized ?? null,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
      participationGateAddress,
      to: input.walletAddress,
    };
  }
}

async function upsertMvpParticipationRecordFromLegacyParticipation(input: {
  db: D1Database;
  surveyId: string;
  walletAddress: string;
  participationId: string;
  eligibility: any;
  participatedAt: string;
}) {
  const mvpSurvey = await getMvpSurveyById(input.db, input.surveyId);

  if (!mvpSurvey) {
    return null;
  }

  const predicateOutcome = await getPredicateOutcomeById(
    input.db,
    input.eligibility?.predicate_outcome_id ?? null,
  );

  const participantRef = input.walletAddress;
  const recordId = buildMvpParticipationRecordId(
    input.surveyId,
    participantRef,
  );

  const predicateSnapshot = predicateOutcome
    ? {
        predicateOutcomeId: predicateOutcome.id,
        subjectHash: predicateOutcome.subject_hash,
        source: predicateOutcome.source,
        verified: Number(predicateOutcome.verified) === 1,
        ageBucket: predicateOutcome.age_bucket,
        countryBucket: predicateOutcome.country_bucket,
        worldRegion: predicateOutcome.world_region,
        validUntil: predicateOutcome.valid_until,
        providerPayloadVersion: predicateOutcome.provider_payload_version,
      }
    : {
        subjectHash: input.eligibility?.subject_hash ?? null,
        predicateOutcomeId: input.eligibility?.predicate_outcome_id ?? null,
      };

  await input.db
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
      input.surveyId,
      mvpSurvey.survey_key,
      participantRef,
      "participated",
      1,
      input.participatedAt,
      input.participationId,
      JSON.stringify(predicateSnapshot),
      JSON.stringify({
        source: "legacy_participate_bridge",
        note: "Answer payload is not stored in legacy participate flow yet",
      }),
      input.participatedAt,
      input.participatedAt,
    )
    .run();

  return input.db
    .prepare(
      `
      SELECT *
      FROM mvp_participation_records
      WHERE survey_id = ?
        AND participant_ref = ?
      LIMIT 1
      `,
    )
    .bind(input.surveyId, participantRef)
    .first<any>();
}

async function getSurveyById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first<any>();
}

async function getVerificationSessionById(db: D1Database, id: string) {
  return db
    .prepare("SELECT * FROM verification_sessions WHERE id = ?")
    .bind(id)
    .first<any>();
}

async function getEligibilityBySurveyAndWallet(
  db: D1Database,
  surveyId: string,
  walletAddress: string,
) {
  return db
    .prepare(
      `
      SELECT *
      FROM survey_participation_eligibility
      WHERE survey_id = ? AND wallet_address = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(surveyId, walletAddress)
    .first<any>();
}

async function getParticipationRecordBySurveyAndWallet(
  db: D1Database,
  surveyId: string,
  walletAddress: string,
) {
  return db
    .prepare(
      `
      SELECT *
      FROM survey_participation_records
      WHERE survey_id = ? AND wallet_address = ?
      LIMIT 1
    `,
    )
    .bind(surveyId, walletAddress)
    .first<any>();
}

function getDefaultSurveyPolicy(): SurveyPolicyV1 {
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

function getSurveyPolicyFromRow(survey: any): SurveyPolicyV1 {
  try {
    if (survey?.predicate_policy_json) {
      return JSON.parse(survey.predicate_policy_json) as SurveyPolicyV1;
    }
  } catch {
    // fallback
  }
  return getDefaultSurveyPolicy();
}

async function getPredicateOutcomeBySessionId(
  db: D1Database,
  sessionId: string,
) {
  return db
    .prepare(
      `
      SELECT *
      FROM predicate_outcomes
      WHERE verification_session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(sessionId)
    .first<any>();
}

async function getCredentialIssueForOutcome(input: {
  db: D1Database;
  surveyId: string;
  walletAddress: string;
  subjectHash: string;
  participationGateAddress?: string | null;
}) {
  const row = await input.db
    .prepare(
      `
      SELECT *
      FROM mvp_credential_issue_jobs
      WHERE survey_id = ? AND wallet_address = ? AND subject_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .bind(input.surveyId, input.walletAddress, input.subjectHash)
    .first<any>();

  if (!row) {
    return {
      status: "skipped",
      reason: "credential_issue_not_created",
      participationGateAddress: input.participationGateAddress ?? null,
      to: input.walletAddress,
    };
  }

  if (row.status === "issued") {
    return {
      status: "issued",
      txHash: row.tx_hash ?? null,
      participationGateAddress:
        row.participation_gate_address ??
        input.participationGateAddress ??
        null,
      to: row.wallet_address ?? input.walletAddress,
    };
  }

  if (row.status === "failed") {
    return {
      status: "failed",
      reason: row.last_error ?? "credential_issue_failed",
      jobId: row.id,
      participationGateAddress:
        row.participation_gate_address ??
        input.participationGateAddress ??
        null,
      to: input.walletAddress,
    };
  }

  return {
    status: "queued",
    reason:
      row.status === "running"
        ? "credential_issue_running"
        : "credential_issue_queued",
    jobId: row.id,
    participationGateAddress:
      row.participation_gate_address ??
      input.participationGateAddress ??
      null,
    to: input.walletAddress,
  };
}

function sessionExpired(session: any, nowMs = Date.now()): boolean {
  const expiresMs = Date.parse(session?.verification_expires_at ?? "");
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

async function verificationClientTokenMatches(
  session: any,
  token: string,
): Promise<boolean> {
  if (!session?.client_token_hash || !token) return false;
  const actual = await hashVerificationClientToken(token);
  return safeStringEqual(actual, String(session.client_token_hash));
}

export async function handleVerificationRoutes(
  request: Request,
  env: VerificationRouteEnv,
  url: URL,
): Promise<Response | null> {
  const claimMatch = url.pathname.match(
    /^\/internal\/zkpassport-verifier\/sessions\/([^/]+)\/claim$/,
  );
  if (request.method === "POST" && claimMatch) {
    if (!isTrustedVerifierAuthorized(request, env)) {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = decodeURIComponent(claimMatch[1]);
    const validated = validateClaimVerificationSessionBody(
      await request.json().catch(() => null),
    );
    if (!validated.ok) {
      return json({ ok: false, error: validated.error }, { status: 400 });
    }

    const session = await getVerificationSessionById(env.dscope_db, sessionId);
    if (!session) {
      return json({ ok: false, error: "Verification session not found" }, { status: 404 });
    }
    if (
      !(await verificationClientTokenMatches(
        session,
        validated.data.clientToken,
      ))
    ) {
      return json({ ok: false, error: "Invalid verification token" }, { status: 401 });
    }
    if (sessionExpired(session)) {
      await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'expired', error_code = 'session_expired',
              error_message = 'Verification session expired', updated_at = ?
          WHERE id = ? AND status IN ('created', 'verifying')
        `,
        )
        .bind(nowIso(), sessionId)
        .run();
      return json({ ok: false, error: "Verification session expired" }, { status: 410 });
    }
    if (
      !isNonEmptyString(session.expected_scope) ||
      !isNonEmptyString(session.expected_binding) ||
      !/^[a-f0-9]{64}$/i.test(String(session.expected_query_hash ?? ""))
    ) {
      return json(
        { ok: false, error: "Verification session has no trusted query configuration" },
        { status: 500 },
      );
    }

    const startedMs = Date.parse(session.verifier_started_at ?? "");
    const stale =
      session.status === "verifying" &&
      (!Number.isFinite(startedMs) ||
        Date.now() - startedMs >= ZKPASSPORT_VERIFIER_STALE_SECONDS * 1000);

    if (session.status === "verifying" && !stale) {
      if (
        safeStringEqual(
          String(session.verifier_proof_digest ?? ""),
          validated.data.proofDigest,
        )
      ) {
        return json({
          ok: true,
          claimStatus: "already_verifying",
          jobId: session.verifier_job_id,
        });
      }
      return json(
        { ok: false, error: "Verification session is already processing another proof" },
        { status: 409 },
      );
    }

    if (session.status !== "created" && !stale) {
      return json(
        { ok: false, error: `Verification session status is '${session.status}'` },
        { status: 409 },
      );
    }

    const now = nowIso();
    const claimed = await env.dscope_db
      .prepare(
        `
        UPDATE verification_sessions
        SET status = 'verifying', verifier_job_id = ?, verifier_proof_digest = ?,
            verifier_started_at = ?, updated_at = ?, error_code = NULL,
            error_message = NULL
        WHERE id = ? AND (
          status = 'created' OR
          (status = 'verifying' AND verifier_started_at = ?)
        )
      `,
      )
      .bind(
        validated.data.jobId,
        validated.data.proofDigest,
        now,
        now,
        sessionId,
        session.verifier_started_at ?? "",
      )
      .run();

    if (Number((claimed as any)?.meta?.changes ?? 0) !== 1) {
      return json({ ok: false, error: "Verification claim conflict" }, { status: 409 });
    }

    return json({
      ok: true,
      claimStatus: "claimed",
      jobId: validated.data.jobId,
      domain: ZKPASSPORT_DOMAIN,
      scope: session.expected_scope,
      binding: session.expected_binding,
      queryHash: session.expected_query_hash,
      validitySeconds: ZKPASSPORT_VALIDITY_SECONDS,
    });
  }

  const failedMatch = url.pathname.match(
    /^\/internal\/zkpassport-verifier\/sessions\/([^/]+)\/failed$/,
  );
  if (request.method === "POST" && failedMatch) {
    if (!isTrustedVerifierAuthorized(request, env)) {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = decodeURIComponent(failedMatch[1]);
    const validated = validateFailVerificationSessionBody(
      await request.json().catch(() => null),
    );
    if (!validated.ok) {
      return json({ ok: false, error: validated.error }, { status: 400 });
    }

    const now = nowIso();
    const updated = await env.dscope_db
      .prepare(
        `
        UPDATE verification_sessions
        SET status = 'failed', error_code = ?,
            error_message = 'Server-side zkPassport verification failed',
            updated_at = ?, completed_at = ?
        WHERE id = ? AND status IN ('verifying', 'finalizing') AND verifier_job_id = ?
          AND verifier_proof_digest = ?
      `,
      )
      .bind(
        validated.data.errorCode,
        now,
        now,
        sessionId,
        validated.data.jobId,
        validated.data.proofDigest,
      )
      .run();

    if (Number((updated as any)?.meta?.changes ?? 0) !== 1) {
      return json({ ok: false, error: "Verification failure callback conflict" }, { status: 409 });
    }

    await env.dscope_db
      .prepare(
        `
        DELETE FROM trusted_zkpassport_nullifiers
        WHERE verification_session_id = ?
      `,
      )
      .bind(sessionId)
      .run();

    return json({ ok: true, status: "failed" });
  }

  const statusMatch = url.pathname.match(/^\/verification-sessions\/([^/]+)$/);
  if (request.method === "GET" && statusMatch) {
    const sessionId = decodeURIComponent(statusMatch[1]);
    let session = await getVerificationSessionById(env.dscope_db, sessionId);
    if (!session) {
      return json({ ok: false, error: "Verification session not found" }, { status: 404 });
    }

    const clientToken = request.headers.get("x-verification-token") ?? "";
    if (!(await verificationClientTokenMatches(session, clientToken))) {
      return json({ ok: false, error: "Invalid verification token" }, { status: 401 });
    }

    if (
      ["created", "verifying"].includes(session.status) &&
      sessionExpired(session)
    ) {
      const now = nowIso();
      await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'expired', error_code = 'session_expired',
              error_message = 'Verification session expired', updated_at = ?
          WHERE id = ? AND status IN ('created', 'verifying')
        `,
        )
        .bind(now, sessionId)
        .run();
      session = await getVerificationSessionById(env.dscope_db, sessionId);
    }

    const base = {
      ok: true,
      verificationSession: {
        id: sessionId,
        status: session.status,
        expiresAt: session.verification_expires_at ?? null,
        errorCode: session.error_code ?? null,
      },
    };

    if (session.status !== "verified") {
      return json(base);
    }

    const [survey, outcome, eligibility, contracts] = await Promise.all([
      getSurveyById(env.dscope_db, session.survey_id),
      getPredicateOutcomeBySessionId(env.dscope_db, sessionId),
      getEligibilityBySurveyAndWallet(
        env.dscope_db,
        session.survey_id,
        session.wallet_address,
      ),
      getMvpContractsBySurveyId(env.dscope_db, session.survey_id),
    ]);

    if (!survey || !outcome) {
      return json(
        { ok: false, error: "Verified session result is incomplete" },
        { status: 500 },
      );
    }

    const normalized: NormalizedPredicateOutcome = {
      verified: Number(outcome.verified) === 1,
      subjectHash: outcome.subject_hash,
      ageBucket: outcome.age_bucket,
      countryBucket: outcome.country_bucket,
      worldRegion:
        outcome.world_region ??
        deriveWorldRegionFromCountry(outcome.country_bucket),
      validUntil: outcome.valid_until ?? null,
      providerPayloadVersion: outcome.provider_payload_version ?? null,
    };
    const credentialIssue = await getCredentialIssueForOutcome({
      db: env.dscope_db,
      surveyId: session.survey_id,
      walletAddress: session.wallet_address,
      subjectHash: outcome.subject_hash,
      participationGateAddress: contracts?.participation_gate_address ?? null,
    });
    const eligible = eligibility?.eligibility_status === "eligible";

    return json({
      ...base,
      predicateOutcome: outcome,
      eligibility,
      normalized,
      policyDecision: {
        eligible,
        reasonCode: eligibility?.reason_code ?? null,
      },
      credentialIssue,
      participationPlan: buildMvpParticipationPlan({
        surveyId: session.survey_id,
        surveyKey: survey.survey_key,
        policyHash: survey.predicate_policy_hash,
        participantAddress: session.wallet_address,
        credentialIssue,
        eligible,
      }),
      participation: {
        surveyId: session.survey_id,
        surveyKey: survey.survey_key,
        policyHash: survey.predicate_policy_hash,
        participantAddress: session.wallet_address,
        participationGateAddress:
          credentialIssue.participationGateAddress ?? null,
      },
    });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/surveys/") &&
    url.pathname.endsWith("/verification-sessions")
  ) {
    const surveyId = url.pathname
      .replace("/surveys/", "")
      .replace("/verification-sessions", "")
      .trim();

    if (!surveyId) {
      return json(
        { ok: false, error: "Survey id is required" },
        { status: 400 },
      );
    }

    const survey = await getSurveyById(env.dscope_db, surveyId);
    if (!survey) {
      return json({ ok: false, error: "Survey not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = validateCreateVerificationSessionBody(body);
    if (!validated.ok) {
      return json({ ok: false, error: validated.error }, { status: 400 });
    }

    const now = nowIso();
    const sessionId = crypto.randomUUID();
    const verifierUrl = env.ZKPASSPORT_VERIFIER_PUBLIC_URL?.trim().replace(
      /\/+$/,
      "",
    );

    if (!verifierUrl || !verifierUrl.startsWith("https://")) {
      return json(
        {
          ok: false,
          error: {
            code: "zkpassport_verifier_unavailable",
            message: "Trusted zkPassport verification is not configured",
          },
        },
        { status: 503 },
      );
    }

    const rateLimit = await consumeVerificationSessionRateLimit({
      db: env.dscope_db,
      request,
      surveyId,
      walletAddress: validated.data.walletAddress,
      secret:
        env.VERIFICATION_RATE_LIMIT_SECRET ||
        env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN,
      walletLimit: parseVerificationRateLimit(
        env.VERIFICATION_SESSION_WALLET_LIMIT_PER_HOUR,
        5,
      ),
      ipLimit: parseVerificationRateLimit(
        env.VERIFICATION_SESSION_IP_LIMIT_PER_HOUR,
        20,
      ),
    });

    if (!rateLimit.allowed) {
      return json(
        {
          ok: false,
          error: {
            code: "verification_session_rate_limited",
            message: "Too many verification sessions. Please try again later.",
          },
        },
        {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const clientToken = createVerificationClientToken();
    const clientTokenHash = await hashVerificationClientToken(clientToken);
    const expectedScope = buildZkPassportScope({
      surveyId,
      surveyKey: survey.survey_key,
    });
    const expectedBinding = buildZkPassportBinding({
      sessionId,
      walletAddress: validated.data.walletAddress,
    });
    const expectedQueryHash = await sha256Hex(
      canonicalJson(buildExpectedZkPassportQuery(expectedBinding)),
    );
    const verificationExpiresAt = addSecondsIso(
      new Date(now),
      ZKPASSPORT_SESSION_TTL_SECONDS,
    );

    await env.dscope_db
      .prepare(
        `
        INSERT INTO verification_sessions (
          id, survey_id, wallet_address, status, zk_request_id, subject_hash,
          valid_until, error_message, created_at, updated_at, provider,
          reused_outcome_id, error_code, completed_at, client_token_hash,
          expected_scope, expected_binding, expected_query_hash,
          verification_expires_at, verifier_job_id, verifier_proof_digest,
          verifier_started_at, verification_method
        ) VALUES (
          ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL,
          ?, ?, ?, ?, ?, NULL, NULL, NULL, ?
        )
      `,
      )
      .bind(
        sessionId,
        surveyId,
        validated.data.walletAddress,
        "created",
        now,
        now,
        "zkpassport",
        clientTokenHash,
        expectedScope,
        expectedBinding,
        expectedQueryHash,
        verificationExpiresAt,
        "zkpassport_vps_sdk_verify_v1",
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO survey_events (
          id, survey_id, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .bind(
        crypto.randomUUID(),
        surveyId,
        "verification_session_created",
        JSON.stringify({
          sessionId,
          walletAddress: validated.data.walletAddress,
          verificationMethod: "zkpassport_vps_sdk_verify_v1",
          expiresAt: verificationExpiresAt,
        }),
        now,
      )
      .run();

    return json(
      {
        ok: true,
        reused: false,
        verificationSession: {
          id: sessionId,
          status: "created",
          expiresAt: verificationExpiresAt,
        },
        clientToken,
        verifierUrl,
        request: {
          domain: ZKPASSPORT_DOMAIN,
          scope: expectedScope,
          binding: expectedBinding,
          validitySeconds: ZKPASSPORT_VALIDITY_SECONDS,
          queryHash: expectedQueryHash,
        },
      },
      { status: 201 },
    );
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/verification-sessions/") &&
    url.pathname.endsWith("/complete")
  ) {
    if (!isTrustedVerifierAuthorized(request, env)) {
      return json(
        {
          ok: false,
          error: {
            code: "server_verification_required",
            message: "Only the trusted zkPassport verifier may complete a session",
          },
        },
        { status: 401 },
      );
    }

    const sessionId = url.pathname
      .replace("/verification-sessions/", "")
      .replace("/complete", "")
      .trim();

    if (!sessionId) {
      return json(
        { ok: false, error: "Verification session id is required" },
        { status: 400 },
      );
    }

    let session = await getVerificationSessionById(env.dscope_db, sessionId);
    if (!session) {
      return json(
        { ok: false, error: "Verification session not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null);
    const validated = validateCompleteVerificationSessionBody(body);
    if (!validated.ok) {
      return json({ ok: false, error: validated.error }, { status: 400 });
    }

    const payload = validated.data;

    if (
      !safeStringEqual(String(session.verifier_job_id ?? ""), payload.jobId) ||
      !safeStringEqual(
        String(session.verifier_proof_digest ?? ""),
        payload.proofDigest,
      ) ||
      !safeStringEqual(String(session.expected_scope ?? ""), payload.scope) ||
      !safeStringEqual(
        String(session.expected_query_hash ?? ""),
        payload.queryHash,
      )
    ) {
      return json(
        { ok: false, error: "Trusted verifier callback does not match the claimed session" },
        { status: 409 },
      );
    }

    if (session.status === "verified") {
      const [survey, outcome, eligibility] = await Promise.all([
        getSurveyById(env.dscope_db, session.survey_id),
        getPredicateOutcomeBySessionId(env.dscope_db, sessionId),
        getEligibilityBySurveyAndWallet(
          env.dscope_db,
          session.survey_id,
          session.wallet_address,
        ),
      ]);

      let credentialIssue: MvpCredentialIssueResult | null = null;
      if (survey && outcome && eligibility) {
        const normalized: NormalizedPredicateOutcome = {
          verified: Number(outcome.verified) === 1,
          subjectHash: outcome.subject_hash,
          ageBucket: outcome.age_bucket,
          countryBucket: outcome.country_bucket,
          worldRegion:
            outcome.world_region ??
            deriveWorldRegionFromCountry(outcome.country_bucket),
          validUntil: outcome.valid_until ?? null,
          providerPayloadVersion: outcome.provider_payload_version ?? null,
        };
        credentialIssue = await issueMvpCredentialIfPossible({
          env,
          surveyId: session.survey_id,
          walletAddress: session.wallet_address,
          normalized,
          eligible: eligibility.eligibility_status === "eligible",
        });
      }

      return json({
        ok: true,
        status: "verified",
        idempotent: true,
        credentialIssue,
      });
    }

    if (session.status !== "verifying" && session.status !== "finalizing") {
      return json(
        {
          ok: false,
          error: `Verification session cannot be completed from status '${session.status}'`,
        },
        { status: 409 },
      );
    }

    if (sessionExpired(session)) {
      const expiredAt = nowIso();
      await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'expired', error_code = 'session_expired',
              error_message = 'Verification session expired', updated_at = ?,
              completed_at = ?
          WHERE id = ? AND status IN ('verifying', 'finalizing')
        `,
        )
        .bind(expiredAt, expiredAt, sessionId)
        .run();
      return json({ ok: false, error: "Verification session expired" }, { status: 410 });
    }

    const survey = await getSurveyById(env.dscope_db, session.survey_id);
    if (!survey) {
      return json({ ok: false, error: "Survey not found" }, { status: 404 });
    }

    const finalizingAt = nowIso();
    if (session.status === "verifying") {
      const finalizing = await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'finalizing', updated_at = ?
          WHERE id = ? AND status = 'verifying' AND verifier_job_id = ?
            AND verifier_proof_digest = ?
        `,
        )
        .bind(finalizingAt, sessionId, payload.jobId, payload.proofDigest)
        .run();
      if (Number((finalizing as any)?.meta?.changes ?? 0) !== 1) {
        return json(
          { ok: false, error: "Verification finalization conflict" },
          { status: 409 },
        );
      }
      session = {
        ...session,
        status: "finalizing",
        updated_at: finalizingAt,
      };
    }

    const now = finalizingAt;
    const surveyPolicy = getSurveyPolicyFromRow(survey);
    const endTime = Number(survey.end_time ?? 0);
    const validUntil =
      Number.isFinite(endTime) && endTime > 0
        ? new Date(endTime > 10_000_000_000 ? endTime : endTime * 1000).toISOString()
        : session.verification_expires_at ?? null;
    const normalized: NormalizedPredicateOutcome = {
      verified: true,
      subjectHash: payload.subjectHash,
      ageBucket: payload.ageBucket as NormalizedPredicateOutcome["ageBucket"],
      countryBucket: normalizeCountryBucket(payload.countryBucket),
      worldRegion: deriveWorldRegionFromCountry(payload.countryBucket),
      validUntil,
      providerPayloadVersion:
        payload.providerPayloadVersion ??
        "zkpassport-sdk-0.16.1-server-verified-v1",
    };

    const existingNullifier = await env.dscope_db
      .prepare(
        `
        SELECT
          nullifier.verification_session_id,
          original_session.wallet_address,
          original_session.survey_id
        FROM trusted_zkpassport_nullifiers AS nullifier
        LEFT JOIN verification_sessions AS original_session
          ON original_session.id = nullifier.verification_session_id
        WHERE nullifier.scope = ? AND nullifier.subject_hash = ?
        LIMIT 1
      `,
      )
      .bind(session.expected_scope, normalized.subjectHash)
      .first<any>();

    const sameWalletNullifier = Boolean(
      existingNullifier &&
        String(existingNullifier.wallet_address ?? "").toLowerCase() ===
          String(session.wallet_address ?? "").toLowerCase() &&
        String(existingNullifier.survey_id ?? "") ===
          String(session.survey_id ?? ""),
    );

    const reuseExistingNullifier = Boolean(
      existingNullifier &&
        (
          existingNullifier.verification_session_id === sessionId ||
          sameWalletNullifier
        ),
    );

    if (
      existingNullifier &&
      existingNullifier.verification_session_id !== sessionId &&
      !sameWalletNullifier
    ) {
      await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'failed', error_code = 'duplicate_subject_for_survey',
              error_message = 'This verified subject already used this survey scope',
              updated_at = ?, completed_at = ?
          WHERE id = ? AND status = 'finalizing'
        `,
        )
        .bind(now, now, sessionId)
        .run();
      return json(
        { ok: false, error: "Verified subject already used for this survey" },
        { status: 409 },
      );
    }

    const policyDecision = matchPolicy(normalized, surveyPolicy);
    const outcomeId = crypto.randomUUID();
    const eligibilityStatus = policyDecision.eligible ? "eligible" : "rejected";
    const eligibilityId = crypto.randomUUID();

    try {
      const completionResults = await env.dscope_db.batch([
        reuseExistingNullifier
          ? env.dscope_db.prepare("SELECT 1 AS reused_nullifier")
          : env.dscope_db
              .prepare(
                `
                INSERT INTO trusted_zkpassport_nullifiers (
                  scope, subject_hash, survey_id, verification_session_id, created_at
                ) VALUES (?, ?, ?, ?, ?)
              `,
              )
              .bind(
                session.expected_scope,
                normalized.subjectHash,
                session.survey_id,
                sessionId,
                now,
              ),
        env.dscope_db
          .prepare(
            `
            INSERT INTO predicate_outcomes (
              id, verification_session_id, subject_hash, source, verified,
              age_bucket, country_bucket, valid_until, created_at, world_region,
              policy_scope, provider_payload_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .bind(
            outcomeId,
            sessionId,
            normalized.subjectHash,
            "zkpassport",
            1,
            normalized.ageBucket,
            normalized.countryBucket,
            normalized.validUntil,
            now,
            normalized.worldRegion,
            session.expected_scope,
            normalized.providerPayloadVersion,
          ),
        env.dscope_db
          .prepare(
            `
            INSERT INTO survey_participation_eligibility (
              id, survey_id, wallet_address, subject_hash, predicate_outcome_id,
              eligibility_status, reason_code, created_at, updated_at,
              decision_source, consumed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(survey_id, wallet_address) DO UPDATE SET
              subject_hash = excluded.subject_hash,
              predicate_outcome_id = excluded.predicate_outcome_id,
              eligibility_status = excluded.eligibility_status,
              reason_code = excluded.reason_code,
              updated_at = excluded.updated_at,
              decision_source = excluded.decision_source
          `,
          )
          .bind(
            eligibilityId,
            session.survey_id,
            session.wallet_address,
            normalized.subjectHash,
            outcomeId,
            eligibilityStatus,
            policyDecision.reasonCode,
            now,
            now,
            "server_verified_zkpassport",
          ),
        env.dscope_db
          .prepare(
            `
            INSERT INTO survey_events (
              id, survey_id, event_type, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?)
          `,
          )
          .bind(
            crypto.randomUUID(),
            session.survey_id,
            "verification_session_completed",
            JSON.stringify({
              verificationSessionId: sessionId,
              walletAddress: session.wallet_address,
              normalized,
              policyDecision,
            }),
            now,
          ),
        env.dscope_db
          .prepare(
            `
            UPDATE verification_sessions
            SET status = 'verified', subject_hash = ?, valid_until = ?,
                error_code = NULL, error_message = NULL, updated_at = ?,
                completed_at = ?
            WHERE id = ? AND status = 'finalizing' AND verifier_job_id = ?
              AND verifier_proof_digest = ?
          `,
          )
          .bind(
            payload.subjectHash,
            normalized.validUntil,
            now,
            now,
            sessionId,
            payload.jobId,
            payload.proofDigest,
          ),
      ]);

      const completed = completionResults.at(-1);
      if (Number((completed as any)?.meta?.changes ?? 0) !== 1) {
        throw new Error("trusted_verification_completion_state_conflict");
      }
    } catch {
      const winner = await env.dscope_db
        .prepare(
          `
          SELECT verification_session_id
          FROM trusted_zkpassport_nullifiers
          WHERE scope = ? AND subject_hash = ?
          LIMIT 1
        `,
        )
        .bind(session.expected_scope, normalized.subjectHash)
        .first<any>();
      const duplicate = Boolean(
        winner && winner.verification_session_id !== sessionId,
      );
      const failedAt = nowIso();
      await env.dscope_db
        .prepare(
          `
          UPDATE verification_sessions
          SET status = 'failed', error_code = ?, error_message = ?,
              updated_at = ?, completed_at = ?
          WHERE id = ? AND status = 'finalizing'
        `,
        )
        .bind(
          duplicate
            ? "duplicate_subject_for_survey"
            : "trusted_completion_persistence_failed",
          duplicate
            ? "This verified subject already used this survey scope"
            : "Trusted verification result could not be persisted atomically",
          failedAt,
          failedAt,
          sessionId,
        )
        .run();
      return json(
        {
          ok: false,
          error: duplicate
            ? "Verified subject already used for this survey"
            : "Trusted verification result could not be persisted",
        },
        { status: duplicate ? 409 : 503 },
      );
    }

    const credentialIssue = await issueMvpCredentialIfPossible({
      env,
      surveyId: session.survey_id,
      walletAddress: session.wallet_address,
      normalized,
      eligible: policyDecision.eligible,
    });

    await env.dscope_db
      .prepare(
        `
        INSERT INTO survey_events (
          id, survey_id, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.survey_id,
        "mvp_credential_issue_result",
        JSON.stringify({
          verificationSessionId: sessionId,
          walletAddress: session.wallet_address,
          credentialIssue,
          reused: reuseExistingNullifier,
        }),
        now,
      )
      .run();

    return json({
      ok: true,
      verificationSession: await getVerificationSessionById(
        env.dscope_db,
        sessionId,
      ),
      predicateOutcome: {
        id: outcomeId,
        verification_session_id: sessionId,
        subject_hash: normalized.subjectHash,
        source: "zkpassport",
        verified: normalized.verified ? 1 : 0,
        age_bucket: normalized.ageBucket,
        country_bucket: normalized.countryBucket,
        valid_until: normalized.validUntil,
        created_at: now,
        world_region: normalized.worldRegion,
        policy_scope: session.expected_scope,
        provider_payload_version: normalized.providerPayloadVersion,
      },
      eligibility: await getEligibilityBySurveyAndWallet(
        env.dscope_db,
        session.survey_id,
        session.wallet_address,
      ),
      normalized,
      policyDecision,
      credentialIssue,
      participationPlan: buildMvpParticipationPlan({
        surveyId: session.survey_id,
        surveyKey: survey.survey_key,
        policyHash: survey.predicate_policy_hash,
        participantAddress: session.wallet_address,
        credentialIssue,
        eligible: policyDecision.eligible,
      }),
      participation: {
        surveyId: session.survey_id,
        surveyKey: survey.survey_key,
        policyHash: survey.predicate_policy_hash,
        participantAddress: session.wallet_address,
        participationGateAddress:
          credentialIssue.participationGateAddress ?? null,
      },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/surveys/") &&
    url.pathname.endsWith("/eligibility")
  ) {
    const surveyId = url.pathname
      .replace("/surveys/", "")
      .replace("/eligibility", "")
      .trim();

    if (!surveyId) {
      return json(
        { ok: false, error: "Survey id is required" },
        { status: 400 },
      );
    }

    const walletAddress = url.searchParams.get("wallet");
    if (!walletAddress?.trim()) {
      return json(
        { ok: false, error: "Query param 'wallet' is required" },
        { status: 400 },
      );
    }

    const survey = await getSurveyById(env.dscope_db, surveyId);
    if (!survey) {
      return json({ ok: false, error: "Survey not found" }, { status: 404 });
    }

    return json({
      ok: true,
      eligibility:
        (await getEligibilityBySurveyAndWallet(
          env.dscope_db,
          surveyId,
          walletAddress,
        )) ?? null,
    });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/surveys/") &&
    url.pathname.endsWith("/participate")
  ) {
    const surveyId = url.pathname
      .replace("/surveys/", "")
      .replace("/participate", "")
      .trim();

    if (!surveyId) {
      return json(
        { ok: false, error: "Survey id is required" },
        { status: 400 },
      );
    }

    const survey = await getSurveyById(env.dscope_db, surveyId);
    if (!survey) {
      return json({ ok: false, error: "Survey not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = validateCreateParticipationBody(body);
    if (!validated.ok) {
      return json({ ok: false, error: validated.error }, { status: 400 });
    }

    const walletAddress = validated.data.walletAddress;
    const eligibility = await getEligibilityBySurveyAndWallet(
      env.dscope_db,
      surveyId,
      walletAddress,
    );

    if (!eligibility) {
      return json(
        { ok: false, error: "Eligibility record not found" },
        { status: 404 },
      );
    }

    if (eligibility.eligibility_status !== "eligible") {
      return json(
        {
          ok: false,
          error: "User is not eligible to participate",
          code: "not_eligible",
        },
        { status: 409 },
      );
    }

    if (eligibility.consumed_at) {
      return json(
        {
          ok: false,
          error: "Participation right already consumed",
          code: "already_consumed",
        },
        { status: 409 },
      );
    }

    const existingParticipation = await getParticipationRecordBySurveyAndWallet(
      env.dscope_db,
      surveyId,
      walletAddress,
    );

    if (existingParticipation) {
      return json(
        {
          ok: false,
          error: "Participation record already exists",
          code: "already_participated",
        },
        { status: 409 },
      );
    }

    const now = nowIso();
    const participationId = crypto.randomUUID();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO survey_participation_records (
          id, survey_id, wallet_address, subject_hash, eligibility_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
        participationId,
        surveyId,
        walletAddress,
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
        INSERT INTO survey_events (
          id, survey_id, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .bind(
        crypto.randomUUID(),
        surveyId,
        "survey_participation_recorded",
        JSON.stringify({
          participationId,
          walletAddress,
          subjectHash: eligibility.subject_hash,
          eligibilityId: eligibility.id,
        }),
        now,
      )
      .run();

    const mvpParticipation =
      await upsertMvpParticipationRecordFromLegacyParticipation({
        db: env.dscope_db,
        surveyId,
        walletAddress,
        participationId,
        eligibility,
        participatedAt: now,
      });

    return json(
      {
        ok: true,
        participation: await getParticipationRecordBySurveyAndWallet(
          env.dscope_db,
          surveyId,
          walletAddress,
        ),
        eligibility: await getEligibilityBySurveyAndWallet(
          env.dscope_db,
          surveyId,
          walletAddress,
        ),
        mvpParticipation,
      },
      { status: 201 },
    );
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/surveys/") &&
    url.pathname.endsWith("/predicate-aggregates")
  ) {
    const surveyId = url.pathname
      .replace("/surveys/", "")
      .replace("/predicate-aggregates", "")
      .trim();

    if (!surveyId) {
      return json(
        { ok: false, error: "Survey id is required" },
        { status: 400 },
      );
    }

    const survey = await getSurveyById(env.dscope_db, surveyId);
    if (!survey) {
      return json({ ok: false, error: "Survey not found" }, { status: 404 });
    }

    const aggregates = await env.dscope_db
      .prepare(
        `
        SELECT id, survey_id, dimension_type, dimension_value, respondent_count, updated_at
        FROM survey_predicate_aggregates
        WHERE survey_id = ?
        ORDER BY dimension_type, dimension_value
      `,
      )
      .bind(surveyId)
      .all();

    return json({
      ok: true,
      aggregates: aggregates.results,
    });
  }

  return null;
}
