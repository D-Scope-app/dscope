import { executeMvpRunnerJob } from "../src/domain/runner/mvp-runner-executor";
import { MockMvpChainClient } from "../src/domain/runner/mock-mvp-chain-client";
import {
  createRunnerJob,
  type SyncSurveyMvpJob,
} from "../src/domain/runner/mvp-runner-types";

async function main() {
  const job = createRunnerJob({
    id: "job_sync_401_mock_smoke",
    type: "sync_survey_mvp",
    payload: {
      surveyId: "survey_401",
      surveyKey: "401",
      dscopeCoreAddress: "0xDSCOPE_CORE_PLACEHOLDER",
      rewardVaultAddress: "0xREWARD_VAULT_MOCK",
      participationGateAddress: "0xPARTICIPATION_GATE_MOCK",
    },
  }) as SyncSurveyMvpJob;

  const result = await executeMvpRunnerJob(job, {
    chainClient: new MockMvpChainClient(),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
