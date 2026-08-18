import { AztecAddress } from "@aztec/aztec.js/addresses";

import {
  createAztecSdkConnection,
  findSdkAccount,
} from "./aztec-sdk-connection";
import type {
  MvpChainClient,
  MvpChainCommandResult,
  MvpChainDeployInput,
  MvpChainSendInput,
  MvpChainSimulateInput,
} from "./mvp-chain-client";
import type { MvpRunnerChainConfig } from "./mvp-runner-config";
import type {
  CreateSurveyMvpJobPayload,
  FinalizeSurveyMvpJobPayload,
} from "./mvp-runner-types";
import { buildPredicatePolicyContractArgsV2 } from "../predicate/predicate-v2-codecs";
import {
  buildFinalizationMvpContractArgs,
  buildFinalizationMvpPayload,
} from "../finalization/finalization-mvp";
import { computeRewardMvpAccounting } from "../rewards/reward-mvp";
import type { AnalyticsMvpResultPayload } from "../analytics/analytics-mvp";

import {
  ParticipationGateV2Contract,
  ParticipationGateV2ContractArtifact,
} from "../../../../../contracts/participation_gate_v2/src/artifacts/ParticipationGateV2";
import {
  RewardVaultMVPContract,
  RewardVaultMVPContractArtifact,
} from "../../../../../contracts/reward_vault_mvp/src/artifacts/RewardVaultMVP";
import {
  DScopeCoreContract,
  DScopeCoreContractArtifact,
} from "../../../../../contracts/dscope_core/src/artifacts/DScopeCore";
import { SurveyFactoryContract } from "../../../../../contracts/survey_factory/src/artifacts/SurveyFactory";

type TxLike = {
  receipt?: { txHash?: unknown; transactionFee?: unknown };
  txHash?: unknown;
};

export type SdkCreateSurveyBundleResult = {
  surveyId: string;
  surveyKey: string;
  chainMode: "sdk";
  contracts: {
    surveyFactoryAddress: string;
    dscopeCoreAddress: string;
    participationGateAddress: string;
    rewardVaultAddress: string;
  };
  txHashes: Record<string, string | null>;
  policy: {
    ageMode: string;
    ageMask: string;
    countryMode: string;
    countryBitmap: string[];
    debug: unknown;
  };
  reads: {
    factoryCore: string;
    factoryGate: string;
    factoryReward: string;
    factoryPolicyHash: string;
    factoryMetadataHash: string | null;
    factoryStartTime: string | null;
    factoryEndTime: string | null;
    factorySystemFinalizer: string | null;
    coreStatus: string;
    coreGate: string;
    rewardStatus: string;
  };
};

export type SdkFinalizeSurveyBundleResult = {
  surveyId: string;
  surveyKey: string;
  chainMode: "sdk";
  contracts: {
    dscopeCoreAddress: string;
    participationGateAddress: string;
    rewardVaultAddress: string;
  };
  txHashes: Record<string, string | null>;
  result: {
    resultHash: string;
    distributionHash: string;
    finalParticipantCount: string;
    analyticsPayload: AnalyticsMvpResultPayload;
    rewardPayload: unknown;
    finalizationPayload: unknown;
  };
  reward: {
    rewardStatus: "FINALIZED";
    rewardPerParticipant: string;
    totalAllocated: string;
    dustReturnToSponsor: string;
    distributionHash: string;
    finalizedAt: string;
  };
  reads: {
    participationCountBeforeFinalize: string;
    coreEndTime: string;
    coreStatus: string;
    coreResultHash: string;
    coreDistributionHash: string;
    coreFinalParticipantCount: string;
    coreFinalizedAt: string;
    rewardStatus: string;
    rewardPerParticipant: string;
    totalAllocated: string;
    dustReturnToSponsor: string;
    rewardDistributionHash: string;
    rewardFinalizedAt: string;
  };
};

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return String(value);
}

