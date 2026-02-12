/**
 * Place types and helpers for search (Phase 1: place types, search-type detection).
 * LiteAPI /data/places returns types[] e.g. ["hotel","lodging","establishment","point_of_interest"].
 *
 * Extended for Google Places integration: normalized type, coordinates, country info.
 */

/** Normalized place type for routing/sorting logic. */
export type NormalizedPlaceType = "country" | "city" | "hotel" | "airport" | "region" | "attraction";

export interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  /** From LiteAPI; used for search-type (Type 1 vs Type 2) and autocomplete icons. */
  types?: string[];

  // ── Google Places fields (optional for backward compatibility) ──

  /** Normalized type for routing/sorting logic (Google Places flow). */
  type?: NormalizedPlaceType;
  /** Original Google primaryType for debugging/logging. */
  primaryType?: string;
  /** Geographic coordinates for distance calculations. */
  lat?: number;
  lng?: number;
  /** ISO 3166-1 alpha-2 country code (e.g. "EG", "SA"). */
  countryCode?: string;
  /** Full country name (e.g. "Egypt", "Saudi Arabia"). */
  countryName?: string;
}

// ── Type mapping helpers ──

/**
 * Maps Google Places primaryType to our normalized type system.
 * Used for routing logic and distance-based sorting.
 */
export function mapGooglePlaceType(primaryType: string): NormalizedPlaceType {
  switch (primaryType) {
    case "country":
      return "country";
    case "locality":
    case "postal_town":
      return "city";
    case "administrative_area_level_1":
    case "administrative_area_level_2":
      return "region";
    case "lodging":
    case "hotel":
      return "hotel";
    case "airport":
      return "airport";
    case "tourist_attraction":
    case "museum":
    case "park":
    case "shopping_mall":
    case "amusement_park":
    case "zoo":
    case "aquarium":
      return "attraction";
    default:
      return "city"; // Default fallback
  }
}

/**
 * Returns true if place type should use distance-to-center sorting.
 * Hotels, attractions, and airports benefit from proximity sorting.
 */
export function shouldSortByDistance(type: NormalizedPlaceType): boolean {
  return type === "hotel" || type === "attraction" || type === "airport";
}

// ── Existing helpers ──

/**
 * Returns true if the place is a specific hotel/lodging (Type 1 search).
 * Use when deciding search type on results page.
 */
export function isSpecificHotelPlace(types: string[] | undefined): boolean {
  return types?.some((t) => t === "hotel" || t === "lodging") ?? false;
}

/**
 * Serialize place types for URL (comma-separated).
 */
export function serializePlaceTypes(types: string[] | undefined): string {
  if (!types?.length) return "";
  return types.join(",");
}

/**
 * Parse placeTypes from URL query (comma-separated).
 */
export function parsePlaceTypes(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}
