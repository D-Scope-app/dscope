import { D1MvpRunnerStore } from "../domain/runner/d1-mvp-runner-store";
import {
  D1RunnerCheckpointStore,
  type UpsertRunnerCheckpointInput,
} from "../domain/runner/d1-runner-checkpoint-store";
import type {
  D1DatabaseLike,
  CreateMvpRunnerJobInput,
} from "../domain/runner/d1-mvp-runner-store";
import type { MvpRunnerJobType } from "../domain/runner/mvp-runner-types";
import { hasValidBearerToken } from "../security/internal-auth";

export type InternalRunnerEnv = {
  dscope_db: D1DatabaseLike;
  INTERNAL_RUNNER_TOKEN?: string;
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
  details?: unknown,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
        details,
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

function isAuthorized(request: Request, env: InternalRunnerEnv): boolean {
  return hasValidBearerToken(request, env.INTERNAL_RUNNER_TOKEN);
}

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}


function safeJsonParse(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}


function extractCredentialIssueTxHash(body: any): string | null {
  const candidates = [
    body?.txHash,
    body?.tx_hash,
    body?.transactionHash,
    body?.transaction_hash,
    body?.issuerResponse?.txHash,
    body?.issuerResponse?.tx_hash,
    body?.issuerResponse?.transactionHash,
    body?.issuerResponse?.transaction_hash,
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      /^0x[a-fA-F0-9]{64}$/.test(value)
    ) {
      return value;
    }
  }

  return null;
}

async function getCredentialIssueJob(env: InternalRunnerEnv, jobId: string) {
  return (env.dscope_db as any)
    .prepare(
      `
      SELECT *
      FROM mvp_credential_issue_jobs
      WHERE id = ?
      LIMIT 1
      `,
    )
    .bind(jobId)
    .first<any>();
}

async function handleInternalCredentialIssuerRoutes(
  request: Request,
  env: InternalRunnerEnv,
  parts: string[],
): Promise<Response> {
  const url = new URL(request.url);

  // GET /internal/credential-issuer/jobs/recent
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "internal" &&
    parts[1] === "credential-issuer" &&
    parts[2] === "jobs" &&
    parts[3] === "recent"
  ) {
    const limit = Number(url.searchParams.get("limit") ?? "20");

    const result = await (env.dscope_db as any)
      .prepare(
        `
        SELECT *
        FROM mvp_credential_issue_jobs
        ORDER BY created_at DESC
        LIMIT ?
        `,
      )
      .bind(Number.isFinite(limit) ? limit : 20)
      .all<any>();

    return jsonResponse({
      ok: true,
      jobs: result.results ?? [],
    });
  }

  // POST /internal/credential-issuer/jobs/next
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "internal" &&
    parts[1] === "credential-issuer" &&
    parts[2] === "jobs" &&
    parts[3] === "next"
  ) {
    const body = await readJsonBody<{ runnerId?: string }>(request);
    const runnerId = body.runnerId || "credential-issuer-v22";
    const now = new Date().toISOString();

    const nextJob = await (env.dscope_db as any)
      .prepare(
        `
        SELECT *
        FROM mvp_credential_issue_jobs
        WHERE status = 'pending'
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT 1
        `,
      )
      .first<any>();

    if (!nextJob) {
      return jsonResponse({
        ok: true,
        job: null,
      });
    }

    await (env.dscope_db as any)
      .prepare(
        `
        UPDATE mvp_credential_issue_jobs
        SET
          status = 'running',
          attempts = attempts + 1,
          locked_at = ?,
          locked_by = ?,
          updated_at = ?
        WHERE id = ?
          AND status = 'pending'
        `,
      )
      .bind(now, runnerId, now, nextJob.id)
      .run();

    const job = await getCredentialIssueJob(env, nextJob.id);

    return jsonResponse({
      ok: true,
      job,
      payload: safeJsonParse(job?.payload_json ?? null),
    });
  }

  // POST /internal/credential-issuer/jobs/:jobId/issued
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "credential-issuer" &&
    parts[2] === "jobs" &&
    parts[4] === "issued"
  ) {
    const jobId = parts[3];

    const body = await readJsonBody<{
      txHash?: string | null;
      issuer?: string | null;
      credential?: unknown;
      normalized?: unknown;
      issuerResponse?: unknown;
    }>(request);

    const txHash = extractCredentialIssueTxHash(body);

    if (!txHash) {
      return errorResponse(
        400,
        "credential_issue_tx_hash_required",
        "Issued credential job requires a valid txHash",
        {
          jobId,
        },
      );
    }

    const now = new Date().toISOString();

    await (env.dscope_db as any)
      .prepare(
        `
        UPDATE mvp_credential_issue_jobs
        SET
          status = 'issued',
          tx_hash = ?,
          issuer = ?,
          credential_json = ?,
          normalized_json = ?,
          issuer_response_json = ?,
          last_error = NULL,
          updated_at = ?,
          issued_at = ?,
          finished_at = ?
        WHERE id = ?
        `,
      )
      .bind(
        txHash,
        body.issuer ?? null,
        body.credential === undefined ? null : JSON.stringify(body.credential),
        body.normalized === undefined ? null : JSON.stringify(body.normalized),
        body.issuerResponse === undefined ? null : JSON.stringify(body.issuerResponse),
        now,
        now,
        now,
        jobId,
      )
      .run();

    return jsonResponse({
      ok: true,
      job: await getCredentialIssueJob(env, jobId),
    });
  }

  // POST /internal/credential-issuer/jobs/:jobId/failed
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "credential-issuer" &&
    parts[2] === "jobs" &&
    parts[4] === "failed"
  ) {
    const jobId = parts[3];

    const body = await readJsonBody<{
      error?: string;
      issuerResponse?: unknown;
    }>(request);

    const now = new Date().toISOString();

    await (env.dscope_db as any)
      .prepare(
        `
        UPDATE mvp_credential_issue_jobs
        SET
          status = 'failed',
          last_error = ?,
          issuer_response_json = ?,
          updated_at = ?,
          finished_at = ?
        WHERE id = ?
        `,
      )
      .bind(
        body.error || "unknown_credential_issuer_error",
        body.issuerResponse === undefined ? null : JSON.stringify(body.issuerResponse),
        now,
        now,
        jobId,
      )
      .run();

    return jsonResponse({
      ok: true,
      job: await getCredentialIssueJob(env, jobId),
    });
  }

  return errorResponse(
    404,
    "internal_credential_issuer_route_not_found",
    "Internal credential issuer route not found",
  );
}

