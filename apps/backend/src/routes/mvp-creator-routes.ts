type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

export type MvpCreatorRoutesEnv = {
  dscope_db: D1Database;
  RESEND_API_KEY?: string;
  CREATOR_EMAIL_FROM?: string;
  APP_ORIGIN?: string;
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
  logo_url?: string | null;
  email_verified_at?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

type CreatorWorkspaceRow = {
  id: string;
  application_id: string | null;
  creator_account_id?: string | null;
  organization_name: string;
  contact_email: string;
  contact_name: string | null;
  website: string | null;
  description: string | null;
  logo_url?: string | null;
  owner_wallet_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

type CreatorAccountRow = {
  id: string;
  email: string;
  status: string;
  email_verified_at: string | null;
  password_hash: string | null;
  password_set_at: string | null;
  failed_login_attempts: number | null;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type CreatorProfileRow = {
  creator_account_id: string;
  organization_name: string;
  contact_name: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

type CreatorVerificationRow = {
  id: string;
  creator_account_id: string;
  token_hash: string;
  setup_token_hash: string | null;
  purpose: string;
  sent_to_email: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CreatorSessionRow = {
  id: string;
  creator_account_id: string;
  session_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

type CreatorSurveyRow = {
  id: string;
  survey_key: string;
  title: string | null;
  description: string | null;
  status: string;
  metadata_hash: string | null;
  predicate_policy_hash: string | null;
  questions_json: string | null;
  reward_enabled: number | null;
  reward_pool_amount: string | null;
  claim_deadline: string | null;
  reward_status: string | null;
  final_participant_count: string | null;
  participants_count: number | null;
  start_time: string | number | null;
  end_time: string | number | null;
  latest_finalize_job_status: string | null;
  latest_finalize_job_last_error: string | null;
  latest_finalize_job_updated_at: string | null;
  public_report_status: string | null;
  public_report_slug: string | null;
  public_report_published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApplyCreatorBody = {
  organizationName?: string;
  projectName?: string;
  contactEmail?: string;
  contactName?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  requestedWalletAddress?: string;
};

type RegisterCreatorBody = ApplyCreatorBody;

type LoginBody = {
  email?: string;
  password?: string;
};

type VerifyEmailBody = {
  token?: string;
};

type SetPasswordBody = {
  setupToken?: string;
  password?: string;
};

type RequestPasswordResetBody = {
  email?: string;
};

type ConfirmPasswordResetBody = {
  resetToken?: string;
  password?: string;
};

type PatchProfileBody = {
  organizationName?: string;
  contactName?: string | null;
  website?: string | null;
  description?: string | null;
  logoUrl?: string | null;
};

const SESSION_COOKIE_NAME = "dscope_creator_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const EMAIL_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_SETUP_TOKEN_TTL_SECONDS = 60 * 60 * 2;
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 30;
const PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS = 60 * 15;
const PASSWORD_HASH_ITERATIONS = 100_000;

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
  return jsonResponse({ ok: false, error: { code, message } }, { status });
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

function secondsFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function secondsBeforeNow(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(value: unknown): string | null {
  const normalized = optionalString(value)?.toLowerCase() ?? null;
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  if (normalized.length > 254) return null;
  return normalized;
}

function normalizeLogoUrl(value: unknown): string | null {
  const input = optionalString(value);
  if (!input) return null;

  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;
    const pathname = url.pathname.toLowerCase();
    const hasLikelyImageExtension = [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".svg",
    ].some((ext) => pathname.endsWith(ext));
    return hasLikelyImageExtension || pathname === "/"
      ? url.toString()
      : url.toString();
  } catch {
    return null;
  }
}

function validatePassword(value: unknown): string | null {
  const password = typeof value === "string" ? value : "";
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[a-z]/.test(password))
    return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password))
    return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Password must include a symbol.";
  return null;
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1)
    bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToBase64Url(buffer);
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

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
    },
    key,
    256,
  );
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(
  password: string,
  encoded: string | null,
): Promise<boolean> {
  if (!encoded) return false;
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 100_000) return false;
  const salt = base64UrlToBytes(parts[2]);
  const expected = base64UrlToBytes(parts[3]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.length * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1)
    diff |= actual[index] ^ expected[index];
  return diff === 0;
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") || "";
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    result[rawName] = decodeURIComponent(rawValue.join("="));
  }
  return result;
}

function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

async function getAccountByEmail(
  db: D1Database,
  email: string,
): Promise<CreatorAccountRow | null> {
  return getFirst<CreatorAccountRow>(
    db,
    `SELECT * FROM mvp_creator_accounts WHERE email = ? LIMIT 1`,
    email,
  );
}

async function getProfile(
  db: D1Database,
  accountId: string,
): Promise<CreatorProfileRow | null> {
  return getFirst<CreatorProfileRow>(
    db,
    `SELECT * FROM mvp_creator_profiles WHERE creator_account_id = ? LIMIT 1`,
    accountId,
  );
}

async function getWorkspaceByEmail(
  db: D1Database,
  email: string,
): Promise<CreatorWorkspaceRow | null> {
  return getFirst<CreatorWorkspaceRow>(
    db,
    `
    SELECT *
    FROM mvp_creator_workspaces
    WHERE contact_email = ?
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    email,
  );
}

async function getLatestApplicationByEmail(
  db: D1Database,
  email: string,
): Promise<CreatorApplicationRow | null> {
  return getFirst<CreatorApplicationRow>(
    db,
    `
    SELECT *
    FROM mvp_creator_applications
    WHERE contact_email = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    email,
  );
}

