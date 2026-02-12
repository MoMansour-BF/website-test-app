/**
 * Feature flag for Google Places backend.
 * When true, API routes call Legacy Places (autocomplete + details).
 * When false or unset, routes use Places API (New).
 * Revert to New API by setting USE_LEGACY_GOOGLE_PLACES=false or removing the env var.
 */
export const USE_LEGACY_GOOGLE_PLACES =
  process.env.USE_LEGACY_GOOGLE_PLACES === "true";
