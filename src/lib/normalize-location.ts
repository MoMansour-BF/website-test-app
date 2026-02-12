import { mapGooglePlaceType } from "@/lib/place-utils";
import type { PlaceSuggestion } from "@/lib/place-utils";

/** Google Places (New) API address component shape */
interface AddressComponent {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types?: string[];
}

/** Google Places (New) API place details response shape */
interface PlaceDetailsResponse {
  id?: string;
  placeId?: string;
  displayName?: { text?: string; languageCode?: string } | string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };
  addressComponents?: AddressComponent[];
  types?: string[];
  primaryType?: string;
}

/**
 * Normalize Google Place Details response to our standard format.
 * This is the single source of truth for place data sent to LITEAPI.
 */
export function normalizePlace(details: PlaceDetailsResponse): PlaceSuggestion {
  const countryComponent = details.addressComponents?.find((c: AddressComponent) =>
    c.types?.includes("country")
  );

  const countryCode =
    countryComponent?.shortText ??
    (countryComponent as { short_name?: string })?.short_name ??
    "";
  const countryName =
    countryComponent?.longText ??
    (countryComponent as { long_name?: string })?.long_name ??
    "";

  const loc = details.location;
  const lat =
    loc?.lat ?? loc?.latitude ?? 0;
  const lng =
    loc?.lng ?? loc?.longitude ?? 0;

  const primaryType =
    details.types?.[0] ?? details.primaryType ?? "";
  const type = mapGooglePlaceType(primaryType);

  const displayName =
    typeof details.displayName === "string"
      ? details.displayName
      : details.displayName?.text ?? "";

  return {
    placeId: details.id ?? details.placeId ?? "",
    displayName,
    formattedAddress: details.formattedAddress ?? "",
    type,
    primaryType: primaryType || undefined,
    lat,
    lng,
    countryCode,
    countryName,
  };
}
