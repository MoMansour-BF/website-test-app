/**
 * Phase 2: URL as single source of truth for results page.
 * Canonical query schema for /results: parse from and serialize to URL.
 * Use for: results page read/write, links to hotel page (preserve full URL), home/hotel → results navigation.
 */

import { parseOccupanciesParam, serializeOccupancies, DEFAULT_OCCUPANCIES } from "@/lib/occupancy";
import type { Occupancy } from "@/lib/occupancy";
import { parsePlaceTypes, serializePlaceTypes, type NormalizedPlaceType } from "@/lib/place-utils";

/** Default guest nationality (Phase 0). Must match server default. */
export const DEFAULT_NATIONALITY = "EG";

/** Sort option for results list (client-side). Phase 8: distance_asc when center point available. */
export type ResultsSortOption = "recommended" | "price_asc" | "price_desc" | "rating_desc" | "distance_asc";

/**
 * Canonical query params for /results.
 * All fields that define the search and view; read from URL, write to URL.
 */
export interface ResultsQueryParams {
  mode: "place" | "vibe";
  placeId: string | null;
  placeName: string | null;
  placeAddress: string | null;
  placeTypes: string[];
  aiSearch: string | null;
  checkin: string;
  checkout: string;
  /** Serialized occupancies (e.g. "2|2,1"). */
  occupancies: string;
  nationality: string;
  /** Client-side sort; included in URL for shareability and back/forward. */
  sort: ResultsSortOption;
  // Optional filters (Phase 6+); include in schema so URL stays canonical
  refundableOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  name?: string;
  stars?: number[];
  minRating?: number;
  /** Phase 7: server-side min review count (LiteAPI minReviewsCount). */
  minReviewsCount?: number;
  /** Phase 7: server-side facility IDs (LiteAPI facilities). */
  facilities?: number[];
  /** Phase 4: map-driven "search this area". Center and radius in meters; when set, search is restricted to this area. */
  latitude?: number;
  longitude?: number;
  radius?: number;
  /** Phase 7: geographic center for distance-based sorting */
  centerLat?: number;
  /** Phase 7: geographic center for distance-based sorting */
  centerLng?: number;
  /** Phase 7: search radius in meters (for "Search this area" + distance filtering) */
  searchRadius?: number;
  /** Phase 7: place type for routing and sorting logic */
  placeType?: NormalizedPlaceType;
  /** Phase 7: country code for country-level searches AND geographic restrictions (LITEAPI) */
  countryCode?: string;
}

const DEFAULT_SORT: ResultsSortOption = "recommended";

/**
 * Parse /results query from URLSearchParams (e.g. useSearchParams() or request.url).
 * Uses same defaults as app (occupancies, nationality, sort).
 */
