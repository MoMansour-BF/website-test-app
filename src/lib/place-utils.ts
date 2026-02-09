/**
 * Place types and helpers for search (Phase 1: place types, search-type detection).
 * LiteAPI /data/places returns types[] e.g. ["hotel","lodging","establishment","point_of_interest"].
 */

export interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  /** From LiteAPI; used for search-type (Type 1 vs Type 2) and autocomplete icons. */
  types?: string[];
}

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
