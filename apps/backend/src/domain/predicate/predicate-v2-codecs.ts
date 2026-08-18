import predicateCodes from "./predicate-codes.v1.json";

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

export type PredicatePolicySelectionV2 = {
  ageBuckets?: string[] | "ANY";
  countries?: string[] | "ANY";
  regions?: string[] | "ANY";
};

export type PredicatePolicyContractArgsV2 = {
  version: 2;

  ageMode: string;
  ageMask: string;

  countryMode: string;
  countryBitmap: string[];

  regionMode: string;
  regionMask: string;

  debug: {
    normalizedAgeBuckets: Array<{
      input: string;
      bucket: AgeBucket;
      bitIndex: number;
    }>;
    normalizedCountries: Array<{
      input: string;
      alpha2: string;
      numericCode: number;
      chunkIndex: number;
      bitIndex: number;
    }>;
    normalizedRegions: Array<{
      input: string;
      region: WorldRegion;
      bitIndex: number;
    }>;
  };
};

export type CredentialInputV2 = {
  ageBucket: string;
  country: string;
  worldRegion?: string;
  validUntil?: number | string;
  sourceTag?: number | string;
  credentialVersion?: number | string;
};

export type CredentialContractArgsV2 = {
  ageBucketIndex: string;
  countryCode: string;
  worldRegionIndex: string;
  validUntil: string;
  sourceTag: string;
  credentialVersion: string;
  debug: {
    ageBucket: AgeBucket;
    countryAlpha2: string;
    worldRegion: WorldRegion;
  };
};

const AGE_BUCKET_BIT_INDEX: Record<AgeBucket, number> = {
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

const REGION_BIT_INDEX: Record<WorldRegion, number> = {
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

  if (normalized in AGE_BUCKET_BIT_INDEX) {
    return normalized as AgeBucket;
  }

  throw new Error(`Unknown age bucket: ${input}`);
}

function normalizeRegion(input: string): WorldRegion {
  const raw = input.trim().toUpperCase();

  const aliases = (predicateCodes as any).worldRegionAliases ?? {};
  const fromAliases = aliases[raw];

  if (fromAliases && fromAliases in REGION_BIT_INDEX) {
    return fromAliases as WorldRegion;
  }

  if (raw in REGION_BIT_INDEX) {
    return raw as WorldRegion;
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

function getRegionForCountry(alpha2: string): WorldRegion {
  const countryRegion = (predicateCodes as any).countryRegion ?? {};
  const region = countryRegion[alpha2];

  if (region && region in REGION_BIT_INDEX) {
    return region as WorldRegion;
  }

  return "OTHER_UNKNOWN";
}

function setU64Bit(mask: bigint, bitIndex: number): bigint {
  if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex > 63) {
    throw new Error(`Invalid u64 bit index: ${bitIndex}`);
  }

  return mask | (1n << BigInt(bitIndex));
}

function buildAgeMask(ageBuckets?: string[] | "ANY") {
  if (!ageBuckets || ageBuckets === "ANY" || ageBuckets.length === 0) {
    return {
      mode: POLICY_MODE_ANY as PolicyMode,
      mask: 0n,
      normalized:
        [] as PredicatePolicyContractArgsV2["debug"]["normalizedAgeBuckets"],
    };
  }

  let mask = 0n;
  const normalized: PredicatePolicyContractArgsV2["debug"]["normalizedAgeBuckets"] =
    [];

  for (const input of ageBuckets) {
    const bucket = normalizeAgeBucket(input);
    const bitIndex = AGE_BUCKET_BIT_INDEX[bucket];

    mask = setU64Bit(mask, bitIndex);

    normalized.push({
      input,
      bucket,
      bitIndex,
    });
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
      normalized:
        [] as PredicatePolicyContractArgsV2["debug"]["normalizedRegions"],
    };
  }

  let mask = 0n;
  const normalized: PredicatePolicyContractArgsV2["debug"]["normalizedRegions"] =
    [];

  for (const input of regions) {
    const region = normalizeRegion(input);
    const bitIndex = REGION_BIT_INDEX[region];

    mask = setU64Bit(mask, bitIndex);

    normalized.push({
      input,
      region,
      bitIndex,
    });
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
      normalized:
        [] as PredicatePolicyContractArgsV2["debug"]["normalizedCountries"],
    };
  }

  const normalized: PredicatePolicyContractArgsV2["debug"]["normalizedCountries"] =
    [];

  for (const input of countries) {
    const alpha2 = normalizeCountryAlpha2(input);
    const numericCode = getCountryNumericCode(alpha2);

    const chunkIndex = Math.floor(numericCode / COUNTRY_BITMAP_CHUNK_SIZE);
    const bitIndex = numericCode % COUNTRY_BITMAP_CHUNK_SIZE;

    chunks[chunkIndex] = setU64Bit(chunks[chunkIndex], bitIndex);

    normalized.push({
      input,
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

export function buildPredicatePolicyContractArgsV2(
  selection: PredicatePolicySelectionV2,
): PredicatePolicyContractArgsV2 {
  const age = buildAgeMask(selection.ageBuckets);
  const country = buildCountryBitmap(selection.countries);
  const region = buildRegionMask(selection.regions);

  return {
    version: 2,

    ageMode: age.mode.toString(),
    ageMask: age.mask.toString(),

    countryMode: country.mode.toString(),
    countryBitmap: country.chunks.map((chunk) => chunk.toString()),

    regionMode: region.mode.toString(),
    regionMask: region.mask.toString(),

    debug: {
      normalizedAgeBuckets: age.normalized,
      normalizedCountries: country.normalized,
      normalizedRegions: region.normalized,
    },
  };
}

export function buildCredentialContractArgsV2(
  input: CredentialInputV2,
): CredentialContractArgsV2 {
  const ageBucket = normalizeAgeBucket(input.ageBucket);
  const ageBucketIndex = AGE_BUCKET_BIT_INDEX[ageBucket];

  const countryAlpha2 = normalizeCountryAlpha2(input.country);
  const countryCode = getCountryNumericCode(countryAlpha2);

  const worldRegion = input.worldRegion
    ? normalizeRegion(input.worldRegion)
    : getRegionForCountry(countryAlpha2);

  const worldRegionIndex = REGION_BIT_INDEX[worldRegion];

  return {
    ageBucketIndex: ageBucketIndex.toString(),
    countryCode: countryCode.toString(),
    worldRegionIndex: worldRegionIndex.toString(),
    validUntil: String(input.validUntil ?? 999999),
    sourceTag: String(input.sourceTag ?? 1),
    credentialVersion: String(input.credentialVersion ?? 2),
    debug: {
      ageBucket,
      countryAlpha2,
      worldRegion,
    },
  };
}
