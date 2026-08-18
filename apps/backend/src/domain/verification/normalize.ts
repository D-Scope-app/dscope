import type {
  AgeBucket,
  NormalizedPredicateOutcome,
  RawVerificationResult,
  WorldRegion,
} from "./types";

const ISO_ALPHA3_TO_ALPHA2: Record<string, string> = {
  AFG: "AF",
  ALB: "AL",
  DZA: "DZ",
  AND: "AD",
  AGO: "AO",
  ATG: "AG",
  ARG: "AR",
  ARM: "AM",
  AUS: "AU",
  AUT: "AT",
  AZE: "AZ",
  BHS: "BS",
  BHR: "BH",
  BGD: "BD",
  BRB: "BB",
  BLR: "BY",
  BEL: "BE",
  BLZ: "BZ",
  BEN: "BJ",
  BTN: "BT",
  BOL: "BO",
  BIH: "BA",
  BWA: "BW",
  BRA: "BR",
  BRN: "BN",
  BGR: "BG",
  BFA: "BF",
  BDI: "BI",
  CPV: "CV",
  KHM: "KH",
  CMR: "CM",
  CAN: "CA",
  CAF: "CF",
  TCD: "TD",
  CHL: "CL",
  CHN: "CN",
  COL: "CO",
  COM: "KM",
  COG: "CG",
  COD: "CD",
  CRI: "CR",
  CIV: "CI",
  HRV: "HR",
  CUB: "CU",
  CYP: "CY",
  CZE: "CZ",
  DNK: "DK",
  DJI: "DJ",
  DMA: "DM",
  DOM: "DO",
  ECU: "EC",
  EGY: "EG",
  SLV: "SV",
  GNQ: "GQ",
  ERI: "ER",
  EST: "EE",
  SWZ: "SZ",
  ETH: "ET",
  FJI: "FJ",
  FIN: "FI",
  FRA: "FR",
  GAB: "GA",
  GMB: "GM",
  GEO: "GE",
  DEU: "DE",
  GHA: "GH",
  GRC: "GR",
  GRD: "GD",
  GTM: "GT",
  GIN: "GN",
  GNB: "GW",
  GUY: "GY",
  HTI: "HT",
  HND: "HN",
  HUN: "HU",
  ISL: "IS",
  IND: "IN",
  IDN: "ID",
  IRN: "IR",
  IRQ: "IQ",
  IRL: "IE",
  ISR: "IL",
  ITA: "IT",
  JAM: "JM",
  JPN: "JP",
  JOR: "JO",
  KAZ: "KZ",
  KEN: "KE",
  KIR: "KI",
  PRK: "KP",
  KOR: "KR",
  KWT: "KW",
  KGZ: "KG",
  LAO: "LA",
  LVA: "LV",
  LBN: "LB",
  LSO: "LS",
  LBR: "LR",
  LBY: "LY",
  LIE: "LI",
  LTU: "LT",
  LUX: "LU",
  MDG: "MG",
  MWI: "MW",
  MYS: "MY",
  MDV: "MV",
  MLI: "ML",
  MLT: "MT",
  MHL: "MH",
  MRT: "MR",
  MUS: "MU",
  MEX: "MX",
  FSM: "FM",
  MDA: "MD",
  MCO: "MC",
  MNG: "MN",
  MNE: "ME",
  MAR: "MA",
  MOZ: "MZ",
  MMR: "MM",
  NAM: "NA",
  NRU: "NR",
  NPL: "NP",
  NLD: "NL",
  NZL: "NZ",
  NIC: "NI",
  NER: "NE",
  NGA: "NG",
  MKD: "MK",
  NOR: "NO",
  OMN: "OM",
  PAK: "PK",
  PLW: "PW",
  PAN: "PA",
  PNG: "PG",
  PRY: "PY",
  PER: "PE",
  PHL: "PH",
  POL: "PL",
  PRT: "PT",
  QAT: "QA",
  ROU: "RO",
  RUS: "RU",
  RWA: "RW",
  KNA: "KN",
  LCA: "LC",
  VCT: "VC",
  WSM: "WS",
  SMR: "SM",
  STP: "ST",
  SAU: "SA",
  SEN: "SN",
  SRB: "RS",
  SYC: "SC",
  SLE: "SL",
  SGP: "SG",
  SVK: "SK",
  SVN: "SI",
  SLB: "SB",
  SOM: "SO",
  ZAF: "ZA",
  SSD: "SS",
  ESP: "ES",
  LKA: "LK",
  SDN: "SD",
  SUR: "SR",
  SWE: "SE",
  CHE: "CH",
  SYR: "SY",
  TJK: "TJ",
  TZA: "TZ",
  THA: "TH",
  TLS: "TL",
  TGO: "TG",
  TON: "TO",
  TTO: "TT",
  TUN: "TN",
  TUR: "TR",
  TKM: "TM",
  TUV: "TV",
  UGA: "UG",
  UKR: "UA",
  ARE: "AE",
  GBR: "GB",
  USA: "US",
  URY: "UY",
  UZB: "UZ",
  VUT: "VU",
  VAT: "VA",
  VEN: "VE",
  VNM: "VN",
  YEM: "YE",
  ZMB: "ZM",
  ZWE: "ZW",
};

