import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8787";
const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";
const AZTEC_CONTRACT_ARTIFACT =
  process.env.AZTEC_CONTRACT_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/dscope_core/target/dscope_core-DScopeCore.json", import.meta.url));

const MAX_ERROR_LENGTH = 2000;

function truncateError(message) {
  if (!message) return null;
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH)}... [truncated]`
    : message;
}

function hasExplicitFinalizeEnv() {
  return (
    process.env.FINALIZE_RESULT_HASH !== undefined ||
    process.env.FINALIZE_DISTRIBUTION_HASH !== undefined ||
    process.env.FINALIZE_PARTICIPANT_COUNT !== undefined ||
    process.env.FINALIZE_FINALIZED_AT !== undefined ||
    process.env.FINALIZE_CURRENT_TIME !== undefined
  );
}

function getEnvFinalizePayload() {
  return {
    resultHash: process.env.FINALIZE_RESULT_HASH || "333",
    distributionHash: process.env.FINALIZE_DISTRIBUTION_HASH || "444",
    finalParticipantCount: process.env.FINALIZE_PARTICIPANT_COUNT || "7",
    finalizedAt: Number(process.env.FINALIZE_FINALIZED_AT || "210"),
    currentTime: Number(process.env.FINALIZE_CURRENT_TIME || "210"),
  };
}

function normalizePayload(payload) {
  if (!payload) return null;

  return {
    resultHash: String(payload.resultHash),
    distributionHash: String(payload.distributionHash),
    finalParticipantCount: String(payload.finalParticipantCount),
    finalizedAt: Number(payload.finalizedAt),
    currentTime: Number(payload.currentTime),
  };
}

function payloadsEqual(a, b) {
  return (
    JSON.stringify(normalizePayload(a)) === JSON.stringify(normalizePayload(b))
  );
}

async function runSendFinalize(contractAddress, payload) {
  const args = [
    "send",
    "finalize_results",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    contractAddress,
    "--contract-artifact",
    AZTEC_CONTRACT_ARTIFACT,
    "--args",
    payload.resultHash,
    payload.distributionHash,
    payload.finalParticipantCount,
    String(payload.finalizedAt),
    String(payload.currentTime),
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024,
  });

  return `${stdout}\n${stderr}`;
}

async function updateJobStatus(jobId, status, lastError = null) {
  const res = await fetch(`${BACKEND_URL}/jobs/${jobId}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
      lastError,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(
      `Failed to update job status: ${JSON.stringify(json, null, 2)}`,
    );
  }

  return json;
}

async function loadSurvey(surveyId) {
  const surveyRes = await fetch(`${BACKEND_URL}/surveys/${surveyId}`);
  const surveyJson = await surveyRes.json();

  if (!surveyRes.ok || !surveyJson.ok) {
    throw new Error(
      `Failed to load survey: ${JSON.stringify(surveyJson, null, 2)}`,
    );
  }

  return surveyJson.survey;
}

async function loadJobs(surveyId) {
  const res = await fetch(`${BACKEND_URL}/surveys/${surveyId}/jobs`);
  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(`Failed to load jobs: ${JSON.stringify(json, null, 2)}`);
  }

  return json.jobs || [];
}

async function loadJob(jobId) {
  const res = await fetch(`${BACKEND_URL}/jobs/${jobId}`);
  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(`Failed to load job: ${JSON.stringify(json, null, 2)}`);
  }

  return json.job;
}

async function loadEvents(surveyId) {
  const res = await fetch(`${BACKEND_URL}/surveys/${surveyId}/events`);
  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(`Failed to load events: ${JSON.stringify(json, null, 2)}`);
  }

  return json.events || [];
}

function findLatestFinalizeJob(jobs) {
  return jobs
    .filter((j) => j.job_type === "finalize_survey")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .at(-1);
}

function findLatestFinalizePayloadFromEvents(events) {
  const event = events
    .filter((e) => e.event_type === "finalize_requested")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .at(-1);

  if (!event) return null;

  try {
    return JSON.parse(event.payload_json);
  } catch {
    return null;
  }
}

function extractPayloadFromJob(job) {
  if (!job?.payload_json) return null;

  try {
    return JSON.parse(job.payload_json);
  } catch {
    return null;
  }
}

