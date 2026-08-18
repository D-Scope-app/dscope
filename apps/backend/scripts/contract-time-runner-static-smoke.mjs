import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [sdk, cli] = await Promise.all([
  readFile(path.join(root, "src/domain/runner/aztec-sdk-chain-client.ts"), "utf8"),
  readFile(path.join(root, "scripts/testnet-cli-runner-once.mjs"), "utf8"),
]);

for (const source of [sdk, cli]) {
  assert.match(source, /register_survey_window/);
  assert.ok(
    source.indexOf("register_survey_window") < source.indexOf("register_survey_policy"),
    "survey window must be registered before policy activation",
  );
}

assert.match(sdk, /endTime <= startTime/);
assert.match(cli, /BigInt\(endTime\) <= BigInt\(startTime\)/);

console.log("CONTRACT_TIME_RUNNER_STATIC_SMOKE_PASSED");