function txHashOf(value: TxLike | undefined): string | null {
  return stringify(value?.receipt?.txHash ?? value?.txHash) || null;
}

function asNumber(
  value: string | number | boolean | undefined,
  fallback: number,
): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value, got ${String(value)}`);
  }
  return parsed;
}

function asBigInt(
  value: string | number | boolean | undefined,
  fallback: bigint,
): bigint {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value ? 1n : 0n;
  return BigInt(value);
}

function asNonZeroBigInt(
  value: string | number | boolean | undefined,
  fallback: bigint,
): bigint {
  const parsed = asBigInt(value, fallback);
  if (parsed !== 0n) return parsed;
  if (fallback !== 0n) return fallback;
  return 1n;
}

function toU64Array(values: string[]): bigint[] {
  return values.map((value) => BigInt(value));
}

function parseAddress(address: string): AztecAddress {
  return AztecAddress.fromString(address);
}

async function registerDeployedContractInWallet(input: {
  connection: Awaited<ReturnType<typeof createAztecSdkConnection>>;
  address: AztecAddress;
  artifact: unknown;
  label: string;
}): Promise<void> {
  const instance = await input.connection.node.getContract(input.address);

  if (!instance) {
    throw new Error(
      `Cannot register ${input.label} in PXE: contract instance not found on Aztec node at ${input.address.toString()}`,
    );
  }

  await input.connection.wallet.registerContract(
    instance,
    input.artifact as never,
  );
}

/**
 * SDK-backed chain client for the MVP runner.
 *
 * The generic deploy/send/simulate interface is intentionally kept minimal for now.
 * The first production-grade path is createSurveyBundle(), because create_survey_mvp
 * needs strongly typed generated contract classes rather than CLI-style string parsing.
 */
export class AztecSdkChainClient implements MvpChainClient {
  constructor(private readonly config: MvpRunnerChainConfig) {}

  async deploy(_input: MvpChainDeployInput): Promise<MvpChainCommandResult> {
    throw new Error(
      "AztecSdkChainClient.deploy is not implemented as a generic string-based wrapper yet. " +
        "Use createSurveyBundle() for SDK create_survey_mvp execution.",
    );
  }

  async send(_input: MvpChainSendInput): Promise<MvpChainCommandResult> {
    throw new Error(
      "AztecSdkChainClient.send is not implemented as a generic string-based wrapper yet. " +
        "Use createSurveyBundle() for SDK create_survey_mvp execution.",
    );
  }

  async simulate(
    _input: MvpChainSimulateInput,
  ): Promise<MvpChainCommandResult> {
    throw new Error(
      "AztecSdkChainClient.simulate is not implemented as a generic string-based wrapper yet. " +
        "Reward sync/finalize SDK methods will be added after create_survey_mvp wiring.",
    );
  }

  async createSurveyBundle(
    payload: CreateSurveyMvpJobPayload,
  ): Promise<SdkCreateSurveyBundleResult> {
    const connection = await createAztecSdkConnection({
      nodeUrl: this.config.aztecNodeUrl,
      accountsToLoad: 3,
    });

    const sponsor = findSdkAccount(connection, this.config.defaultFrom);

    const surveyKey = asNumber(payload.surveyKey, Date.now());
    const metadataHash = asNonZeroBigInt(
      payload.metadataHash,
      BigInt(surveyKey + 2000),
    );
    const policyHash = asNonZeroBigInt(
      payload.predicatePolicyHash,
      BigInt(surveyKey + 1000),
    );

    const policy = buildPredicatePolicyContractArgsV2({
      ageBuckets: payload.ageBuckets,
      countries: payload.countries,
      regions: payload.regions,
    });

    const startTime = asNumber(
      payload.startTime ?? process.env.MVP_DEFAULT_SURVEY_START_TIME,
      1,
    );
    const endTime = asNumber(
      payload.endTime ?? process.env.MVP_DEFAULT_SURVEY_END_TIME,
      9_999_999_999,
    );

    if (endTime <= startTime) {
      throw new Error(
        `Invalid survey time range for ${payload.surveyId}: endTime ${endTime} <= startTime ${startTime}`,
      );
    }

    const txHashes: Record<string, string | null> = {};

    let surveyFactory: SurveyFactoryContract;
    if (this.config.surveyFactoryAddress) {
      surveyFactory = SurveyFactoryContract.at(
        parseAddress(this.config.surveyFactoryAddress),
        connection.wallet,
      );
    } else {
      const deploy = await SurveyFactoryContract.deploy(
        connection.wallet,
        sponsor.address,
        sponsor.address,
      ).send({ from: sponsor.address });
      surveyFactory = deploy.contract;
      txHashes.deploySurveyFactory = txHashOf(deploy);
    }

    let gate: ParticipationGateV2Contract;
    if (this.config.sharedParticipationGateAddress) {
      gate = ParticipationGateV2Contract.at(
        parseAddress(this.config.sharedParticipationGateAddress),
        connection.wallet,
      );
    } else {
      const deploy = await ParticipationGateV2Contract.deploy(
        connection.wallet,
        sponsor.address,
      ).send({ from: sponsor.address });
      gate = deploy.contract;
      txHashes.deployParticipationGate = txHashOf(deploy);
    }

    const gateMethods = gate.methods as any;
    if (typeof gateMethods.register_survey_window !== "function") {
      throw new Error(
        "ParticipationGateV2 artifact does not expose register_survey_window. " +
          "Compile and regenerate the Aztec 5.1.0 contract bindings before deployment.",
      );
    }

    txHashes.registerSurveyWindow = txHashOf(
      await gateMethods
        .register_survey_window(surveyKey, startTime, endTime)
        .send({ from: sponsor.address }),
    );

    if (typeof gateMethods.register_survey_policy === "function") {
      const registerSurveyPolicyTxHash = txHashOf(
        await gateMethods
          .register_survey_policy(
            surveyKey,
            policyHash,
            BigInt(policy.ageMode),
            BigInt(policy.ageMask),
            BigInt(policy.countryMode),
            toU64Array(policy.countryBitmap),
          )
          .send({ from: sponsor.address }),
      );

      txHashes.registerSurveyPolicy = registerSurveyPolicyTxHash;
      // Backwards-compatible key used by the existing D1 read-model column.
      txHashes.registerPolicyHash = registerSurveyPolicyTxHash;
    } else {
      txHashes.registerPolicyHash = txHashOf(
        await gate.methods
          .register_policy_hash(surveyKey, policyHash)
          .send({ from: sponsor.address }),
      );
      txHashes.registerAgeMode = txHashOf(
        await gate.methods
          .register_age_mode(surveyKey, BigInt(policy.ageMode))
          .send({ from: sponsor.address }),
      );
      txHashes.registerAgeMask = txHashOf(
        await gate.methods
          .register_age_mask(surveyKey, BigInt(policy.ageMask))
          .send({ from: sponsor.address }),
      );
      txHashes.registerCountryMode = txHashOf(
        await gate.methods
          .register_country_mode(surveyKey, BigInt(policy.countryMode))
          .send({ from: sponsor.address }),
      );
      txHashes.registerCountryBitmap = txHashOf(
        await gate.methods
          .register_country_bitmap(surveyKey, toU64Array(policy.countryBitmap))
          .send({ from: sponsor.address }),
      );

      if (typeof gateMethods.activate_policy_config === "function") {
        txHashes.activatePolicyConfig = txHashOf(
          await gateMethods
            .activate_policy_config(surveyKey)
            .send({ from: sponsor.address }),
        );
      }
    }

    let rewardVault: RewardVaultMVPContract;
    if (this.config.sharedRewardVaultAddress) {
      rewardVault = RewardVaultMVPContract.at(
        parseAddress(this.config.sharedRewardVaultAddress),
        connection.wallet,
      );
    } else {
      const deploy = await RewardVaultMVPContract.deploy(
        connection.wallet,
        sponsor.address,
      ).send({ from: sponsor.address });
      rewardVault = deploy.contract;
      txHashes.deployRewardVault = txHashOf(deploy);
    }

    const rewardEnabled = payload.reward.rewardEnabled ? 1 : 0;
    const rewardPoolAmount = asBigInt(payload.reward.rewardPoolAmount, 0n);
    const claimDeadline = asBigInt(
      payload.reward.claimDeadline,
      9_999_999_999n,
    );

    txHashes.registerRewardConfig = txHashOf(
      await rewardVault.methods
        .register_reward_config(
          surveyKey,
          rewardEnabled,
          rewardPoolAmount,
          claimDeadline,
        )
        .send({ from: sponsor.address }),
    );

    const minimumSampleTarget = asBigInt(
      process.env.MVP_MINIMUM_SAMPLE_TARGET,
      1n,
    );
    const analyticsMinTotalSample = asBigInt(
      process.env.MVP_ANALYTICS_MIN_TOTAL_SAMPLE,
      1n,
    );
    const analyticsMinSegmentSample = asBigInt(
      process.env.MVP_ANALYTICS_MIN_SEGMENT_SAMPLE,
      1n,
    );
    const analyticsVisibilityMode = asBigInt(
      process.env.MVP_ANALYTICS_VISIBILITY_MODE,
      1n,
    );

    const coreDeploy = await DScopeCoreContract.deploy(
      connection.wallet,
      sponsor.address,
      sponsor.address,
      sponsor.address,
      gate.address,
      surveyKey,
      metadataHash,
      policyHash,
      startTime,
      endTime,
      rewardPoolAmount,
      claimDeadline,
      rewardEnabled,
      minimumSampleTarget,
      analyticsMinTotalSample,
      analyticsMinSegmentSample,
      analyticsVisibilityMode,
    ).send({ from: sponsor.address });
    const dscopeCore = coreDeploy.contract;
    txHashes.deployDscopeCore = txHashOf(coreDeploy);

    const factoryMethods = surveyFactory.methods as any;

    const createdAt = asNumber(
      process.env.MVP_FACTORY_CREATED_AT,
      Math.floor(Date.now() / 1000),
    );

    if (typeof factoryMethods.register_survey_with_config === "function") {
      txHashes.factoryRegisterSurveyWithConfig = txHashOf(
        await factoryMethods
          .register_survey_with_config(
            surveyKey,
            dscopeCore.address,
            gate.address,
            rewardVault.address,
            policyHash,
            sponsor.address,
            metadataHash,
            startTime,
            endTime,
            sponsor.address,
            createdAt,
          )
          .send({ from: sponsor.address }),
      );
      // Backwards-compatible key used by the existing D1 read-model column.
      txHashes.factoryRegisterSurveyWithKey =
        txHashes.factoryRegisterSurveyWithConfig;
    } else if (typeof factoryMethods.register_survey_with_key === "function") {
      txHashes.factoryRegisterSurveyWithKey = txHashOf(
        await factoryMethods
          .register_survey_with_key(
            surveyKey,
            dscopeCore.address,
            gate.address,
            rewardVault.address,
            policyHash,
            sponsor.address,
            createdAt,
          )
          .send({ from: sponsor.address }),
      );
    } else {
      throw new Error(
        "SurveyFactory artifact does not expose register_survey_with_config or register_survey_with_key. " +
          "Run aztec codegen for the hardened SurveyFactory.",
      );
    }

    const { result: factoryCore } = await factoryMethods
      .get_survey_address_by_key(surveyKey)
      .simulate({ from: sponsor.address });
    const { result: factoryGate } = await factoryMethods
      .get_participation_gate_by_key(surveyKey)
      .simulate({ from: sponsor.address });
    const { result: factoryReward } = await factoryMethods
      .get_reward_vault_by_key(surveyKey)
      .simulate({ from: sponsor.address });
    const { result: factoryPolicyHash } = await factoryMethods
      .get_predicate_policy_hash_by_key(surveyKey)
      .simulate({ from: sponsor.address });

    let factoryMetadataHash: unknown = null;
    let factoryStartTime: unknown = null;
    let factoryEndTime: unknown = null;
    let factorySystemFinalizer: unknown = null;

    if (typeof factoryMethods.get_metadata_hash_by_key === "function") {
      const { result } = await factoryMethods
        .get_metadata_hash_by_key(surveyKey)
        .simulate({ from: sponsor.address });
      factoryMetadataHash = result;
    }

    if (typeof factoryMethods.get_start_time_by_key === "function") {
      const { result } = await factoryMethods
        .get_start_time_by_key(surveyKey)
        .simulate({ from: sponsor.address });
      factoryStartTime = result;
    }

    if (typeof factoryMethods.get_end_time_by_key === "function") {
      const { result } = await factoryMethods
        .get_end_time_by_key(surveyKey)
        .simulate({ from: sponsor.address });
      factoryEndTime = result;
    }

    if (typeof factoryMethods.get_system_finalizer_by_key === "function") {
      const { result } = await factoryMethods
        .get_system_finalizer_by_key(surveyKey)
        .simulate({ from: sponsor.address });
      factorySystemFinalizer = result;
    }

    const { result: coreStatus } = await dscopeCore.methods
      .get_status()
      .simulate({ from: sponsor.address });
    const { result: coreGate } = await dscopeCore.methods
      .get_participation_gate()
      .simulate({ from: sponsor.address });
    const { result: rewardStatus } = await rewardVault.methods
      .get_reward_status(surveyKey)
      .simulate({ from: sponsor.address });

    return {
      surveyId: payload.surveyId,
      surveyKey: payload.surveyKey,
      chainMode: "sdk",
      contracts: {
        surveyFactoryAddress: surveyFactory.address.toString(),
        dscopeCoreAddress: dscopeCore.address.toString(),
        participationGateAddress: gate.address.toString(),
        rewardVaultAddress: rewardVault.address.toString(),
      },
      txHashes,
      policy: {
        ageMode: policy.ageMode,
        ageMask: policy.ageMask,
        countryMode: policy.countryMode,
        countryBitmap: policy.countryBitmap,
        debug: policy.debug,
      },
      reads: {
        factoryCore: stringify(factoryCore),
        factoryGate: stringify(factoryGate),
        factoryReward: stringify(factoryReward),
        factoryPolicyHash: stringify(factoryPolicyHash),
        factoryMetadataHash:
          factoryMetadataHash === null ? null : stringify(factoryMetadataHash),
        factoryStartTime:
          factoryStartTime === null ? null : stringify(factoryStartTime),
        factoryEndTime:
          factoryEndTime === null ? null : stringify(factoryEndTime),
        factorySystemFinalizer:
          factorySystemFinalizer === null
            ? null
            : stringify(factorySystemFinalizer),
        coreStatus: stringify(coreStatus),
        coreGate: stringify(coreGate),
        rewardStatus: stringify(rewardStatus),
      },
    };
  }

  async finalizeSurveyBundle(
    payload: FinalizeSurveyMvpJobPayload,
  ): Promise<SdkFinalizeSurveyBundleResult> {
    const connection = await createAztecSdkConnection({
      nodeUrl: this.config.aztecNodeUrl,
      accountsToLoad: 3,
    });

    const operator = findSdkAccount(connection, this.config.defaultFrom);

    const surveyKey = asNumber(payload.surveyKey, Date.now());
    const policyHash = asBigInt(payload.policyHash, BigInt(surveyKey + 1000));

    const participationGateAddress = parseAddress(
      payload.participationGateAddress,
    );
    const rewardVaultAddress = parseAddress(payload.rewardVaultAddress);
    const dscopeCoreAddress = parseAddress(payload.dscopeCoreAddress);

    await registerDeployedContractInWallet({
      connection,
      address: participationGateAddress,
      artifact: ParticipationGateV2ContractArtifact,
      label: "ParticipationGateV2",
    });
    await registerDeployedContractInWallet({
      connection,
      address: rewardVaultAddress,
      artifact: RewardVaultMVPContractArtifact,
      label: "RewardVaultMVP",
    });
    await registerDeployedContractInWallet({
      connection,
      address: dscopeCoreAddress,
      artifact: DScopeCoreContractArtifact,
      label: "DScopeCore",
    });

    const participationGate = ParticipationGateV2Contract.at(
      participationGateAddress,
      connection.wallet,
    );

    const rewardVault = RewardVaultMVPContract.at(
      rewardVaultAddress,
      connection.wallet,
    );

    const dscopeCore = DScopeCoreContract.at(
      dscopeCoreAddress,
      connection.wallet,
    );

    const { result: participationCountResult } = await participationGate.methods
      .get_survey_participation_count(surveyKey)
      .simulate({ from: operator.address });

    const finalParticipantCount = asBigInt(
      stringify(participationCountResult),
      0n,
    );

    const { result: coreEndTimeResult } = await dscopeCore.methods
      .get_end_time()
      .simulate({ from: operator.address });

    const coreEndTime = asNumber(
      stringify(coreEndTimeResult),
      Math.floor(Date.now() / 1000),
    );

    const requestedCurrentTime = asNumber(
      payload.currentTime,
      Math.floor(Date.now() / 1000),
    );

    const safeCurrentTime = Math.max(requestedCurrentTime, coreEndTime);
    const finalizedAt = safeCurrentTime;

    const { result: rewardEnabledResult } = await rewardVault.methods
      .get_reward_enabled(surveyKey)
      .simulate({ from: operator.address });

    const rewardEnabled = stringify(rewardEnabledResult) === "1";

    const rewardAccounting = computeRewardMvpAccounting({
      rewardEnabled,
      rewardPoolAmount: asBigInt(payload.rewardPoolAmount, 0n),
      finalParticipantCount,
      claimDeadline: asBigInt(payload.claimDeadline, 0n),
      finalizedAt: BigInt(finalizedAt),
    });

    const incomingAnalyticsPayload =
      payload.analyticsPayload && typeof payload.analyticsPayload === "object"
        ? (payload.analyticsPayload as AnalyticsMvpResultPayload)
        : null;

    const analyticsPayload: AnalyticsMvpResultPayload =
      incomingAnalyticsPayload || {
        version: 1,
        kind: "dscope_survey_analytics_mvp",
        surveyKey: payload.surveyKey,
        totalRecords: Number(finalParticipantCount),
        totalValidParticipants: Number(finalParticipantCount),
        byAgeBucket: {},
        byCountry: {},
        byRegion: {},
        answerTotals: {},
        privacy: {
          minTotalSample: 1,
          minSegmentSample: 1,
          flags: {
            totalSampleTooSmall: false,
            suppressedAgeBuckets: [],
            suppressedCountries: [],
            suppressedRegions: [],
          },
        },
      };

    const generatedAt = new Date(finalizedAt * 1000).toISOString();

    const finalizationPayload = buildFinalizationMvpPayload({
      surveyKey: payload.surveyKey,
      policyHash: payload.policyHash,
      generatedAt,
      analyticsPayload,
      rewardAccounting,
    });

    const contractArgs = buildFinalizationMvpContractArgs({
      payload: finalizationPayload,
      finalizedAt: String(finalizedAt),
      currentTime: String(safeCurrentTime),
    });

    const txHashes: Record<string, string | null> = {};

    txHashes.finalizeRewardDistribution = txHashOf(
      await rewardVault.methods
        .finalize_reward_distribution(
          surveyKey,
          BigInt(contractArgs.finalParticipantCount),
          BigInt(contractArgs.distributionHash),
          BigInt(contractArgs.finalizedAt),
        )
        .send({ from: operator.address }),
    );

    txHashes.finalizeDscopeCore = txHashOf(
      await dscopeCore.methods
        .finalize_results(
          BigInt(contractArgs.resultHash),
          BigInt(contractArgs.distributionHash),
          BigInt(contractArgs.finalParticipantCount),
          BigInt(contractArgs.finalizedAt),
          BigInt(contractArgs.currentTime),
        )
        .send({ from: operator.address }),
    );

    const { result: coreStatus } = await dscopeCore.methods
      .get_status()
      .simulate({ from: operator.address });

    const { result: coreResultHash } = await dscopeCore.methods
      .get_result_hash()
      .simulate({ from: operator.address });

    const { result: coreDistributionHash } = await dscopeCore.methods
      .get_distribution_hash()
      .simulate({ from: operator.address });

    const { result: coreFinalParticipantCount } = await dscopeCore.methods
      .get_final_participant_count()
      .simulate({ from: operator.address });

    const { result: coreFinalizedAt } = await dscopeCore.methods
      .get_finalized_at()
      .simulate({ from: operator.address });

    const { result: rewardStatus } = await rewardVault.methods
      .get_reward_status(surveyKey)
      .simulate({ from: operator.address });

    const { result: rewardPerParticipant } = await rewardVault.methods
      .get_reward_per_participant(surveyKey)
      .simulate({ from: operator.address });

    const { result: totalAllocated } = await rewardVault.methods
      .get_total_allocated(surveyKey)
      .simulate({ from: operator.address });

    const { result: dustReturnToSponsor } = await rewardVault.methods
      .get_dust_return_to_sponsor(surveyKey)
      .simulate({ from: operator.address });

    const { result: rewardDistributionHash } = await rewardVault.methods
      .get_distribution_hash(surveyKey)
      .simulate({ from: operator.address });

    const { result: rewardFinalizedAt } = await rewardVault.methods
      .get_finalized_at(surveyKey)
      .simulate({ from: operator.address });

    return {
      surveyId: payload.surveyId,
      surveyKey: payload.surveyKey,
      chainMode: "sdk",
      contracts: {
        dscopeCoreAddress: payload.dscopeCoreAddress,
        participationGateAddress: payload.participationGateAddress,
        rewardVaultAddress: payload.rewardVaultAddress,
      },
      txHashes,
      result: {
        resultHash: contractArgs.resultHash,
        distributionHash: contractArgs.distributionHash,
        finalParticipantCount: contractArgs.finalParticipantCount,
        analyticsPayload,
        rewardPayload: finalizationPayload.rewardDistributionPayload,
        finalizationPayload,
      },
      reward: {
        rewardStatus: "FINALIZED",
        rewardPerParticipant: stringify(rewardPerParticipant),
        totalAllocated: stringify(totalAllocated),
        dustReturnToSponsor: stringify(dustReturnToSponsor),
        distributionHash: stringify(rewardDistributionHash),
        finalizedAt: stringify(rewardFinalizedAt),
      },
      reads: {
        participationCountBeforeFinalize: finalParticipantCount.toString(),
        coreEndTime: String(coreEndTime),
        coreStatus: stringify(coreStatus),
        coreResultHash: stringify(coreResultHash),
        coreDistributionHash: stringify(coreDistributionHash),
        coreFinalParticipantCount: stringify(coreFinalParticipantCount),
        coreFinalizedAt: stringify(coreFinalizedAt),
        rewardStatus: stringify(rewardStatus),
        rewardPerParticipant: stringify(rewardPerParticipant),
        totalAllocated: stringify(totalAllocated),
        dustReturnToSponsor: stringify(dustReturnToSponsor),
        rewardDistributionHash: stringify(rewardDistributionHash),
        rewardFinalizedAt: stringify(rewardFinalizedAt),
      },
    };
  }
}
