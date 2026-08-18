import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildCredentialContractArgsV2 } from "../src/domain/predicate/predicate-v2-codecs";

const execFileAsync = promisify(execFile);

async function main() {
  const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
  const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";

  const PARTICIPATION_GATE_V2_ADDRESS =
    process.env.PARTICIPATION_GATE_V2_ADDRESS ||
    "0x0996d108675ba1d0302b89624f6c8b7f7d6c0a0df04b3019bb932ffb02ac1862";

  const AZTEC_CONTRACT_ARTIFACT =
    process.env.AZTEC_CONTRACT_ARTIFACT ||
    dscopeFileURLToPath(new URL("../../../contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json", import.meta.url));

  const to = process.env.TO || "accounts:test1";
  const ageBucket = process.env.AGE_BUCKET || "31_35";
  const country = process.env.COUNTRY || "RU";
  const worldRegion = process.env.WORLD_REGION || undefined;
  const validUntil = process.env.VALID_UNTIL || "999999";
  const sourceTag = process.env.SOURCE_TAG || "1";
  const credentialVersion = process.env.CREDENTIAL_VERSION || "2";

  const credential = buildCredentialContractArgsV2({
    ageBucket,
    country,
    worldRegion,
    validUntil,
    sourceTag,
    credentialVersion,
  });

  console.log("Credential v2 normalization:");
  console.log(JSON.stringify(credential, null, 2));

  const args = [
    "send",
    "store_credential",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    PARTICIPATION_GATE_V2_ADDRESS,
    "--contract-artifact",
    AZTEC_CONTRACT_ARTIFACT,
    "--args",
    to,
    credential.ageBucketIndex,
    credential.countryCode,
    credential.worldRegionIndex,
    credential.validUntil,
    credential.sourceTag,
    credential.credentialVersion,
  ];

  console.log("\nRunning:");
  console.log(`aztec-wallet ${args.join(" ")}`);

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024 * 10,
  });

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
