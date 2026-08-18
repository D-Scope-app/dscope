import { hasValidBearerToken } from "../security/internal-auth";

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

export type InternalAdminRoutesEnv = {
  dscope_db: D1Database;
  INTERNAL_ADMIN_TOKEN?: string;
};

type CreatorApplicationRow = {
  id: string;
  organization_name: string;
  contact_email: string;
  contact_name: string | null;
  website: string | null;
  description: string | null;
  requested_wallet_address: string | null;
  status: string;
  review_note: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

type CreatorWorkspaceRow = {
  id: string;
  application_id: string | null;
  organization_name: string;
  contact_email: string;
  contact_name: string | null;
  website: string | null;
  description: string | null;
  owner_wallet_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
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
      error: { code, message },
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

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isAuthorized(request: Request, env: InternalAdminRoutesEnv): boolean {
  return hasValidBearerToken(request, env.INTERNAL_ADMIN_TOKEN);
}

function requireAuth(
  request: Request,
  env: InternalAdminRoutesEnv,
): Response | null {
  if (isAuthorized(request, env)) return null;

  return errorResponse(
    401,
    "internal_admin_unauthorized",
    "Missing or invalid internal admin token",
  );
}

async function getFirst<T>(
  db: D1Database,
  query: string,
  ...values: unknown[]
): Promise<T | null> {
  return db
    .prepare(query)
    .bind(...values)
    .first<T>();
}

async function getAll<T>(
  db: D1Database,
  query: string,
  ...values: unknown[]
): Promise<T[]> {
  const result = (await db
    .prepare(query)
    .bind(...values)
    .all<T>()) as D1Result<T>;

  return result.results ?? [];
}

function serializeApplication(row: CreatorApplicationRow) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    website: row.website,
    description: row.description,
    requestedWalletAddress: row.requested_wallet_address,
    status: row.status,
    reviewNote: row.review_note,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

function serializeWorkspace(row: CreatorWorkspaceRow) {
  return {
    id: row.id,
    applicationId: row.application_id,
    organizationName: row.organization_name,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    website: row.website,
    description: row.description,
    ownerWalletAddress: row.owner_wallet_address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  };
}

function normalizeStatusFilter(value: string | null): string {
  const normalized = String(value ?? "pending").trim().toLowerCase();

  if (
    normalized === "all" ||
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return "pending";
}

function normalizeLimit(value: string | null, fallback = 50): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

async function listCreatorApplications(
  env: InternalAdminRoutesEnv,
  url: URL,
): Promise<Response> {
  const status = normalizeStatusFilter(url.searchParams.get("status"));
  const limit = normalizeLimit(url.searchParams.get("limit"), 50);

  const rows = await getAll<CreatorApplicationRow>(
    env.dscope_db,
    `
    SELECT *
    FROM mvp_creator_applications
    WHERE (? = 'all' OR status = ?)
    ORDER BY created_at DESC
    LIMIT ?
    `,
    status,
    status,
    limit,
  );

  return jsonResponse({
    ok: true,
    filters: { status, limit },
    count: rows.length,
    applications: rows.map(serializeApplication),
  });
}

async function approveCreatorApplication(
  request: Request,
  env: InternalAdminRoutesEnv,
  applicationId: string,
): Promise<Response> {
  const body = await readJsonBody<{
    reviewNote?: string;
    ownerWalletAddress?: string | null;
    workspaceId?: string;
  }>(request);

  const application = await getFirst<CreatorApplicationRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
    applicationId,
  );

  if (!application) {
    return errorResponse(
      404,
      "creator_application_not_found",
      "Creator application not found",
    );
  }

  const now = nowIso();
  const workspaceId =
    optionalString(body.workspaceId) ||
    application.workspace_id ||
    `creator_ws_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const existingWorkspace = await getFirst<CreatorWorkspaceRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_workspaces WHERE id = ? LIMIT 1`,
    workspaceId,
  );

  if (!existingWorkspace) {
    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_creator_workspaces (
          id,
          application_id,
          organization_name,
          contact_email,
          contact_name,
          website,
          description,
          owner_wallet_address,
          status,
          created_at,
          updated_at,
          approved_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `,
      )
      .bind(
        workspaceId,
        application.id,
        application.organization_name,
        application.contact_email,
        application.contact_name,
        application.website,
        application.description,
        optionalString(body.ownerWalletAddress) ||
          application.requested_wallet_address,
        now,
        now,
        now,
      )
      .run();
  }

  await env.dscope_db
    .prepare(
      `
      UPDATE mvp_creator_applications
      SET status = 'approved',
          review_note = ?,
          workspace_id = ?,
          updated_at = ?,
          reviewed_at = ?
      WHERE id = ?
      `,
    )
    .bind(optionalString(body.reviewNote), workspaceId, now, now, application.id)
    .run();

  const [updatedApplication, workspace] = await Promise.all([
    getFirst<CreatorApplicationRow>(
      env.dscope_db,
      `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
      application.id,
    ),
    getFirst<CreatorWorkspaceRow>(
      env.dscope_db,
      `SELECT * FROM mvp_creator_workspaces WHERE id = ? LIMIT 1`,
      workspaceId,
    ),
  ]);

  return jsonResponse({
    ok: true,
    application: updatedApplication
      ? serializeApplication(updatedApplication)
      : null,
    workspace: workspace ? serializeWorkspace(workspace) : null,
  });
}

