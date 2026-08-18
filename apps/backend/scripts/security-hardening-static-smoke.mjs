import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [admin, runner, survey, verification, creator, creatorUi, app, model, migration] =
  await Promise.all([
    read("src/routes/internal-admin-routes.ts"),
    read("src/routes/internal-runner-routes.ts"),
    read("src/routes/mvp-survey-routes.ts"),
    read("src/routes/verification.ts"),
    read("src/routes/mvp-creator-routes.ts"),
    read("frontend/src/app/pages/CreatorPages.tsx"),
    read("frontend/src/app/App.tsx"),
    read("frontend/src/app/model.ts"),
    read("migrations/0022_verification_session_rate_limits.sql"),
  ]);

assert.match(admin, /hasValidBearerToken\(request, env\.INTERNAL_ADMIN_TOKEN\)/);
assert.doesNotMatch(admin, /hasValidBearerToken\(request, env\.INTERNAL_RUNNER_TOKEN\)/);
assert.match(runner, /hasValidBearerToken\(request, env\.INTERNAL_RUNNER_TOKEN\)/);
assert.match(survey, /hasValidBearerToken\(request, env\.INTERNAL_RUNNER_TOKEN\)/);
assert.match(survey, /invalid_predicate_policy/);
assert.match(verification, /consumeVerificationSessionRateLimit/);
assert.match(verification, /verification_session_rate_limited/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS verification_session_rate_limits/);
assert.match(creator, /request-password-reset/);
assert.match(creator, /confirm-password-reset/);
assert.match(creator, /purpose = 'password_reset'/);
assert.match(creator, /UPDATE mvp_creator_sessions[\s\S]*SET revoked_at/);
assert.match(creatorUi, /Forgot password/);
assert.match(creatorUi, /creatorReset/);
assert.doesNotMatch(app, /sampleSurvey/);
assert.doesNotMatch(model, /export const sampleSurvey/);

console.log("SECURITY_HARDENING_STATIC_SMOKE_PASSED");
