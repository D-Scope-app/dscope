export type SurveyAnswerValue = string | number | boolean;

export type SurveyAnswerRecord = {
  questionId: string;
  answer: SurveyAnswerValue;
};

export type AnalyticsMvpParticipationRecord = {
  participantRef: string;
  surveyKey: string;
  valid: boolean;
  ageBucket: string;
  country: string;
  region: string;
  answers: SurveyAnswerRecord[];
};

export type AnalyticsMvpPrivacyConfig = {
  minTotalSample: number;
  minSegmentSample: number;
};

export type AnalyticsMvpCountMap = Record<string, number>;

export type AnalyticsMvpAnswerTotals = Record<string, AnalyticsMvpCountMap>;

export type AnalyticsMvpPrivacyFlags = {
  totalSampleTooSmall: boolean;
  suppressedAgeBuckets: string[];
  suppressedCountries: string[];
  suppressedRegions: string[];
};

export type AnalyticsMvpResultPayload = {
  version: 1;
  kind: "dscope_survey_analytics_mvp";
  surveyKey: string;
  totalRecords: number;
  totalValidParticipants: number;
  byAgeBucket: AnalyticsMvpCountMap;
  byCountry: AnalyticsMvpCountMap;
  byRegion: AnalyticsMvpCountMap;
  answerTotals: AnalyticsMvpAnswerTotals;
  privacy: {
    minTotalSample: number;
    minSegmentSample: number;
    flags: AnalyticsMvpPrivacyFlags;
  };
};

function increment(map: AnalyticsMvpCountMap, key: string): void {
  const normalizedKey = normalizeBucketKey(key);
  map[normalizedKey] = (map[normalizedKey] ?? 0) + 1;
}

function normalizeBucketKey(value: string | undefined | null): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "OTHER_UNKNOWN";
  }

  return normalized.toUpperCase();
}

function normalizeAnswerValue(value: SurveyAnswerValue): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value).trim() || "EMPTY";
}

function getSuppressedKeys(
  map: AnalyticsMvpCountMap,
  minSegmentSample: number,
): string[] {
  return Object.entries(map)
    .filter(([, count]) => count > 0 && count < minSegmentSample)
    .map(([key]) => key)
    .sort();
}

export function buildAnalyticsMvpResultPayload(input: {
  surveyKey: string;
  records: AnalyticsMvpParticipationRecord[];
  privacy: AnalyticsMvpPrivacyConfig;
}): AnalyticsMvpResultPayload {
  const byAgeBucket: AnalyticsMvpCountMap = {};
  const byCountry: AnalyticsMvpCountMap = {};
  const byRegion: AnalyticsMvpCountMap = {};
  const answerTotals: AnalyticsMvpAnswerTotals = {};

  const validRecords = input.records.filter((record) => record.valid);

  for (const record of validRecords) {
    increment(byAgeBucket, record.ageBucket);
    increment(byCountry, record.country);
    increment(byRegion, record.region);

    for (const answerRecord of record.answers) {
      const questionId = String(answerRecord.questionId).trim();

      if (!questionId) {
        continue;
      }

      if (!answerTotals[questionId]) {
        answerTotals[questionId] = {};
      }

      const answerKey = normalizeAnswerValue(answerRecord.answer);
      increment(answerTotals[questionId], answerKey);
    }
  }

  const totalValidParticipants = validRecords.length;

  const privacyFlags: AnalyticsMvpPrivacyFlags = {
    totalSampleTooSmall:
      totalValidParticipants > 0 &&
      totalValidParticipants < input.privacy.minTotalSample,
    suppressedAgeBuckets: getSuppressedKeys(
      byAgeBucket,
      input.privacy.minSegmentSample,
    ),
    suppressedCountries: getSuppressedKeys(
      byCountry,
      input.privacy.minSegmentSample,
    ),
    suppressedRegions: getSuppressedKeys(
      byRegion,
      input.privacy.minSegmentSample,
    ),
  };

  return {
    version: 1,
    kind: "dscope_survey_analytics_mvp",
    surveyKey: input.surveyKey,
    totalRecords: input.records.length,
    totalValidParticipants,
    byAgeBucket,
    byCountry,
    byRegion,
    answerTotals,
    privacy: {
      minTotalSample: input.privacy.minTotalSample,
      minSegmentSample: input.privacy.minSegmentSample,
      flags: privacyFlags,
    },
  };
}

export function buildAnalyticsMvpResultEnvelope(input: {
  surveyKey: string;
  policyHash: string;
  generatedAt: string;
  payload: AnalyticsMvpResultPayload;
}) {
  return {
    version: 1,
    kind: "dscope_result_envelope_mvp",
    surveyKey: input.surveyKey,
    policyHash: input.policyHash,
    generatedAt: input.generatedAt,
    payload: input.payload,
  };
}
