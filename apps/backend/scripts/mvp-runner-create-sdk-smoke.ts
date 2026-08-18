import { executeMvpRunnerJob } from "../src/domain/runner/mvp-runner-executor";
import {
  createRunnerJob,
  type CreateSurveyMvpJob,
  type CreateSurveyMvpJobPayload,
} from "../src/domain/runner/mvp-runner-types";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }

  return parsed;
}

function requireSdkMode() {
  if (!process.env.MVP_CHAIN_MODE) {
    process.env.MVP_CHAIN_MODE = "sdk";
  }

  if (process.env.MVP_CHAIN_MODE !== "sdk") {
    throw new Error(
      `mvp-runner-create-sdk-smoke requires MVP_CHAIN_MODE=sdk, got ${process.env.MVP_CHAIN_MODE}`,
    );
  }
}

async function main() {
  requireSdkMode();

  const surveyKey = envNumber(
    "SDK_RUNNER_CREATE_SURVEY_KEY",
    800000 + (Math.floor(Date.now() / 1000) % 100000),
  );
  const policyHash = envNumber("SDK_RUNNER_CREATE_POLICY_HASH", surveyKey + 1000);
  const metadataHash = envNumber("SDK_RUNNER_CREATE_METADATA_HASH", surveyKey + 2000);

  const payload: CreateSurveyMvpJobPayload = {
    surveyId: `survey_sdk_runner_${surveyKey}`,
    surveyKey: String(surveyKey),
    sponsor: process.env.AZTEC_FROM_ALIAS ?? "accounts:test0",
    metadataHash: String(metadataHash),
    predicatePolicyHash: String(policyHash),
    ageBuckets: ["31_35"],
    countries: ["DE"],
    regions: "ANY",
    reward: {
      rewardEnabled: true,
      rewardPoolAmount: process.env.SDK_RUNNER_CREATE_REWARD_POOL_AMOUNT ?? "1000",
      claimDeadline: process.env.SDK_RUNNER_CREATE_CLAIM_DEADLINE ?? "9999999999",
    },
  };

  const job = {
    ...createRunnerJob<CreateSurveyMvpJobPayload>({
      id: `job_create_sdk_runner_${surveyKey}`,
      type: "create_survey_mvp",
      payload,
      maxAttempts: 1,
    }),
    type: "create_survey_mvp" as const,
  } satisfies CreateSurveyMvpJob;

  console.log(
    JSON.stringify(
      {
        step: "start",
        mode: process.env.MVP_CHAIN_MODE,
        nodeUrl: process.env.AZTEC_NODE_URL ?? null,
        defaultFrom: process.env.AZTEC_FROM_ALIAS ?? "accounts:test0",
        surveyKey,
        policyHash,
        metadataHash,
      },
      null,
      2,
    ),
  );

  const result = await executeMvpRunnerJob(job);

  console.log(JSON.stringify(result, null, 2));

  if (result.status !== "done") {
    process.exitCode = 1;
    return;
  }

  const output = result.output as any;
  if (!output?.contracts?.dscopeCoreAddress) {
    throw new Error("SDK runner create output did not include dscopeCoreAddress");
  }
  if (!output?.contracts?.participationGateAddress) {
    throw new Error("SDK runner create output did not include participationGateAddress");
  }
  if (!output?.contracts?.surveyFactoryAddress) {
    throw new Error("SDK runner create output did not include surveyFactoryAddress");
  }
  if (!output?.contracts?.rewardVaultAddress) {
    throw new Error("SDK runner create output did not include rewardVaultAddress");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        message: "MVP runner create_survey_mvp SDK smoke passed",
        surveyId: output.surveyId,
        surveyKey: output.surveyKey,
        contracts: output.contracts,
        reads: output.reads,
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
