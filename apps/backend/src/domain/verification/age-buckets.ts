import type { AgeBucket } from "./types";

export function bucketAge(age: number | null | undefined): AgeBucket {
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0) {
    return "other_unknown";
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

export function normalizeAgeBucket(value: unknown): AgeBucket {
  if (typeof value !== "string") {
    return "other_unknown";
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "18_25":
      return "18_25";
    case "26_30":
      return "26_30";
    case "31_35":
      return "31_35";
    case "36_45":
      return "36_45";
    case "46_50":
      return "46_50";
    case "51_55":
      return "51_55";
    case "56_60":
      return "56_60";
    case "61_plus":
      return "61_plus";
    default:
      return "other_unknown";
  }
}
