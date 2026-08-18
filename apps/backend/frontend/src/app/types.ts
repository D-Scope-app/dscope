export type SurveyStatus =
  | "active"
  | "ended"
  | "finalizing"
  | "finalized"
  | "draft"
  | "cancelled"
  | "failed";

export type SurveySchedule = {
  startTime: number | null;
  endTime: number | null;
  startTimeIso: string | null;
  endTimeIso: string | null;
  timeRemainingSeconds: number | null;
};

export type SurveyLifecycle = {
  storedStatus: string;
  effectiveStatus: SurveyStatus | string;
  hasStarted: boolean;
  hasEnded: boolean;
  canParticipate: boolean;
  canRequestFinalization: boolean;
  canViewResults: boolean;
};
export type QuestionType = "single_choice" | "multiple_choice" | "short_text";
export type SurveyDurationPreset =
  | "1h"
  | "24h"
  | "3d"
  | "7d"
  | "14d"
  | "30d"
  | "15m_test";

export type SurveyQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[];
};

export type SurveyPredicatePolicyV1 = {
  version: 1;
  predicateSource: "zkpassport";
  age: { mode: "any" | "bucket_in"; min: null; buckets: string[] };
  countries: { mode: "any" | "allow_list"; values: string[] };
  regions: { mode: "any" | "allow_list"; values: string[] };
  freshness: { mode: "any"; days: null };
};

export type CreateMvpSurveyBody = {
  surveyId: string;
  surveyKey: string;
  sponsor: string;
  creatorWorkspaceId?: string | null;
  creatorDisplayName?: string | null;
  operatorAddress?: string | null;
  createdByOperator?: boolean;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  predicatePolicyHash: string;
  predicatePolicyJson: SurveyPredicatePolicyV1;
  rewardEnabled: boolean;
  rewardPoolAmount: string;
  claimDeadline: string;
  durationPreset: SurveyDurationPreset;
  testMode?: boolean;
  startTime?: number;
  endTime?: number;
  analyticsMinTotalSample: string;
  analyticsMinSegmentSample: string;
};

export type MvpCreatorRef = {
  workspaceId: string | null;
  displayName: string;
  createdByOperator: boolean;
  operatorAddress: string | null;
};

export type MvpPublicReportRef = {
  status: "published" | "not_published";
  slug: string | null;
  url: string | null;
  shareImageUrl: string | null;
  publishedAt: string | null;
};

export type MvpSurveySummary = {
  id: string;
  surveyKey: string;
  sponsor: string | null;
  creator?: MvpCreatorRef;
  title: string;
  description: string | null;
  status: SurveyStatus;
  effectiveStatus?: SurveyStatus | string;
  schedule?: SurveySchedule | null;
  lifecycle?: SurveyLifecycle | null;
  metadataHash: string | null;
  predicatePolicyHash: string | null;
  questionsCount: number;
  reward: {
    rewardEnabled: boolean;
    rewardPoolAmount: string;
    claimDeadline: string | null;
    rewardStatus: string | null;
  };
  eligibilitySummary: {
    mode: string;
    policyHash: string | null;
  };
  participantCount: number;
  finalParticipantCount: string | null;
  publicReport?: MvpPublicReportRef;
  createdAt: string;
  updatedAt: string;
};

