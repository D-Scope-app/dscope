import { createAztecSdkConnection } from "../src/domain/runner/aztec-sdk-connection";

import { ParticipationGateV2Contract } from "../../../contracts/participation_gate_v2/src/artifacts/ParticipationGateV2";
import { RewardVaultMVPContract } from "../../../contracts/reward_vault_mvp/src/artifacts/RewardVaultMVP";
import { DScopeCoreContract } from "../../../contracts/dscope_core/src/artifacts/DScopeCore";
import { SurveyFactoryContract } from "../../../contracts/survey_factory/src/artifacts/SurveyFactory";

type TxLike = {
  receipt?: { txHash?: unknown; transactionFee?: unknown };
  txHash?: unknown;
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

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }

  return parsed;
}

async function main() {
  const connection = await createAztecSdkConnection({ accountsToLoad: 3 });
  const sponsor = connection.accounts[0];
  const respondent = connection.accounts[1];

  const surveyKey = envNumber(
    "SDK_SMOKE_SURVEY_KEY",
    700000 + Math.floor(Date.now() / 1000) % 100000,
  );
  const policyHash = envNumber("SDK_SMOKE_POLICY_HASH", surveyKey + 1000);
  const metadataHash = envNumber("SDK_SMOKE_METADATA_HASH", surveyKey + 2000);
  const createdAt = envNumber("SDK_SMOKE_CREATED_AT", Math.floor(Date.now() / 1000));

  const ageModeAllowlist = 1;
  const ageMask31_35 = 4;
  const countryModeAllowlist = 1;
  const countryBitmapDE = [
    0, 0, 0, 0, 1048576, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];

  const startTime = 1;
  const endTime = 9_999_999_999;
  const rewardPoolAmount = 1000;
  const claimDeadline = 9_999_999_999;
  const rewardEnabled = 1;
  const minimumSampleTarget = 1;
  const analyticsMinTotalSample = 1;
  const analyticsMinSegmentSample = 1;
  const analyticsVisibilityMode = 1;

  const txHashes: Record<string, string | null> = {};

  console.log(
    JSON.stringify(
      {
        step: "start",
        nodeUrl: connection.nodeUrl,
        sponsor: sponsor.addressString,
        respondent: respondent.addressString,
        surveyKey,
        policyHash,
      },
      null,
      2,
    ),
  );

  const surveyFactoryDeploy = await SurveyFactoryContract.deploy(
    connection.wallet,
    sponsor.address,
    sponsor.address,
  ).send({ from: sponsor.address });
  const surveyFactory = surveyFactoryDeploy.contract;
  txHashes.deploySurveyFactory = txHashOf(surveyFactoryDeploy);
  console.log("✅ SurveyFactory deployed", surveyFactory.address.toString());

  const gateDeploy = await ParticipationGateV2Contract.deploy(
    connection.wallet,
    sponsor.address,
  ).send({ from: sponsor.address });
  const gate = gateDeploy.contract;
  txHashes.deployParticipationGate = txHashOf(gateDeploy);
  console.log("✅ ParticipationGateV2 deployed", gate.address.toString());

  txHashes.registerSurveyWindow = txHashOf(
    await gate.methods
      .register_survey_window(surveyKey, startTime, endTime)
      .send({ from: sponsor.address }),
  );
  txHashes.registerPolicyHash = txHashOf(
    await gate.methods.register_policy_hash(surveyKey, policyHash).send({ from: sponsor.address }),
  );
  txHashes.registerAgeMode = txHashOf(
    await gate.methods.register_age_mode(surveyKey, ageModeAllowlist).send({ from: sponsor.address }),
  );
  txHashes.registerAgeMask = txHashOf(
    await gate.methods.register_age_mask(surveyKey, ageMask31_35).send({ from: sponsor.address }),
  );
  txHashes.registerCountryMode = txHashOf(
    await gate.methods.register_country_mode(surveyKey, countryModeAllowlist).send({ from: sponsor.address }),
  );
  txHashes.registerCountryBitmap = txHashOf(
    await gate.methods.register_country_bitmap(surveyKey, countryBitmapDE).send({ from: sponsor.address }),
  );
  txHashes.activatePolicyConfig = txHashOf(
    await gate.methods.activate_policy_config(surveyKey).send({ from: sponsor.address }),
  );
  console.log("✅ Gate policy registered");

  const rewardVaultDeploy = await RewardVaultMVPContract.deploy(
    connection.wallet,
    sponsor.address,
  ).send({ from: sponsor.address });
  const rewardVault = rewardVaultDeploy.contract;
  txHashes.deployRewardVault = txHashOf(rewardVaultDeploy);
  console.log("✅ RewardVaultMVP deployed", rewardVault.address.toString());

  txHashes.registerRewardConfig = txHashOf(
    await rewardVault.methods
      .register_reward_config(surveyKey, rewardEnabled, rewardPoolAmount, claimDeadline)
      .send({ from: sponsor.address }),
  );
  console.log("✅ Reward config registered");

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
  console.log("✅ DScopeCore deployed", dscopeCore.address.toString());

  const factoryMethods = surveyFactory.methods as any;
  if (typeof factoryMethods.register_survey_with_key !== "function") {
    throw new Error(
      "SurveyFactory artifact does not expose register_survey_with_key. " +
        "Run aztec codegen for the hardened SurveyFactory before running this smoke.",
    );
  }

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
  console.log("✅ Survey registered in SurveyFactory");

  const issuedCredential = await gate.methods
    .store_credential(
      respondent.address,
      2, // age bucket 31_35
      276, // DE country bucket
      1,
      9_999_999_999,
      999,
      1,
    )
    .send({ from: sponsor.address });
  txHashes.storeCredential = txHashOf(issuedCredential);
  console.log("✅ Credential stored for respondent");

  txHashes.participate = txHashOf(
    await gate.methods.participate(surveyKey, policyHash, createdAt + 1).send({ from: respondent.address }),
  );
  console.log("✅ Respondent participated");

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
  const { result: gateParticipationCount } = await gate.methods
    .get_survey_participation_count(surveyKey)
    .simulate({ from: sponsor.address });
  const { result: coreStatus } = await dscopeCore.methods.get_status().simulate({ from: sponsor.address });
  const { result: coreGate } = await dscopeCore.methods
    .get_participation_gate()
    .simulate({ from: sponsor.address });
  const { result: rewardStatus } = await rewardVault.methods
    .get_reward_status(surveyKey)
    .simulate({ from: sponsor.address });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "sdk",
        nodeUrl: connection.nodeUrl,
        surveyKey,
        policyHash,
        accounts: {
          sponsor: sponsor.addressString,
          respondent: respondent.addressString,
        },
        contracts: {
          surveyFactory: surveyFactory.address.toString(),
          participationGate: gate.address.toString(),
          rewardVault: rewardVault.address.toString(),
          dscopeCore: dscopeCore.address.toString(),
        },
        txHashes,
        reads: {
          factoryCore: stringify(factoryCore),
          factoryGate: stringify(factoryGate),
          factoryReward: stringify(factoryReward),
          factoryPolicyHash: stringify(factoryPolicyHash),
          gateParticipationCount: stringify(gateParticipationCount),
          coreStatus: stringify(coreStatus),
          coreGate: stringify(coreGate),
          rewardStatus: stringify(rewardStatus),
        },
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
