import { executeMvpRunnerJob } from "../src/domain/runner/mvp-runner-executor";
import {
  createMvpChainClientFromConfig,
  getDefaultMvpRunnerChainConfig,
} from "../src/domain/runner/mvp-runner-config";
import type { MvpRunnerJob } from "../src/domain/runner/mvp-runner-types";

type RunnerApiJobResponse = {
  ok: boolean;
  job: null | {
    id: string;
    type: string;
    status: string;
    attempts: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    last_error: string | null;
    payload_json: string;
  };
  error?: unknown;
};

type RunnerApiGenericResponse = {
  ok: boolean;
  error?: unknown;
  [key: string]: unknown;
};

type RunnerJobType = MvpRunnerJob["type"];

const DEFAULT_JOB_TYPES: RunnerJobType[] = [
  "sync_survey_mvp",
  "finalize_survey_mvp",
  "create_survey_mvp",
];

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getRunnerApiBaseUrl(): string {
  const value =
    readEnv("RUNNER_API_BASE_URL") ||
    readEnv("API_BASE_URL") ||
    readEnv("D_SCOPE_API_BASE_URL") ||
    "http://127.0.0.1:8787";

  return value.replace(/\/+$/, "");
}

function getRunnerId(): string {
  return readEnv("RUNNER_ID") || "local-runner-1";
}

function getRunnerToken(): string | undefined {
  return readEnv("INTERNAL_RUNNER_TOKEN");
}

function isRunnerJobType(value: string): value is RunnerJobType {
  return DEFAULT_JOB_TYPES.includes(value as RunnerJobType);
}

function getRunnerJobTypes(): RunnerJobType[] {
  const raw = readEnv("MVP_RUNNER_JOB_TYPES") || readEnv("MVP_RUNNER_JOB_TYPE");

  if (!raw) {
    return DEFAULT_JOB_TYPES;
  }

  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is RunnerJobType => isRunnerJobType(item));

  if (parsed.length === 0) {
    throw new Error(
      `Invalid MVP runner job type filter: ${raw}. Expected one or more of ${DEFAULT_JOB_TYPES.join(
        ", ",
      )}`,
    );
  }

  return parsed;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const token = getRunnerToken();

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

function rowToRunnerJob(
  row: NonNullable<RunnerApiJobResponse["job"]>,
): MvpRunnerJob {
  return {
    id: row.id,
    type: row.type as MvpRunnerJob["type"],
    status: row.status as MvpRunnerJob["status"],
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    payload: JSON.parse(row.payload_json),
  } as MvpRunnerJob;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getRunnerApiBaseUrl()}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();

  let data: unknown;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Request failed ${response.status} ${response.statusText}: ${JSON.stringify(
        data,
      )}`,
    );
  }

  return data as T;
}

async function claimNextJob(): Promise<MvpRunnerJob | null> {
  const response = await postJson<RunnerApiJobResponse>(
    "/internal/runner/jobs/next",
    {
      runnerId: getRunnerId(),
      jobTypes: getRunnerJobTypes(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Runner API returned error: ${JSON.stringify(response.error)}`,
    );
  }

  if (!response.job) {
    return null;
  }

  return rowToRunnerJob(response.job);
}

async function markDone(jobId: string, events: unknown[]): Promise<void> {
  await postJson(`/internal/runner/jobs/${jobId}/done`, {
    events,
  });
}

async function markFailed(
  jobId: string,
  error: string,
  events: unknown[],
): Promise<void> {
  await postJson(`/internal/runner/jobs/${jobId}/failed`, {
    error,
    events,
  });
}

