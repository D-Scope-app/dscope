import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The 0.16.0 ESM bundle currently imports a dependency JSON file without the
// import attribute required by recent Node versions. Its published CommonJS
// export is compatible with the same Node releases, so load that export here.
const require = createRequire(import.meta.url);
const { NullifierType, ZKPassport } = require("@zkpassport/sdk");

const API_BASE = String(
  process.env.RUNNER_API_BASE_URL || "https://app.dscope.app",
).replace(/\/+$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_ZKPASSPORT_VERIFIER_TOKEN || "";
const SUBJECT_PEPPER = process.env.ZKPASSPORT_SUBJECT_PEPPER || "";
const DOMAIN = process.env.ZKPASSPORT_DOMAIN || "app.dscope.app";
const HOST = process.env.ZKPASSPORT_VERIFIER_HOST || "127.0.0.1";
const PORT = Number(process.env.ZKPASSPORT_VERIFIER_PORT || "8791");
const MAX_BODY_BYTES = Number(
  process.env.ZKPASSPORT_VERIFIER_MAX_BODY_BYTES || String(20 * 1024 * 1024),
);
const MAX_QUEUE = Number(process.env.ZKPASSPORT_VERIFIER_MAX_QUEUE || "20");
const CACHE_DIR =
  process.env.ZKPASSPORT_VERIFIER_CACHE_DIR ||
  "/opt/dscope/zkpassport-verifier-cache";
const ALLOWED_ORIGINS = new Set(
  String(
    process.env.ZKPASSPORT_ALLOWED_ORIGINS || "https://app.dscope.app",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!INTERNAL_TOKEN || INTERNAL_TOKEN.length < 32) {
  throw new Error("INTERNAL_ZKPASSPORT_VERIFIER_TOKEN is missing or too short");
}
if (!SUBJECT_PEPPER || SUBJECT_PEPPER.length < 32) {
  throw new Error("ZKPASSPORT_SUBJECT_PEPPER is missing or too short");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("ZKPASSPORT_VERIFIER_PORT is invalid");
}
if (!Number.isFinite(MAX_BODY_BYTES) || MAX_BODY_BYTES < 1024) {
  throw new Error("ZKPASSPORT_VERIFIER_MAX_BODY_BYTES is invalid");
}

const currentFile = fileURLToPath(import.meta.url);
const predicateCodesPath = path.resolve(
  path.dirname(currentFile),
  "../src/domain/predicate/predicate-codes.v1.json",
);
const predicateCodes = JSON.parse(await readFile(predicateCodesPath, "utf8"));
await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });

const queue = [];
const accepted = new Map();
let running = false;

