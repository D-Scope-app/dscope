/**
 * @deprecated Use predicate-v2-codecs.ts for ParticipationGateV2 contract args.
 * Kept temporarily for old scripts/backward compatibility.
 */

import predicateCodes from "./predicate-codes.v1.json" with { type: "json" };

export const POLICY_MODE_ANY = 0;
export const POLICY_MODE_ALLOWLIST = 1;

export const COUNTRY_BITMAP_CHUNKS = 16;
export const COUNTRY_BITMAP_CHUNK_SIZE = 64;

export type PolicyMode = typeof POLICY_MODE_ANY | typeof POLICY_MODE_ALLOWLIST;

export type AgeBucket =
  | "18_25"
  | "26_30"
  | "31_35"
  | "36_45"
  | "46_50"
  | "51_55"
  | "56_60"
  | "61_plus"
  | "other_unknown";

export type WorldRegion =
  | "EUROPE"
  | "NORTH_AMERICA"
  | "LATIN_AMERICA"
  | "MENA"
  | "SUB_SAHARAN_AFRICA"
  | "SOUTH_ASIA"
  | "EECA"
  | "SOUTHEAST_ASIA"
  | "EAST_ASIA"
  | "OCEANIA"
  | "OTHER_UNKNOWN";

export type PredicatePolicySelectionV1 = {
  ageBuckets?: string[] | "ANY";
  countries?: string[] | "ANY";
  regions?: string[] | "ANY";
};

export type PredicatePolicyBitmapV1 = {
  version: 1;

  ageMode: PolicyMode;
  ageMask: string;

  regionMode: PolicyMode;
  regionMask: string;

  countryMode: PolicyMode;
  countryBitmap: string[];

  debug: {
    normalizedAgeBuckets: string[];
    normalizedRegions: string[];
    normalizedCountries: Array<{
      input: string;
      alpha2: string;
      numericCode: number;
      chunkIndex: number;
      bitIndex: number;
    }>;
  };
};

const AGE_BUCKET_BIT: Record<AgeBucket, number> = {
  "18_25": 0,
  "26_30": 1,
  "31_35": 2,
  "36_45": 3,
  "46_50": 4,
  "51_55": 5,
  "56_60": 6,
  "61_plus": 7,
  other_unknown: 63,
};

const REGION_BIT: Record<WorldRegion, number> = {
  EUROPE: 0,
  NORTH_AMERICA: 1,
  LATIN_AMERICA: 2,
  MENA: 3,
  SUB_SAHARAN_AFRICA: 4,
  SOUTH_ASIA: 5,
  EECA: 6,
  SOUTHEAST_ASIA: 7,
  EAST_ASIA: 8,
  OCEANIA: 9,
  OTHER_UNKNOWN: 63,
};

function normalizeAgeBucket(input: string): AgeBucket {
  const raw = input.trim();

  const normalized = raw.toLowerCase().replace(/\s+/g, "").replace("-", "_");

  const aliases = (predicateCodes as any).ageBucketAliases ?? {};

  const fromAliases = aliases[raw] ?? aliases[normalized];
  if (fromAliases) {
    return fromAliases as AgeBucket;
  }

  if (normalized in AGE_BUCKET_BIT) {
    return normalized as AgeBucket;
  }

  throw new Error(`Unknown age bucket: ${input}`);
}

function normalizeRegion(input: string): WorldRegion {
  const normalized = input.trim().toUpperCase();

  if (normalized in REGION_BIT) {
    return normalized as WorldRegion;
  }

  throw new Error(`Unknown world region: ${input}`);
}

function normalizeCountryAlpha2(input: string): string {
  const raw = input.trim().toUpperCase();

  const countryNumericCodes = (predicateCodes as any).countryNumericCodes ?? {};
  const alpha3ToAlpha2 = (predicateCodes as any).countryAlpha3ToAlpha2 ?? {};

  if (countryNumericCodes[raw]) {
    return raw;
  }

  if (alpha3ToAlpha2[raw]) {
    return alpha3ToAlpha2[raw];
  }

  throw new Error(`Unknown country code: ${input}`);
}

