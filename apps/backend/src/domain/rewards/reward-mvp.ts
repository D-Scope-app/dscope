export type RewardMvpStatus =
  | "disabled"
  | "not_finalized"
  | "no_valid_participants"
  | "finalized";

export type RewardMvpInput = {
  rewardEnabled: boolean;
  rewardPoolAmount: bigint;
  finalParticipantCount: bigint;
  claimDeadline: bigint;
  finalizedAt: bigint;
};

export type RewardMvpAccounting = {
  status: RewardMvpStatus;
  rewardEnabled: boolean;
  rewardPoolAmount: string;
  finalParticipantCount: string;
  rewardPerParticipant: string;
  totalAllocated: string;
  dustReturnToSponsor: string;
  claimDeadline: string;
  finalizedAt: string;
};

export function computeRewardMvpAccounting(
  input: RewardMvpInput,
): RewardMvpAccounting {
  const rewardPoolAmount = input.rewardPoolAmount;
  const finalParticipantCount = input.finalParticipantCount;

  if (!input.rewardEnabled) {
    return {
      status: "disabled",
      rewardEnabled: false,
      rewardPoolAmount: rewardPoolAmount.toString(),
      finalParticipantCount: finalParticipantCount.toString(),
      rewardPerParticipant: "0",
      totalAllocated: "0",
      dustReturnToSponsor: rewardPoolAmount.toString(),
      claimDeadline: input.claimDeadline.toString(),
      finalizedAt: input.finalizedAt.toString(),
    };
  }

  if (input.finalizedAt <= 0n) {
    return {
      status: "not_finalized",
      rewardEnabled: true,
      rewardPoolAmount: rewardPoolAmount.toString(),
      finalParticipantCount: finalParticipantCount.toString(),
      rewardPerParticipant: "0",
      totalAllocated: "0",
      dustReturnToSponsor: rewardPoolAmount.toString(),
      claimDeadline: input.claimDeadline.toString(),
      finalizedAt: input.finalizedAt.toString(),
    };
  }

  if (finalParticipantCount <= 0n) {
    return {
      status: "no_valid_participants",
      rewardEnabled: true,
      rewardPoolAmount: rewardPoolAmount.toString(),
      finalParticipantCount: finalParticipantCount.toString(),
      rewardPerParticipant: "0",
      totalAllocated: "0",
      dustReturnToSponsor: rewardPoolAmount.toString(),
      claimDeadline: input.claimDeadline.toString(),
      finalizedAt: input.finalizedAt.toString(),
    };
  }

  const rewardPerParticipant = rewardPoolAmount / finalParticipantCount;
  const totalAllocated = rewardPerParticipant * finalParticipantCount;
  const dustReturnToSponsor = rewardPoolAmount - totalAllocated;

  return {
    status: "finalized",
    rewardEnabled: true,
    rewardPoolAmount: rewardPoolAmount.toString(),
    finalParticipantCount: finalParticipantCount.toString(),
    rewardPerParticipant: rewardPerParticipant.toString(),
    totalAllocated: totalAllocated.toString(),
    dustReturnToSponsor: dustReturnToSponsor.toString(),
    claimDeadline: input.claimDeadline.toString(),
    finalizedAt: input.finalizedAt.toString(),
  };
}
