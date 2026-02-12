/**
 * Google Places Autocomplete configuration for hotel search.
 * Uses New Places API (Place Autocomplete Data API).
 * Docs: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 *
 * Cost optimization:
 * - Session tokens ensure autocomplete + details = 1 SKU charge
 * - Client-side filtering reduces unnecessary detail fetches
 * - 300ms debounce prevents API spam during typing
 */

/** Session token for cost optimization — one token per search session. */
export function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export interface AutocompleteRequestOptions {
  input: string;
  sessionToken: string;
  languageCode: "ar" | "en";
}

/**
 * Build autocomplete request body for the Google Places API (New).
 *
 * Location bias: Egypt-centered with 2 000 km radius to cover MENA region.
 * No type filtering at the request level — we filter client-side for flexibility.
 *
 * NOTE: The Google Places API (New) uses `latitude`/`longitude` keys
 * (not `lat`/`lng`) in the request body.
 */
export function buildAutocompleteRequest(options: AutocompleteRequestOptions) {
  const { input, sessionToken, languageCode } = options;

  return {
    input,
    // Bias toward Egypt / MENA region (26.8206°N, 30.8025°E = Egypt center)
    locationBias: {
      circle: {
        center: { latitude: 26.8206, longitude: 30.8025 },
        radius: 2000000, // 2 000 km — covers Egypt, Saudi Arabia, Jordan, etc.
      },
    },
    languageCode,
    sessionToken,
    // No type filtering — we want all results and will filter client-side
  };
}