async function getAuthenticatedCreator(
  request: Request,
  db: D1Database,
): Promise<{
  account: CreatorAccountRow;
  profile: CreatorProfileRow | null;
  workspace: CreatorWorkspaceRow | null;
  application: CreatorApplicationRow | null;
  session: CreatorSessionRow;
} | null> {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (!token) return null;

  const sessionHash = await sha256Hex(token);
  const now = nowIso();
  const session = await getFirst<CreatorSessionRow>(
    db,
    `
    SELECT *
    FROM mvp_creator_sessions
    WHERE session_hash = ?
      AND revoked_at IS NULL
      AND expires_at > ?
    LIMIT 1
    `,
    sessionHash,
    now,
  );

  if (!session) return null;

  const account = await getFirst<CreatorAccountRow>(
    db,
    `SELECT * FROM mvp_creator_accounts WHERE id = ? LIMIT 1`,
    session.creator_account_id,
  );
  if (!account) return null;

  await db
    .prepare(
      `UPDATE mvp_creator_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(now, now, session.id)
    .run();

  const [profile, workspace, application] = await Promise.all([
    getProfile(db, account.id),
    getWorkspaceByEmail(db, account.email),
    getLatestApplicationByEmail(db, account.email),
  ]);

  return { account, profile, workspace, application, session };
}

function serializeApplication(row: CreatorApplicationRow) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    website: row.website,
    description: row.description,
    logoUrl: row.logo_url ?? null,
    requestedWalletAddress: row.requested_wallet_address,
    status: row.status,
    reviewNote: row.review_note,
    workspaceId: row.workspace_id,
    emailVerifiedAt: row.email_verified_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

function serializeWorkspace(row: CreatorWorkspaceRow) {
  return {
    id: row.id,
    applicationId: row.application_id,
    creatorAccountId: row.creator_account_id ?? null,
    organizationName: row.organization_name,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    website: row.website,
    description: row.description,
    logoUrl: row.logo_url ?? null,
    ownerWalletAddress: row.owner_wallet_address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  };
}

function serializeAccount(
  row: CreatorAccountRow,
  profile: CreatorProfileRow | null,
) {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    passwordSet: !!row.password_hash,
    lastLoginAt: row.last_login_at,
    profile: profile
      ? {
          organizationName: profile.organization_name,
          contactName: profile.contact_name,
          website: profile.website,
          description: profile.description,
          logoUrl: profile.logo_url,
        }
      : null,
  };
}

function safeParseQuestions(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function isFailedRunnerJobStatus(value: unknown): boolean {
  return String(value ?? "").toLowerCase() === "failed";
}

function deriveSurveyLifecycle(input: {
  status: string;
  startTime?: unknown;
  endTime?: unknown;
  nowSeconds?: number;
  latestFinalizeJobStatus?: unknown;
}) {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const startTime = toUnixSeconds(input.startTime);
  const endTime = toUnixSeconds(input.endTime);
  const storedStatus = String(input.status || "draft");
  const hasStarted = startTime === null || nowSeconds >= startTime;
  const hasEnded = endTime !== null && nowSeconds >= endTime;
  let effectiveStatus = storedStatus;

  if (storedStatus === "active" && hasEnded) effectiveStatus = "ended";

  if (
    storedStatus === "finalizing" &&
    isFailedRunnerJobStatus(input.latestFinalizeJobStatus)
  ) {
    effectiveStatus = "finalization_failed";
  }

  const canParticipate =
    effectiveStatus === "active" &&
    hasStarted &&
    (endTime === null || nowSeconds < endTime);

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
    canRequestFinalization:
      effectiveStatus === "ended" || effectiveStatus === "finalization_failed",
    canViewResults: effectiveStatus === "finalized",
  };
}

function serializeCreatorSurvey(row: CreatorSurveyRow) {
  const questions = safeParseQuestions(row.questions_json);
  const lifecycle = deriveSurveyLifecycle({
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    latestFinalizeJobStatus: row.latest_finalize_job_status,
  });

  return {
    id: row.id,
    surveyKey: row.survey_key,
    sponsor: null,
    creator: {
      workspaceId: null,
      displayName: null,
      createdByOperator: false,
      operatorAddress: null,
    },
    title: row.title ?? row.id,
    description: row.description ?? null,
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
      canParticipate: lifecycle.canParticipate,
      canRequestFinalization: lifecycle.canRequestFinalization,
      canViewResults: lifecycle.canViewResults,
    },
    metadataHash: row.metadata_hash,
    predicatePolicyHash: row.predicate_policy_hash,
    questionsCount: questions.length,
    reward: {
      rewardEnabled: row.reward_enabled === 1,
      rewardPoolAmount: row.reward_pool_amount || "0",
      claimDeadline: row.claim_deadline,
      rewardStatus: row.reward_status,
    },
    eligibilitySummary: {
      mode: row.predicate_policy_hash
        ? "policy_hash_available"
        : "mvp_policy_pending",
      policyHash: row.predicate_policy_hash,
    },
    finalParticipantCount: row.final_participant_count,
    participantCount: Number(row.participants_count ?? 0),
    publicReport: {
      status:
        row.public_report_status === "published"
          ? "published"
          : "not_published",
      slug:
        row.public_report_status === "published"
          ? row.public_report_slug
          : null,
      url:
        row.public_report_status === "published" && row.public_report_slug
          ? `/reports/${encodeURIComponent(row.public_report_slug)}`
          : null,
      shareImageUrl:
        row.public_report_status === "published" && row.public_report_slug
          ? `/reports/${encodeURIComponent(row.public_report_slug)}/share.png`
          : null,
      publishedAt:
        row.public_report_status === "published"
          ? row.public_report_published_at
          : null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureApplicationForAccount(
  db: D1Database,
  input: {
    accountId: string;
    organizationName: string;
    contactEmail: string;
    contactName: string | null;
    website: string | null;
    description: string | null;
    logoUrl: string | null;
  },
) {
  const existing = await getLatestApplicationByEmail(db, input.contactEmail);
  if (existing) return existing;

  const now = nowIso();
  const applicationId = `creator_app_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .prepare(
      `
      INSERT INTO mvp_creator_applications (
        id, organization_name, contact_email, contact_name, website, description,
        requested_wallet_address, status, review_note, workspace_id, logo_url,
        email_verified_at, created_at, updated_at, reviewed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, ?, NULL, ?, ?, NULL)
      `,
    )
    .bind(
      applicationId,
      input.organizationName,
      input.contactEmail,
      input.contactName,
      input.website,
      input.description,
      input.logoUrl,
      now,
      now,
    )
    .run();

  return getFirst<CreatorApplicationRow>(
    db,
    `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
    applicationId,
  );
}

async function sendVerificationEmail(
  env: MvpCreatorRoutesEnv,
  input: { email: string; organizationName: string; token: string },
): Promise<{ sent: boolean; devVerificationUrl: string | null }> {
  const origin = (env.APP_ORIGIN || "https://app.dscope.app").replace(
    /\/+$/,
    "",
  );
  const verificationUrl = `${origin}/mvp/mvp.html?creatorVerify=${encodeURIComponent(input.token)}`;
  const organizationNameHtml = escapeHtml(input.organizationName);

  if (!env.RESEND_API_KEY) {
    return { sent: false, devVerificationUrl: verificationUrl };
  }

  const from = env.CREATOR_EMAIL_FROM || "D-Scope <info@dscope.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: "Verify your D-Scope Creator account",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
          <h2>Verify your D-Scope Creator account</h2>
          <p>Hi,</p>
          <p>Please verify the creator email for <strong>${organizationNameHtml}</strong>.</p>
          <p><a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2f6bff;color:#fff;text-decoration:none;">Verify email</a></p>
          <p>If the button does not work, open this URL:</p>
          <p style="word-break:break-all;color:#475569;">${verificationUrl}</p>
          <p>This link expires in 24 hours.</p>
        </div>
      `,
      text: `Verify your D-Scope Creator account for ${input.organizationName}: ${verificationUrl}`,
    }),
  });

  if (!response.ok) {
    return { sent: false, devVerificationUrl: verificationUrl };
  }

  return { sent: true, devVerificationUrl: null };
}

