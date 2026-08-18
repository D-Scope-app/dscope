type RateLimitDimension = "wallet" | "ip";

type RateLimitStatement = {
  bind(...values: unknown[]): {
    first<T>(): Promise<T | null>;
  };
};

export type VerificationRateLimitDatabase = {
  prepare(query: string): RateLimitStatement;
};

export type VerificationRateLimitDecision = {
  allowed: boolean;
  blockedDimension: RateLimitDimension | null;
  retryAfterSeconds: number;
  walletCount: number;
  walletLimit: number;
  ipCount: number | null;
  ipLimit: number;
  ipProtectionApplied: boolean;
};

const HOUR_MS = 60 * 60 * 1000;

export function parseVerificationRateLimit(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 10_000);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedConnectingIp(request: Request): string | null {
  const value = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (!value || value.length > 128) return null;
  return value;
}

async function incrementCounter(input: {
  db: VerificationRateLimitDatabase;
  dimension: RateLimitDimension;
  keyHash: string;
  surveyId: string;
  windowStart: string;
  now: string;
}): Promise<number> {
  const row = await input.db
    .prepare(
      `
      INSERT INTO verification_session_rate_limits (
        dimension,
        key_hash,
        survey_id,
        window_start,
        request_count,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(dimension, key_hash, survey_id, window_start)
      DO UPDATE SET
        request_count = request_count + 1,
        updated_at = excluded.updated_at
      RETURNING request_count
      `,
    )
    .bind(
      input.dimension,
      input.keyHash,
      input.surveyId,
      input.windowStart,
      input.now,
    )
    .first<{ request_count: number | string }>();

  const count = Number(row?.request_count);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Verification rate limit counter did not return a count");
  }
  return count;
}

export async function consumeVerificationSessionRateLimit(input: {
  db: VerificationRateLimitDatabase;
  request: Request;
  surveyId: string;
  walletAddress: string;
  secret?: string;
  walletLimit: number;
  ipLimit: number;
  now?: Date;
}): Promise<VerificationRateLimitDecision> {
  const nowDate = input.now ?? new Date();
  const windowStartMs = Math.floor(nowDate.getTime() / HOUR_MS) * HOUR_MS;
  const windowStart = new Date(windowStartMs).toISOString();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + HOUR_MS - nowDate.getTime()) / 1000),
  );
  const now = nowDate.toISOString();
  const secret = input.secret?.trim() ?? "";

  const walletKeyHash = await sha256(
    `dscope:verification-rate-limit:v1:wallet:${secret}:${input.walletAddress.toLowerCase()}`,
  );
  const walletCount = await incrementCounter({
    db: input.db,
    dimension: "wallet",
    keyHash: walletKeyHash,
    surveyId: input.surveyId,
    windowStart,
    now,
  });

  const connectingIp = normalizedConnectingIp(input.request);
  let ipCount: number | null = null;
  const ipProtectionApplied = Boolean(connectingIp && secret);

  if (connectingIp && secret) {
    const ipKeyHash = await sha256(
      `dscope:verification-rate-limit:v1:ip:${secret}:${connectingIp}`,
    );
    ipCount = await incrementCounter({
      db: input.db,
      dimension: "ip",
      keyHash: ipKeyHash,
      surveyId: input.surveyId,
      windowStart,
      now,
    });
  }

  const blockedDimension: RateLimitDimension | null =
    walletCount > input.walletLimit
      ? "wallet"
      : ipCount !== null && ipCount > input.ipLimit
        ? "ip"
        : null;

  return {
    allowed: blockedDimension === null,
    blockedDimension,
    retryAfterSeconds,
    walletCount,
    walletLimit: input.walletLimit,
    ipCount,
    ipLimit: input.ipLimit,
    ipProtectionApplied,
  };
}