function getCountryNumericCode(alpha2: string): number {
  const countryNumericCodes = (predicateCodes as any).countryNumericCodes ?? {};
  const entry = countryNumericCodes[alpha2];

  if (!entry?.fieldCode) {
    throw new Error(`Missing numeric country code for ${alpha2}`);
  }

  const numericCode = Number(entry.fieldCode);

  if (!Number.isInteger(numericCode) || numericCode < 0 || numericCode > 1023) {
    throw new Error(
      `Country numeric code out of bitmap range: ${alpha2}=${entry.fieldCode}`,
    );
  }

  return numericCode;
}

function setBit(mask: bigint, bitIndex: number): bigint {
  if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex > 63) {
    throw new Error(`Invalid bit index: ${bitIndex}`);
  }

  return mask | (1n << BigInt(bitIndex));
}

function buildAgeMask(ageBuckets?: string[] | "ANY") {
  if (!ageBuckets || ageBuckets === "ANY" || ageBuckets.length === 0) {
    return {
      mode: POLICY_MODE_ANY as PolicyMode,
      mask: 0n,
      normalized: [] as string[],
    };
  }

  let mask = 0n;
  const normalized: string[] = [];

  for (const bucketInput of ageBuckets) {
    const bucket = normalizeAgeBucket(bucketInput);
    const bit = AGE_BUCKET_BIT[bucket];

    mask = setBit(mask, bit);
    normalized.push(bucket);
  }

  return {
    mode: POLICY_MODE_ALLOWLIST as PolicyMode,
    mask,
    normalized,
  };
}

function buildRegionMask(regions?: string[] | "ANY") {
  if (!regions || regions === "ANY" || regions.length === 0) {
    return {
      mode: POLICY_MODE_ANY as PolicyMode,
      mask: 0n,
      normalized: [] as string[],
    };
  }

  let mask = 0n;
  const normalized: string[] = [];

  for (const regionInput of regions) {
    const region = normalizeRegion(regionInput);
    const bit = REGION_BIT[region];

    mask = setBit(mask, bit);
    normalized.push(region);
  }

  return {
    mode: POLICY_MODE_ALLOWLIST as PolicyMode,
    mask,
    normalized,
  };
}

function buildCountryBitmap(countries?: string[] | "ANY") {
  const chunks = Array.from({ length: COUNTRY_BITMAP_CHUNKS }, () => 0n);

  if (!countries || countries === "ANY" || countries.length === 0) {
    return {
      mode: POLICY_MODE_ANY as PolicyMode,
      chunks,
      normalized: [] as PredicatePolicyBitmapV1["debug"]["normalizedCountries"],
    };
  }

  const normalized: PredicatePolicyBitmapV1["debug"]["normalizedCountries"] =
    [];

  for (const countryInput of countries) {
    const alpha2 = normalizeCountryAlpha2(countryInput);
    const numericCode = getCountryNumericCode(alpha2);

    const chunkIndex = Math.floor(numericCode / COUNTRY_BITMAP_CHUNK_SIZE);
    const bitIndex = numericCode % COUNTRY_BITMAP_CHUNK_SIZE;

    if (chunkIndex < 0 || chunkIndex >= COUNTRY_BITMAP_CHUNKS) {
      throw new Error(
        `Country numeric code chunk out of range: ${alpha2}=${numericCode}`,
      );
    }

    chunks[chunkIndex] = setBit(chunks[chunkIndex], bitIndex);

    normalized.push({
      input: countryInput,
      alpha2,
      numericCode,
      chunkIndex,
      bitIndex,
    });
  }

  return {
    mode: POLICY_MODE_ALLOWLIST as PolicyMode,
    chunks,
    normalized,
  };
}

export function buildPredicatePolicyBitmapV1(
  selection: PredicatePolicySelectionV1,
): PredicatePolicyBitmapV1 {
  const age = buildAgeMask(selection.ageBuckets);
  const region = buildRegionMask(selection.regions);
  const country = buildCountryBitmap(selection.countries);

  return {
    version: 1,

    ageMode: age.mode,
    ageMask: age.mask.toString(),

    regionMode: region.mode,
    regionMask: region.mask.toString(),

    countryMode: country.mode,
    countryBitmap: country.chunks.map((chunk) => chunk.toString()),

    debug: {
      normalizedAgeBuckets: age.normalized,
      normalizedRegions: region.normalized,
      normalizedCountries: country.normalized,
    },
  };
}
