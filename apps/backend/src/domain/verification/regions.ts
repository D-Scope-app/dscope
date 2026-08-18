import type { WorldRegion } from "./types";
import {
  normalizeCountryAlpha2,
  worldRegionForCountry,
} from "../predicate/predicate-codes";

export function getWorldRegion(countryCode: unknown): WorldRegion {
  return worldRegionForCountry(countryCode) as WorldRegion;
}

export function normalizeCountryBucket(value: unknown): string {
  return normalizeCountryAlpha2(value);
}
