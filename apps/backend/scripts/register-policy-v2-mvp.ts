import { fileURLToPath as dscopeFileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import predicateCodes from "../src/domain/predicate/predicate-codes.v1.json";
import { buildPredicatePolicyContractArgsV2 } from "../src/domain/predicate/predicate-v2-codecs";

const execFileAsync = promisify(execFile);

const REGION_COUNTRY_FALLBACK: Record<string, string[]> = {
  EUROPE: [
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
  ],
  EECA: [
    "AM",
    "AZ",
    "BY",
    "GE",
    "KZ",
    "KG",
    "MD",
    "RU",
    "TJ",
    "TM",
    "UA",
    "UZ",
  ],
};

function parseSelection(value: string | undefined): string[] | "ANY" {
  if (!value) return "ANY";

  const normalized = value.trim();

  if (!normalized || normalized.toUpperCase() === "ANY") {
    return "ANY";
  }

  return normalized
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function getCountriesByRegions(regions: string[] | "ANY"): string[] {
  if (regions === "ANY") return [];

  const countryRegion = (predicateCodes as any).countryRegion ?? {};
  const wantedRegions = new Set(
    regions.map((region) => region.trim().toUpperCase()),
  );

  const countries = new Set<string>();

  for (const [alpha2, rawRegion] of Object.entries<any>(countryRegion)) {
    const normalizedAlpha2 = String(alpha2).trim().toUpperCase();
    const entryRegion = String(rawRegion ?? "")
      .trim()
      .toUpperCase();

    if (wantedRegions.has(entryRegion)) {
      countries.add(normalizedAlpha2);
    }
  }

  for (const region of wantedRegions) {
    const fallbackCountries = REGION_COUNTRY_FALLBACK[region] ?? [];

    for (const country of fallbackCountries) {
      countries.add(country.trim().toUpperCase());
    }
  }

  return Array.from(countries).sort();
}

function mergeCountries(
  directCountries: string[] | "ANY",
  regionCountries: string[],
): string[] | "ANY" {
  if (directCountries === "ANY" && regionCountries.length === 0) {
    return "ANY";
  }

  const merged = new Set<string>();

  if (directCountries !== "ANY") {
    for (const country of directCountries) {
      merged.add(country.trim().toUpperCase());
    }
  }

  for (const country of regionCountries) {
    merged.add(country.trim().toUpperCase());
  }

  return Array.from(merged).sort();
}

async function runAztecWalletSend(
  functionName: string,
  functionArgs: string[],
) {
  const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || "http://localhost:8080";
  const AZTEC_FROM_ALIAS = process.env.AZTEC_FROM_ALIAS || "accounts:test0";

  const PARTICIPATION_GATE_V2_ADDRESS =
    process.env.PARTICIPATION_GATE_V2_ADDRESS || process.env.PG_V2;

  if (!PARTICIPATION_GATE_V2_ADDRESS) {
    throw new Error("Missing PARTICIPATION_GATE_V2_ADDRESS or PG_V2");
  }

  const AZTEC_CONTRACT_ARTIFACT =
    process.env.AZTEC_CONTRACT_ARTIFACT ||
    dscopeFileURLToPath(new URL("../../../contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json", import.meta.url));

  const args = [
    "send",
    functionName,
    "--node-url",
    AZTEC_NODE_URL,
    "--from",
    AZTEC_FROM_ALIAS,
    "--contract-address",
    PARTICIPATION_GATE_V2_ADDRESS,
    "--contract-artifact",
    AZTEC_CONTRACT_ARTIFACT,
    "--args",
    ...functionArgs,
  ];

  console.log("\nRunning:");
  console.log(`aztec-wallet ${args.join(" ")}`);

  const { stdout, stderr } = await execFileAsync("aztec-wallet", args, {
    maxBuffer: 1024 * 1024 * 20,
  });

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
}

async function main() {
  const surveyKey = process.env.SURVEY_KEY || "401";
  const policyHash = process.env.POLICY_HASH || "1001";

  const ageBuckets = parseSelection(process.env.AGE_BUCKETS);
  const directCountries = parseSelection(process.env.COUNTRIES);
  const selectedRegions = parseSelection(process.env.REGIONS);

  const regionCountries = getCountriesByRegions(selectedRegions);

  if (selectedRegions !== "ANY" && regionCountries.length === 0) {
    throw new Error(
      `Selected regions ${selectedRegions.join(
        ",",
      )} expanded to 0 countries. Refusing to fallback to ANY.`,
    );
  }

  const finalCountries = mergeCountries(directCountries, regionCountries);

  if (selectedRegions !== "ANY" && finalCountries === "ANY") {
    throw new Error(
      `Selected regions ${selectedRegions.join(
        ",",
      )} unexpectedly produced ANY country policy.`,
    );
  }

  console.log("MVP policy input:");
  console.log(
    JSON.stringify(
      {
        surveyKey,
        policyHash,
        ageBuckets,
        directCountries,
        selectedRegions,
        regionCountriesCount: regionCountries.length,
        regionCountries,
        finalCountries,
      },
      null,
      2,
    ),
  );

  const policy = buildPredicatePolicyContractArgsV2({
    ageBuckets,
    countries: finalCountries,
    regions: "ANY",
  });

  console.log("\nMVP policy contract args:");
  console.log(JSON.stringify(policy, null, 2));

  const countryBitmapArg = `[${policy.countryBitmap.join(",")}]`;

  await runAztecWalletSend("register_policy_hash", [surveyKey, policyHash]);

  await runAztecWalletSend("register_age_mode", [surveyKey, policy.ageMode]);

  await runAztecWalletSend("register_age_mask", [surveyKey, policy.ageMask]);

  await runAztecWalletSend("register_country_mode", [
    surveyKey,
    policy.countryMode,
  ]);

  await runAztecWalletSend("register_country_bitmap", [
    surveyKey,
    countryBitmapArg,
  ]);

  console.log("\nMVP policy registration completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
