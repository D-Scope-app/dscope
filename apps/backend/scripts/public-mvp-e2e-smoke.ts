type JsonObject = Record<string, unknown>;

type ApiResponse = {
  ok?: boolean;
  error?: unknown;
  [key: string]: unknown;
};

function getApiBaseUrl(): string {
  return process.env.MVP_E2E_API_BASE_URL || "http://127.0.0.1:8787";
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const token = process.env.INTERNAL_RUNNER_TOKEN;

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
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
}): Promise<T & { __status: number }> {
  const url = `${getApiBaseUrl()}${input.path}`;

  const response = await fetch(url, {
    method: input.method,
    headers: input.method === "POST" ? buildHeaders() : undefined,
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
): Promise<T & { __status: number }> {
  return requestJson<T>({
    method: "POST",
    path,
    body,
    expectedStatus: expectedStatus ?? 200,
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

async function runLocalRunnerOnce(): Promise<void> {
  const response = await postJson<{
    ok: boolean;
    job: null | JsonObject;
  }>("/internal/runner/jobs/next", {
    runnerId: "public-mvp-e2e-smoke",
    jobTypes: ["sync_survey_mvp", "finalize_survey_mvp", "create_survey_mvp"],
  });

  assert(response.ok === true, "runner jobs/next should return ok=true");
  assert(response.job, "runner should pick a pending job");

  const job = response.job as {
    id: string;
    type: string;
    payload_json: string;
  };

  const payload = JSON.parse(job.payload_json) as JsonObject;

  const events = [
    {
      type: `${job.type}.started`,
      message: `E2E smoke started ${job.type}`,
      createdAt: new Date().toISOString(),
      data: {
        jobId: job.id,
        jobType: job.type,
        payload,
      },
    },
  ];

  if (job.type === "create_survey_mvp") {
    const surveyId = String(payload.surveyId);
    const surveyKey = String(payload.surveyKey);
    const reward = payload.reward as
      | {
          rewardEnabled?: boolean;
        }
      | undefined;

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
        rewardStatus:
          reward?.rewardEnabled === false ? "DISABLED" : "CONFIGURED",
      },
    );

    events.push({
      type: "runner.lifecycle_applied",
      message: "E2E smoke applied create-complete lifecycle",
      createdAt: new Date().toISOString(),
      data: createComplete,
    });
  } else if (job.type === "finalize_survey_mvp") {
    const surveyId = String(payload.surveyId);
    const surveyKey = String(payload.surveyKey);
    const rewardPoolAmount = String(payload.rewardPoolAmount ?? "0");
    const claimDeadline = String(payload.claimDeadline ?? "0");

    const finalizeComplete = await postJson(
      `/internal/runner/surveys/${surveyId}/finalize-complete`,
      {
        status: "finalized",
        result: {
          resultHash: `mock_result_hash_${surveyId}`,
          distributionHash: `mock_distribution_hash_${surveyId}`,
          finalParticipantCount: "1",
          analyticsPayload: {
            source: "public_mvp_e2e_smoke",
            surveyId,
            surveyKey,
            totalValidParticipants: 1,
          },
          rewardPayload: {
            source: "public_mvp_e2e_smoke",
            rewardPoolAmount,
            claimDeadline,
          },
          finalizationPayload: {
            source: "public_mvp_e2e_smoke",
            surveyId,
            surveyKey,
          },
        },
        reward: {
          rewardStatus: "FINALIZED",
          rewardPerParticipant: rewardPoolAmount,
          totalAllocated: rewardPoolAmount,
          dustReturnToSponsor: "0",
          distributionHash: `mock_distribution_hash_${surveyId}`,
          finalizedAt: new Date().toISOString(),
        },
      },
    );

    events.push({
      type: "runner.lifecycle_applied",
      message: "E2E smoke applied finalize-complete lifecycle",
      createdAt: new Date().toISOString(),
      data: finalizeComplete,
    });
  } else {
    events.push({
      type: "runner.no_lifecycle_side_effect",
      message:
        "E2E smoke did not apply lifecycle side effects for this job type",
      createdAt: new Date().toISOString(),
      data: {
        jobType: job.type,
      },
    });
  }

  const done = await postJson(`/internal/runner/jobs/${job.id}/done`, {
    events,
  });

  assert(done.ok === true, `runner job ${job.id} should be marked done`);
}

async function main() {
  const uniqueKey = String(Date.now());
  const surveyId = `survey_e2e_${uniqueKey}`;
  const surveyKey = `e2e_${uniqueKey}`;
  const participantRef = `accounts:e2e_${uniqueKey}`;
  const subjectHash = `subject_${uniqueKey}`;

  console.log(
    JSON.stringify(
      {
        step: "start",
        apiBaseUrl: getApiBaseUrl(),
        surveyId,
        surveyKey,
        participantRef,
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
      title: `D-Scope Public MVP E2E ${surveyKey}`,
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
    "created MVP survey should start as draft",
  );
  assertEqual(
    getNested(createSurvey, ["survey", "legacyCompatibility", "created"]),
    true,
    "legacy survey should be created",
  );

  console.log("✅ create survey + legacy compatibility");

  await runLocalRunnerOnce();

  const activeCard = await getJson(`/mvp/surveys/${surveyId}`);

  assert(activeCard.ok === true, "active survey card should return ok=true");
  assertEqual(
    getNested(activeCard, ["survey", "status"]),
    "active",
    "runner create should activate survey",
  );
  assertEqual(
    getNested(activeCard, ["reward", "rewardStatus"]),
    "CONFIGURED",
    "runner create should configure reward",
  );
  assert(
    getNested(activeCard, ["contracts", "participationGateAddress"]),
    "runner create should save participation gate address",
  );

  console.log("✅ runner create lifecycle");

  const verificationSessionResponse = await postJson(
    `/surveys/${surveyId}/verification-sessions`,
    {
      walletAddress: participantRef,
    },
    201,
  );

  assert(
    verificationSessionResponse.ok === true,
    "verification session should return ok=true",
  );

  const verificationSessionId = getNested<string>(verificationSessionResponse, [
    "verificationSession",
    "id",
  ]);

  assert(verificationSessionId, "verification session id should exist");

  console.log("✅ verification session created");

  const completeVerification = await postJson(
    `/verification-sessions/${verificationSessionId}/complete`,
    {
      verified: true,
      subjectHash,
      ageBucket: "31_35",
      countryBucket: "DE",
      validUntil: null,
    },
  );

  assert(
    completeVerification.ok === true,
    "complete verification should return ok=true",
  );
  assertEqual(
    getNested(completeVerification, ["policyDecision", "eligible"]),
    true,
    "policy decision should be eligible",
  );
  assertEqual(
    getNested(completeVerification, ["policyDecision", "reasonCode"]),
    "verified_and_policy_matched",
    "policy decision reason should match",
  );

  console.log("✅ verification completed + policy matched");

  const participation = await postJson(
    `/surveys/${surveyId}/participate`,
    {
      walletAddress: participantRef,
    },
    201,
  );

  assert(participation.ok === true, "participation should return ok=true");
  assert(
    getNested(participation, ["mvpParticipation", "id"]),
    "mvp participation bridge should create record",
  );
  assert(
    getNested(participation, ["eligibility", "consumed_at"]),
    "eligibility should be consumed",
  );

  console.log("✅ participate + MVP bridge");

  const beforeFinalizeView = await getJson(
    `/mvp/surveys/${surveyId}/participant-view?participantRef=${encodeURIComponent(
      participantRef,
    )}`,
  );

  assertEqual(
    getNested(beforeFinalizeView, ["participant", "hasParticipated"]),
    true,
    "participant-view should see participation",
  );
  assertEqual(
    getNested(beforeFinalizeView, ["claim", "claimStatus"]),
    "not_available_yet",
    "claim should not be available before finalize",
  );
  assertEqual(
    getNested(beforeFinalizeView, ["availability", "canClaim"]),
    false,
    "canClaim should be false before finalize",
  );

  console.log("✅ participant-view before finalize");

  const requestFinalize = await postJson(
    `/mvp/surveys/${surveyId}/request-finalize`,
    {
      finalizedAt: "1000",
      currentTime: "1000",
      rewardPoolAmount: "1000",
      claimDeadline: "999999",
      policyHash: "222",
    },
    202,
  );

  assert(requestFinalize.ok === true, "request-finalize should return ok=true");
  assert(
    getNested(requestFinalize, ["job", "id"]),
    "request-finalize should create finalize job",
  );

  console.log("✅ request finalize");

  await runLocalRunnerOnce();

  const finalizedCard = await getJson(`/mvp/surveys/${surveyId}`);

  assertEqual(
    getNested(finalizedCard, ["survey", "status"]),
    "finalized",
    "runner finalize should finalize survey",
  );
  assertEqual(
    getNested(finalizedCard, ["reward", "rewardStatus"]),
    "FINALIZED",
    "runner finalize should finalize reward",
  );
  assert(
    getNested(finalizedCard, ["result", "resultHash"]),
    "runner finalize should save result",
  );

  console.log("✅ runner finalize lifecycle");

  const afterFinalizeView = await getJson(
    `/mvp/surveys/${surveyId}/participant-view?participantRef=${encodeURIComponent(
      participantRef,
    )}`,
  );

  assertEqual(
    getNested(afterFinalizeView, ["availability", "canClaim"]),
    true,
    "canClaim should be true after finalize",
  );
  assertEqual(
    getNested(afterFinalizeView, ["claim", "claimStatus"]),
    "not_claimed",
    "claimStatus should be not_claimed after finalize",
  );
  assertEqual(
    getNested(afterFinalizeView, ["claim", "claimAmount"]),
    "1000",
    "claimAmount should be 1000",
  );

  console.log("✅ participant-view after finalize");

  const claim = await postJson(
    `/mvp/surveys/${surveyId}/claim`,
    {
      participantRef,
    },
    201,
  );

  assert(claim.ok === true, "claim should return ok=true");
  assertEqual(
    getNested(claim, ["claim", "claimStatus"]),
    "claimed",
    "claimStatus should be claimed",
  );
  assert(
    getNested(claim, ["claim", "claimTxHash"]),
    "claim tx hash should exist",
  );

  console.log("✅ claim");

  const afterClaimView = await getJson(
    `/mvp/surveys/${surveyId}/participant-view?participantRef=${encodeURIComponent(
      participantRef,
    )}`,
  );

  assertEqual(
    getNested(afterClaimView, ["availability", "canClaim"]),
    false,
    "canClaim should be false after claim",
  );
  assertEqual(
    getNested(afterClaimView, ["claim", "claimStatus"]),
    "claimed",
    "participant-view should show claimed",
  );

  console.log("✅ participant-view after claim");

  const repeatClaim = await postJson(
    `/mvp/surveys/${surveyId}/claim`,
    {
      participantRef,
    },
    409,
  );

  assertEqual(
    getNested(repeatClaim, ["error", "code"]),
    "already_claimed",
    "repeat claim should be blocked as already_claimed",
  );

  console.log("✅ repeat claim blocked");

  console.log(
    JSON.stringify(
      {
        ok: true,
        milestone: "D-Scope Public MVP local e2e smoke passed",
        surveyId,
        surveyKey,
        participantRef,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ Public MVP E2E smoke failed");
  console.error(err);
  process.exit(1);
});
