import predicateCodes from "./predicate-codes.v1.json";

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

export type CountryReference = {
  alpha2: string;
  alpha3: string;
  name: string;
  numeric3: string;
  fieldCode: string;
  region: WorldRegion;
};

const codes = predicateCodes as any;

export const ANY_BUCKET = "0";
export const OTHER_UNKNOWN = "999";

export const AGE_BUCKETS: AgeBucket[] = [
  "18_25",
  "26_30",
  "31_35",
  "36_45",
  "46_50",
  "51_55",
  "56_60",
  "61_plus",
  "other_unknown",
];

export const WORLD_REGIONS: WorldRegion[] = [
  "EUROPE",
  "NORTH_AMERICA",
  "LATIN_AMERICA",
  "MENA",
  "SUB_SAHARAN_AFRICA",
  "SOUTH_ASIA",
  "EECA",
  "SOUTHEAST_ASIA",
  "EAST_ASIA",
  "OCEANIA",
  "OTHER_UNKNOWN",
];

export function normalizeAgeBucketLabel(input: unknown): AgeBucket {
  const raw = String(input || "").trim();

  if (!raw) {
    return "other_unknown";
  }

  const direct = codes.ageBucketAliases?.[raw];
  if (direct && AGE_BUCKETS.includes(direct)) {
    return direct as AgeBucket;
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, "").replace("-", "_");
  const byNormalized = codes.ageBucketAliases?.[normalized];

  if (byNormalized && AGE_BUCKETS.includes(byNormalized)) {
    return byNormalized as AgeBucket;
  }

  if (AGE_BUCKETS.includes(normalized as AgeBucket)) {
    return normalized as AgeBucket;
  }

  return "other_unknown";
}

export function ageBucketCode(input: unknown): string {
  const bucket = normalizeAgeBucketLabel(input);
  return codes.ageBucketCodes?.[bucket] ?? OTHER_UNKNOWN;
}

export function ageBucketFromBirthdate(
  birthdate: string | null | undefined,
  now: Date = new Date(),
): AgeBucket {
  if (!birthdate) return "other_unknown";

  const date = new Date(birthdate);
  if (Number.isNaN(date.getTime())) return "other_unknown";

  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  const dayDiff = now.getUTCDate() - date.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

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

export function normalizeWorldRegion(input: unknown): WorldRegion {
  const raw = String(input || "").trim().toUpperCase();

  if (raw === "CIS_EASTERN_EUROPE") {
    return "EECA";
  }

  if (WORLD_REGIONS.includes(raw as WorldRegion)) {
    return raw as WorldRegion;
  }

  return "OTHER_UNKNOWN";
}

export function worldRegionCode(input: unknown): string {
  const region = normalizeWorldRegion(input);
  return codes.regionCodes?.[region] ?? OTHER_UNKNOWN;
}

export function normalizeCountryAlpha2(input: unknown): string {
  const raw = String(input || "").trim().toUpperCase();

  if (!raw) {
    return "OTHER_UNKNOWN";
  }

  if (codes.countryNumericCodes?.[raw]) {
    return raw;
  }

  if (codes.countryAlpha3ToAlpha2?.[raw]) {
    return codes.countryAlpha3ToAlpha2[raw];
  }

  return "OTHER_UNKNOWN";
}

export function isKnownCountryAlpha2(input: unknown): boolean {
  const alpha2 = normalizeCountryAlpha2(input);
  return alpha2 !== "OTHER_UNKNOWN" && !!codes.countryNumericCodes?.[alpha2];
}

export function countryCode(input: unknown): string {
  const alpha2 = normalizeCountryAlpha2(input);

  if (alpha2 === "OTHER_UNKNOWN") {
    return OTHER_UNKNOWN;
  }

  return codes.countryNumericCodes?.[alpha2]?.fieldCode ?? OTHER_UNKNOWN;
}

export function countryNumericCode(input: unknown): number | null {
  const value = countryCode(input);
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 1023) {
    return null;
  }

  return numeric;
}

export function worldRegionForCountry(input: unknown): WorldRegion {
  const alpha2 = normalizeCountryAlpha2(input);

  if (alpha2 === "OTHER_UNKNOWN") {
    return "OTHER_UNKNOWN";
  }

  return normalizeWorldRegion(codes.countryRegion?.[alpha2]);
}

export function getAllCountries(): CountryReference[] {
  return Object.values(codes.countryNumericCodes ?? {})
    .map((entry: any) => {
      const alpha2 = String(entry.alpha2 || "").toUpperCase();

      return {
        alpha2,
        alpha3: String(entry.alpha3 || "").toUpperCase(),
        name: String(entry.name || alpha2),
        numeric3: String(entry.numeric3 || ""),
        fieldCode: String(entry.fieldCode || OTHER_UNKNOWN),
        region: worldRegionForCountry(alpha2),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAllRegions(): WorldRegion[] {
  return WORLD_REGIONS;
}

export function getAllAgeBuckets(): AgeBucket[] {
  return AGE_BUCKETS;
}
