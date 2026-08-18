type JsonObject = Record<string, unknown>;

type ApiResponse = {
  ok?: boolean;
  error?: unknown;
  code?: string;
  [key: string]: unknown;
};

function getApiBaseUrl(): string {
  return process.env.MVP_E2E_API_BASE_URL || "http://127.0.0.1:8787";
}

function getRunnerToken(): string {
  return process.env.INTERNAL_RUNNER_TOKEN || "dev_runner_secret";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected ${JSON.stringify(
        expected,
      )}, got ${JSON.stringify(actual)}`,
    );
  }
}

function getNested<T = unknown>(
  value: unknown,
  path: Array<string | number>,
): T | undefined {
  let current: unknown = value;

  for (const part of path) {
    if (
      current === null ||
      current === undefined ||
      (typeof current !== "object" && !Array.isArray(current))
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[String(part)];
  }

  return current as T | undefined;
}

async function requestJson<T = ApiResponse>(input: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  expectedStatus?: number | number[];
  headers?: Record<string, string>;
}): Promise<T & { __status: number }> {
  const response = await fetch(`${getApiBaseUrl()}${input.path}`, {
    method: input.method,
    headers:
      input.method === "POST"
        ? {
            "content-type": "application/json",
            ...(input.headers ?? {}),
          }
        : input.headers,
    body:
      input.method === "POST" && input.body !== undefined
        ? JSON.stringify(input.body)
        : undefined,
  });

  const text = await response.text();

  let data: unknown;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const expectedStatuses = Array.isArray(input.expectedStatus)
    ? input.expectedStatus
    : [input.expectedStatus ?? 200];

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${input.method} ${input.path} failed with ${response.status}: ${JSON.stringify(
        data,
        null,
        2,
      )}`,
    );
  }

  return {
    ...(data as T),
    __status: response.status,
  };
}

async function postJson<T = ApiResponse>(
  path: string,
  body: unknown,
  expectedStatus?: number | number[],
  headers?: Record<string, string>,
): Promise<T & { __status: number }> {
  return requestJson<T>({
    method: "POST",
    path,
    body,
    expectedStatus: expectedStatus ?? 200,
    headers,
  });
}

async function getJson<T = ApiResponse>(
  path: string,
  expectedStatus?: number | number[],
): Promise<T & { __status: number }> {
  return requestJson<T>({
    method: "GET",
    path,
    expectedStatus: expectedStatus ?? 200,
  });
}

async function runCreateRunnerOnceWithToken(): Promise<void> {
  const nextJob = await postJson<{
    ok: boolean;
    job: null | {
      id: string;
      type: string;
      payload_json: string;
    };
  }>(
    "/internal/runner/jobs/next",
    {
      runnerId: "public-mvp-negative-smoke",
      jobTypes: ["create_survey_mvp"],
    },
    200,
    {
      Authorization: `Bearer ${getRunnerToken()}`,
    },
  );

  assert(nextJob.ok === true, "runner jobs/next should return ok=true");
  assert(nextJob.job, "runner should pick create_survey_mvp job");
  assertEqual(
    nextJob.job.type,
    "create_survey_mvp",
    "picked job should be create_survey_mvp",
  );

  const job = nextJob.job;
  const payload = JSON.parse(job.payload_json) as JsonObject;

  const surveyId = String(payload.surveyId);
  const surveyKey = String(payload.surveyKey);

  const createComplete = await postJson(
    `/internal/runner/surveys/${surveyId}/create-complete`,
    {
      status: "active",
      contracts: {
        surveyFactoryAddress: `0xmock_factory_${surveyKey}`,
        dscopeCoreAddress: `0xmock_core_${surveyKey}`,
        participationGateAddress: `0xmock_gate_${surveyKey}`,
        rewardVaultAddress: `0xmock_reward_${surveyKey}`,
      },
      rewardStatus: "CONFIGURED",
    },
    200,
    {
      Authorization: `Bearer ${getRunnerToken()}`,
    },
  );

  assert(createComplete.ok === true, "create-complete should return ok=true");

  const done = await postJson(
    `/internal/runner/jobs/${job.id}/done`,
    {
      events: [
        {
          type: "negative_smoke.create_completed",
          message: "Negative smoke activated survey",
          createdAt: new Date().toISOString(),
          data: {
            surveyId,
            surveyKey,
          },
        },
      ],
    },
    200,
    {
      Authorization: `Bearer ${getRunnerToken()}`,
    },
  );

  assert(done.ok === true, "runner job should be marked done");
}

async function createVerificationSession(input: {
  surveyId: string;
  walletAddress: string;
}): Promise<string> {
  const response = await postJson(
    `/surveys/${input.surveyId}/verification-sessions`,
    {
      walletAddress: input.walletAddress,
    },
    201,
  );

  assert(response.ok === true, "verification session should return ok=true");

  const sessionId = getNested<string>(response, ["verificationSession", "id"]);

  assert(sessionId, "verification session id should exist");

  return sessionId;
}

async function completeVerification(input: {
  sessionId: string;
  subjectHash: string;
  ageBucket: string;
  countryBucket: string;
}) {
  return postJson(
    `/verification-sessions/${input.sessionId}/complete`,
    {
      verified: true,
      subjectHash: input.subjectHash,
      ageBucket: input.ageBucket,
      countryBucket: input.countryBucket,
      validUntil: null,
    },
    200,
  );
}