export function parseResultsSearchParams(
  searchParams: Readonly<URLSearchParams> | Iterable<[string, string]>
): ResultsQueryParams {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(Array.from(searchParams));

  const mode = (params.get("mode") as "place" | "vibe") ?? "place";
  const placeId = params.get("placeId");
  const placeName = params.get("placeName");
  const placeAddress = params.get("placeAddress");
  const placeTypes = parsePlaceTypes(params.get("placeTypes"));
  const aiSearch = params.get("aiSearch");
  const checkin = params.get("checkin") ?? "";
  const checkout = params.get("checkout") ?? "";
  const occupanciesParam = params.get("occupancies");
  const adultsLegacy = params.get("adults");
  const occupancies = occupanciesParam
    ? parseOccupanciesParam(occupanciesParam)
    : adultsLegacy && Number(adultsLegacy) >= 1
      ? [{ adults: Number(adultsLegacy), children: [] }]
      : DEFAULT_OCCUPANCIES;
  const occupanciesStr =
    occupanciesParam ?? (adultsLegacy ? `${adultsLegacy}` : serializeOccupancies(DEFAULT_OCCUPANCIES));
  const nationality = params.get("nationality") ?? DEFAULT_NATIONALITY;
  const sort = (params.get("sort") as ResultsSortOption) ?? DEFAULT_SORT;
  const validSorts: ResultsSortOption[] = ["recommended", "price_asc", "price_desc", "rating_desc", "distance_asc"];
  const sortFinal = validSorts.includes(sort) ? sort : DEFAULT_SORT;

  const refundableOnly = params.get("refundableOnly");
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const name = params.get("name");
  const starsParam = params.get("stars");
  const minRating = params.get("minRating");
  const minReviewsCountParam = params.get("minReviewsCount");
  const facilitiesParam = params.get("facilities");
  const latitudeParam = params.get("latitude");
  const longitudeParam = params.get("longitude");
  const radiusParam = params.get("radius");
  const countryCodeParam = params.get("countryCode");
  const placeTypeParam = params.get("placeType");
  const centerLatParam = params.get("centerLat");
  const centerLngParam = params.get("centerLng");
  const searchRadiusParam = params.get("searchRadius");

  const validPlaceTypes: NormalizedPlaceType[] = ["country", "city", "hotel", "airport", "region", "attraction"];
  const placeType = placeTypeParam && validPlaceTypes.includes(placeTypeParam as NormalizedPlaceType)
    ? (placeTypeParam as NormalizedPlaceType)
    : undefined;

  return {
    mode,
    placeId: placeId ?? null,
    placeName: placeName ?? null,
    placeAddress: placeAddress ?? null,
    placeTypes,
    aiSearch: aiSearch?.trim() ?? null,
    checkin,
    checkout,
    occupancies: occupanciesStr,
    nationality,
    sort: sortFinal,
    ...(refundableOnly === "1" && { refundableOnly: true }),
    ...(minPrice != null && minPrice !== "" && { minPrice: Number(minPrice) }),
    ...(maxPrice != null && maxPrice !== "" && { maxPrice: Number(maxPrice) }),
    ...(name != null && name !== "" && { name }),
    ...(starsParam != null && starsParam !== "" && {
      stars: starsParam.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    }),
    ...(minRating != null && minRating !== "" && { minRating: Number(minRating) }),
    ...(minReviewsCountParam != null && minReviewsCountParam !== "" && { minReviewsCount: Number(minReviewsCountParam) }),
    ...(facilitiesParam != null && facilitiesParam !== "" && {
      facilities: facilitiesParam.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    }),
    ...(latitudeParam != null && latitudeParam !== "" && !Number.isNaN(Number(latitudeParam)) && { latitude: Number(latitudeParam) }),
    ...(longitudeParam != null && longitudeParam !== "" && !Number.isNaN(Number(longitudeParam)) && { longitude: Number(longitudeParam) }),
    ...(radiusParam != null && radiusParam !== "" && !Number.isNaN(Number(radiusParam)) && Number(radiusParam) > 0 && { radius: Number(radiusParam) }),
    ...(countryCodeParam != null && countryCodeParam !== "" && { countryCode: countryCodeParam.trim() }),
    ...(placeType && { placeType }),
    ...(centerLatParam != null && centerLatParam !== "" && !Number.isNaN(Number(centerLatParam)) && { centerLat: Number(centerLatParam) }),
    ...(centerLngParam != null && centerLngParam !== "" && !Number.isNaN(Number(centerLngParam)) && { centerLng: Number(centerLngParam) }),
    ...(searchRadiusParam != null && searchRadiusParam !== "" && !Number.isNaN(Number(searchRadiusParam)) && Number(searchRadiusParam) > 0 && { searchRadius: Number(searchRadiusParam) })
  };
}

/**
 * Serialize ResultsQueryParams to URLSearchParams for /results?...
 * Use when building links to results or updating the results page URL.
 */
export function serializeResultsQuery(params: ResultsQueryParams): URLSearchParams {
  const q = new URLSearchParams();

  q.set("mode", params.mode);
  if (params.placeId) q.set("placeId", params.placeId);
  if (params.placeName) q.set("placeName", params.placeName);
  if (params.placeAddress) q.set("placeAddress", params.placeAddress);
  const pt = serializePlaceTypes(params.placeTypes);
  if (pt) q.set("placeTypes", pt);
  if (params.aiSearch) q.set("aiSearch", params.aiSearch);
  q.set("checkin", params.checkin);
  q.set("checkout", params.checkout);
  q.set("occupancies", params.occupancies);
  q.set("nationality", params.nationality);
  if (params.sort && params.sort !== DEFAULT_SORT) q.set("sort", params.sort);

  if (params.refundableOnly) q.set("refundableOnly", "1");
  if (params.minPrice != null) q.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null) q.set("maxPrice", String(params.maxPrice));
  if (params.name) q.set("name", params.name);
  if (params.stars?.length) q.set("stars", params.stars.join(","));
  if (params.minRating != null) q.set("minRating", String(params.minRating));
  if (params.minReviewsCount != null) q.set("minReviewsCount", String(params.minReviewsCount));
  if (params.facilities?.length) q.set("facilities", params.facilities.join(","));
  if (params.latitude != null && !Number.isNaN(params.latitude)) q.set("latitude", String(params.latitude));
  if (params.longitude != null && !Number.isNaN(params.longitude)) q.set("longitude", String(params.longitude));
  if (params.radius != null && !Number.isNaN(params.radius) && params.radius > 0) q.set("radius", String(params.radius));
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.placeType) q.set("placeType", params.placeType);
  if (params.centerLat != null && !Number.isNaN(params.centerLat)) q.set("centerLat", String(params.centerLat));
  if (params.centerLng != null && !Number.isNaN(params.centerLng)) q.set("centerLng", String(params.centerLng));
  if (params.searchRadius != null && !Number.isNaN(params.searchRadius) && params.searchRadius > 0) q.set("searchRadius", String(params.searchRadius));

  return q;
}

