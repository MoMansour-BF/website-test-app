/**
 * Phase 3.5: Last-search persistence (search bar, cross-page).
 *
 * - lastSearch: localStorage — drives search bar prefill and Back-to-list; persists for repeat visitors.
 * - recentSearches / recentHotels: localStorage, max 10 — capture only; no UI yet (FUTURE_PLANS).
 *
 * Stored shape matches ResultsQueryParams so we can build /results?… from it.
 */

import type { ResultsQueryParams } from "@/lib/results-query";
import { resultsUrl } from "@/lib/results-query";

const KEY_LAST_SEARCH = "hotelApp.lastSearch";
const KEY_RECENT_SEARCHES = "hotelApp.recentSearches";
const KEY_RECENT_HOTELS = "hotelApp.recentHotels";
const MAX_RECENT = 10;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Minimal guard: object has required string fields for a valid search.
 * Used to avoid corrupt or legacy data breaking the app.
 */
function isValidLastSearchPayload(obj: unknown): obj is ResultsQueryParams {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    (o.mode === "place" || o.mode === "vibe") &&
    typeof o.checkin === "string" &&
    o.checkin.length >= 8 &&
    typeof o.checkout === "string" &&
    o.checkout.length >= 8 &&
    typeof o.occupancies === "string"
  );
}

/**
 * Read the last search from localStorage (persists across sessions for repeat visitors).
 * Use to prefill the search bar and for "Back to results" URL.
 */
export function getLastSearch(): ResultsQueryParams | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(KEY_LAST_SEARCH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidLastSearchPayload(parsed) ? (parsed as ResultsQueryParams) : null;
  } catch {
    return null;
  }
}

/**
 * Save the current search as last search (localStorage — persists for repeat visitors).
 * Call after successful results load, on search submit, or when user commits date/occupancy change on hotel page.
 */
export function setLastSearch(payload: ResultsQueryParams): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY_LAST_SEARCH, JSON.stringify(payload));
  } catch {
    // quota or private mode
  }
}

/**
 * Build the results page URL for the given params (e.g. from getLastSearch()).
 * Use for "Back to results" so the list uses the latest search params.
 */
export function lastSearchResultsUrl(params: ResultsQueryParams | null): string {
  if (!params) return "/results";
  return resultsUrl(params);
}

/** One entry in the recent searches list (same shape as last search). */
export type RecentSearchItem = ResultsQueryParams;

/**
 * Read recent searches from localStorage (max 10).
 * For future "Recently searched" UI; no UI in Phase 3.5.
 */
export function getRecentSearches(): RecentSearchItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY_RECENT_SEARCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLastSearchPayload) as RecentSearchItem[];
  } catch {
    return [];
  }
}

/**
 * Append a search to recent list (localStorage), dedupe by stable signature, evict oldest when > 10.
 * Call after successful results load or when user submits search.
 */
export function pushRecentSearch(payload: ResultsQueryParams): void {
  if (!isBrowser()) return;
  try {
    const list = getRecentSearches();
    const signature = JSON.stringify({
      mode: payload.mode,
      placeId: payload.placeId,
      aiSearch: payload.aiSearch,
      checkin: payload.checkin,
      checkout: payload.checkout,
      occupancies: payload.occupancies
    });
    const withoutThis = list.filter((item) => {
      const s = JSON.stringify({
        mode: item.mode,
        placeId: item.placeId,
        aiSearch: item.aiSearch,
        checkin: item.checkin,
        checkout: item.checkout,
        occupancies: item.occupancies
      });
      return s !== signature;
    });
    const next = [payload, ...withoutThis].slice(0, MAX_RECENT);
    localStorage.setItem(KEY_RECENT_SEARCHES, JSON.stringify(next));
  } catch {
    // quota or private mode
  }
}

export interface RecentHotelItem {
  hotelId: string;
  name?: string;
  viewedAt?: number;
}

/**
 * Read recent hotels from localStorage (max 10).
 * For future "Recently viewed hotels" UI; no UI in Phase 3.5.
 */
export function getRecentHotels(): RecentHotelItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY_RECENT_HOTELS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is RecentHotelItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).hotelId === "string"
    );
  } catch {
    return [];
  }
}

/**
 * Add or move-to-front a hotel in recent list (localStorage), keyed by hotelId. Evict oldest when > 10.
 * Call when user opens a hotel detail page.
 */
export function pushRecentHotel(item: RecentHotelItem): void {
  if (!isBrowser() || !item.hotelId) return;
  try {
    const list = getRecentHotels();
    const withViewedAt = { ...item, viewedAt: item.viewedAt ?? Date.now() };
    const withoutThis = list.filter((h) => h.hotelId !== item.hotelId);
    const next = [withViewedAt, ...withoutThis].slice(0, MAX_RECENT);
    localStorage.setItem(KEY_RECENT_HOTELS, JSON.stringify(next));
  } catch {
    // quota or private mode
  }
}