export type MvpSurveyDetail = {
  ok: boolean;
  survey: {
    id: string;
    surveyKey: string;
    sponsor: string | null;
    creator?: MvpCreatorRef;
    title: string | null;
    status: SurveyStatus;
    effectiveStatus?: SurveyStatus | string;
    schedule?: SurveySchedule | null;
    lifecycle?: SurveyLifecycle | null;
    metadataHash: string | null;
    predicatePolicyHash: string | null;
    predicatePolicyJson?: SurveyPredicatePolicyV1 | null;
    createdAt: string;
    updatedAt: string;
  };
  metadata: {
    title: string;
    description: string | null;
    questions: SurveyQuestion[];
    createdAt: string;
    updatedAt: string;
  };
  contracts: null | {
    surveyFactoryAddress?: string | null;
    dscopeCoreAddress: string | null;
    participationGateAddress: string | null;
    rewardVaultAddress: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  reward: null | {
    rewardEnabled: boolean;
    rewardPoolAmount: string;
    claimDeadline: string | null;
    rewardStatus: string | null;
    rewardPerParticipant: string | null;
    totalAllocated: string | null;
    dustReturnToSponsor: string | null;
    distributionHash: string | null;
    finalizedAt: string | null;
  };
  result: null | {
    resultHash: string | null;
    distributionHash: string | null;
    finalParticipantCount: string | null;
    analyticsPayload: unknown;
    rewardPayload?: unknown;
    finalizationPayload?: unknown;
  };
  runner: {
    jobs: Array<{
      id: string;
      type: string;
      status: string;
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      created_at: string;
      updated_at: string;
      finished_at: string | null;
    }>;
    events: unknown[];
  };
};

export type CreateMvpSurveyResponse = {
  ok: boolean;
  survey: {
    id: string;
    surveyKey: string;
    sponsor: string;
    creator?: MvpCreatorRef;
    title: string;
    status: SurveyStatus;
    metadataHash: string;
    predicatePolicyHash: string;
    ageBuckets: string[] | "ANY";
    countries: string[] | "ANY";
    regions: string[] | "ANY";
    schedule?: {
      durationPreset: SurveyDurationPreset | "custom";
      startTime: number;
      endTime: number;
      durationSeconds: number;
      testMode: boolean;
    };
    metadata: {
      title: string;
      description: string | null;
      questions: SurveyQuestion[];
    };
    reward: {
      rewardEnabled: boolean;
      rewardPoolAmount: string;
      claimDeadline: string | null;
    };
    createdAt: string;
    updatedAt: string;
  };
  job: unknown;
};

export type CredentialIssueResult = {
  status: "issued" | "queued" | "pending" | "running" | "skipped" | "failed";
  reason?: string | null;
  jobId?: string | null;
  txHash?: string | null;
  participationGateAddress?: string | null;
  to?: string | null;
  issuer?: string | null;
  credential?: unknown;
  normalized?: unknown;
  issuedAt?: string | null;
  updatedAt?: string | null;
};

export type ParticipationPlan = {
  nextAction:
    | "verify_eligibility"
    | "credential_pending"
    | "wallet_participate"
    | "already_participated"
    | "not_ready";
  reason?: string | null;
  contractCall?: null | {
    target: string | null;
    method: string;
    args: {
      surveyKey: string;
      policyHash: string | null;
      currentTime: string;
    };
  };
};

export type ParticipantPauseStatus = {
  paused: boolean;
  scope: "global" | "survey" | null;
  reason: string | null;
  message: string | null;
  globalPaused: boolean;
  surveyPaused: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type ParticipantSystemStatus = {
  credentialBacklogLevel: "normal" | "queued" | "high_demand";
  credentialPendingJobs: number;
  credentialRunningJobs: number;
  oldestPendingCredentialJobAt: string | null;
  credentialServiceAlive: boolean;
  credentialServiceStatus: string | null;
  credentialServiceLastSeenAt: string | null;
  credentialServiceAgeSeconds: number | null;
  participationPause?: ParticipantPauseStatus | null;
};

export type CompleteVerificationSessionResponse = {
  ok: boolean;
  verificationSession?: unknown;
  predicateOutcome?: unknown;
  eligibility?: {
    eligibility_status?: string;
    reason_code?: string | null;
    [key: string]: unknown;
  } | null;
  normalized?: {
    verified?: boolean;
    subjectHash?: string;
    ageBucket?: string;
    countryBucket?: string;
    worldRegion?: string;
    validUntil?: string | null;
    [key: string]: unknown;
  };
  policyDecision?: {
    eligible?: boolean;
    reasonCode?: string | null;
    [key: string]: unknown;
  };
  credentialIssue?: CredentialIssueResult;
  participation?: {
    surveyId: string;
    surveyKey: string;
    policyHash: string | null;
    participantAddress: string;
    participationGateAddress: string | null;
  };
};

export type ParticipantViewResponse = {
  ok: boolean;
  participant: {
    participantRef: string;
    hasParticipated: boolean;
    eligibleForReward: boolean;
    participationStatus: string;
    participatedAt: string | null;
    participationTxHash: string | null;
  };
  survey: {
    id: string;
    surveyKey: string;
    title: string | null;
    status: SurveyStatus;
    effectiveStatus?: SurveyStatus | string;
    schedule?: SurveySchedule | null;
    lifecycle?: SurveyLifecycle | null;
    sponsor: string | null;
  };
  availability: {
    canParticipate: boolean;
    canViewResults: boolean;
    canClaim: boolean;
  };
  systemStatus?: ParticipantSystemStatus | null;
  contracts: null | {
    dscopeCoreAddress: string | null;
    participationGateAddress: string | null;
    rewardVaultAddress: string | null;
  };
  credentialIssue?: CredentialIssueResult | null;
  participationPlan?: ParticipationPlan | null;
  reward: null | {
    rewardEnabled: boolean;
    rewardStatus: string | null;
    rewardPoolAmount: string;
    rewardPerParticipant: string | null;
    totalAllocated: string | null;
    dustReturnToSponsor: string | null;
    claimDeadline: string | null;
    finalizedAt: string | null;
  };
  claim: {
    claimStatus: string;
    claimAmount: string;
    claimDeadline: string | null;
    claimTxHash: string | null;
    claimedAt: string | null;
    source: string;
  };
  result: null | {
    resultHash: string | null;
    distributionHash: string | null;
    finalParticipantCount: string | null;
    analyticsPayload: unknown;
  };
  runner: {
    latestJob: null | {
      id: string;
      type: string;
      status: string;
      lastError: string | null;
    };
  };
};

export type CreatorApplicationStatus = "pending" | "approved" | "rejected";

export type CreatorApplication = {
  id: string;
  organizationName: string;
  contactEmail: string;
  contactName: string | null;
  website: string | null;
  description: string | null;
  requestedWalletAddress: string | null;
  logoUrl?: string | null;
  emailVerifiedAt?: string | null;
  status: CreatorApplicationStatus;
  reviewNote: string | null;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type CreatorWorkspace = {
  id: string;
  applicationId: string | null;
  organizationName: string;
  contactEmail: string;
  contactName: string | null;
  website: string | null;
  description: string | null;
  logoUrl?: string | null;
  creatorAccountId?: string | null;
  ownerWalletAddress: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type CreatorAccount = {
  id: string;
  email: string;
  status: string;
  emailVerifiedAt: string | null;
  passwordSet: boolean;
  lastLoginAt: string | null;
  profile: null | {
    organizationName: string;
    contactName: string | null;
    website: string | null;
    description: string | null;
    logoUrl: string | null;
  };
};

export type CreatorAuthResponse = {
  ok: true;
  account: CreatorAccount;
  workspace: CreatorWorkspace | null;
  application: CreatorApplication | null;
};

export type CreatorRegisterResponse = {
  ok: true;
  status: string;
  email: string;
  verificationEmailSent?: boolean;
  devVerificationUrl?: string | null;
  approvalEmailSent?: boolean;
  devPasswordSetupUrl?: string | null;
  account: CreatorAccount;
  application: CreatorApplication | null;
};

export type CreatorVerifyEmailResponse = {
  ok: true;
  status: "email_verified";
  setupToken: string;
  expiresAt: string;
};

export type CreatorStatusResponse = {
  ok: true;
  email: string;
  status:
    | "none"
    | CreatorApplicationStatus
    | "pending_email_verification"
    | "approved_password_required"
    | "password_required"
    | "pending_approval";
  account?: CreatorAccount | null;
  application: CreatorApplication | null;
  workspace: CreatorWorkspace | null;
};

export type CreatorApplyResponse = {
  ok: true;
  status?: "pending" | "already_pending" | "already_approved";
  application?: CreatorApplication | null;
  workspace?: CreatorWorkspace | null;
};

export type CreatorWorkspaceResponse = {
  ok: true;
  workspace: CreatorWorkspace | null;
  surveys: MvpSurveySummary[];
  application?: CreatorApplication | null;
};

export type ParticipantActivityResponse = {
  ok: true;
  participant: {
    participantRef: string;
    profileSource: string;
  };
  summary: {
    completedSurveys: number;
    claimableRewardsCount: number;
    totalClaimableAmount: string;
    totalPoints: number;
  };
  activity: Array<{
    survey: {
      id: string;
      surveyKey: string;
      title: string;
      status: SurveyStatus;
    };
    participation: {
      status: string;
      eligibleForReward: boolean;
      participatedAt: string | null;
      participationTxHash: string | null;
    };
    reward: {
      rewardEnabled: boolean;
      rewardStatus: string | null;
      rewardPerParticipant: string | null;
    };
    claim: {
      claimStatus: string;
      claimAmount: string;
      claimTxHash: string | null;
      claimedAt: string | null;
    };
    result: {
      resultHash: string | null;
      finalParticipantCount: string | null;
    };
  }>;
};

export type InternalCreatorApplicationsResponse = {
  ok: true;
  filters: { status: string; limit: number; offset: number };
  applications: CreatorApplication[];
};

export type InternalRunnerJobsResponse = {
  ok: true;
  filters: { status: string; type: string; limit: number; offset: number };
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    surveyId: string | null;
    surveyKey: string | null;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    lockedAt: string | null;
    lockedBy: string | null;
    finishedAt: string | null;
  }>;
};
