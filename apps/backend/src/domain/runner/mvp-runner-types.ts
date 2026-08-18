export type MvpRunnerJobType =
  | "create_survey_mvp"
  | "finalize_survey_mvp"
  | "sync_survey_mvp";

export type MvpRunnerJobStatus = "pending" | "running" | "done" | "failed";

export type MvpRunnerJobBase<TPayload> = {
  id: string;
  type: MvpRunnerJobType;
  status: MvpRunnerJobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  payload: TPayload;
};

export type CreateSurveyMvpJobPayload = {
  surveyId: string;
  surveyKey: string;
  sponsor: string;
  metadataHash: string;
  predicatePolicyHash: string;
  durationPreset?: string;
  startTime?: number | string;
  endTime?: number | string;
  durationSeconds?: number | string;
  testMode?: boolean;
  ageBuckets: string[] | "ANY";
  countries: string[] | "ANY";
  regions: string[] | "ANY";
  reward: {
    rewardEnabled: boolean;
    rewardPoolAmount: string;
    claimDeadline: string;
  };
};

export type FinalizeSurveyMvpJobPayload = {
  surveyId: string;
  surveyKey: string;
  policyHash: string;
  participationGateAddress: string;
  dscopeCoreAddress: string;
  rewardVaultAddress: string;
  rewardPoolAmount: string;
  claimDeadline: string;
  finalizedAt: string;
  currentTime: string;
  finalParticipantCount?: string;
  analyticsPayload?: unknown;
  analyticsGeneratedAt?: string;
  finalizationPayload?: unknown;
};

export type SyncSurveyMvpJobPayload = {
  surveyId: string;
  surveyKey: string;
  dscopeCoreAddress: string;
  rewardVaultAddress?: string;
  participationGateAddress?: string;
};

export type CreateSurveyMvpJob = MvpRunnerJobBase<CreateSurveyMvpJobPayload> & {
  type: "create_survey_mvp";
};

export type FinalizeSurveyMvpJob =
  MvpRunnerJobBase<FinalizeSurveyMvpJobPayload> & {
    type: "finalize_survey_mvp";
  };

export type SyncSurveyMvpJob = MvpRunnerJobBase<SyncSurveyMvpJobPayload> & {
  type: "sync_survey_mvp";
};

export type MvpRunnerJob =
  | CreateSurveyMvpJob
  | FinalizeSurveyMvpJob
  | SyncSurveyMvpJob;

export type MvpRunnerEvent = {
  jobId: string;
  type: string;
  message: string;
  createdAt: string;
  data?: unknown;
};

export type MvpRunnerResult = {
  jobId: string;
  status: "done" | "failed";
  events: MvpRunnerEvent[];
  output?: unknown;
  error?: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function createRunnerJob<TPayload>(input: {
  id: string;
  type: MvpRunnerJobType;
  payload: TPayload;
  maxAttempts?: number;
}): MvpRunnerJobBase<TPayload> {
  const now = nowIso();

  return {
    id: input.id,
    type: input.type,
    status: "pending",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    payload: input.payload,
  };
}