function createEventId(jobId: string, eventType: string): string {
  return `${jobId}_${eventType}_${crypto.randomUUID()}`;
}

function normalizeJobTypes(value: unknown): MvpRunnerJobType[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowed = new Set<MvpRunnerJobType>([
    "create_survey_mvp",
    "finalize_survey_mvp",
    "sync_survey_mvp",
  ]);

  return value
    .map((item) => String(item))
    .filter((item): item is MvpRunnerJobType =>
      allowed.has(item as MvpRunnerJobType),
    );
}

export async function handleInternalRunnerRoutes(
  request: Request,
  env: InternalRunnerEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  const isRunnerPath = url.pathname.startsWith("/internal/runner");
  const isCredentialIssuerPath = url.pathname.startsWith("/internal/credential-issuer");
  const isHeartbeatPath = url.pathname === "/internal/ops/heartbeat";

  if (!isRunnerPath && !isCredentialIssuerPath && !isHeartbeatPath) {
    return null;
  }

  if (!isAuthorized(request, env)) {
    return errorResponse(
      401,
      "internal_runner_unauthorized",
      "Missing or invalid internal runner token",
    );
  }

  const parts = getPathParts(url);

  // POST /internal/ops/heartbeat
  // This exact path is admitted into this router, then protected by
  // the same INTERNAL_RUNNER_TOKEN authorization as runner routes.
  if (isHeartbeatPath) {
    if (request.method !== "POST") {
      return errorResponse(
        405,
        "internal_ops_method_not_allowed",
        "Only POST is supported for the heartbeat route",
      );
    }

    const body = await readJsonBody<{
      service?: string;
      serviceName?: string;
      service_name?: string;
      serviceId?: string;
      service_id?: string;
      runnerId?: string;
      status?: string;
      payload?: unknown;
    }>(request);

    const rawServiceName =
      body.serviceName ?? body.service_name ?? body.service;
    const serviceName =
      (
        typeof rawServiceName === "string"
          ? rawServiceName.trim()
          : ""
      ).slice(0, 80) || "unknown-service";

    const rawServiceId =
      body.serviceId ?? body.service_id ?? body.runnerId;
    const serviceId =
      (
        typeof rawServiceId === "string"
          ? rawServiceId.trim()
          : ""
      ).slice(0, 120) || serviceName;

    const status =
      (
        typeof body.status === "string"
          ? body.status.trim()
          : ""
      ).slice(0, 80) || "alive";

    const now = new Date().toISOString();
    const heartbeatId = `${serviceName}:${serviceId}`;
    const payload =
      body.payload === undefined ? body : body.payload;
    const payloadJson = JSON.stringify(payload ?? null).slice(0, 12000);

    await (env.dscope_db as any)
      .prepare(
        `
        INSERT INTO mvp_ops_heartbeats (
          id,
          service_name,
          service_id,
          status,
          last_seen_at,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          service_name = excluded.service_name,
          service_id = excluded.service_id,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        heartbeatId,
        serviceName,
        serviceId,
        status,
        now,
        payloadJson,
        now,
        now,
      )
      .run();

    return jsonResponse({
      ok: true,
      heartbeat: {
        id: heartbeatId,
        serviceName,
        serviceId,
        status,
        lastSeenAt: now,
      },
    });
  }

  if (isCredentialIssuerPath) {
    return handleInternalCredentialIssuerRoutes(request, env, parts);
  }

  const store = new D1MvpRunnerStore(env.dscope_db);
  const checkpointStore = new D1RunnerCheckpointStore(env.dscope_db);

  // GET|POST /internal/runner/jobs/:jobId/checkpoint
  if (
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs" &&
    parts[4] === "checkpoint"
  ) {
    if (request.method !== "GET" && request.method !== "POST") {
      return errorResponse(
        405,
        "checkpoint_method_not_allowed",
        "Only GET and POST are supported for runner checkpoints",
      );
    }

    const jobId = parts[3];
    const job = await store.getJob(jobId);

    if (!job) {
      return errorResponse(
        404,
        "runner_job_not_found",
        "Runner job not found",
      );
    }

    if (request.method === "GET") {
      const checkpoint = await checkpointStore.getCheckpoint(jobId);

      return jsonResponse({
        ok: true,
        checkpoint,
      });
    }

    const body =
      await readJsonBody<UpsertRunnerCheckpointInput>(request);
    const checkpoint =
      await checkpointStore.upsertCheckpoint(jobId, body);

    return jsonResponse({
      ok: true,
      checkpoint,
    });
  }

  // POST /internal/runner/jobs
  // Dev/internal helper: create a job directly.
  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs"
  ) {
    const body = await readJsonBody<Partial<CreateMvpRunnerJobInput>>(request);

    if (!body.id || !body.type || !body.payload) {
      return errorResponse(
        400,
        "invalid_create_job_request",
        "Expected body with id, type and payload",
      );
    }

    await store.createJob({
      id: body.id,
      type: body.type,
      surveyId: body.surveyId ?? null,
      surveyKey: body.surveyKey ?? null,
      payload: body.payload,
      maxAttempts: body.maxAttempts ?? 3,
    });

    const job = await store.getJob(body.id);

    return jsonResponse({
      ok: true,
      job,
    });
  }

  // GET /internal/runner/jobs
  if (
    request.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs"
  ) {
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const jobs = await store.listRecentJobs(
      Number.isFinite(limit) ? limit : 20,
    );

    return jsonResponse({
      ok: true,
      jobs,
    });
  }

  // POST /internal/runner/jobs/next
  if (
    request.method === "POST" &&
    parts.length === 4 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs" &&
    parts[3] === "next"
  ) {
    const body = await readJsonBody<{
      runnerId?: string;
      jobTypes?: unknown;
    }>(request);

    const runnerId = body.runnerId || "local-runner";
    const jobTypes = normalizeJobTypes(body.jobTypes);

    const job = await store.claimNextJob({
      runnerId,
      jobTypes,
    });

    return jsonResponse({
      ok: true,
      job,
    });
  }

  // GET /internal/runner/jobs/:jobId
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs"
  ) {
    const jobId = parts[3];
    const job = await store.getJob(jobId);
    const events = await store.listEventsForJob(jobId);

    if (!job) {
      return errorResponse(404, "job_not_found", "Runner job not found");
    }

    return jsonResponse({
      ok: true,
      job,
      events,
    });
  }

  // POST /internal/runner/jobs/:jobId/events
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs" &&
    parts[4] === "events"
  ) {
    const jobId = parts[3];
    const body = await readJsonBody<{
      events?: Array<{
        type: string;
        message: string;
        data?: unknown;
        createdAt?: string;
      }>;
      event?: {
        type: string;
        message: string;
        data?: unknown;
        createdAt?: string;
      };
    }>(request);

    const events = body.events ?? (body.event ? [body.event] : []);

    if (events.length === 0) {
      return errorResponse(
        400,
        "invalid_events_request",
        "Expected event or events array",
      );
    }

    for (const runnerEvent of events) {
      if (!runnerEvent.type || !runnerEvent.message) {
        return errorResponse(
          400,
          "invalid_runner_event",
          "Each event must include type and message",
        );
      }

      await store.appendEvent({
        id: createEventId(jobId, runnerEvent.type),
        jobId,
        type: runnerEvent.type,
        message: runnerEvent.message,
        data: runnerEvent.data,
        createdAt: runnerEvent.createdAt,
      });
    }

    return jsonResponse({
      ok: true,
      appended: events.length,
    });
  }

  // POST /internal/runner/jobs/:jobId/done
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs" &&
    parts[4] === "done"
  ) {
    const jobId = parts[3];
    const body = await readJsonBody<{
      events?: Array<{
        type: string;
        message: string;
        data?: unknown;
        createdAt?: string;
      }>;
    }>(request);

    if (body.events?.length) {
      for (const runnerEvent of body.events) {
        await store.appendEvent({
          id: createEventId(jobId, runnerEvent.type),
          jobId,
          type: runnerEvent.type,
          message: runnerEvent.message,
          data: runnerEvent.data,
          createdAt: runnerEvent.createdAt,
        });
      }
    }

    await store.markJobDone(jobId);

    const job = await store.getJob(jobId);

    return jsonResponse({
      ok: true,
      job,
    });
  }

  // POST /internal/runner/jobs/:jobId/failed
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "jobs" &&
    parts[4] === "failed"
  ) {
    const jobId = parts[3];
    const body = await readJsonBody<{
      error?: string;
      events?: Array<{
        type: string;
        message: string;
        data?: unknown;
        createdAt?: string;
      }>;
    }>(request);

    const error = body.error || "Unknown runner error";

    if (body.events?.length) {
      for (const runnerEvent of body.events) {
        await store.appendEvent({
          id: createEventId(jobId, runnerEvent.type),
          jobId,
          type: runnerEvent.type,
          message: runnerEvent.message,
          data: runnerEvent.data,
          createdAt: runnerEvent.createdAt,
        });
      }
    }

    await store.markJobFailed(jobId, error);

    const job = await store.getJob(jobId);

    return jsonResponse({
      ok: true,
      job,
    });
  }

  // POST /internal/runner/surveys/:surveyId/create-complete
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "surveys" &&
    parts[4] === "create-complete"
  ) {
    const surveyId = parts[3];

    const body = await readJsonBody<{
      status?: string;
      contracts?: {
        surveyFactoryAddress?: string | null;
        dscopeCoreAddress?: string | null;
        participationGateAddress?: string | null;
        rewardVaultAddress?: string | null;
      };
      rewardStatus?: string;
      chainMode?: string | null;
      txHashes?: Record<string, string> | null;
      policy?: unknown;
      reads?: unknown;
      runnerOutput?: unknown;
    }>(request);

    const now = new Date().toISOString();
    const nextStatus = body.status || "active";

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_surveys
        SET
          status = ?,
          updated_at = ?
        WHERE id = ?
        `,
      )
      .bind(nextStatus, now, surveyId)
      .run();

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_survey_contracts
        SET
          survey_factory_address = ?,
          dscope_core_address = ?,
          participation_gate_address = ?,
          reward_vault_address = ?,
          chain_mode = ?,
          deploy_survey_factory_tx_hash = ?,
          deploy_participation_gate_tx_hash = ?,
          register_policy_tx_hash = ?,
          register_age_mode_tx_hash = ?,
          register_age_mask_tx_hash = ?,
          register_country_mode_tx_hash = ?,
          register_country_bitmap_tx_hash = ?,
          deploy_reward_vault_tx_hash = ?,
          register_reward_config_tx_hash = ?,
          deploy_dscope_core_tx_hash = ?,
          factory_register_survey_tx_hash = ?,
          policy_json = ?,
          read_checks_json = ?,
          runner_output_json = ?,
          updated_at = ?
        WHERE survey_id = ?
        `,
      )
      .bind(
        body.contracts?.surveyFactoryAddress ?? null,
        body.contracts?.dscopeCoreAddress ?? null,
        body.contracts?.participationGateAddress ?? null,
        body.contracts?.rewardVaultAddress ?? null,
        body.chainMode ?? null,
        body.txHashes?.deploySurveyFactory ?? null,
        body.txHashes?.deployParticipationGate ?? null,
        body.txHashes?.registerSurveyPolicy ??
          body.txHashes?.registerPolicyHash ??
          null,
        body.txHashes?.registerAgeMode ?? null,
        body.txHashes?.registerAgeMask ?? null,
        body.txHashes?.registerCountryMode ?? null,
        body.txHashes?.registerCountryBitmap ?? null,
        body.txHashes?.deployRewardVault ?? null,
        body.txHashes?.registerRewardConfig ?? null,
        body.txHashes?.deployDscopeCore ?? null,
        body.txHashes?.factoryRegisterSurveyWithConfig ??
          body.txHashes?.factoryRegisterSurveyWithKey ??
          null,
        body.policy === undefined ? null : JSON.stringify(body.policy),
        body.reads === undefined ? null : JSON.stringify(body.reads),
        body.runnerOutput === undefined
          ? null
          : JSON.stringify(body.runnerOutput),
        now,
        surveyId,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_survey_rewards
        SET
          reward_status = ?,
          updated_at = ?
        WHERE survey_id = ?
        `,
      )
      .bind(body.rewardStatus || "CONFIGURED", now, surveyId)
      .run();

    return jsonResponse({
      ok: true,
      surveyId,
      status: nextStatus,
      contracts: body.contracts ?? null,
      chainMode: body.chainMode ?? null,
      txHashes: body.txHashes ?? null,
      rewardStatus: body.rewardStatus || "CONFIGURED",
      updatedAt: now,
    });
  }

  // POST /internal/runner/surveys/:surveyId/finalize-complete
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "runner" &&
    parts[2] === "surveys" &&
    parts[4] === "finalize-complete"
  ) {
    const surveyId = parts[3];

    const body = await readJsonBody<{
      status?: string;
      result?: {
        resultHash?: string;
        distributionHash?: string;
        finalParticipantCount?: string;
        analyticsPayload?: unknown;
        rewardPayload?: unknown;
        finalizationPayload?: unknown;
      };
      reward?: {
        rewardStatus?: string;
        rewardPerParticipant?: string;
        totalAllocated?: string;
        dustReturnToSponsor?: string;
        distributionHash?: string;
        finalizedAt?: string;
      };
    }>(request);

    const now = new Date().toISOString();
    const nextStatus = body.status || "finalized";

    const resultHash = body.result?.resultHash || "0";
    const distributionHash =
      body.result?.distributionHash || body.reward?.distributionHash || "0";
    const finalParticipantCount = body.result?.finalParticipantCount || "0";

    const rewardStatus = body.reward?.rewardStatus || "FINALIZED";
    const rewardPerParticipant = body.reward?.rewardPerParticipant || "0";
    const totalAllocated = body.reward?.totalAllocated || "0";
    const dustReturnToSponsor = body.reward?.dustReturnToSponsor || "0";
    const finalizedAt = body.reward?.finalizedAt || now;

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_surveys
        SET
          status = ?,
          updated_at = ?
        WHERE id = ?
        `,
      )
      .bind(nextStatus, now, surveyId)
      .run();

    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_survey_rewards
        SET
          reward_status = ?,
          reward_per_participant = ?,
          total_allocated = ?,
          dust_return_to_sponsor = ?,
          distribution_hash = ?,
          finalized_at = ?,
          updated_at = ?
        WHERE survey_id = ?
        `,
      )
      .bind(
        rewardStatus,
        rewardPerParticipant,
        totalAllocated,
        dustReturnToSponsor,
        distributionHash,
        finalizedAt,
        now,
        surveyId,
      )
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_survey_results (
          survey_id,
          survey_key,
          result_hash,
          distribution_hash,
          final_participant_count,
          analytics_payload_json,
          reward_payload_json,
          finalization_payload_json,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          COALESCE((SELECT survey_key FROM mvp_surveys WHERE id = ?), ?),
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
        ON CONFLICT(survey_id) DO UPDATE SET
          result_hash = excluded.result_hash,
          distribution_hash = excluded.distribution_hash,
          final_participant_count = excluded.final_participant_count,
          analytics_payload_json = excluded.analytics_payload_json,
          reward_payload_json = excluded.reward_payload_json,
          finalization_payload_json = excluded.finalization_payload_json,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        surveyId,
        surveyId,
        surveyId,
        resultHash,
        distributionHash,
        finalParticipantCount,
        JSON.stringify(body.result?.analyticsPayload ?? null),
        JSON.stringify(body.result?.rewardPayload ?? null),
        JSON.stringify(body.result?.finalizationPayload ?? null),
        now,
        now,
      )
      .run();

    return jsonResponse({
      ok: true,
      surveyId,
      status: nextStatus,
      result: {
        resultHash,
        distributionHash,
        finalParticipantCount,
      },
      reward: {
        rewardStatus,
        rewardPerParticipant,
        totalAllocated,
        dustReturnToSponsor,
        distributionHash,
        finalizedAt,
      },
      updatedAt: now,
    });
  }

  return errorResponse(
    404,
    "internal_runner_route_not_found",
    "Internal runner route not found",
  );
}