function log(status, details = {}) {
  // Never include proofs, originalQuery, queryResult, birthdate, nationality,
  // clientToken or uniqueIdentifier in logs.
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), status, ...details })}\n`,
  );
}

function canonicalJson(value) {
  function sortJson(nested) {
    if (Array.isArray(nested)) return nested.map(sortJson);
    if (nested && typeof nested === "object") {
      return Object.fromEntries(
        Object.entries(nested)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sortJson(child)]),
      );
    }
    return nested;
  }

  return JSON.stringify(sortJson(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function subjectHash(domain, scope, uniqueIdentifierType, uniqueIdentifier) {
  return createHmac("sha256", SUBJECT_PEPPER)
    .update(
      `${domain}\u0000${scope}\u0000${String(uniqueIdentifierType)}\u0000${uniqueIdentifier}`,
    )
    .digest("hex");
}

function disclosedValue(queryResult, key) {
  const value = queryResult?.[key];
  if (value?.disclose && "result" in value.disclose) {
    return value.disclose.result;
  }
  return null;
}

function ageBucketFromBirthdate(value, now = new Date()) {
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "other_unknown";

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  const day = now.getUTCDate() - birth.getUTCDate();
  if (month < 0 || (month === 0 && day < 0)) age -= 1;

  if (age >= 18 && age <= 25) return "18_25";
  if (age >= 26 && age <= 30) return "26_30";
  if (age >= 31 && age <= 35) return "31_35";
  if (age >= 36 && age <= 45) return "36_45";
  if (age >= 46 && age <= 50) return "46_50";
  if (age >= 51 && age <= 55) return "51_55";
  if (age >= 56 && age <= 60) return "56_60";
  if (age >= 61 && age <= 125) return "61_plus";
  return "other_unknown";
}

function countryAlpha2(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (predicateCodes.countryNumericCodes?.[normalized]) return normalized;
  return predicateCodes.countryAlpha3ToAlpha2?.[normalized] || "OTHER_UNKNOWN";
}

function worldRegion(country) {
  return predicateCodes.countryRegion?.[country] || "OTHER_UNKNOWN";
}

function publicHeaders(origin) {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "600",
    vary: "Origin",
    "cache-control": "no-store",
  };
}

function sendJson(response, status, body, origin = "") {
  response.writeHead(status, publicHeaders(origin));
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request_too_large");
      error.code = "request_too_large";
      throw error;
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function apiPost(route, body) {
  const response = await fetch(`${API_BASE}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok || parsed?.ok === false) {
    const error = new Error(`worker_callback_http_${response.status}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  return parsed;
}

function expectedQuery(zkPassport, binding) {
  return zkPassport
    .createQuery()
    .gte("age", 18)
    .disclose("nationality")
    .disclose("birthdate")
    .bind("custom_data", binding)
    .done().query;
}

function failureCode(error) {
  const code = error?.code || error?.message;
  if (code === "query_mismatch") return "query_mismatch";
  if (code === "claim_configuration_mismatch") {
    return "claim_configuration_mismatch";
  }
  if (code === "proof_rejected") return "proof_rejected";
  if (code === "missing_unique_identifier") return "missing_unique_identifier";
  if (code === "invalid_demographic_result") return "invalid_demographic_result";
  return "verifier_error";
}

async function processJob(job) {
  const { claim, payload, proofDigest, jobId, sessionId } = job;

  if (
    claim.domain !== DOMAIN ||
    typeof claim.scope !== "string" ||
    !claim.scope ||
    typeof claim.binding !== "string" ||
    !claim.binding ||
    !/^[a-f0-9]{64}$/i.test(String(claim.queryHash || "")) ||
    claim.validitySeconds !== 30 * 60
  ) {
    const error = new Error("claim_configuration_mismatch");
    error.code = "claim_configuration_mismatch";
    throw error;
  }

  const zkPassport = new ZKPassport(claim.domain, {
    disableProofStorage: true,
  });
  const serverQuery = expectedQuery(zkPassport, claim.binding);

  if (canonicalJson(payload.originalQuery) !== canonicalJson(serverQuery)) {
    const error = new Error("query_mismatch");
    error.code = "query_mismatch";
    throw error;
  }
  if (sha256(canonicalJson(serverQuery)) !== claim.queryHash) {
    const error = new Error("query_mismatch");
    error.code = "query_mismatch";
    throw error;
  }

  const result = await zkPassport.verify({
    proofs: payload.proofs,
    originalQuery: serverQuery,
    queryResult: payload.queryResult,
    validity: claim.validitySeconds,
    scope: claim.scope,
    devMode: false,
    writingDirectory: CACHE_DIR,
  });

  if (!result.verified) {
    const error = new Error("proof_rejected");
    error.code = "proof_rejected";
    throw error;
  }
  if (!result.uniqueIdentifier) {
    const error = new Error("missing_unique_identifier");
    error.code = "missing_unique_identifier";
    throw error;
  }
  // D-Scope's one-person-per-survey rule requires the deterministic production
  // nullifier. Salted nullifiers are intentionally rejected because accepting
  // both types would create two identifiers for the same document and scope.
  if (result.uniqueIdentifierType !== NullifierType.NON_SALTED) {
    const error = new Error("proof_rejected");
    error.code = "proof_rejected";
    throw error;
  }
  if (
    result.queryResultErrors &&
    Object.keys(result.queryResultErrors).length > 0
  ) {
    const error = new Error("proof_rejected");
    error.code = "proof_rejected";
    throw error;
  }

  const birthdate = disclosedValue(payload.queryResult, "birthdate");
  const nationality = disclosedValue(payload.queryResult, "nationality");
  const ageBucket = ageBucketFromBirthdate(birthdate);
  const countryBucket = countryAlpha2(nationality);

  if (ageBucket === "other_unknown" || countryBucket === "OTHER_UNKNOWN") {
    const error = new Error("invalid_demographic_result");
    error.code = "invalid_demographic_result";
    throw error;
  }

  await apiPost(
    `/verification-sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      jobId,
      proofDigest,
      scope: claim.scope,
      queryHash: claim.queryHash,
      verified: true,
      subjectHash: subjectHash(
        claim.domain,
        claim.scope,
        result.uniqueIdentifierType,
        result.uniqueIdentifier,
      ),
      uniqueIdentifierType: String(result.uniqueIdentifierType),
      ageBucket,
      countryBucket,
      worldRegion: worldRegion(countryBucket),
      providerPayloadVersion: "zkpassport-sdk-0.16.0-server-verified-v1",
    },
  );
}