async function createPasswordSetupToken(
  db: D1Database,
  accountId: string,
  email: string,
): Promise<string> {
  const setupToken = randomToken(32);
  const setupTokenHash = await sha256Hex(setupToken);
  const tokenHash = await sha256Hex(`password_setup:${setupToken}`);
  const now = nowIso();

  await db
    .prepare(
      `
      INSERT INTO mvp_creator_email_verifications (
        id, creator_account_id, token_hash, setup_token_hash, purpose,
        sent_to_email, expires_at, consumed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'password_setup', ?, ?, NULL, ?, ?)
      `,
    )
    .bind(
      `creator_password_setup_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      accountId,
      tokenHash,
      setupTokenHash,
      email,
      secondsFromNow(PASSWORD_SETUP_TOKEN_TTL_SECONDS),
      now,
      now,
    )
    .run();

  return setupToken;
}

async function sendPasswordSetupEmail(
  env: MvpCreatorRoutesEnv,
  input: { email: string; organizationName: string; setupToken: string },
): Promise<{ sent: boolean; devPasswordSetupUrl: string | null }> {
  const origin = (env.APP_ORIGIN || "https://app.dscope.app").replace(
    /\/+$/,
    "",
  );
  const setupUrl = `${origin}/mvp/mvp.html?creatorSetup=${encodeURIComponent(input.setupToken)}`;
  const organizationNameHtml = escapeHtml(input.organizationName);

  if (!env.RESEND_API_KEY) {
    return { sent: false, devPasswordSetupUrl: setupUrl };
  }

  const from = env.CREATOR_EMAIL_FROM || "D-Scope <info@dscope.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: "Your D-Scope Creator account has been approved",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
          <h2>Your D-Scope Creator account has been approved</h2>
          <p>Hi,</p>
          <p>Your creator application for <strong>${organizationNameHtml}</strong> has been approved.</p>
          <p>Create your password to enter Creator Studio and start creating public testnet surveys.</p>
          <p><a href="${setupUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2f6bff;color:#fff;text-decoration:none;">Create password</a></p>
          <p>If the button does not work, open this URL:</p>
          <p style="word-break:break-all;color:#475569;">${setupUrl}</p>
          <p>This link expires in 2 hours.</p>
        </div>
      `,
      text: `Your D-Scope Creator account for ${input.organizationName} has been approved. Create your password: ${setupUrl}`,
    }),
  });

  if (!response.ok) {
    return { sent: false, devPasswordSetupUrl: setupUrl };
  }

  return { sent: true, devPasswordSetupUrl: null };
}

async function createPasswordResetToken(
  db: D1Database,
  accountId: string,
  email: string,
): Promise<string> {
  const resetToken = randomToken(32);
  const resetTokenHash = await sha256Hex(resetToken);
  const tokenHash = await sha256Hex(`password_reset:${resetToken}`);
  const now = nowIso();

  await db.batch([
    db
      .prepare(
        `
        UPDATE mvp_creator_email_verifications
        SET consumed_at = ?, updated_at = ?
        WHERE creator_account_id = ?
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
        `,
      )
      .bind(now, now, accountId),
    db
      .prepare(
        `
        INSERT INTO mvp_creator_email_verifications (
          id, creator_account_id, token_hash, setup_token_hash, purpose,
          sent_to_email, expires_at, consumed_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'password_reset', ?, ?, NULL, ?, ?)
        `,
      )
      .bind(
        `creator_password_reset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        accountId,
        tokenHash,
        resetTokenHash,
        email,
        secondsFromNow(PASSWORD_RESET_TOKEN_TTL_SECONDS),
        now,
        now,
      ),
  ]);

  return resetToken;
}

async function sendPasswordResetEmail(
  env: MvpCreatorRoutesEnv,
  input: { email: string; organizationName: string; resetToken: string },
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const origin = (env.APP_ORIGIN || "https://app.dscope.app").replace(
    /\/+$/,
    "",
  );
  const resetUrl = `${origin}/mvp/mvp.html?creatorReset=${encodeURIComponent(input.resetToken)}`;
  const organizationNameHtml = escapeHtml(input.organizationName);
  const from = env.CREATOR_EMAIL_FROM || "D-Scope <info@dscope.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: "Reset your D-Scope Creator password",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
          <h2>Reset your D-Scope Creator password</h2>
          <p>A password reset was requested for ${organizationNameHtml}.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2f6bff;color:#fff;text-decoration:none;">Reset password</a></p>
          <p>If the button does not work, open this URL:</p>
          <p style="word-break:break-all;color:#475569;">${resetUrl}</p>
          <p>This single-use link expires in 30 minutes. If you did not request it, you can ignore this email.</p>
        </div>
      `,
      text: `Reset the D-Scope Creator password for ${input.organizationName}: ${resetUrl}. This link expires in 30 minutes.`,
    }),
  });

  return response.ok;
}

