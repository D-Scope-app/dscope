import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { CliAztecChainClient } from "./cli-aztec-chain-client";
import type { MvpChainClient } from "./mvp-chain-client";
import { MockMvpChainClient } from "./mock-mvp-chain-client";
import { AztecSdkChainClient } from "./aztec-sdk-chain-client";

export type MvpRunnerChainMode = "mock" | "cli" | "sdk";

export type MvpRunnerArtifactConfig = {
  participationGateV2: string;
  dscopeCore: string;
  surveyFactory: string;
  rewardVaultMvp: string;
};

export type MvpRunnerChainConfig = {
  mode: MvpRunnerChainMode;
  defaultFrom: string;
  aztecNodeUrl?: string;
  surveyFactoryAddress?: string;
  sharedParticipationGateAddress?: string;
  sharedRewardVaultAddress?: string;
  artifacts: MvpRunnerArtifactConfig;
};

const DEFAULT_PROJECT_ROOT = dscopeFileURLToPath(new URL("../../../../../", import.meta.url));

function env(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMode(value: string | undefined): MvpRunnerChainMode {
  if (value === "mock" || value === "cli" || value === "sdk") {
    return value;
  }

  return "mock";
}

export function getDefaultMvpRunnerChainConfig(): MvpRunnerChainConfig {
  const projectRoot = env("D_SCOPE_PROJECT_ROOT") ?? DEFAULT_PROJECT_ROOT;

  return {
    mode: normalizeMode(env("MVP_CHAIN_MODE")),
    defaultFrom: env("AZTEC_FROM_ALIAS") ?? "accounts:test0",
    aztecNodeUrl: env("AZTEC_NODE_URL"),
    surveyFactoryAddress: env("SURVEY_FACTORY_ADDRESS"),
    sharedParticipationGateAddress: env("PARTICIPATION_GATE_ADDRESS"),
    sharedRewardVaultAddress: env("REWARD_VAULT_MVP_ADDRESS"),
    artifacts: {
      participationGateV2:
        env("PARTICIPATION_GATE_V2_ARTIFACT") ??
        `${projectRoot}/contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json`,
      dscopeCore:
        env("DSCOPE_CORE_ARTIFACT") ??
        `${projectRoot}/contracts/dscope_core/target/dscope_core-DScopeCore.json`,
      surveyFactory:
        env("SURVEY_FACTORY_ARTIFACT") ??
        `${projectRoot}/contracts/survey_factory/target/survey_factory-SurveyFactory.json`,
      rewardVaultMvp:
        env("REWARD_VAULT_MVP_ARTIFACT") ??
        `${projectRoot}/contracts/reward_vault_mvp/target/reward_vault_mvp-RewardVaultMVP.json`,
    },
  };
}

export function createMvpChainClientFromConfig(
  config: MvpRunnerChainConfig,
): MvpChainClient {
  if (config.mode === "mock") {
    return new MockMvpChainClient();
  }

  if (config.mode === "cli") {
    return new CliAztecChainClient();
  }

  return new AztecSdkChainClient(config);
}

export function createMvpChainClientFromEnv(): MvpChainClient {
  return createMvpChainClientFromConfig(getDefaultMvpRunnerChainConfig());
}
