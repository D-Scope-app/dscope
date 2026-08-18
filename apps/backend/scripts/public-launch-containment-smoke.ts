import assert from "node:assert/strict";

import worker from "../src/index";
import { handleInternalAdminRoutes } from "../src/routes/internal-admin-routes";
import { handleInternalRunnerRoutes } from "../src/routes/internal-runner-routes";
import {
  isDisabledLegacyOrchestrationPath,
  isPublicParticipationSubmissionPath,
  isRewardEndpointPath,
  isUnauthenticatedParticipantReadPath,
  isUnsafeClientVerificationCompletionPath,
  isUnsafeRewardsRuntimeConfig,
  validateRewardsDisabledPayload,
} from "../src/security/public-launch-policy";

const noDatabaseAccess = {
  prepare() {
    throw new Error("database access was not expected in this negative test");
  },
} as never;

const surveyLookupOnlyDatabase = {
  prepare(query: string) {
    return {
      bind() {
        return this;
      },
      async first() {
        if (query.includes("FROM mvp_surveys")) {
          return {
            id: "s1",
            survey_key: "1",
            sponsor: "creator@example.com",
            title: "Survey",
            status: "ended",
            metadata_hash: "1",
            predicate_policy_hash: "1",
            creator_workspace_id: "workspace-owner",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        throw new Error(`unexpected database query: ${query}`);
      },
    };
  },
} as never;

async function responseJson(response: Response | null) {
  assert(response, "expected a response");
  return (await response.json()) as Record<string, any>;
}

async function main() {
  assert.deepEqual(validateRewardsDisabledPayload({}), { ok: true });
  assert.deepEqual(
    validateRewardsDisabledPayload({
      rewardEnabled: false,
      rewardPoolAmount: "0",
      claimDeadline: "0",
    }),
    { ok: true },
  );
  assert.equal(
    validateRewardsDisabledPayload({ rewardEnabled: true }).ok,
    false,
  );
  assert.equal(
    validateRewardsDisabledPayload({ rewardEnabled: "true" }).ok,
    false,
  );
  assert.equal(
    validateRewardsDisabledPayload({ rewardEnabled: "unexpected" }).ok,
    false,
  );
  assert.equal(
    validateRewardsDisabledPayload({ rewardPoolAmount: "1" }).ok,
    false,
  );
  assert.equal(
    validateRewardsDisabledPayload({ reward: { claimDeadline: "999" } }).ok,
    false,
  );
  assert.equal(isUnsafeRewardsRuntimeConfig("true"), true);
  assert.equal(isUnsafeRewardsRuntimeConfig("false"), false);
  assert.equal(isRewardEndpointPath("/mvp/surveys/s1/claim"), true);
  assert.equal(
    isRewardEndpointPath("/mvp/surveys/s1/reward-status"),
    true,
  );
  assert.equal(isDisabledLegacyOrchestrationPath("/db-check"), true);
  assert.equal(
    isDisabledLegacyOrchestrationPath("/surveys/s1/participate"),
    true,
  );
  assert.equal(
    isDisabledLegacyOrchestrationPath("/surveys/s1/predicate-aggregates"),
    true,
  );
  assert.equal(
    isDisabledLegacyOrchestrationPath(
      "/surveys/s1/verification-sessions",
    ),
    false,
  );
  assert.equal(
    isUnsafeClientVerificationCompletionPath(
      "/verification-sessions/session-1/complete",
    ),
    true,
  );
  assert.equal(
    isPublicParticipationSubmissionPath("/mvp/surveys/s1/responses"),
    true,
  );
  assert.equal(
    isUnauthenticatedParticipantReadPath(
      "/mvp/participants/wallet-1/activity",
    ),
    true,
  );
  assert.equal(
    isUnauthenticatedParticipantReadPath(
      "/mvp/surveys/s1/participant-view",
    ),
    true,
  );

  const unsafeConfigResponse = await worker.fetch(
    new Request("https://app.dscope.app/mvp/health"),
    {
      dscope_db: noDatabaseAccess,
      REWARDS_ENABLED: "true",
    },
  );
  assert.equal(unsafeConfigResponse.status, 503);
  assert.equal(
    (await unsafeConfigResponse.json() as any).error.code,
    "unsafe_rewards_configuration",
  );

  const publicConfigResponse = await worker.fetch(
    new Request("https://app.dscope.app/mvp/config"),
    { dscope_db: noDatabaseAccess, REWARDS_ENABLED: "false" },
  );
  assert.equal(publicConfigResponse.status, 200);
  const publicConfig = await publicConfigResponse.json() as any;
  assert.equal(publicConfig.features.rewards, false);
  assert.equal(publicConfig.features.zkPassportVerification, false);
  assert.equal(publicConfig.features.publicParticipation, false);
  assert.equal(publicConfig.features.serverValidatedVerification, false);

  const legacyResponse = await worker.fetch(
    new Request("https://app.dscope.app/surveys/s1/participate", {
      method: "POST",
    }),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(legacyResponse.status, 410);
  assert.equal(
    (await legacyResponse.json() as any).error.code,
    "legacy_endpoint_disabled",
  );

  const emptyCountryAllowlist = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surveyKey: "123",
        rewardEnabled: false,
        rewardPoolAmount: "0",
        claimDeadline: "0",
        predicatePolicyJson: {
          version: 1,
          predicateSource: "zkpassport",
          age: { mode: "any", min: null, buckets: [] },
          countries: { mode: "allow_list", values: [] },
          regions: { mode: "any", values: [] },
          freshness: { mode: "any", days: null },
        },
      }),
    }),
    { dscope_db: noDatabaseAccess, REWARDS_ENABLED: "false" },
  );
  assert.equal(emptyCountryAllowlist.status, 400);
  assert.equal(
    (await emptyCountryAllowlist.json() as any).error.code,
    "invalid_predicate_policy",
  );

  const unsafeVerificationCompletion = await worker.fetch(
    new Request(
      "https://app.dscope.app/verification-sessions/session-1/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verified: true, subjectHash: "client-value" }),
      },
    ),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(unsafeVerificationCompletion.status, 503);
  assert.equal(
    (await unsafeVerificationCompletion.json() as any).error.code,
    "server_verification_required",
  );

  const unsafeResponseSubmission = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys/s1/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantRef: "wallet", answers: {} }),
    }),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(unsafeResponseSubmission.status, 503);
  assert.equal(
    (await unsafeResponseSubmission.json() as any).error.code,
    "server_verification_required",
  );

  for (const pathname of [
    "/mvp/participants/wallet-1/activity",
    "/mvp/surveys/s1/participant-view?participantRef=wallet-1",
  ]) {
    const participantRead = await worker.fetch(
      new Request(`https://app.dscope.app${pathname}`),
      { dscope_db: noDatabaseAccess },
    );
    assert.equal(participantRead.status, 503);
    assert.equal(
      (await participantRead.json() as any).error.code,
      "participant_wallet_auth_required",
    );
  }

  const unauthenticatedCreate = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surveyKey: "123" }),
    }),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(unauthenticatedCreate.status, 401);
  assert.equal(
    (await unauthenticatedCreate.json() as any).error.code,
    "creator_login_required",
  );

  const finalizeWithReward = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys/s1/request-finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rewardPoolAmount: "1" }),
    }),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(finalizeWithReward.status, 400);
  assert.equal(
    (await finalizeWithReward.json() as any).error.code,
    "rewards_not_supported_in_v1",
  );

  const unauthenticatedFinalize = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys/s1/request-finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rewardPoolAmount: "0", claimDeadline: "0" }),
    }),
    { dscope_db: surveyLookupOnlyDatabase },
  );
  assert.equal(unauthenticatedFinalize.status, 401);
  assert.equal(
    (await unauthenticatedFinalize.json() as any).error.code,
    "creator_login_required",
  );

  const rewardClaim = await worker.fetch(
    new Request("https://app.dscope.app/mvp/surveys/s1/claim", {
      method: "POST",
    }),
    { dscope_db: noDatabaseAccess },
  );
  assert.equal(rewardClaim.status, 410);
  assert.equal(
    (await rewardClaim.json() as any).error.code,
    "rewards_unavailable_in_v1",
  );

  const adminWithRunnerToken = await handleInternalAdminRoutes(
    new Request("https://app.dscope.app/internal/mvp/creator-applications", {
      headers: { authorization: "Bearer runner-only" },
    }),
    {
      dscope_db: noDatabaseAccess,
      INTERNAL_ADMIN_TOKEN: "admin-only",
    },
  );
  assert.equal(adminWithRunnerToken?.status, 401);
  assert.equal(
    (await responseJson(adminWithRunnerToken)).error.code,
    "internal_admin_unauthorized",
  );

  const adminWithAdminToken = await handleInternalAdminRoutes(
    new Request("https://app.dscope.app/internal/mvp/not-a-route", {
      headers: { authorization: "Bearer admin-only" },
    }),
    {
      dscope_db: noDatabaseAccess,
      INTERNAL_ADMIN_TOKEN: "admin-only",
    },
  );
  assert.equal(adminWithAdminToken?.status, 404);
  assert.equal(
    (await responseJson(adminWithAdminToken)).error.code,
    "internal_admin_route_not_found",
  );

  const runnerWithAdminToken = await handleInternalRunnerRoutes(
    new Request("https://app.dscope.app/internal/runner/jobs", {
      headers: { authorization: "Bearer admin-only" },
    }),
    {
      dscope_db: noDatabaseAccess,
      INTERNAL_RUNNER_TOKEN: "runner-only",
    },
  );
  assert.equal(runnerWithAdminToken?.status, 401);
  assert.equal(
    (await responseJson(runnerWithAdminToken)).error.code,
    "internal_runner_unauthorized",
  );

  const runnerWithRunnerToken = await handleInternalRunnerRoutes(
    new Request("https://app.dscope.app/internal/runner/not-a-route", {
      headers: { authorization: "Bearer runner-only" },
    }),
    {
      dscope_db: noDatabaseAccess,
      INTERNAL_RUNNER_TOKEN: "runner-only",
    },
  );
  assert.equal(runnerWithRunnerToken?.status, 404);
  assert.equal(
    (await responseJson(runnerWithRunnerToken)).error.code,
    "internal_runner_route_not_found",
  );

  console.log("public launch containment smoke: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