export function normalizeCountryBucket(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "OTHER_UNKNOWN";
  }

  const normalized = value.trim().toUpperCase();

  if (ISO_ALPHA3_TO_ALPHA2[normalized]) {
    return ISO_ALPHA3_TO_ALPHA2[normalized];
  }

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  return "OTHER_UNKNOWN";
}

export function deriveWorldRegionFromCountry(countryCode: string): WorldRegion {
  const code = countryCode.trim().toUpperCase();

  if (
    [
      "RU",
      "UA",
      "BY",
      "KZ",
      "AM",
      "AZ",
      "GE",
      "KG",
      "MD",
      "TJ",
      "TM",
      "UZ",
    ].includes(code)
  ) {
    return "EECA";
  }

  if (
    [
      "AL",
      "AD",
      "AT",
      "BE",
      "BA",
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
      "IS",
      "IE",
      "IT",
      "LV",
      "LI",
      "LT",
      "LU",
      "MT",
      "MC",
      "ME",
      "NL",
      "MK",
      "NO",
      "PL",
      "PT",
      "RO",
      "SM",
      "RS",
      "SK",
      "SI",
      "ES",
      "SE",
      "CH",
      "GB",
      "VA",
    ].includes(code)
  ) {
    return "EUROPE";
  }

  if (["US", "CA"].includes(code)) return "NORTH_AMERICA";

  if (
    [
      "MX",
      "AR",
      "BO",
      "BR",
      "CL",
      "CO",
      "CR",
      "CU",
      "DO",
      "EC",
      "SV",
      "GT",
      "HN",
      "NI",
      "PA",
      "PY",
      "PE",
      "UY",
      "VE",
      "GY",
      "SR",
      "HT",
      "JM",
      "TT",
      "BB",
      "BS",
      "DM",
      "GD",
      "AG",
      "KN",
      "LC",
      "VC",
    ].includes(code)
  ) {
    return "LATIN_AMERICA";
  }

  if (
    [
      "DZ",
      "BH",
      "EG",
      "IR",
      "IQ",
      "IL",
      "JO",
      "KW",
      "LB",
      "LY",
      "MA",
      "OM",
      "PS",
      "QA",
      "SA",
      "SY",
      "TN",
      "TR",
      "AE",
      "YE",
    ].includes(code)
  ) {
    return "MENA";
  }

  if (
    [
      "AO",
      "BJ",
      "BW",
      "BF",
      "BI",
      "CM",
      "CV",
      "CF",
      "TD",
      "KM",
      "CG",
      "CD",
      "CI",
      "DJ",
      "GQ",
      "ER",
      "SZ",
      "ET",
      "GA",
      "GM",
      "GH",
      "GN",
      "GW",
      "KE",
      "LS",
      "LR",
      "MG",
      "MW",
      "ML",
      "MR",
      "MU",
      "MZ",
      "NA",
      "NE",
      "NG",
      "RW",
      "ST",
      "SN",
      "SC",
      "SL",
      "SO",
      "ZA",
      "SS",
      "SD",
      "TZ",
      "TG",
      "UG",
      "ZM",
      "ZW",
    ].includes(code)
  ) {
    return "SUB_SAHARAN_AFRICA";
  }

  if (["AF", "BD", "BT", "IN", "MV", "NP", "PK", "LK"].includes(code)) {
    return "SOUTH_ASIA";
  }

  if (
    ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"].includes(
      code,
    )
  ) {
    return "SOUTHEAST_ASIA";
  }

  if (["CN", "JP", "KP", "KR", "MN"].includes(code)) {
    return "EAST_ASIA";
  }

  if (
    [
      "AU",
      "NZ",
      "FJ",
      "PG",
      "SB",
      "VU",
      "WS",
      "TO",
      "KI",
      "NR",
      "PW",
      "FM",
      "MH",
      "TV",
    ].includes(code)
  ) {
    return "OCEANIA";
  }

  return "OTHER_UNKNOWN";
}