async function main() {
  const uniqueKey = String(Date.now());
  const surveyId = `survey_neg_${uniqueKey}`;
  const surveyKey = `neg_${uniqueKey}`;

  const deWallet = `accounts:de_pass_${uniqueKey}`;
  const ruWallet = `accounts:ru_fail_${uniqueKey}`;

  console.log(
    JSON.stringify(
      {
        step: "start",
        apiBaseUrl: getApiBaseUrl(),
        surveyId,
        surveyKey,
        deWallet,
        ruWallet,
      },
      null,
      2,
    ),
  );

  const createSurvey = await postJson(
    "/mvp/surveys",
    {
      surveyId,
      surveyKey,
      sponsor: "accounts:test0",
      title: `D-Scope Negative Smoke ${surveyKey}`,
      metadataHash: "111",
      predicatePolicyHash: "222",
      ageBuckets: ["31_35"],
      countries: "ANY",
      regions: ["EUROPE"],
      reward: {
        rewardEnabled: true,
        rewardPoolAmount: "1000",
        claimDeadline: "999999",
      },
    },
    201,
  );

  assert(createSurvey.ok === true, "create survey should return ok=true");
  assertEqual(
    getNested(createSurvey, ["survey", "status"]),
    "draft",
    "created survey should start as draft",
  );

  console.log("✅ create negative-test survey");

  await runCreateRunnerOnceWithToken();

  const activeCard = await getJson(`/mvp/surveys/${surveyId}`);

  assertEqual(
    getNested(activeCard, ["survey", "status"]),
    "active",
    "runner should activate negative-test survey",
  );

  console.log("✅ runner create with token");

  const deSessionId = await createVerificationSession({
    surveyId,
    walletAddress: deWallet,
  });

  const deComplete = await completeVerification({
    sessionId: deSessionId,
    subjectHash: `subject_de_pass_${uniqueKey}`,
    ageBucket: "31_35",
    countryBucket: "DE",
  });

  assertEqual(
    getNested(deComplete, ["policyDecision", "eligible"]),
    true,
    "DE should be eligible for EUROPE policy",
  );
  assertEqual(
    getNested(deComplete, ["normalized", "worldRegion"]),
    "EUROPE",
    "DE should normalize to EUROPE",
  );

  console.log("✅ DE / EUROPE positive control");

  const ruSessionId = await createVerificationSession({
    surveyId,
    walletAddress: ruWallet,
  });

  const ruComplete = await completeVerification({
    sessionId: ruSessionId,
    subjectHash: `subject_ru_fail_${uniqueKey}`,
    ageBucket: "31_35",
    countryBucket: "RU",
  });

  assertEqual(
    getNested(ruComplete, ["policyDecision", "eligible"]),
    false,
    "RU should be rejected for EUROPE-only policy",
  );
  assertEqual(
    getNested(ruComplete, ["policyDecision", "reasonCode"]),
    "region_policy_mismatch",
    "RU rejection should be region_policy_mismatch",
  );
  assertEqual(
    getNested(ruComplete, ["eligibility", "eligibility_status"]),
    "rejected",
    "RU eligibility status should be rejected",
  );

  const ruRegion = getNested<string>(ruComplete, ["normalized", "worldRegion"]);
  assert(
    ruRegion && ruRegion !== "EUROPE",
    `RU worldRegion should not be EUROPE, got ${ruRegion}`,
  );

  console.log("✅ RU / EUROPE rejection");

  const ruParticipate = await postJson(
    `/surveys/${surveyId}/participate`,
    {
      walletAddress: ruWallet,
    },
    409,
  );

  assertEqual(
    ruParticipate.code,
    "not_eligible",
    "RU participate should be blocked with not_eligible",
  );

  console.log("✅ rejected participant cannot participate");

  const internalNoToken = await postJson(
    "/internal/runner/jobs/next",
    {
      runnerId: "attacker",
      jobTypes: ["create_survey_mvp"],
    },
    401,
  );

  assertEqual(
    getNested(internalNoToken, ["error", "code"]),
    "internal_runner_unauthorized",
    "internal runner without token should be unauthorized",
  );

  console.log("✅ internal runner without token blocked");

  const manualParticipationNoToken = await postJson(
    `/mvp/surveys/${surveyId}/participation-records`,
    {
      participantRef: "attacker",
    },
    401,
  );

  assertEqual(
    getNested(manualParticipationNoToken, ["error", "code"]),
    "internal_endpoint_unauthorized",
    "manual participation-records without token should be unauthorized",
  );

  console.log("✅ manual participation-records without token blocked");

  const manualRewardClaimNoToken = await postJson(
    `/mvp/surveys/${surveyId}/reward-claims`,
    {
      participantRef: "attacker",
      claimStatus: "claimed",
      claimAmount: "999999",
    },
    401,
  );

  assertEqual(
    getNested(manualRewardClaimNoToken, ["error", "code"]),
    "internal_endpoint_unauthorized",
    "manual reward-claims without token should be unauthorized",
  );

  console.log("✅ manual reward-claims without token blocked");

  console.log(
    JSON.stringify(
      {
        ok: true,
        milestone: "D-Scope Public MVP negative smoke passed",
        surveyId,
        surveyKey,
        checks: [
          "DE eligible for EUROPE",
          "RU rejected for EUROPE",
          "rejected user cannot participate",
          "internal runner requires token",
          "manual participation-records requires token",
          "manual reward-claims requires token",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ Public MVP negative smoke failed");
  console.error(err);
  process.exit(1);
});
