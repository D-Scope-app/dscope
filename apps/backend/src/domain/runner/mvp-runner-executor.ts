import type {
  CreateSurveyMvpJob,
  FinalizeSurveyMvpJob,
  MvpRunnerEvent,
  MvpRunnerJob,
  MvpRunnerResult,
  SyncSurveyMvpJob,
} from "./mvp-runner-types";
import { nowIso } from "./mvp-runner-types";
import type { MvpChainClient } from "./mvp-chain-client";
import {
  createMvpChainClientFromConfig,
  getDefaultMvpRunnerChainConfig,
  type MvpRunnerChainConfig,
} from "./mvp-runner-config";

export type MvpRunnerExecutorOptions = {
  chainClient?: MvpChainClient;
  chainConfig?: MvpRunnerChainConfig;
};

function event(
  jobId: string,
  type: string,
  message: string,
  data?: unknown,
): MvpRunnerEvent {
  return {
    jobId,
    type,
    message,
    createdAt: nowIso(),
    data,
  };
}

async function simulateRewardVaultGetter(input: {
  chainClient: MvpChainClient;
  chainConfig: MvpRunnerChainConfig;
  functionName: string;
  rewardVaultAddress: string;
  surveyKey: string;
}): Promise<string | null> {
  const result = await input.chainClient.simulate({
    functionName: input.functionName,
    contractAddress: input.rewardVaultAddress,
    contractArtifact: input.chainConfig.artifacts.rewardVaultMvp,
    args: [input.surveyKey],
  });

  return result.simulationResult ?? null;
}