async function createVerificationToken(
  db: D1Database,
  accountId: string,
  email: string,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();
  await db
    .prepare(
      `
      INSERT INTO mvp_creator_email_verifications (
        id, creator_account_id, token_hash, setup_token_hash, purpose,
        sent_to_email, expires_at, consumed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, NULL, 'verify_email', ?, ?, NULL, ?, ?)
      `,
    )
    .bind(
      `creator_email_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      accountId,
      tokenHash,
      email,
      secondsFromNow(EMAIL_TOKEN_TTL_SECONDS),
      now,
      now,
    )
    .run();
  return token;
}

async function createSessionResponse(
  request: Request,
  env: MvpCreatorRoutesEnv,
  account: CreatorAccountRow,
): Promise<Response> {
  const now = nowIso();
  const token = randomToken(32);
  const sessionHash = await sha256Hex(token);
  await env.dscope_db
    .prepare(
      `
      INSERT INTO mvp_creator_sessions (
        id, creator_account_id, session_hash, user_agent, ip_hint, expires_at,
        revoked_at, created_at, updated_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `,
    )
    .bind(
      `creator_session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      account.id,
      sessionHash,
      request.headers.get("user-agent") || null,
      request.headers.get("cf-connecting-ip") || null,
      secondsFromNow(SESSION_TTL_SECONDS),
      now,
      now,
      now,
    )
    .run();

  const profile = await getProfile(env.dscope_db, account.id);
  const workspace = await getWorkspaceByEmail(env.dscope_db, account.email);
  const application = await getLatestApplicationByEmail(
    env.dscope_db,
    account.email,
  );

  return jsonResponse(
    {
      ok: true,
      account: serializeAccount(account, profile),
      workspace: workspace ? serializeWorkspace(workspace) : null,
      application: application ? serializeApplication(application) : null,
    },
    { headers: { "Set-Cookie": sessionCookie(token, request) } },
  );
}

async function registerCreator(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<RegisterCreatorBody>(request);
  const organizationName =
    optionalString(body.organizationName) || optionalString(body.projectName);
  const contactEmail = normalizeEmail(body.contactEmail);

  if (!organizationName)
    return errorResponse(
      400,
      "missing_organization_name",
      "organizationName or projectName is required",
    );
  if (!contactEmail)
    return errorResponse(
      400,
      "invalid_contact_email",
      "A valid contactEmail is required",
    );

  const contactName = optionalString(body.contactName);
  const website = optionalString(body.website);
  const description = optionalString(body.description);
  const logoUrl = normalizeLogoUrl(body.logoUrl);
  const now = nowIso();

  let account = await getAccountByEmail(env.dscope_db, contactEmail);
  if (!account) {
    const accountId = `creator_${Date.now()}_${crypto.randomUUID().slice(0, 10)}`;
    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_creator_accounts (
          id, email, status, email_verified_at, password_hash, password_set_at,
          failed_login_attempts, locked_until, last_login_at, created_at, updated_at
        )
        VALUES (?, ?, 'pending_approval', NULL, NULL, NULL, 0, NULL, NULL, ?, ?)
        `,
      )
      .bind(accountId, contactEmail, now, now)
      .run();

    await env.dscope_db
      .prepare(
        `
        INSERT INTO mvp_creator_profiles (
          creator_account_id, organization_name, contact_name, website,
          description, logo_url, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        accountId,
        organizationName,
        contactName,
        website,
        description,
        logoUrl,
        now,
        now,
      )
      .run();

    account = await getAccountByEmail(env.dscope_db, contactEmail);
  } else {
    await env.dscope_db
      .prepare(
        `
        INSERT OR IGNORE INTO mvp_creator_profiles (
          creator_account_id, organization_name, contact_name, website,
          description, logo_url, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        account.id,
        organizationName,
        contactName,
        website,
        description,
        logoUrl,
        now,
        now,
      )
      .run();
  }

  if (!account)
    return errorResponse(
      500,
      "creator_account_create_failed",
      "Could not create creator account",
    );

  await ensureApplicationForAccount(env.dscope_db, {
    accountId: account.id,
    organizationName,
    contactEmail,
    contactName,
    website,
    description,
    logoUrl,
  });

  if (account.password_hash) {
    return errorResponse(
      409,
      "creator_account_exists",
      "Creator account already exists. Please sign in.",
    );
  }

  const profile = await getProfile(env.dscope_db, account.id);
  const application = await getLatestApplicationByEmail(
    env.dscope_db,
    contactEmail,
  );

  return jsonResponse(
    {
      ok: true,
      status:
        application?.status === "approved"
          ? "approved_password_required"
          : "pending_approval",
      email: contactEmail,
      verificationEmailSent: false,
      devVerificationUrl: null,
      approvalEmailSent: false,
      devPasswordSetupUrl: null,
      account: serializeAccount(account, profile),
      application: application ? serializeApplication(application) : null,
    },
    { status: 201 },
  );
}

async function verifyCreatorEmail(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<VerifyEmailBody>(request);
  const token = optionalString(body.token);
  if (!token)
    return errorResponse(
      400,
      "missing_token",
      "Verification token is required",
    );

  const tokenHash = await sha256Hex(token);
  const now = nowIso();
  const row = await getFirst<CreatorVerificationRow>(
    env.dscope_db,
    `
    SELECT *
    FROM mvp_creator_email_verifications
    WHERE token_hash = ?
      AND consumed_at IS NULL
      AND expires_at > ?
    LIMIT 1
    `,
    tokenHash,
    now,
  );

  if (!row)
    return errorResponse(
      400,
      "invalid_or_expired_token",
      "Verification token is invalid or expired",
    );

  const setupToken = randomToken(32);
  const setupTokenHash = await sha256Hex(setupToken);

  await env.dscope_db.batch([
    env.dscope_db
      .prepare(
        `UPDATE mvp_creator_email_verifications SET consumed_at = ?, setup_token_hash = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        now,
        setupTokenHash,
        secondsFromNow(PASSWORD_SETUP_TOKEN_TTL_SECONDS),
        now,
        row.id,
      ),
    env.dscope_db
      .prepare(
        `UPDATE mvp_creator_accounts SET email_verified_at = COALESCE(email_verified_at, ?), status = 'password_required', updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, row.creator_account_id),
    env.dscope_db
      .prepare(
        `UPDATE mvp_creator_applications SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE contact_email = ?`,
      )
      .bind(now, now, row.sent_to_email),
  ]);

  return jsonResponse({
    ok: true,
    status: "email_verified",
    setupToken,
    expiresAt: secondsFromNow(PASSWORD_SETUP_TOKEN_TTL_SECONDS),
  });
}

async function setCreatorPassword(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<SetPasswordBody>(request);
  const setupToken = optionalString(body.setupToken);
  const password = typeof body.password === "string" ? body.password : "";

  if (!setupToken)
    return errorResponse(
      400,
      "missing_setup_token",
      "Password setup token is required",
    );
  const passwordError = validatePassword(password);
  if (passwordError) return errorResponse(400, "weak_password", passwordError);

  const setupTokenHash = await sha256Hex(setupToken);
  const now = nowIso();
  const row = await getFirst<CreatorVerificationRow>(
    env.dscope_db,
    `
    SELECT *
    FROM mvp_creator_email_verifications
    WHERE setup_token_hash = ?
      AND consumed_at IS NULL
      AND expires_at > ?
    LIMIT 1
    `,
    setupTokenHash,
    now,
  );

  if (!row)
    return errorResponse(
      400,
      "invalid_or_expired_setup_token",
      "Password setup token is invalid or expired",
    );

  const existingAccount = await getFirst<CreatorAccountRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_accounts WHERE id = ? LIMIT 1`,
    row.creator_account_id,
  );
  if (!existingAccount)
    return errorResponse(
      404,
      "creator_account_not_found",
      "Creator account not found",
    );

  const workspace = await getWorkspaceByEmail(
    env.dscope_db,
    existingAccount.email,
  );
  const nextStatus = workspace ? "approved" : "pending_approval";
  const passwordHash = await hashPassword(password);

  await env.dscope_db.batch([
    env.dscope_db
      .prepare(
        `
        UPDATE mvp_creator_accounts
        SET password_hash = ?, password_set_at = ?, email_verified_at = COALESCE(email_verified_at, ?), status = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .bind(passwordHash, now, now, nextStatus, now, row.creator_account_id),
    env.dscope_db
      .prepare(
        `UPDATE mvp_creator_email_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, row.id),
    env.dscope_db
      .prepare(
        `UPDATE mvp_creator_applications SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE contact_email = ?`,
      )
      .bind(now, now, existingAccount.email),
  ]);

  const account = await getFirst<CreatorAccountRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_accounts WHERE id = ? LIMIT 1`,
    row.creator_account_id,
  );
  if (!account)
    return errorResponse(
      404,
      "creator_account_not_found",
      "Creator account not found",
    );

  return createSessionResponse(request, env, account);
}

async function requestCreatorPasswordReset(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const genericResponse = () =>
    jsonResponse({
      ok: true,
      message:
        "If an eligible creator account exists, a password reset link has been sent.",
    });

  const body = await readJsonBody<RequestPasswordResetBody>(request);
  const email = normalizeEmail(body.email);
  if (!email) return genericResponse();

  const account = await getAccountByEmail(env.dscope_db, email);
  if (!account?.email_verified_at || !account.password_hash) {
    return genericResponse();
  }
  if (!env.RESEND_API_KEY) return genericResponse();

  const recentRequest = await getFirst<{ id: string }>(
    env.dscope_db,
    `
    SELECT id
    FROM mvp_creator_email_verifications
    WHERE creator_account_id = ?
      AND purpose = 'password_reset'
      AND created_at >= ?
    LIMIT 1
    `,
    account.id,
    secondsBeforeNow(PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS),
  );
  if (recentRequest) return genericResponse();

  const profile = await getProfile(env.dscope_db, account.id);
  const resetToken = await createPasswordResetToken(
    env.dscope_db,
    account.id,
    account.email,
  );

  let sent = false;
  try {
    sent = await sendPasswordResetEmail(env, {
      email: account.email,
      organizationName: profile?.organization_name || "your workspace",
      resetToken,
    });
  } catch {
    // Keep the response enumeration-safe even if the email provider is down.
  }

  if (!sent) {
    const resetTokenHash = await sha256Hex(resetToken);
    const failedAt = nowIso();
    await env.dscope_db
      .prepare(
        `
        UPDATE mvp_creator_email_verifications
        SET consumed_at = ?, updated_at = ?
        WHERE setup_token_hash = ?
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
        `,
      )
      .bind(failedAt, failedAt, resetTokenHash)
      .run();
  }

  return genericResponse();
}

async function confirmCreatorPasswordReset(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<ConfirmPasswordResetBody>(request);
  const resetToken = optionalString(body.resetToken);
  const password = typeof body.password === "string" ? body.password : "";

  if (!resetToken) {
    return errorResponse(400, "missing_reset_token", "Password reset token is required");
  }
  const passwordError = validatePassword(password);
  if (passwordError) return errorResponse(400, "weak_password", passwordError);

  const resetTokenHash = await sha256Hex(resetToken);
  const now = nowIso();
  const reset = await getFirst<CreatorVerificationRow>(
    env.dscope_db,
    `
    SELECT *
    FROM mvp_creator_email_verifications
    WHERE setup_token_hash = ?
      AND purpose = 'password_reset'
      AND consumed_at IS NULL
      AND expires_at > ?
    LIMIT 1
    `,
    resetTokenHash,
    now,
  );
  if (!reset) {
    return errorResponse(
      400,
      "invalid_or_expired_reset_token",
      "Password reset token is invalid or expired",
    );
  }

  const account = await getFirst<CreatorAccountRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_accounts WHERE id = ? LIMIT 1`,
    reset.creator_account_id,
  );
  if (!account?.email_verified_at) {
    return errorResponse(
      400,
      "invalid_or_expired_reset_token",
      "Password reset token is invalid or expired",
    );
  }

  const passwordHash = await hashPassword(password);
  const results = await env.dscope_db.batch([
    env.dscope_db
      .prepare(
        `
        UPDATE mvp_creator_accounts
        SET password_hash = ?, password_set_at = ?, failed_login_attempts = 0,
            locked_until = NULL, updated_at = ?
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM mvp_creator_email_verifications
            WHERE id = ?
              AND creator_account_id = ?
              AND purpose = 'password_reset'
              AND consumed_at IS NULL
              AND expires_at > ?
          )
        `,
      )
      .bind(
        passwordHash,
        now,
        now,
        account.id,
        reset.id,
        account.id,
        now,
      ),
    env.dscope_db
      .prepare(
        `
        UPDATE mvp_creator_sessions
        SET revoked_at = ?, updated_at = ?
        WHERE creator_account_id = ?
          AND revoked_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM mvp_creator_email_verifications
            WHERE id = ?
              AND creator_account_id = ?
              AND purpose = 'password_reset'
              AND consumed_at IS NULL
              AND expires_at > ?
          )
        `,
      )
      .bind(now, now, account.id, reset.id, account.id, now),
    env.dscope_db
      .prepare(
        `
        UPDATE mvp_creator_email_verifications
        SET consumed_at = ?, updated_at = ?
        WHERE id = ?
          AND creator_account_id = ?
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
          AND expires_at > ?
        `,
      )
      .bind(now, now, reset.id, account.id, now),
  ]);

  const accountChanges = Number(
    (results[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes ??
      0,
  );
  if (accountChanges !== 1) {
    return errorResponse(
      400,
      "invalid_or_expired_reset_token",
      "Password reset token is invalid or expired",
    );
  }

  const fresh = await getFirst<CreatorAccountRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_accounts WHERE id = ? LIMIT 1`,
    account.id,
  );
  if (!fresh) {
    return errorResponse(404, "creator_account_not_found", "Creator account not found");
  }

  return createSessionResponse(request, env, fresh);
}

async function loginCreator(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<LoginBody>(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password)
    return errorResponse(
      400,
      "invalid_credentials",
      "Email and password are required",
    );

  const account = await getAccountByEmail(env.dscope_db, email);
  if (!account)
    return errorResponse(
      401,
      "invalid_credentials",
      "Invalid email or password",
    );
  if (!account.email_verified_at)
    return errorResponse(
      403,
      "email_not_verified",
      "Please verify your email before signing in",
    );
  if (!account.password_hash)
    return errorResponse(
      403,
      "password_not_set",
      "Please create a password before signing in",
    );

  const ok = await verifyPassword(password, account.password_hash);
  const now = nowIso();
  if (!ok) {
    await env.dscope_db
      .prepare(
        `UPDATE mvp_creator_accounts SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1, updated_at = ? WHERE id = ?`,
      )
      .bind(now, account.id)
      .run();
    return errorResponse(
      401,
      "invalid_credentials",
      "Invalid email or password",
    );
  }

  await env.dscope_db
    .prepare(
      `UPDATE mvp_creator_accounts SET failed_login_attempts = 0, last_login_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(now, now, account.id)
    .run();

  const fresh = (await getAccountByEmail(env.dscope_db, email)) ?? account;
  return createSessionResponse(request, env, fresh);
}

async function logoutCreator(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (token) {
    const sessionHash = await sha256Hex(token);
    const now = nowIso();
    await env.dscope_db
      .prepare(
        `UPDATE mvp_creator_sessions SET revoked_at = ?, updated_at = ? WHERE session_hash = ? AND revoked_at IS NULL`,
      )
      .bind(now, now, sessionHash)
      .run();
  }
  return jsonResponse(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request) } },
  );
}

