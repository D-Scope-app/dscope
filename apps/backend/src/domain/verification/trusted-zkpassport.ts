export const ZKPASSPORT_DOMAIN = "app.dscope.app";
export const ZKPASSPORT_VALIDITY_SECONDS = 30 * 60;
export const ZKPASSPORT_SESSION_TTL_SECONDS = 30 * 60;
export const ZKPASSPORT_VERIFIER_STALE_SECONDS = 12 * 60;

export const TRUSTED_AGE_BUCKETS = new Set([
  "18_25",
  "26_30",
  "31_35",
  "36_45",
  "46_50",
  "51_55",
  "56_60",
  "61_plus",
  "other_unknown",
]);

export function buildZkPassportScope(input: {
  surveyId: string;
  surveyKey?: string | null;
}): string {
  const source = String(input.surveyId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 160);

  if (!source) {
    throw new Error("A survey id is required for zkPassport scope");
  }

  // Deliberately stable for the whole survey. Putting a session id in this
  // scope would create a fresh nullifier on every retry and defeat one-person-
  // per-survey enforcement.
  return `dscope-survey-${source}`;
}

export function buildZkPassportBinding(input: {
  sessionId: string;
  walletAddress: string;
}): string {
  const sessionId = input.sessionId.trim();
  const walletAddress = input.walletAddress.trim();

  if (!sessionId || !walletAddress) {
    throw new Error("Session id and wallet address are required for binding");
  }

  const value = `dscope-session:${sessionId}:wallet:${walletAddress}`;
  if (new TextEncoder().encode(value).byteLength > 480) {
    throw new Error("zkPassport binding is too long");
  }

  return value;
}

export function buildExpectedZkPassportQuery(binding: string) {
  return {
    age: { gte: 18 },
    nationality: { disclose: true },
    birthdate: { disclose: true },
    bind: { custom_data: binding },
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function hashVerificationClientToken(
  token: string,
): Promise<string> {
  return sha256Hex(`dscope-zkpassport-client-token-v1:${token}`);
}

export function createVerificationClientToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function safeStringEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

export function addSecondsIso(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}
