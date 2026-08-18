import { buildAnalyticsMvpResultPayload } from "../src/domain/analytics/analytics-mvp";
import { computeRewardMvpAccounting } from "../src/domain/rewards/reward-mvp";
import {
  buildFinalizationMvpPayload,
  buildFinalizationMvpContractArgs,
} from "../src/domain/finalization/finalization-mvp";

async function main() {
  const analyticsPayload = buildAnalyticsMvpResultPayload({
    surveyKey: "401",
    privacy: {
      minTotalSample: 2,
      minSegmentSample: 2,
    },
    records: [
      {
        participantRef: "p1",
        surveyKey: "401",
        valid: true,
        ageBucket: "31_35",
        country: "DE",
        region: "EUROPE",
        answers: [
          { questionId: "q1", answer: "yes" },
          { questionId: "q2", answer: "aztec" },
        ],
      },
      {
        participantRef: "p2",
        surveyKey: "401",
        valid: true,
        ageBucket: "31_35",
        country: "FR",
        region: "EUROPE",
        answers: [
          { questionId: "q1", answer: "yes" },
          { questionId: "q2", answer: "zkpassport" },
        ],
      },
    ],
  });

  const rewardAccounting = computeRewardMvpAccounting({
    rewardEnabled: true,
    rewardPoolAmount: 1000n,
    finalParticipantCount: BigInt(analyticsPayload.totalValidParticipants),
    claimDeadline: 999999n,
    finalizedAt: 1000n,
  });

  const finalizationPayload = buildFinalizationMvpPayload({
    surveyKey: "401",
    policyHash: "1001",
    generatedAt: "1000",
    analyticsPayload,
    rewardAccounting,
  });

  const contractArgs = buildFinalizationMvpContractArgs({
    payload: finalizationPayload,
    finalizedAt: "1000",
  });

  console.log(
    JSON.stringify(
      {
        finalizationPayload,
        contractArgs,
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