async function requestFinalizeJob(surveyId, payload) {
  const requestFinalizeRes = await fetch(
    `${BACKEND_URL}/surveys/${surveyId}/request-finalize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const requestFinalizeJson = await requestFinalizeRes.json();

  if (!requestFinalizeRes.ok || !requestFinalizeJson.ok) {
    throw new Error(
      `Failed to request finalize: ${JSON.stringify(requestFinalizeJson, null, 2)}`,
    );
  }

  return requestFinalizeJson.job;
}

async function runSyncSurvey(surveyId) {
  const { stdout, stderr } = await execFileAsync("node", [
    "scripts/sync-survey.mjs",
    surveyId,
  ]);

  return `${stdout}\n${stderr}`;
}

async function main() {
  const surveyId = process.argv[2];

  if (!surveyId) {
    throw new Error("Usage: node scripts/finalize-survey.mjs <survey-id>");
  }

  let survey = await loadSurvey(surveyId);

  if (survey.create_flow_status !== "created") {
    throw new Error("Survey is not fully created yet");
  }

  if (!survey.contract_address || !survey.contract_address.trim()) {
    throw new Error("Survey contract_address is missing");
  }

  console.log("Initial sync...");
  const initialSyncOutput = await runSyncSurvey(surveyId);
  console.log(initialSyncOutput);

  survey = await loadSurvey(surveyId);

  if (survey.status === "finalized") {
    console.log(`Survey '${surveyId}' is already finalized`);
    return;
  }

  if (survey.status === "cancelled") {
    throw new Error("Cancelled survey cannot be finalized");
  }

  const jobs = await loadJobs(surveyId);
  const events = await loadEvents(surveyId);

  let job = findLatestFinalizeJob(jobs);

  const explicitEnvPayload = hasExplicitFinalizeEnv()
    ? getEnvFinalizePayload()
    : null;

  const jobPayload = extractPayloadFromJob(job);
  const eventPayload = findLatestFinalizePayloadFromEvents(events);

  let payload =
    explicitEnvPayload || jobPayload || eventPayload || getEnvFinalizePayload();

  payload = normalizePayload(payload);

  console.log("Using finalize payload:");
  console.log(JSON.stringify(payload, null, 2));

  if (job?.status === "done") {
    console.log(
      `Finalize job '${job.id}' is already done, syncing one more time...`,
    );
    const syncOutput = await runSyncSurvey(surveyId);
    console.log(syncOutput);

    survey = await loadSurvey(surveyId);

    if (survey.status === "finalized") {
      console.log(`Survey '${surveyId}' is already finalized`);
      return;
    }

    job = null;
  }

  const latestJobPayload = extractPayloadFromJob(job);
  const payloadChanged =
    !latestJobPayload || !payloadsEqual(latestJobPayload, payload);

  if (
    !job ||
    job.status === "done" ||
    (job.status === "failed" && payloadChanged)
  ) {
    job = await requestFinalizeJob(surveyId, payload);
    console.log("Finalize job created:");
    console.log(JSON.stringify(job, null, 2));
  } else {
    console.log(`Reusing finalize job '${job.id}' with status '${job.status}'`);
  }

  job = await loadJob(job.id);

  await updateJobStatus(job.id, "running");

  try {
    const effectivePayload = normalizePayload(
      extractPayloadFromJob(job) || payload,
    );

    console.log("Effective finalize payload:");
    console.log(JSON.stringify(effectivePayload, null, 2));

    const txOutput = await runSendFinalize(
      survey.contract_address,
      effectivePayload,
    );

    console.log("Finalize tx output:");
    console.log(txOutput);

    const syncOutput = await runSyncSurvey(surveyId);

    console.log("Sync output:");
    console.log(syncOutput);

    survey = await loadSurvey(surveyId);

    if (survey.status !== "finalized") {
      throw new Error(
        "Finalize transaction completed but survey is not finalized after sync",
      );
    }

    await updateJobStatus(job.id, "done");
  } catch (err) {
    const message = truncateError(
      err instanceof Error ? err.message : String(err),
    );
    await updateJobStatus(job.id, "failed", message);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
