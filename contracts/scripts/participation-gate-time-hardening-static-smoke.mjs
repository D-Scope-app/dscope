import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(
  path.join(root, "participation_gate_v2/src/main.nr"),
  "utf8",
);

assert.match(source, /fn register_survey_window\(/);
assert.match(source, /survey_start_time_by_key/);
assert.match(source, /survey_end_time_by_key/);
assert.match(source, /let current_time = self\.context\.timestamp\(\);/);
assert.match(source, /assert\(current_time >= start_time, "survey has not started"\);/);
assert.match(source, /assert\(current_time < end_time, "survey has ended"\);/);
assert.match(source, /credential_note\.valid_until >= survey_end_time/);
assert.doesNotMatch(source, /credential_note\.valid_until >= current_time/);
assert.match(source, /policy_configured == POLICY_CONFIGURED/);
assert.match(
  source,
  /self\.enqueue_self\._validate_window_and_increment_participation_count\(survey_key\);/,
);

console.log("PARTICIPATION_GATE_TIME_HARDENING_STATIC_SMOKE_PASSED");