async function drainQueue() {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const job = queue.shift();
    log("verification_started", {
      sessionId: job.sessionId,
      jobId: job.jobId,
      queued: queue.length,
    });

    try {
      await processJob(job);
      log("verification_completed", {
        sessionId: job.sessionId,
        jobId: job.jobId,
      });
    } catch (error) {
      const code = failureCode(error);
      try {
        await apiPost(
          `/internal/zkpassport-verifier/sessions/${encodeURIComponent(job.sessionId)}/failed`,
          { jobId: job.jobId, proofDigest: job.proofDigest, errorCode: code },
        );
      } catch {
        log("failure_callback_failed", {
          sessionId: job.sessionId,
          jobId: job.jobId,
        });
      }
      log("verification_failed", {
        sessionId: job.sessionId,
        jobId: job.jobId,
        errorCode: code,
      });
    } finally {
      accepted.delete(job.sessionId);
      job.payload = null;
    }
  }

  running = false;
}

async function acceptVerification(request, response, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { ok: false, error: "origin_not_allowed" }, origin);
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    sendJson(response, 503, { ok: false, error: "verifier_busy" }, origin);
    return;
  }

  const payload = await readJson(request);
  const sessionId = String(payload?.sessionId || "").trim();
  const clientToken = String(payload?.clientToken || "").trim();

  if (
    !sessionId ||
    !clientToken ||
    !Array.isArray(payload?.proofs) ||
    payload.proofs.length === 0 ||
    !payload?.originalQuery ||
    !payload?.queryResult
  ) {
    sendJson(
      response,
      400,
      { ok: false, error: "invalid_verification_payload" },
      origin,
    );
    return;
  }

  const proofDigest = sha256(
    canonicalJson({
      proofs: payload.proofs,
      originalQuery: payload.originalQuery,
      queryResult: payload.queryResult,
    }),
  );
  const jobId = randomUUID();
  const claim = await apiPost(
    `/internal/zkpassport-verifier/sessions/${encodeURIComponent(sessionId)}/claim`,
    { clientToken, jobId, proofDigest },
  );

  if (claim.claimStatus === "already_verifying") {
    sendJson(response, 202, { ok: true, status: "verifying" }, origin);
    return;
  }
  if (accepted.has(sessionId)) {
    sendJson(response, 202, { ok: true, status: "queued" }, origin);
    return;
  }

  const job = {
    sessionId,
    jobId,
    proofDigest,
    claim,
    payload: {
      proofs: payload.proofs,
      originalQuery: payload.originalQuery,
      queryResult: payload.queryResult,
    },
  };
  accepted.set(sessionId, jobId);
  queue.push(job);
  void drainQueue();

  sendJson(response, 202, { ok: true, status: "queued" }, origin);
}

const server = createServer(async (request, response) => {
  const origin = String(request.headers.origin || "");

  if (request.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) {
      sendJson(response, 403, { ok: false, error: "origin_not_allowed" }, origin);
      return;
    }
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(
      response,
      200,
      { ok: true, service: "dscope-zkpassport-verifier", running, queued: queue.length },
      origin,
    );
    return;
  }

  if (request.method === "POST" && request.url === "/verify") {
    try {
      await acceptVerification(request, response, origin);
    } catch (error) {
      const status = error?.code === "request_too_large" ? 413 : 400;
      sendJson(
        response,
        status,
        { ok: false, error: error?.code || "verification_request_rejected" },
        origin,
      );
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: "not_found" }, origin);
});

server.listen(PORT, HOST, () => {
  log("service_started", { host: HOST, port: PORT, apiBase: API_BASE });
});