async function rejectCreatorApplication(
  request: Request,
  env: InternalAdminRoutesEnv,
  applicationId: string,
): Promise<Response> {
  const body = await readJsonBody<{ reviewNote?: string }>(request);

  const application = await getFirst<CreatorApplicationRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
    applicationId,
  );

  if (!application) {
    return errorResponse(
      404,
      "creator_application_not_found",
      "Creator application not found",
    );
  }

  const now = nowIso();

  await env.dscope_db
    .prepare(
      `
      UPDATE mvp_creator_applications
      SET status = 'rejected',
          review_note = ?,
          updated_at = ?,
          reviewed_at = ?
      WHERE id = ?
      `,
    )
    .bind(optionalString(body.reviewNote), now, now, application.id)
    .run();

  const updatedApplication = await getFirst<CreatorApplicationRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
    application.id,
  );

  return jsonResponse({
    ok: true,
    application: updatedApplication
      ? serializeApplication(updatedApplication)
      : null,
  });
}

function normalizeJobStatusFilter(value: string | null): string {
  const normalized = String(value ?? "failed").trim().toLowerCase();

  if (
    normalized === "all" ||
    normalized === "pending" ||
    normalized === "running" ||
    normalized === "done" ||
    normalized === "failed"
  ) {
    return normalized;
  }

  return "failed";
}

async function listRunnerJobs(
  env: InternalAdminRoutesEnv,
  url: URL,
): Promise<Response> {
  const status = normalizeJobStatusFilter(url.searchParams.get("status"));
  const limit = normalizeLimit(url.searchParams.get("limit"), 50);

  const rows = await getAll<MvpRunnerJobRow>(
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
    WHERE (? = 'all' OR status = ?)
    ORDER BY created_at DESC
    LIMIT ?
    `,
    status,
    status,
    limit,
  );

  return jsonResponse({
    ok: true,
    filters: { status, limit },
    count: rows.length,
    jobs: rows.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      surveyId: job.survey_id,
      surveyKey: job.survey_key,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      lastError: job.last_error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      lockedAt: job.locked_at,
      lockedBy: job.locked_by,
      finishedAt: job.finished_at,
    })),
  });
}

async function retryRunnerJob(
  env: InternalAdminRoutesEnv,
  jobId: string,
): Promise<Response> {
  const job = await getFirst<MvpRunnerJobRow>(
    env.dscope_db,
    `SELECT * FROM mvp_runner_jobs WHERE id = ? LIMIT 1`,
    jobId,
  );

  if (!job) {
    return errorResponse(404, "runner_job_not_found", "Runner job not found");
  }

  if (job.status !== "failed") {
    return errorResponse(
      409,
      "runner_job_not_failed",
      "Only failed runner jobs can be retried",
    );
  }

  const now = nowIso();

  await env.dscope_db
    .prepare(
      `
      UPDATE mvp_runner_jobs
      SET status = 'pending',
          attempts = 0,
          last_error = NULL,
          locked_at = NULL,
          locked_by = NULL,
          finished_at = NULL,
          updated_at = ?
      WHERE id = ?
        AND status = 'failed'
      `,
    )
    .bind(now, jobId)
    .run();

  const updatedJob = await getFirst<MvpRunnerJobRow>(
    env.dscope_db,
    `SELECT * FROM mvp_runner_jobs WHERE id = ? LIMIT 1`,
    jobId,
  );

  return jsonResponse({
    ok: true,
    job: updatedJob,
  });
}

export async function handleInternalAdminRoutes(
  request: Request,
  env: InternalAdminRoutesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/internal/mvp")) {
    return null;
  }

  const parts = getPathParts(url);

  const authError = requireAuth(request, env);
  if (authError) return authError;

  // GET /internal/mvp/creator-applications?status=pending|approved|rejected|all
  if (
    request.method === "GET" &&
    parts.length === 3 &&
    parts[0] === "internal" &&
    parts[1] === "mvp" &&
    parts[2] === "creator-applications"
  ) {
    return listCreatorApplications(env, url);
  }

  // POST /internal/mvp/creator-applications/:id/approve
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "mvp" &&
    parts[2] === "creator-applications" &&
    parts[4] === "approve"
  ) {
    return approveCreatorApplication(
      request,
      env,
      decodeURIComponent(parts[3]),
    );
  }

  // POST /internal/mvp/creator-applications/:id/reject
  if (
    request.method === "POST" &&
    parts.length === 5 &&
    parts[0] === "internal" &&
    parts[1] === "mvp" &&
    parts[2] === "creator-applications" &&
    parts[4] === "reject"
  ) {
    return rejectCreatorApplication(
      request,
      env,
      decodeURIComponent(parts[3]),
    );
  }

  // GET /internal/mvp/runner/jobs?status=failed|pending|running|done|all
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[0] === "internal" &&
    parts[1] === "mvp" &&
    parts[2] === "runner" &&
    parts[3] === "jobs"
  ) {
    return listRunnerJobs(env, url);
  }

  // POST /internal/mvp/runner/jobs/:id/retry
  if (
    request.method === "POST" &&
    parts.length === 6 &&
    parts[0] === "internal" &&
    parts[1] === "mvp" &&
    parts[2] === "runner" &&
    parts[3] === "jobs" &&
    parts[5] === "retry"
  ) {
    return retryRunnerJob(env, decodeURIComponent(parts[4]));
  }

  return errorResponse(
    404,
    "internal_admin_route_not_found",
    "Internal admin route not found",
  );
}
