import { executeMvpRunnerJob } from "../src/domain/runner/mvp-runner-executor";
import {
  createRunnerJob,
  type SyncSurveyMvpJob,
} from "../src/domain/runner/mvp-runner-types";

async function main() {
  const rewardVaultAddress = process.env.REWARD_VAULT_MVP;

  if (!rewardVaultAddress) {
    throw new Error("Missing REWARD_VAULT_MVP env var");
  }

  const job = createRunnerJob({
    id: "job_sync_401_smoke",
    type: "sync_survey_mvp",
    payload: {
      surveyId: "survey_401",
      surveyKey: "401",
      dscopeCoreAddress: "0xDSCOPE_CORE_PLACEHOLDER",
      rewardVaultAddress,
      participationGateAddress:
        process.env.PARTICIPATION_GATE_V2_ADDRESS ||
        "0xPARTICIPATION_GATE_PLACEHOLDER",
    },
  }) as SyncSurveyMvpJob;

  const result = await executeMvpRunnerJob(job);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
