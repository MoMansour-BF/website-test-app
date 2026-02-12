/**
 * Content filtering configuration.
 * Defines restricted countries and places that should never appear in search results.
 *
 * Multi-layer defense:
 *  Layer 1 – Client-side autocomplete (process-predictions.ts)
 *  Layer 2 – Server-side autocomplete API route
 *  Layer 3 – Server-side place details API route
 *  Layer 4 – Client-side results page (geographic bounding box)
 *  Layer 5 – Static data (top-cities.ts)
 */

// ── Restricted country codes ──

/** ISO 3166-1 alpha-2 country codes to exclude from all search functionality. */
export const RESTRICTED_COUNTRY_CODES = ["IL"] as const;

// ── Restricted place IDs ──

/**
 * Specific Google Place IDs to block.
 * Add IDs here as they're discovered to ensure comprehensive filtering.
 */
export const RESTRICTED_PLACE_IDS = [
  // Israel country-level place ID
  "ChIJi8mnMiRJABURuiw1EyBCa2o",

  // Major Israeli cities
  "ChIJH3w7GaZMHRURkD-WwKJy-8E", // Tel Aviv
  "ChIJkZGDg9VI1xQRMp_RiQvR2SQ", // Jerusalem
  "ChIJZbCvRZwpHRURuFW0I3D1p5I", // Haifa
] as const;

// ── Geographic bounding boxes ──

/**
 * Geographic bounding boxes for restricted regions.
 * Format: [minLat, maxLat, minLng, maxLng]
 */
const RESTRICTED_GEOGRAPHIC_BOUNDS: Record<
  string,
  [number, number, number, number]
> = {
  // Israel approximate boundaries
  IL: [29.5, 33.3, 34.3, 35.9],
};

// ── Check helpers ──

/**
 * Check if a country code is restricted.
 */
export function isCountryRestricted(
  countryCode: string | null | undefined
): boolean {
  if (!countryCode) return false;
  return (RESTRICTED_COUNTRY_CODES as readonly string[]).includes(
    countryCode.toUpperCase()
  );
}

/**
 * Check if a place ID is restricted.
 */
export function isPlaceIdRestricted(
  placeId: string | null | undefined
): boolean {
  if (!placeId) return false;
  return (RESTRICTED_PLACE_IDS as readonly string[]).includes(placeId);
}

/**
 * Check if coordinates fall within a restricted geographic area.
 * Returns true if the location should be BLOCKED.
 */
export function isLocationRestricted(lat: number, lng: number): boolean {
  for (const [, [minLat, maxLat, minLng, maxLng]] of Object.entries(
    RESTRICTED_GEOGRAPHIC_BOUNDS
  )) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a place should be filtered out based on any restriction criteria.
 * Returns true if the place should be EXCLUDED.
 */
export function shouldFilterPlace(place: {
  placeId?: string;
  countryCode?: string;
}): boolean {
  if (isPlaceIdRestricted(place.placeId)) return true;
  if (isCountryRestricted(place.countryCode)) return true;
  return false;
}

/**
 * Check if autocomplete suggestion text indicates a restricted country (e.g. Israel).
 * Used when country is not in the API response (autocomplete only returns place_id + text).
 * Returns true if the suggestion should be EXCLUDED.
 */
export function isSuggestionTextIndicatingRestrictedCountry(
  displayText: string | null | undefined
): boolean {
  if (!displayText || typeof displayText !== "string") return false;
  const t = displayText.trim();
  if (!t) return false;
  // Israel: word boundary to avoid blocking "Israeli" in other countries
  if (/\bIsrael\b/i.test(t)) return true;
  // Arabic for Israel
  if (/\bإسرائيل\b/.test(t)) return true;
  return false;
}