export async function executeMvpRunnerJob(
  job: MvpRunnerJob,
  options: MvpRunnerExecutorOptions = {},
): Promise<MvpRunnerResult> {
  const chainConfig = options.chainConfig ?? getDefaultMvpRunnerChainConfig();
  const chainClient =
    options.chainClient ?? createMvpChainClientFromConfig(chainConfig);

  try {
    if (job.type === "create_survey_mvp") {
      return executeCreateSurveyMvpJob(job, chainClient, chainConfig);
    }

    if (job.type === "finalize_survey_mvp") {
      return executeFinalizeSurveyMvpJob(job, chainClient, chainConfig);
    }

    if (job.type === "sync_survey_mvp") {
      return executeSyncSurveyMvpJob(job, chainClient, chainConfig);
    }

    return {
      jobId: job.id,
      status: "failed",
      events: [
        event(job.id, "runner.unknown_job_type", "Unknown MVP runner job type"),
      ],
      error: "Unknown MVP runner job type",
    };
  } catch (err) {
    return {
      jobId: job.id,
      status: "failed",
      events: [
        event(job.id, "runner.failed", "MVP runner job failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      ],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeCreateSurveyMvpJob(
  job: CreateSurveyMvpJob,
  chainClient: MvpChainClient,
  chainConfig: MvpRunnerChainConfig,
): Promise<MvpRunnerResult> {
  const events: MvpRunnerEvent[] = [];

  events.push(
    event(job.id, "create.started", "Create survey MVP job started", {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
    }),
  );

  events.push(
    event(job.id, "create.plan_built", "Create survey execution plan built", {
      chainMode: chainConfig.mode,
      defaultFrom: chainConfig.defaultFrom,
      artifacts: chainConfig.artifacts,
      knownContracts: {
        surveyFactoryAddress: chainConfig.surveyFactoryAddress ?? null,
        sharedParticipationGateAddress:
          chainConfig.sharedParticipationGateAddress ?? null,
        sharedRewardVaultAddress: chainConfig.sharedRewardVaultAddress ?? null,
      },
      steps: [
        "build predicate policy",
        "register ParticipationGateV2 policy",
        "register RewardVaultMVP config",
        "deploy DScopeCore",
        "register survey in SurveyFactory",
        "save addresses to read-model",
      ],
    }),
  );

  events.push(
    event(
      job.id,
      "create.chain_client_ready",
      "Create survey job received chain client and runner config",
      {
        chainClient: chainClient.constructor.name,
        chainMode: chainConfig.mode,
      },
    ),
  );

  const sdkCreateSurveyBundle = (
    chainClient as {
      createSurveyBundle?: (
        payload: CreateSurveyMvpJob["payload"],
      ) => Promise<unknown>;
    }
  ).createSurveyBundle;

  if (chainConfig.mode === "sdk") {
    if (typeof sdkCreateSurveyBundle !== "function") {
      throw new Error(
        "MVP_CHAIN_MODE=sdk requires a chain client with createSurveyBundle().",
      );
    }

    events.push(
      event(
        job.id,
        "create.sdk_started",
        "Aztec SDK create survey flow started",
      ),
    );

    const sdkOutput = await sdkCreateSurveyBundle.call(
      chainClient,
      job.payload,
    );

    events.push(
      event(
        job.id,
        "create.sdk_done",
        "Aztec SDK create survey flow completed",
        sdkOutput,
      ),
    );

    return {
      jobId: job.id,
      status: "done",
      events,
      output: sdkOutput,
    };
  }

  return {
    jobId: job.id,
    status: "done",
    events,
    output: {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
      chainMode: chainConfig.mode,
      contracts: {
        surveyFactoryAddress: chainConfig.surveyFactoryAddress ?? null,
        dscopeCoreAddress: null,
        participationGateAddress:
          chainConfig.sharedParticipationGateAddress ?? null,
        rewardVaultAddress: chainConfig.sharedRewardVaultAddress ?? null,
      },
      txHashes: {},
      note: "Create runner wiring prepared. Real Aztec SDK execution will fill contracts and txHashes.",
    },
  };
}

async function executeFinalizeSurveyMvpJob(
  job: FinalizeSurveyMvpJob,
  chainClient: MvpChainClient,
  chainConfig: MvpRunnerChainConfig,
): Promise<MvpRunnerResult> {
  const events: MvpRunnerEvent[] = [];

  events.push(
    event(job.id, "finalize.started", "Finalize survey MVP job started", {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
    }),
  );

  events.push(
    event(
      job.id,
      "finalize.plan_built",
      "Finalize survey execution plan built",
      {
        chainClient: chainClient.constructor.name,
        chainMode: chainConfig.mode,
        steps: [
          "read ParticipationGateV2 participation count",
          "build MVP analytics/finalization payload",
          "compute result hash",
          "compute distribution hash",
          "call RewardVaultMVP.finalize_reward_distribution",
          "call DScopeCore.finalize_results",
          "return finalized payload for read-model apply",
        ],
      },
    ),
  );

  const sdkFinalizeSurveyBundle = (
    chainClient as {
      finalizeSurveyBundle?: (
        payload: FinalizeSurveyMvpJob["payload"],
      ) => Promise<unknown>;
    }
  ).finalizeSurveyBundle;

  if (chainConfig.mode === "sdk") {
    if (typeof sdkFinalizeSurveyBundle !== "function") {
      throw new Error(
        "MVP_CHAIN_MODE=sdk requires a chain client with finalizeSurveyBundle().",
      );
    }

    events.push(
      event(
        job.id,
        "finalize.sdk_started",
        "Aztec SDK finalize survey flow started",
        {
          dscopeCoreAddress: job.payload.dscopeCoreAddress,
          participationGateAddress: job.payload.participationGateAddress,
          rewardVaultAddress: job.payload.rewardVaultAddress,
        },
      ),
    );

    const sdkOutput = await sdkFinalizeSurveyBundle.call(
      chainClient,
      job.payload,
    );

    events.push(
      event(
        job.id,
        "finalize.sdk_done",
        "Aztec SDK finalize survey flow completed",
        sdkOutput,
      ),
    );

    return {
      jobId: job.id,
      status: "done",
      events,
      output: sdkOutput,
    };
  }

  return {
    jobId: job.id,
    status: "done",
    events,
    output: {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
      dscopeCoreAddress: job.payload.dscopeCoreAddress,
      rewardVaultAddress: job.payload.rewardVaultAddress,
      participationGateAddress: job.payload.participationGateAddress,
      note: "Finalize runner skeleton only for non-SDK mode. SDK mode executes real Aztec finalize flow.",
    },
  };
}

async function executeSyncSurveyMvpJob(
  job: SyncSurveyMvpJob,
  chainClient: MvpChainClient,
  chainConfig: MvpRunnerChainConfig,
): Promise<MvpRunnerResult> {
  const events: MvpRunnerEvent[] = [];

  events.push(
    event(job.id, "sync.started", "Sync survey MVP job started", {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
    }),
  );

  if (!job.payload.rewardVaultAddress) {
    events.push(
      event(
        job.id,
        "sync.reward_vault_skipped",
        "RewardVaultMVP address is missing, skipping reward sync",
      ),
    );

    return {
      jobId: job.id,
      status: "done",
      events,
      output: {
        surveyId: job.payload.surveyId,
        surveyKey: job.payload.surveyKey,
        reward: null,
        note: "Sync completed without reward state because rewardVaultAddress was missing.",
      },
    };
  }

  events.push(
    event(job.id, "sync.reward_vault_started", "Reading RewardVaultMVP state", {
      rewardVaultAddress: job.payload.rewardVaultAddress,
    }),
  );

  const rewardStatus = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_reward_status",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const rewardPoolAmount = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_reward_pool_amount",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const claimDeadline = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_claim_deadline",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const finalParticipantCount = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_final_participant_count",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const rewardPerParticipant = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_reward_per_participant",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const totalAllocated = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_total_allocated",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const dustReturnToSponsor = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_dust_return_to_sponsor",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const distributionHash = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_distribution_hash",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const finalizedAt = await simulateRewardVaultGetter({
    chainClient,
    chainConfig,
    functionName: "get_finalized_at",
    rewardVaultAddress: job.payload.rewardVaultAddress,
    surveyKey: job.payload.surveyKey,
  });

  const rewardState = {
    rewardVaultAddress: job.payload.rewardVaultAddress,
    rewardStatus,
    rewardStatusMeaning:
      rewardStatus === "0"
        ? "NONE"
        : rewardStatus === "1"
          ? "REGISTERED"
          : rewardStatus === "2"
            ? "FINALIZED"
            : rewardStatus === "3"
              ? "CLAIMS_CLOSED"
              : "UNKNOWN",
    rewardPoolAmount,
    claimDeadline,
    finalParticipantCount,
    rewardPerParticipant,
    totalAllocated,
    dustReturnToSponsor,
    distributionHash,
    finalizedAt,
  };

  events.push(
    event(job.id, "sync.reward_vault_done", "RewardVaultMVP state read", {
      rewardState,
    }),
  );

  return {
    jobId: job.id,
    status: "done",
    events,
    output: {
      surveyId: job.payload.surveyId,
      surveyKey: job.payload.surveyKey,
      reward: rewardState,
    },
  };
}
