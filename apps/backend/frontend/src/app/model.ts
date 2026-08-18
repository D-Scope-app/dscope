import type {
  MvpSurveyDetail,
  MvpSurveySummary,
  ParticipantViewResponse,
  SurveyQuestion,
  SurveyStatus,
  SurveySchedule,
  SurveyLifecycle,
} from "./types";

export type Screen =
  | "home"
  | "explore"
  | "survey"
  | "results"
  | "activity"
  | "creatorAccess"
  | "creatorWorkspace"
  | "builder"
  | "admin";

export type Survey = {
  id: string;
  surveyKey: string;
  title: string;
  description: string;
  creatorName: string;
  status: SurveyStatus;
  effectiveStatus: SurveyStatus | string;
  schedule: SurveySchedule | null;
  lifecycle: SurveyLifecycle | null;
  rewardAmount: string;
  questionsCount: number;
  participants: number;
  finalParticipantCount: string | null;
  rewardStatus: string | null;
  publicReport: {
    status: "published" | "not_published";
    slug: string | null;
    url: string | null;
    shareImageUrl: string | null;
    publishedAt: string | null;
  };
  contractsReady: boolean;
  detail?: MvpSurveyDetail | null;
  source: "backend" | "sample";
};

export type CreatorProfile = {
  organization: string;
  email: string;
  website: string | null;
  logoUrl?: string | null;
  status:
    | "local_approved"
    | "pending"
    | "approved"
    | "rejected"
    | "pending_email_verification"
    | "approved_password_required"
    | "password_required"
    | "pending_approval";
  workspaceId?: string | null;
};

export type WalletConnection = {
  connected: boolean;
  source: "none" | "local_dev" | "azguard";
  accountAddress: string | null;
  participantRef: string | null;
  label: string;
};

export type SurveyStep =
  | "overview"
  | "verify"
  | "respond"
  | "sign"
  | "confirmed";
export type BuilderStep = "content" | "eligibility" | "rewards" | "review";
export type Answers = Record<string, string | string[]>;

export const LOCAL_PARTICIPANT_REF = "accounts:test3";
export const EMPTY_WALLET_CONNECTION: WalletConnection = {
  connected: false,
  source: "none",
  accountAddress: null,
  participantRef: null,
  label: "Not connected",
};
export const LOCAL_DEV_WALLET_CONNECTION: WalletConnection = {
  connected: true,
  source: "local_dev",
  accountAddress: LOCAL_PARTICIPANT_REF,
  participantRef: LOCAL_PARTICIPANT_REF,
  label: "Local dev account",
};
export const AGE_BUCKETS = [
  "18_25",
  "26_30",
  "31_35",
  "36_45",
  "46_50",
  "51_55",
  "56_60",
  "61_plus",
  "other_unknown",
];
export const COUNTRIES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
  "OTHER_UNKNOWN",
];
export const REGIONS = [
  "EUROPE",
  "EECA",
  "NORTH_AMERICA",
  "LATIN_AMERICA",
  "MENA",
  "SUB_SAHARAN_AFRICA",
  "SOUTH_ASIA",
  "SOUTHEAST_ASIA",
  "EAST_ASIA",
  "OCEANIA",
  "OTHER_UNKNOWN",
];

export const SUPPORTED_ZKPASSPORT_COUNTRIES = [
  "Austria",
  "Belgium",
  "Brazil",
  "Canada",
  "France",
  "Germany",
  "Italy",
  "Japan",
  "Netherlands",
  "Portugal",
  "Singapore",
  "South Korea",
  "Spain",
  "Switzerland",
  "United Kingdom",
  "United States",
];

export const starterQuestions: SurveyQuestion[] = [
  {
    id: "q_1",
    type: "single_choice",
    title: "Would you use privacy-preserving surveys for product research?",
    required: true,
    options: ["Yes", "No", "Not sure"],
  },
  {
    id: "q_2",
    type: "multiple_choice",
    title: "What makes a survey worth completing?",
    required: true,
    options: [
      "Short duration",
      "Clear purpose",
      "Known creator",
      "Private eligibility",
    ],
  },
  {
    id: "q_3",
    type: "short_text",
    title: "What should D-Scope improve first?",
    required: false,
    options: [],
  },
];