async function getMe(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const auth = await getAuthenticatedCreator(request, env.dscope_db);
  if (!auth)
    return errorResponse(401, "not_authenticated", "Creator login required");
  return jsonResponse({
    ok: true,
    account: serializeAccount(auth.account, auth.profile),
    workspace: auth.workspace ? serializeWorkspace(auth.workspace) : null,
    application: auth.application
      ? serializeApplication(auth.application)
      : null,
  });
}

async function patchProfile(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const auth = await getAuthenticatedCreator(request, env.dscope_db);
  if (!auth)
    return errorResponse(401, "not_authenticated", "Creator login required");

  const body = await readJsonBody<PatchProfileBody>(request);
  const organizationName =
    optionalString(body.organizationName) ||
    auth.profile?.organization_name ||
    auth.workspace?.organization_name;
  if (!organizationName)
    return errorResponse(
      400,
      "missing_organization_name",
      "Organization name is required",
    );

  const contactName =
    body.contactName === undefined
      ? (auth.profile?.contact_name ?? null)
      : optionalString(body.contactName);
  const website =
    body.website === undefined
      ? (auth.profile?.website ?? null)
      : optionalString(body.website);
  const description =
    body.description === undefined
      ? (auth.profile?.description ?? null)
      : optionalString(body.description);
  const logoUrl =
    body.logoUrl === undefined
      ? (auth.profile?.logo_url ?? auth.workspace?.logo_url ?? null)
      : normalizeLogoUrl(body.logoUrl);
  const now = nowIso();

  await env.dscope_db
    .prepare(
      `
      INSERT INTO mvp_creator_profiles (
        creator_account_id, organization_name, contact_name, website,
        description, logo_url, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(creator_account_id) DO UPDATE SET
        organization_name = excluded.organization_name,
        contact_name = excluded.contact_name,
        website = excluded.website,
        description = excluded.description,
        logo_url = excluded.logo_url,
        updated_at = excluded.updated_at
      `,
    )
    .bind(
      auth.account.id,
      organizationName,
      contactName,
      website,
      description,
      logoUrl,
      now,
      now,
    )
    .run();

  await env.dscope_db
    .prepare(
      `
      UPDATE mvp_creator_workspaces
      SET organization_name = ?, contact_name = ?, website = ?, description = ?, logo_url = ?, updated_at = ?
      WHERE contact_email = ?
      `,
    )
    .bind(
      organizationName,
      contactName,
      website,
      description,
      logoUrl,
      now,
      auth.account.email,
    )
    .run();

  return getMe(request, env);
}