/**
 * Build the results page path + query string, e.g. "/results?mode=place&placeId=..."
 */
export function resultsUrl(params: ResultsQueryParams): string {
  return `/results?${serializeResultsQuery(params).toString()}`;
}

/**
 * Phase 5.5: Stable signature for "major" search params (location, dates, occupancy only).
 * Used by background search to avoid duplicate requests and to validate cached results.
 * Do not include filters or sort.
 */
export function backgroundSearchParamsSignature(params: ResultsQueryParams): string {
  return JSON.stringify({
    mode: params.mode,
    placeId: params.placeId ?? "",
    placeName: params.placeName ?? "",
    placeAddress: params.placeAddress ?? "",
    placeTypes: (params.placeTypes ?? []).slice().sort(),
    aiSearch: params.aiSearch ?? "",
    checkin: params.checkin,
    checkout: params.checkout,
    occupancies: params.occupancies,
    latitude: params.latitude ?? "",
    longitude: params.longitude ?? "",
    radius: params.radius ?? "",
    centerLat: params.centerLat ?? "",
    centerLng: params.centerLng ?? "",
    searchRadius: params.searchRadius ?? "",
    countryCode: params.countryCode ?? ""
  });
}

/** SessionStorage key for passing preloaded search result from modal to results page (Phase 5.5). */
export const PRELOADED_SEARCH_RESULT_KEY = "hotelApp.preloadedSearchResult";

/**
 * Build ResultsQueryParams from form/state (e.g. search modal or home page).
 * Use when you have place + dates + occupancies and optional filters.
 */
export function buildResultsQueryParams(options: {
  mode: "place" | "vibe";
  placeId?: string | null;
  placeName?: string | null;
  placeAddress?: string | null;
  placeTypes?: string[];
  aiSearch?: string | null;
  checkin: string;
  checkout: string;
  occupancies: Occupancy[];
  nationality?: string;
  sort?: ResultsSortOption;
  refundableOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  name?: string;
  stars?: number[];
  minRating?: number;
  minReviewsCount?: number;
  facilities?: number[];
  latitude?: number;
  longitude?: number;
  radius?: number;
  /** Phase 7: geographic center and radius for distance sorting; country/type for LITEAPI */
  centerLat?: number;
  centerLng?: number;
  searchRadius?: number;
  placeType?: NormalizedPlaceType;
  countryCode?: string;
}): ResultsQueryParams {
  const occupanciesStr = serializeOccupancies(options.occupancies);
  const placeTypes = options.placeTypes ?? [];
  return {
    mode: options.mode,
    placeId: options.placeId ?? null,
    placeName: options.placeName ?? null,
    placeAddress: options.placeAddress ?? null,
    placeTypes,
    aiSearch: options.aiSearch ?? null,
    checkin: options.checkin,
    checkout: options.checkout,
    occupancies: occupanciesStr,
    nationality: options.nationality ?? DEFAULT_NATIONALITY,
    sort: options.sort ?? DEFAULT_SORT,
    refundableOnly: options.refundableOnly,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    name: options.name,
    stars: options.stars,
    minRating: options.minRating,
    minReviewsCount: options.minReviewsCount,
    facilities: options.facilities,
    latitude: options.latitude,
    longitude: options.longitude,
    radius: options.radius,
    centerLat: options.centerLat,
    centerLng: options.centerLng,
    searchRadius: options.searchRadius,
    placeType: options.placeType,
    countryCode: options.countryCode
  };
}