export function surveyFromSummary(row: MvpSurveySummary): Survey {
  const reward = row.reward ?? {
    rewardEnabled: false,
    rewardPoolAmount: "0",
    claimDeadline: null,
    rewardStatus: null,
  };

  return {
    id: row.id,
    surveyKey: row.surveyKey,
    title: row.title || row.id,
    description: row.description ?? "No description provided.",
    creatorName: row.creator?.displayName ?? row.sponsor ?? "D-Scope Creator",
    status: row.status,
    effectiveStatus:
      row.effectiveStatus ?? row.lifecycle?.effectiveStatus ?? row.status,
    schedule: row.schedule ?? null,
    lifecycle: row.lifecycle ?? null,
    rewardAmount: reward.rewardPoolAmount ?? "0",
    questionsCount: row.questionsCount ?? 0,
    participants: Number(row.participantCount ?? 0),
    finalParticipantCount: row.finalParticipantCount ?? null,
    rewardStatus: reward.rewardStatus ?? null,
    publicReport: row.publicReport ?? {
      status: "not_published",
      slug: null,
      url: null,
      shareImageUrl: null,
      publishedAt: null,
    },
    contractsReady: false,
    source: "backend",
  };
}

export function surveyFromDetail(detail: MvpSurveyDetail): Survey {
  return {
    id: detail.survey.id,
    surveyKey: detail.survey.surveyKey,
    title: detail.metadata.title || detail.survey.title || detail.survey.id,
    description: detail.metadata.description ?? "No description provided.",
    creatorName:
      detail.survey.creator?.displayName ??
      detail.survey.sponsor ??
      "D-Scope Creator",
    status: detail.survey.status,
    effectiveStatus:
      detail.survey.effectiveStatus ??
      detail.survey.lifecycle?.effectiveStatus ??
      detail.survey.status,
    schedule: detail.survey.schedule ?? null,
    lifecycle: detail.survey.lifecycle ?? null,
    rewardAmount: detail.reward?.rewardPoolAmount ?? "0",
    questionsCount: detail.metadata.questions.length,
    participants: Number(detail.result?.finalParticipantCount ?? 0),
    finalParticipantCount: detail.result?.finalParticipantCount ?? null,
    rewardStatus: detail.reward?.rewardStatus ?? null,
    publicReport: {
      status: "not_published",
      slug: null,
      url: null,
      shareImageUrl: null,
      publishedAt: null,
    },
    contractsReady: Boolean(
      detail.contracts?.dscopeCoreAddress &&
      detail.contracts?.participationGateAddress &&
      detail.contracts?.rewardVaultAddress,
    ),
    detail,
    source: "backend",
  };
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
export function uniqueSurveyKey() {
  return String(Date.now());
}
export function formatCompact(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
export function shortHash(value: string | null | undefined) {
  if (!value) return "pending";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}
export function badgeTone(status: string | null | undefined) {
  if (status === "active" || status === "done" || status === "FINALIZED")
    return "green";
  if (status === "finalized") return "blue";
  if (status === "finalization_failed") return "red";
  if (
    status === "ended" ||
    status === "finalizing" ||
    status === "draft" ||
    status === "running" ||
    status === "CONFIGURED"
  )
    return "amber";
  return "neutral";
}

export function effectiveSurveyStatus(survey: Survey): string {
  return (
    survey.effectiveStatus || survey.lifecycle?.effectiveStatus || survey.status
  );
}

export function canParticipateInSurvey(survey: Survey): boolean {
  if (survey.lifecycle) return survey.lifecycle.canParticipate === true;
  return effectiveSurveyStatus(survey) === "active";
}

export function canRequestSurveyFinalization(survey: Survey): boolean {
  if (survey.lifecycle) return survey.lifecycle.canRequestFinalization === true;
  const status = effectiveSurveyStatus(survey);
  return status === "ended" || status === "finalization_failed";
}

export function canViewSurveyResults(survey: Survey): boolean {
  if (survey.lifecycle) return survey.lifecycle.canViewResults === true;
  return effectiveSurveyStatus(survey) === "finalized";
}

export function formatTimeRemaining(
  seconds: number | null | undefined,
): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds <= 0) return "ended";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function surveyStatusLabel(
  survey: Survey,
  options?: { creator?: boolean },
): string {
  const status = effectiveSurveyStatus(survey);
  if (status === "ended") {
    return options?.creator ? "Queued for finalization" : "Ended";
  }
  if (status === "finalizing") return "Finalizing";
  if (status === "finalization_failed") return "Finalization failed";
  if (status === "finalized") return "Finalized";
  if (status === "active") return "Active";
  if (status === "draft") return "Draft";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}
