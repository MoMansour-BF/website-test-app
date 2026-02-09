/**
 * Phase 2: URL as single source of truth for results page.
 * Canonical query schema for /results: parse from and serialize to URL.
 * Use for: results page read/write, links to hotel page (preserve full URL), home/hotel → results navigation.
 */

import { parseOccupanciesParam, serializeOccupancies, DEFAULT_OCCUPANCIES } from "@/lib/occupancy";
import type { Occupancy } from "@/lib/occupancy";
import { parsePlaceTypes, serializePlaceTypes } from "@/lib/place-utils";

/** Default guest nationality (Phase 0). Must match server default. */
export const DEFAULT_NATIONALITY = "EG";

/** Sort option for results list (client-side). */
export type ResultsSortOption = "recommended" | "price_asc" | "price_desc" | "rating_desc";

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
  const validSorts: ResultsSortOption[] = ["recommended", "price_asc", "price_desc", "rating_desc"];
  const sortFinal = validSorts.includes(sort) ? sort : DEFAULT_SORT;

  const refundableOnly = params.get("refundableOnly");
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const name = params.get("name");
  const starsParam = params.get("stars");
  const minRating = params.get("minRating");
  const minReviewsCountParam = params.get("minReviewsCount");
  const facilitiesParam = params.get("facilities");

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
    })
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
    occupancies: params.occupancies
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
    facilities: options.facilities
  };
}
