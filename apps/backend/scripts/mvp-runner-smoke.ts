import { executeMvpRunnerJob } from "../src/domain/runner/mvp-runner-executor";
import {
  createRunnerJob,
  type FinalizeSurveyMvpJob,
} from "../src/domain/runner/mvp-runner-types";

async function main() {
  const job = createRunnerJob({
    id: "job_finalize_401_smoke",
    type: "finalize_survey_mvp",
    payload: {
      surveyId: "survey_401",
      surveyKey: "401",
      policyHash: "1001",
      participationGateAddress:
        "0x11bfef4aee4980e252b3a33eaa2b1916c22f90a5151c6248e77e644d9bce6c0e",
      dscopeCoreAddress: "0xDSCOPE_CORE_PLACEHOLDER",
      rewardVaultAddress: "0xREWARD_VAULT_PLACEHOLDER",
      rewardPoolAmount: "1000",
      claimDeadline: "999999",
      finalizedAt: "1000",
      currentTime: "1000",
    },
  }) as FinalizeSurveyMvpJob;

  const result = await executeMvpRunnerJob(job);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
