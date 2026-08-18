import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";
const PARTICIPATION_GATE_ADDRESS = process.env.PARTICIPATION_GATE_ADDRESS || "";
const TO = process.env.TO || process.argv[2] || "";

const AGE_BUCKET = process.env.AGE_BUCKET || "";
const BIRTHDATE = process.env.BIRTHDATE || "";
const COUNTRY = process.env.COUNTRY || "";
const REGION = process.env.REGION || "";

const VALID_UNTIL = process.env.VALID_UNTIL || "999999";
const SOURCE_TAG = process.env.SOURCE_TAG || "1";
const CREDENTIAL_VERSION = process.env.CREDENTIAL_VERSION || "2";

const AZTEC_PARTICIPATION_GATE_ARTIFACT =
  process.env.AZTEC_PARTICIPATION_GATE_ARTIFACT ||
  dscopeFileURLToPath(new URL("../../../contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json", import.meta.url));

const PREDICATE_CODES_PATH =
  process.env.PREDICATE_CODES_PATH ||
  dscopeFileURLToPath(new URL("../src/domain/predicate/predicate-codes.v1.json", import.meta.url));

function requireValue(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required value: ${name}`);
  }
  return String(value).trim();
}

function normalizeAgeBucketLabel(codes, input) {
  const raw = String(input || "").trim();
  if (codes.ageBucketAliases[raw]) return codes.ageBucketAliases[raw];

  const normalized = raw.toLowerCase().replace(/\s+/g, "").replace("-", "_");
  return codes.ageBucketAliases[normalized] || "other_unknown";
}

function ageBucketFromBirthdate(birthdate, now = new Date()) {
  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return "other_unknown";

  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  const dayDiff = now.getUTCDate() - date.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  if (age >= 18 && age <= 25) return "18_25";
  if (age >= 26 && age <= 30) return "26_30";
  if (age >= 31 && age <= 35) return "31_35";
  if (age >= 36 && age <= 45) return "36_45";
  if (age >= 46 && age <= 50) return "46_50";
  if (age >= 51 && age <= 55) return "51_55";
  if (age >= 56 && age <= 60) return "56_60";
  if (age >= 61) return "61_plus";

  return "other_unknown";
}

function ageBucketBitIndex(ageBucket) {
  const map = {
    "18_25": "0",
    "26_30": "1",
    "31_35": "2",
    "36_45": "3",
    "46_50": "4",
    "51_55": "5",
    "56_60": "6",
    "61_plus": "7",
    other_unknown: "63",
  };

  return map[ageBucket] || "63";
}

function normalizeCountryAlpha2(codes, input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase();

  if (codes.countryNumericCodes[raw]) return raw;
  if (codes.countryAlpha3ToAlpha2[raw]) return codes.countryAlpha3ToAlpha2[raw];

  return "OTHER_UNKNOWN";
}

function normalize(codes) {
  const ageBucket = AGE_BUCKET
    ? normalizeAgeBucketLabel(codes, AGE_BUCKET)
    : BIRTHDATE
      ? ageBucketFromBirthdate(BIRTHDATE)
      : "other_unknown";

  const countryAlpha2 = normalizeCountryAlpha2(
    codes,
    requireValue("COUNTRY", COUNTRY),
  );
  const worldRegion = REGION
    ? String(REGION).trim().toUpperCase()
    : codes.countryRegion[countryAlpha2] || "OTHER_UNKNOWN";

  return {
    ageBucket,
    ageBucketCode:
      codes.ageBucketCodes[ageBucket] || codes.contractSemantics.otherUnknown,
    countryAlpha2,
    countryCode:
      codes.countryNumericCodes[countryAlpha2]?.fieldCode ||
      codes.contractSemantics.otherUnknown,
    worldRegion,
    worldRegionCode:
      codes.regionCodes[worldRegion] || codes.contractSemantics.otherUnknown,
  };
}

async function main() {
  const participationGateAddress = requireValue(
    "PARTICIPATION_GATE_ADDRESS",
    PARTICIPATION_GATE_ADDRESS,
  );
  const to = requireValue("TO or first CLI arg", TO);

  const codes = JSON.parse(await readFile(PREDICATE_CODES_PATH, "utf8"));
  const normalized = normalize(codes);

  console.log("Credential normalization:");
  console.log(JSON.stringify(normalized, null, 2));

  const args = [
    "send",
    "store_credential",
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    participationGateAddress,
    "--contract-artifact",
    AZTEC_PARTICIPATION_GATE_ARTIFACT,
    "--args",
    to,
    normalized.ageBucketCode,
    normalized.countryCode,
    normalized.worldRegionCode,
    String(VALID_UNTIL),
    String(SOURCE_TAG),
    String(CREDENTIAL_VERSION),
  ];

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024 * 10,
  });

  console.log(stdout);
  console.error(stderr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
