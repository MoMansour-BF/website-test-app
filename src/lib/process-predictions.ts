/**
 * Client-side filtering & ranking for Google Places autocomplete predictions.
 *
 * Google Places Autocomplete (New) returns `suggestions[]` with `placePrediction`
 * objects. This module filters to relevant place types and ranks them for a
 * hotel-search UX.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/autocomplete
 */

import {
  ALLOWED_PRIMARY_TYPES,
  TYPE_PRIORITY,
  type AllowedPrimaryType,
} from "@/config/place-types";
import {
  shouldFilterPlace,
  isSuggestionTextIndicatingRestrictedCountry,
} from "@/config/content-restrictions";

// ── Raw Google API types (matches New Places API response) ──

/** A single text element returned by the autocomplete API. */
export interface FormattableText {
  text: string;
  matches?: { startOffset: number; endOffset: number }[];
}

/** Structured formatting: main text + disambiguating secondary text. */
export interface StructuredFormat {
  mainText: FormattableText;
  secondaryText?: FormattableText;
}

/**
 * A single PlacePrediction from the Google Places Autocomplete (New) response.
 * Matches the shape inside `suggestions[].placePrediction`.
 */
export interface GooglePlacePrediction {
  /** Resource name, e.g. "places/ChIJ..." */
  place: string;
  /** The Google Place ID. */
  placeId: string;
  /** Full display text (name + address). */
  text: FormattableText;
  /** Breakdown into main text (name) and secondary text (city/region). */
  structuredFormat: StructuredFormat;
  /** All types that apply to this place (Table A / Table B). */
  types: string[];
  /** Geodesic distance from `origin` in meters (if origin was set). */
  distanceMeters?: number;
}

/** A single suggestion from the autocomplete response. */
export interface GoogleAutocompleteSuggestion {
  placePrediction?: GooglePlacePrediction;
  queryPrediction?: unknown; // We don't use query predictions
}

/** Top-level autocomplete response from Google Places API (New). */
export interface GoogleAutocompleteResponse {
  suggestions: GoogleAutocompleteSuggestion[];
}

// ── Processed prediction (our normalized shape for the client) ──

/**
 * A prediction after filtering and ranking.
 * This is the shape consumed by the SearchModal UI.
 */
export interface ProcessedPrediction {
  placeId: string;
  /** Full display text (e.g. "Cairo, Egypt"). */
  description: string;
  /** Main text (e.g. "Cairo"). */
  mainText: string;
  /** Secondary text (e.g. "Egypt"). */
  secondaryText: string;
  /** All Google types for this place. */
  types: string[];
  /** The primary type we matched from ALLOWED_PRIMARY_TYPES. */
  primaryType: AllowedPrimaryType;
  /** Geodesic distance from origin in meters (if available). */
  distanceMeters?: number;
}

// ── Helpers ──

/**
 * Derive the "primary type" from a Google types array.
 *
 * Google doesn't return a single `primaryType` in autocomplete predictions,
 * only a `types[]` array. We pick the first type that appears in our allowed
 * list, respecting our priority order (lower priority number = more important).
 *
 * Returns `null` if no type matches our allowed list.
 */
export function derivePrimaryType(
  types: string[]
): AllowedPrimaryType | null {
  let bestType: AllowedPrimaryType | null = null;
  let bestPriority = Infinity;

  for (const t of types) {
    if (
      (ALLOWED_PRIMARY_TYPES as readonly string[]).includes(t) &&
      (TYPE_PRIORITY[t] ?? 999) < bestPriority
    ) {
      bestType = t as AllowedPrimaryType;
      bestPriority = TYPE_PRIORITY[t] ?? 999;
    }
  }

  return bestType;
}

/** Egypt detection keywords for secondary text boost. */
const EGYPT_KEYWORDS = ["egypt", "مصر"];

/**
 * Check if a prediction likely belongs to Egypt.
 *
 * Since `addressComponents` are NOT available at autocomplete time,
 * we inspect the secondary text for Egypt indicators.
 */
function isLikelyEgypt(prediction: GooglePlacePrediction): boolean {
  const secondary =
    prediction.structuredFormat?.secondaryText?.text?.toLowerCase() ?? "";
  return EGYPT_KEYWORDS.some((kw) => secondary.includes(kw));
}

// ── Main processing function ──

/**
 * Filter and rank Google Places autocomplete predictions.
 *
 * Logic:
 * 1. Extract only `placePrediction` items (ignore query predictions)
 * 1.5. Filter out restricted content (blocked place IDs / countries)
 * 2. Filter to allowed place types only
 * 3. Sort by type priority (countries first, then cities, etc.)
 * 4. Within same priority, boost Egypt results (primary market)
 * 5. Limit to top N results for UX
 *
 * @param response  Raw Google autocomplete response
 * @param maxResults  Maximum number of results to return (default 10)
 * @returns  Processed and ranked predictions ready for UI consumption
 */
export function processPredictions(
  response: GoogleAutocompleteResponse,
  maxResults = 10
): ProcessedPrediction[] {
  const suggestions = response.suggestions ?? [];

  // Step 1: Extract place predictions only
  const placePredictions = suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is GooglePlacePrediction => p != null);

  // Step 1.5: CRITICAL — filter out restricted content (place IDs + Israel text)
  const unrestricted = placePredictions.filter((p) => {
    const displayText =
      p.text?.text ??
      [p.structuredFormat?.mainText?.text, p.structuredFormat?.secondaryText?.text]
        .filter(Boolean)
        .join(", ");
    return (
      !shouldFilterPlace({ placeId: p.placeId }) &&
      !isSuggestionTextIndicatingRestrictedCountry(displayText)
    );
  });

  // Step 2: Filter to allowed types and derive primary type
  const withPrimaryType: { prediction: GooglePlacePrediction; primaryType: AllowedPrimaryType }[] = [];

  for (const prediction of unrestricted) {
    const primaryType = derivePrimaryType(prediction.types ?? []);
    if (primaryType != null) {
      withPrimaryType.push({ prediction, primaryType });
    }
  }

  // Step 3 & 4: Sort by priority + Egypt boost
  withPrimaryType.sort((a, b) => {
    // Primary sort: type priority
    const priorityA = TYPE_PRIORITY[a.primaryType] ?? 999;
    const priorityB = TYPE_PRIORITY[b.primaryType] ?? 999;
    const priorityDiff = priorityA - priorityB;

    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort: boost Egypt in ties (primary market)
    const egyptA = isLikelyEgypt(a.prediction);
    const egyptB = isLikelyEgypt(b.prediction);

    if (egyptA && !egyptB) return -1;
    if (egyptB && !egyptA) return 1;

    return 0;
  });

  // Step 5: Limit and normalize to ProcessedPrediction shape
  return withPrimaryType.slice(0, maxResults).map(({ prediction, primaryType }) => ({
    placeId: prediction.placeId,
    description: prediction.text?.text ?? "",
    mainText: prediction.structuredFormat?.mainText?.text ?? "",
    secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
    types: prediction.types ?? [],
    primaryType,
    distanceMeters: prediction.distanceMeters,
  }));
}