async function applyForCreatorAccess(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const body = await readJsonBody<ApplyCreatorBody>(request);
  const organizationName =
    optionalString(body.organizationName) || optionalString(body.projectName);
  const contactEmail = normalizeEmail(body.contactEmail);
  if (!organizationName)
    return errorResponse(
      400,
      "missing_organization_name",
      "organizationName or projectName is required",
    );
  if (!contactEmail)
    return errorResponse(
      400,
      "invalid_contact_email",
      "A valid contactEmail is required",
    );

  const existingWorkspace = await getWorkspaceByEmail(
    env.dscope_db,
    contactEmail,
  );
  if (existingWorkspace)
    return jsonResponse({
      ok: true,
      status: "already_approved",
      workspace: serializeWorkspace(existingWorkspace),
    });

  const existingApplication = await getLatestApplicationByEmail(
    env.dscope_db,
    contactEmail,
  );
  if (existingApplication?.status === "pending") {
    return jsonResponse(
      {
        ok: true,
        status: "already_pending",
        application: serializeApplication(existingApplication),
      },
      { status: 202 },
    );
  }

  const now = nowIso();
  const applicationId = `creator_app_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await env.dscope_db
    .prepare(
      `
      INSERT INTO mvp_creator_applications (
        id, organization_name, contact_email, contact_name, website, description,
        requested_wallet_address, status, review_note, workspace_id, logo_url,
        email_verified_at, created_at, updated_at, reviewed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL, ?, ?, NULL)
      `,
    )
    .bind(
      applicationId,
      organizationName,
      contactEmail,
      optionalString(body.contactName),
      optionalString(body.website),
      optionalString(body.description),
      optionalString(body.requestedWalletAddress),
      normalizeLogoUrl(body.logoUrl),
      now,
      now,
    )
    .run();

  const application = await getFirst<CreatorApplicationRow>(
    env.dscope_db,
    `SELECT * FROM mvp_creator_applications WHERE id = ? LIMIT 1`,
    applicationId,
  );
  return jsonResponse(
    {
      ok: true,
      status: "pending",
      application: application ? serializeApplication(application) : null,
    },
    { status: 201 },
  );
}

async function getCreatorStatus(
  request: Request,
  env: MvpCreatorRoutesEnv,
  url: URL,
): Promise<Response> {
  const email = normalizeEmail(url.searchParams.get("email"));
  if (!email)
    return errorResponse(
      400,
      "invalid_contact_email",
      "A valid email query param is required",
    );

  const auth = await getAuthenticatedCreator(request, env.dscope_db);
  const account = await getAccountByEmail(env.dscope_db, email);
  const application = await getLatestApplicationByEmail(env.dscope_db, email);
  const workspace = await getWorkspaceByEmail(env.dscope_db, email);

  const isSelf = Boolean(auth && auth.account.email === email);
  const publicStatus = workspace
    ? "approved"
    : (application?.status ?? account?.status ?? "none");

  // Public status checks are intentionally minimal. Detailed creator account,
  // workspace and survey data are only available through /mvp/creators/me and
  // /mvp/creators/me/workspace with a valid HttpOnly session cookie.
  if (!isSelf) {
    return jsonResponse({
      ok: true,
      email,
      status: publicStatus,
      account: null,
      application: application
        ? {
            id: application.id,
            status: application.status,
            createdAt: application.created_at,
            updatedAt: application.updated_at,
            reviewedAt: application.reviewed_at,
          }
        : null,
      workspace: null,
    });
  }

  const profile = account ? await getProfile(env.dscope_db, account.id) : null;
  return jsonResponse({
    ok: true,
    email,
    status: publicStatus,
    account: account ? serializeAccount(account, profile) : null,
    application: application ? serializeApplication(application) : null,
    workspace: workspace ? serializeWorkspace(workspace) : null,
  });
}

async function queryWorkspaceSurveys(
  env: MvpCreatorRoutesEnv,
  workspace: CreatorWorkspaceRow,
): Promise<CreatorSurveyRow[]> {
  return getAll<CreatorSurveyRow>(
    env.dscope_db,
    `
    SELECT
      s.id,
      s.survey_key,
      COALESCE(m.title, s.title) AS title,
      m.description AS description,
      m.questions_json AS questions_json,
      s.status,
      s.metadata_hash,
      s.predicate_policy_hash,
      r.reward_enabled,
      r.reward_pool_amount,
      r.claim_deadline,
      r.reward_status,
      res.final_participant_count,
      COALESCE(p.participants_count, 0) AS participants_count,
      legacy.start_time AS start_time,
      legacy.end_time AS end_time,
      (
        SELECT j.status
        FROM mvp_runner_jobs j
        WHERE j.survey_id = s.id
          AND j.type = 'finalize_survey_mvp'
        ORDER BY j.created_at DESC
        LIMIT 1
      ) AS latest_finalize_job_status,
      (
        SELECT j.last_error
        FROM mvp_runner_jobs j
        WHERE j.survey_id = s.id
          AND j.type = 'finalize_survey_mvp'
        ORDER BY j.created_at DESC
        LIMIT 1
      ) AS latest_finalize_job_last_error,
      (
        SELECT j.updated_at
        FROM mvp_runner_jobs j
        WHERE j.survey_id = s.id
          AND j.type = 'finalize_survey_mvp'
        ORDER BY j.created_at DESC
        LIMIT 1
      ) AS latest_finalize_job_updated_at,
      public_report.status AS public_report_status,
      public_report.slug AS public_report_slug,
      public_report.published_at AS public_report_published_at,
      s.created_at,
      s.updated_at
    FROM mvp_surveys s
    LEFT JOIN mvp_survey_metadata m ON m.survey_id = s.id
    LEFT JOIN mvp_survey_rewards r ON r.survey_id = s.id
    LEFT JOIN mvp_survey_results res ON res.survey_id = s.id
    LEFT JOIN mvp_public_reports public_report ON public_report.survey_id = s.id
    LEFT JOIN surveys legacy ON legacy.id = s.id
    LEFT JOIN (
      SELECT survey_id, COUNT(*) AS participants_count
      FROM mvp_participation_records
      WHERE participation_status = 'participated'
      GROUP BY survey_id
    ) p ON p.survey_id = s.id
    WHERE s.creator_workspace_id = ?
       OR s.sponsor = ?
    ORDER BY s.created_at DESC
    LIMIT 50
    `,
    workspace.id,
    workspace.contact_email,
  );
}

function workspacePayload(
  workspace: CreatorWorkspaceRow,
  surveys: CreatorSurveyRow[],
) {
  const serializedSurveys = surveys.map(serializeCreatorSurvey);
  return {
    ok: true,
    workspace: serializeWorkspace(workspace),
    surveys: serializedSurveys,
    summary: {
      totalSurveys: serializedSurveys.length,
      activeSurveys: serializedSurveys.filter(
        (survey) => survey.effectiveStatus === "active",
      ).length,
      finalizedSurveys: serializedSurveys.filter(
        (survey) => survey.effectiveStatus === "finalized",
      ).length,
    },
  };
}

async function getMyWorkspace(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response> {
  const auth = await getAuthenticatedCreator(request, env.dscope_db);
  if (!auth)
    return errorResponse(401, "not_authenticated", "Creator login required");
  if (!auth.workspace) {
    return jsonResponse({
      ok: true,
      workspace: null,
      surveys: [],
      application: auth.application
        ? serializeApplication(auth.application)
        : null,
    });
  }
  const surveys = await queryWorkspaceSurveys(env, auth.workspace);
  return jsonResponse(workspacePayload(auth.workspace, surveys));
}

async function getCreatorWorkspace(
  request: Request,
  env: MvpCreatorRoutesEnv,
  workspaceId: string,
): Promise<Response> {
  const auth = await getAuthenticatedCreator(request, env.dscope_db);
  if (!auth)
    return errorResponse(401, "not_authenticated", "Creator login required");
  if (!auth.workspace || auth.workspace.id !== workspaceId) {
    return errorResponse(
      403,
      "creator_workspace_forbidden",
      "Creator session cannot access another workspace",
    );
  }
  const surveys = await queryWorkspaceSurveys(env, auth.workspace);
  return jsonResponse(workspacePayload(auth.workspace, surveys));
}

export async function handleMvpCreatorRoutes(
  request: Request,
  env: MvpCreatorRoutesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/mvp/creators")) return null;
  const parts = getPathParts(url);

  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[2] === "register"
  )
    return registerCreator(request, env);
  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[2] === "verify-email"
  )
    return verifyCreatorEmail(request, env);
  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[2] === "set-password"
  )
    return setCreatorPassword(request, env);
  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[2] === "request-password-reset"
  )
    return requestCreatorPasswordReset(request, env);
  if (
    request.method === "POST" &&
    parts.length === 3 &&
    parts[2] === "confirm-password-reset"
  )
    return confirmCreatorPasswordReset(request, env);
  if (request.method === "POST" && parts.length === 3 && parts[2] === "login")
    return loginCreator(request, env);
  if (request.method === "POST" && parts.length === 3 && parts[2] === "logout")
    return logoutCreator(request, env);
  if (request.method === "GET" && parts.length === 3 && parts[2] === "me")
    return getMe(request, env);
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[2] === "me" &&
    parts[3] === "workspace"
  )
    return getMyWorkspace(request, env);
  if (
    request.method === "PATCH" &&
    parts.length === 4 &&
    parts[2] === "me" &&
    parts[3] === "profile"
  )
    return patchProfile(request, env);

  if (request.method === "POST" && parts.length === 3 && parts[2] === "apply")
    return applyForCreatorAccess(request, env);
  if (request.method === "GET" && parts.length === 3 && parts[2] === "status")
    return getCreatorStatus(request, env, url);
  if (
    request.method === "GET" &&
    parts.length === 4 &&
    parts[3] === "workspace"
  )
    return getCreatorWorkspace(request, env, parts[2]);

  return errorResponse(
    404,
    "mvp_creator_route_not_found",
    "Creator route not found",
  );
}
