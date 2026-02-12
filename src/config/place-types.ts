/**
 * Allowed Google Places primaryTypes for hotel search autocomplete.
 * We fetch all results from the API, then filter to these types client-side.
 */
export const ALLOWED_PRIMARY_TYPES = [
  "country",
  "locality",
  "administrative_area_level_1",
  "lodging",
  "airport",
  "train_station",
  "bus_station",
  "tourist_attraction",
  "museum",
  "park",
  "shopping_mall",
  "amusement_park",
] as const;

/** Helper type for the allowed primary types tuple. */
export type AllowedPrimaryType = (typeof ALLOWED_PRIMARY_TYPES)[number];

/**
 * Priority ranking for autocomplete results.
 * Lower number = higher priority (shown first).
 * Prioritize places most relevant to hotel search.
 */
export const TYPE_PRIORITY: Record<string, number> = {
  country: 1,
  locality: 2,
  administrative_area_level_1: 3,
  airport: 4,
  lodging: 5,
  tourist_attraction: 6,
  museum: 7,
  park: 8,
  shopping_mall: 9,
  train_station: 10,
  bus_station: 11,
  amusement_park: 12,
};

// ── Address component helpers ──

/** A single address component returned by Google Places API. */
export interface GoogleAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

/**
 * Extract country code from Google Places address components.
 * Returns ISO 3166-1 alpha-2 code (e.g. "EG", "SA") or null if not found.
 */
export function extractCountryCode(
  addressComponents: GoogleAddressComponent[]
): string | null {
  const countryComponent = addressComponents.find((c) =>
    c.types.includes("country")
  );
  return countryComponent?.shortText || null;
}

/**
 * Extract full country name from Google Places address components.
 * Returns the long-form name (e.g. "Egypt", "Saudi Arabia") or null.
 */
export function extractCountryName(
  addressComponents: GoogleAddressComponent[]
): string | null {
  const countryComponent = addressComponents.find((c) =>
    c.types.includes("country")
  );
  return countryComponent?.longText || null;
}