function buildMockAddress(label: string, surveyKey: string): string {
  const cleanLabel = label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const cleanKey = surveyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

  return `0xmock_${cleanLabel}_${cleanKey}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function contractsFromRunnerOutput(runnerOutput: unknown): {
  surveyFactoryAddress: string | null;
  dscopeCoreAddress: string | null;
  participationGateAddress: string | null;
  rewardVaultAddress: string | null;
} | null {
  const output = asRecord(runnerOutput);
  const contracts = asRecord(output?.contracts);

  if (!contracts) {
    return null;
  }

  return {
    surveyFactoryAddress: readStringField(contracts, "surveyFactoryAddress"),
    dscopeCoreAddress: readStringField(contracts, "dscopeCoreAddress"),
    participationGateAddress: readStringField(
      contracts,
      "participationGateAddress",
    ),
    rewardVaultAddress: readStringField(contracts, "rewardVaultAddress"),
  };
}

function hasAllContractAddresses(
  contracts: {
    surveyFactoryAddress: string | null;
    dscopeCoreAddress: string | null;
    participationGateAddress: string | null;
    rewardVaultAddress: string | null;
  },
  rewardEnabled = false,
): boolean {
  return Boolean(
    contracts.surveyFactoryAddress &&
    contracts.dscopeCoreAddress &&
    contracts.participationGateAddress &&
    (!rewardEnabled || contracts.rewardVaultAddress),
  );
}

function txHashesFromRunnerOutput(
  runnerOutput: unknown,
): Record<string, string> | null {
  const output = asRecord(runnerOutput);
  const txHashes = asRecord(output?.txHashes);

  if (!txHashes) {
    return null;
  }

  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(txHashes)) {
    if (typeof value === "string" && value.length > 0) {
      clean[key] = value;
    }
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

function readRunnerOutputField(
  runnerOutput: unknown,
  key: string,
): unknown | null {
  const output = asRecord(runnerOutput);
  return output && key in output ? output[key] : null;
}

function fallbackMockContracts(surveyKey: string) {
  return {
    surveyFactoryAddress: buildMockAddress("factory", surveyKey),
    dscopeCoreAddress: buildMockAddress("core", surveyKey),
    participationGateAddress: buildMockAddress("gate", surveyKey),
    rewardVaultAddress: buildMockAddress("reward", surveyKey),
  };
}

async function completeCreateSurvey(
  job: MvpRunnerJob,
  runnerOutput: unknown,
): Promise<unknown | null> {
  if (job.type !== "create_survey_mvp") {
    return null;
  }

  const surveyId = job.payload.surveyId;
  const surveyKey = job.payload.surveyKey;

  const chainMode = getDefaultMvpRunnerChainConfig().mode;
  const outputContracts = contractsFromRunnerOutput(runnerOutput);

  if (chainMode === "sdk") {
    if (!outputContracts || !hasAllContractAddresses(outputContracts, Boolean(job.payload.reward?.rewardEnabled))) {
      throw new Error(
        "SDK create_survey_mvp completed without full contract addresses; refusing to write mock addresses.",
      );
    }
  }

  return postJson<RunnerApiGenericResponse>(
    `/internal/runner/surveys/${surveyId}/create-complete`,
    {
      status: "active",
      chainMode,
      contracts: outputContracts ?? fallbackMockContracts(surveyKey),
      txHashes: txHashesFromRunnerOutput(runnerOutput),
      policy: readRunnerOutputField(runnerOutput, "policy"),
      reads: readRunnerOutputField(runnerOutput, "reads"),
      runnerOutput,
      rewardStatus: job.payload.reward.rewardEnabled
        ? "CONFIGURED"
        : "DISABLED",
    },
  );
}

async function completeFinalizeSurvey(
  job: MvpRunnerJob,
  runnerOutput: unknown,
): Promise<unknown | null> {
  if (job.type !== "finalize_survey_mvp") {
    return null;
  }

  const output = asRecord(runnerOutput) ?? {};
  const surveyId = job.payload.surveyId;
  const chainMode = getDefaultMvpRunnerChainConfig().mode;

  const sdkResult = asRecord(output.result);
  const sdkReward = asRecord(output.reward);

  if (chainMode === "sdk") {
    const resultHash = readStringField(sdkResult, "resultHash");
    const distributionHash =
      readStringField(sdkResult, "distributionHash") ??
      readStringField(sdkReward, "distributionHash");
    const finalParticipantCount = readStringField(
      sdkResult,
      "finalParticipantCount",
    );

    if (!resultHash || !distributionHash || finalParticipantCount === null) {
      throw new Error(
        "SDK finalize_survey_mvp completed without result hashes/count; refusing to write mock finalization data.",
      );
    }

    return postJson<RunnerApiGenericResponse>(
      `/internal/runner/surveys/${surveyId}/finalize-complete`,
      {
        status: "finalized",
        result: {
          resultHash,
          distributionHash,
          finalParticipantCount,
          analyticsPayload:
            sdkResult && "analyticsPayload" in sdkResult
              ? sdkResult.analyticsPayload
              : null,
          rewardPayload:
            sdkResult && "rewardPayload" in sdkResult
              ? sdkResult.rewardPayload
              : null,
          finalizationPayload:
            sdkResult && "finalizationPayload" in sdkResult
              ? sdkResult.finalizationPayload
              : output,
        },
        reward: {
          rewardStatus:
            readStringField(sdkReward, "rewardStatus") ?? "FINALIZED",
          rewardPerParticipant:
            readStringField(sdkReward, "rewardPerParticipant") ?? "0",
          totalAllocated: readStringField(sdkReward, "totalAllocated") ?? "0",
          dustReturnToSponsor:
            readStringField(sdkReward, "dustReturnToSponsor") ?? "0",
          distributionHash,
          finalizedAt:
            readStringField(sdkReward, "finalizedAt") ??
            new Date().toISOString(),
        },
      },
    );
  }

  return postJson<RunnerApiGenericResponse>(
    `/internal/runner/surveys/${surveyId}/finalize-complete`,
    {
      status: "finalized",
      result: {
        resultHash: "mock_result_hash_" + surveyId,
        distributionHash: "mock_distribution_hash_" + surveyId,
        finalParticipantCount: "1",
        analyticsPayload: {
          source: "local_mvp_runner_mock",
          surveyId,
          surveyKey: job.payload.surveyKey,
          totalValidParticipants: 1,
          note: "Mock analytics payload generated by local MVP runner.",
        },
        rewardPayload: {
          source: "local_mvp_runner_mock",
          rewardPoolAmount: job.payload.rewardPoolAmount,
          claimDeadline: job.payload.claimDeadline,
        },
        finalizationPayload: {
          source: "local_mvp_runner_mock",
          runnerOutput: output,
        },
      },
      reward: {
        rewardStatus: "FINALIZED",
        rewardPerParticipant: job.payload.rewardPoolAmount || "0",
        totalAllocated: job.payload.rewardPoolAmount || "0",
        dustReturnToSponsor: "0",
        distributionHash: "mock_distribution_hash_" + surveyId,
        finalizedAt: new Date().toISOString(),
      },
    },
  );
}

async function applyLifecycleSideEffects(
  job: MvpRunnerJob,
  runnerOutput: unknown,
): Promise<unknown | null> {
  if (job.type === "create_survey_mvp") {
    return completeCreateSurvey(job, runnerOutput);
  }

  if (job.type === "finalize_survey_mvp") {
    return completeFinalizeSurvey(job, runnerOutput);
  }

  return null;
}

async function main() {
  console.log(
    JSON.stringify(
      {
        runnerId: getRunnerId(),
        apiBaseUrl: getRunnerApiBaseUrl(),
        mode: getDefaultMvpRunnerChainConfig().mode,
        jobTypes: getRunnerJobTypes(),
      },
      null,
      2,
    ),
  );

  const job = await claimNextJob();

  if (!job) {
    console.log("No pending MVP runner job found.");
    return;
  }

  console.log(
    JSON.stringify(
      {
        pickedJob: {
          id: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          payload: job.payload,
        },
      },
      null,
      2,
    ),
  );

  const chainConfig = getDefaultMvpRunnerChainConfig();
  const result = await executeMvpRunnerJob(job, {
    chainConfig,
    chainClient: createMvpChainClientFromConfig(chainConfig),
  });

  if (result.status === "done") {
    const lifecycleResult = await applyLifecycleSideEffects(job, result.output);

    const events = [
      ...result.events,
      ...(lifecycleResult
        ? [
            {
              jobId: job.id,
              type: "runner.lifecycle_applied",
              message: "MVP read-model lifecycle side effects applied",
              createdAt: new Date().toISOString(),
              data: {
                jobType: job.type,
                lifecycleResult,
              },
            },
          ]
        : []),
    ];

    await markDone(job.id, events);

    console.log(
      JSON.stringify(
        {
          jobId: job.id,
          status: "done",
          output: result.output,
          lifecycleResult,
          events,
        },
        null,
        2,
      ),
    );

    return;
  }

  await markFailed(
    job.id,
    result.error || "MVP runner job failed",
    result.events,
  );

  console.log(
    JSON.stringify(
      {
        jobId: job.id,
        status: "failed",
        error: result.error,
        events: result.events,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
