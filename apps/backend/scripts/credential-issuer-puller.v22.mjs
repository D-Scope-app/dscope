import process from "node:process";

const API_BASE = process.env.RUNNER_API_BASE_URL || "https://app.dscope.app";
const INTERNAL_TOKEN = process.env.INTERNAL_RUNNER_TOKEN || "";
const ISSUER_TOKEN = process.env.ISSUER_API_TOKEN || "";
const ISSUER_URL =
  process.env.LOCAL_ISSUER_SERVICE_URL || "http://127.0.0.1:8790";
const RUNNER_ID =
  process.env.CREDENTIAL_ISSUER_RUNNER_ID || "credential-issuer-v22";
const LOOP_MS = Number(process.env.CREDENTIAL_ISSUER_LOOP_MS || "10000");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${INTERNAL_TOKEN}`,
  };
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok || json?.ok === false) {
    throw new Error(`API ${path} failed ${res.status}: ${text}`);
  }

  return json;
}

async function postHeartbeat(status, payload = {}) {
  try {
    await apiPost("/internal/ops/heartbeat", {
      service: "credential-issuer",
      serviceId: RUNNER_ID,
      status,
      payload: {
        runnerId: RUNNER_ID,
        apiBase: API_BASE,
        issuerUrl: ISSUER_URL,
        ...payload,
      },
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        status: "heartbeat_warn",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

async function issuerPost(payload) {
  const res = await fetch(`${ISSUER_URL}/issuer/issue-credential`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ISSUER_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok || json?.ok === false) {
    throw new Error(`issuer failed ${res.status}: ${text}`);
  }

  if (!json?.txHash || !/^0x[a-fA-F0-9]{64}$/.test(json.txHash)) {
    throw new Error(`issuer returned no valid txHash: ${text}`);
  }

  return json;
}

async function runOnce() {
  const next = await apiPost("/internal/credential-issuer/jobs/next", {
    runnerId: RUNNER_ID,
  });

  if (!next.job) {
    await postHeartbeat("idle", { pendingJob: false });
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), status: "idle" }),
    );
    return;
  }

  const job = next.job;
  const payload = next.payload || JSON.parse(job.payload_json);

  await postHeartbeat("running", {
    jobId: job.id,
    surveyId: job.survey_id,
    walletAddress: job.wallet_address,
  });

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      status: "picked",
      jobId: job.id,
      surveyId: job.survey_id,
    }),
  );

  try {
    const issued = await issuerPost(payload);

    await apiPost(`/internal/credential-issuer/jobs/${job.id}/issued`, {
      txHash: issued.txHash,
      issuer: issued.issuer,
      credential: issued.credential,
      normalized: issued.normalized,
      issuerResponse: issued,
    });

    await postHeartbeat("issued", {
      jobId: job.id,
      surveyId: job.survey_id,
      txHash: issued.txHash,
    });

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        status: "issued",
        jobId: job.id,
        txHash: issued.txHash,
      }),
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);

    await apiPost(`/internal/credential-issuer/jobs/${job.id}/failed`, {
      error,
    });

    await postHeartbeat("failed", {
      jobId: job.id,
      surveyId: job.survey_id,
      error,
    });

    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        status: "failed",
        jobId: job.id,
        error,
      }),
    );
  }
}

async function main() {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "dscope-credential-issuer-puller-v22",
      apiBase: API_BASE,
      issuerUrl: ISSUER_URL,
      runnerId: RUNNER_ID,
    }),
  );

  await postHeartbeat("starting");

  if (process.env.CREDENTIAL_ISSUER_MODE === "once") {
    await runOnce();
    return;
  }

  while (true) {
    await runOnce();
    await sleep(LOOP_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
