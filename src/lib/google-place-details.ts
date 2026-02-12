/**
 * Fetch full place details from Google Places API.
 * Called once when user selects an autocomplete suggestion.
 * Uses same session token for cost optimization.
 */

export interface PlaceDetailsOptions {
  placeId: string;
  sessionToken: string;
  languageCode: "ar" | "en";
}

/**
 * Fields to request from Google Places Details API.
 * Optimized for hotel search: name, location, address, type.
 */
export const PLACE_DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
  "types",
] as const;

export async function getPlaceDetails(
  options: PlaceDetailsOptions
): Promise<Record<string, unknown>> {
  const { placeId, sessionToken, languageCode } = options;

  const response = await fetch("/api/google-places/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      placeId,
      fields: [...PLACE_DETAILS_FIELDS],
      sessionToken,
      languageCode,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(
      (error as { error?: string }).error ?? "Failed to fetch place details"
    );
  }

  return response.json();
}
