import type {
  MvpChainClient,
  MvpChainCommandResult,
  MvpChainDeployInput,
  MvpChainSendInput,
  MvpChainSimulateInput,
} from "./mvp-chain-client";

type MockRewardState = {
  rewardStatus: string;
  rewardPoolAmount: string;
  claimDeadline: string;
  finalParticipantCount: string;
  rewardPerParticipant: string;
  totalAllocated: string;
  dustReturnToSponsor: string;
  distributionHash: string;
  finalizedAt: string;
};

export type MockMvpChainClientOptions = {
  deployedAddressPrefix?: string;
  rewardStateBySurveyKey?: Record<string, MockRewardState>;
};

const DEFAULT_REWARD_STATE_BY_SURVEY_KEY: Record<string, MockRewardState> = {
  "401": {
    rewardStatus: "2",
    rewardPoolAmount: "1000",
    claimDeadline: "999999",
    finalParticipantCount: "1",
    rewardPerParticipant: "1000",
    totalAllocated: "1000",
    dustReturnToSponsor: "0",
    distributionHash: "7777",
    finalizedAt: "1000",
  },
};

export class MockMvpChainClient implements MvpChainClient {
  private deployedCounter = 0;
  private deployedAddressPrefix: string;
  private rewardStateBySurveyKey: Record<string, MockRewardState>;

  constructor(options: MockMvpChainClientOptions = {}) {
    this.deployedAddressPrefix =
      options.deployedAddressPrefix ?? "0xmock000000000000000000000000000000000000";
    this.rewardStateBySurveyKey =
      options.rewardStateBySurveyKey ?? DEFAULT_REWARD_STATE_BY_SURVEY_KEY;
  }

  async deploy(input: MvpChainDeployInput): Promise<MvpChainCommandResult> {
    this.deployedCounter += 1;

    const suffix = this.deployedCounter.toString().padStart(4, "0");
    const deployedAddress = `${this.deployedAddressPrefix}${suffix}`;

    return {
      deployedAddress,
      txHash: `0xmockdeploy${suffix}`,
      rawStdout: JSON.stringify({
        mode: "mock",
        action: "deploy",
        contractArtifact: input.contractArtifact,
        args: input.args ?? [],
        alias: input.alias ?? null,
        deployedAddress,
      }),
      rawStderr: "",
    };
  }

  async send(input: MvpChainSendInput): Promise<MvpChainCommandResult> {
    const txHash = `0xmocksend${Date.now()}`;

    return {
      txHash,
      rawStdout: JSON.stringify({
        mode: "mock",
        action: "send",
        functionName: input.functionName,
        contractAddress: input.contractAddress,
        contractArtifact: input.contractArtifact,
        args: input.args ?? [],
        txHash,
      }),
      rawStderr: "",
    };
  }

  async simulate(input: MvpChainSimulateInput): Promise<MvpChainCommandResult> {
    const surveyKey = input.args?.[0] ?? "401";
    const rewardState =
      this.rewardStateBySurveyKey[surveyKey] ??
      DEFAULT_REWARD_STATE_BY_SURVEY_KEY["401"];

    const simulationResult = this.resolveSimulationResult(
      input.functionName,
      rewardState,
    );

    return {
      simulationResult,
      rawStdout: JSON.stringify({
        mode: "mock",
        action: "simulate",
        functionName: input.functionName,
        contractAddress: input.contractAddress,
        contractArtifact: input.contractArtifact,
        args: input.args ?? [],
        simulationResult,
      }),
      rawStderr: "",
    };
  }

  private resolveSimulationResult(
    functionName: string,
    rewardState: MockRewardState,
  ): string {
    if (functionName === "get_reward_status") return rewardState.rewardStatus;
    if (functionName === "get_reward_pool_amount") return rewardState.rewardPoolAmount;
    if (functionName === "get_claim_deadline") return rewardState.claimDeadline;
    if (functionName === "get_final_participant_count") return rewardState.finalParticipantCount;
    if (functionName === "get_reward_per_participant") return rewardState.rewardPerParticipant;
    if (functionName === "get_total_allocated") return rewardState.totalAllocated;
    if (functionName === "get_dust_return_to_sponsor") return rewardState.dustReturnToSponsor;
    if (functionName === "get_distribution_hash") return rewardState.distributionHash;
    if (functionName === "get_finalized_at") return rewardState.finalizedAt;

    return "0";
  }
}