export function tryExtractNationalityFromRaw(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;

  const obj = input as Record<string, any>;
  const resultRoot =
    obj.result && typeof obj.result === "object" ? obj.result : obj;

  const candidates = [
    resultRoot?.nationality?.disclose?.result,
    resultRoot?.nationality?.result,
    resultRoot?.country?.disclose?.result,
    resultRoot?.country?.result,
    resultRoot?.countryCode?.disclose?.result,
    resultRoot?.countryCode?.result,
    resultRoot?.issuing_state?.disclose?.result,
    resultRoot?.issuing_state?.result,
    resultRoot?.nationality,
    resultRoot?.country,
    resultRoot?.countryCode,
    resultRoot?.issuing_state,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export function tryExtractBirthdateFromRaw(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;

  const obj = input as Record<string, any>;
  const resultRoot =
    obj.result && typeof obj.result === "object" ? obj.result : obj;

  const candidates = [
    resultRoot?.birthdate?.disclose?.result,
    resultRoot?.birthdate?.result,
    resultRoot?.date_of_birth?.disclose?.result,
    resultRoot?.date_of_birth?.result,
    resultRoot?.dob?.disclose?.result,
    resultRoot?.dob?.result,
    resultRoot?.birthdate,
    resultRoot?.date_of_birth,
    resultRoot?.dob,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export function deriveAgeBucketFromBirthdate(value: string | null): AgeBucket {
  if (!value) return "other_unknown";

  const birthMs = Date.parse(value);
  if (Number.isNaN(birthMs)) return "other_unknown";

  const birth = new Date(birthMs);
  const now = new Date();

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = now.getUTCDate() - birth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
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

export function normalizePredicateOutcomeFromRaw(input: {
  verified: boolean;
  subjectHash: string;
  validUntil?: string | null;
  rawResult?: RawVerificationResult | unknown;
  providerPayloadVersion?: string | null;
}): NormalizedPredicateOutcome {
  const rawBirthdate = tryExtractBirthdateFromRaw(input.rawResult);
  const rawNationality = tryExtractNationalityFromRaw(input.rawResult);

  const ageBucket = deriveAgeBucketFromBirthdate(rawBirthdate);
  const countryBucket = normalizeCountryBucket(rawNationality);
  const worldRegion = deriveWorldRegionFromCountry(countryBucket);

  return {
    verified: input.verified,
    subjectHash: input.subjectHash,
    ageBucket,
    countryBucket,
    worldRegion,
    validUntil: input.validUntil ?? null,
    providerPayloadVersion: input.providerPayloadVersion ?? null,
  };
}
