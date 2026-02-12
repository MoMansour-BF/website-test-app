/**
 * Adapters that map Legacy Google Places API responses to the same shapes
 * used by the New API, so processPredictions and normalizePlace need no changes.
 */

import type {
  GoogleAutocompleteResponse,
  GoogleAutocompleteSuggestion,
} from "@/lib/process-predictions";

// ── Legacy API types (for reference; not exposed to rest of app) ──

/** Legacy: GET .../place/autocomplete/json → { predictions: [...], status } */
export interface LegacyAutocompletePrediction {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
}

export interface LegacyAutocompleteResponse {
  predictions?: LegacyAutocompletePrediction[];
  status?: string;
}

/** Legacy: GET .../place/details/json → { result: {...}, status } */
export interface LegacyPlaceDetailsResult {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  types?: string[];
}

/** New API–shaped details (same shape normalizePlace expects) */
export interface NewShapePlaceDetails {
  id?: string;
  placeId?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  types?: string[];
  primaryType?: string;
}

// ── Adapters ──

/**
 * Map legacy autocomplete response to New API shape so processPredictions works unchanged.
 * Returns { suggestions: [] } when status !== "OK" or no predictions.
 */
export function mapLegacyAutocompleteToNewShape(
  legacyResponse: LegacyAutocompleteResponse
): GoogleAutocompleteResponse {
  if (legacyResponse.status !== "OK" || !legacyResponse.predictions?.length) {
    return { suggestions: [] };
  }

  const suggestions: GoogleAutocompleteSuggestion[] =
    legacyResponse.predictions.map((p) => ({
      placePrediction: {
        place: p.place_id ? `places/${p.place_id}` : "",
        placeId: p.place_id ?? "",
        text: { text: p.description ?? "" },
        structuredFormat: {
          mainText: {
            text: p.structured_formatting?.main_text ?? "",
          },
          secondaryText: {
            text: p.structured_formatting?.secondary_text ?? "",
          },
        },
        types: p.types ?? [],
      },
    }));

  return { suggestions };
}

/**
 * Map legacy place details result to New API shape so normalizePlace works unchanged.
 */
export function mapLegacyDetailsToNewShape(
  legacyResult: LegacyPlaceDetailsResult
): NewShapePlaceDetails {
  const loc = legacyResult.geometry?.location;
  return {
    id: legacyResult.place_id,
    placeId: legacyResult.place_id,
    displayName: legacyResult.name,
    formattedAddress: legacyResult.formatted_address,
    location:
      loc != null
        ? {
            latitude: loc.lat,
            longitude: loc.lng,
          }
        : undefined,
    addressComponents: legacyResult.address_components?.map((c) => ({
      longText: c.long_name,
      shortText: c.short_name,
      types: c.types,
    })),
    types: legacyResult.types,
    primaryType: legacyResult.types?.[0],
  };
}
