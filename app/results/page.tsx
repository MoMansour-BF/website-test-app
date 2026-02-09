"use client";

import { HotelCard } from "@/components/HotelCard";
import { BottomNav } from "@/components/BottomNav";
import { SearchModal } from "@/components/SearchModal";
import { MapPinIcon, FilterIcon } from "@/components/Icons";
import { useFavoriteHotels } from "@/context/FavoriteHotelsContext";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { formatRangeShort, parseYYYYMMDD } from "@/lib/date-utils";
import { parsePlaceTypes, serializePlaceTypes, type PlaceSuggestion, isSpecificHotelPlace } from "@/lib/place-utils";
import { getSearchErrorMessage } from "@/lib/search-errors";
import { getRatesSearchTimeout } from "@/lib/rates-timeout";
import { DEFAULT_OCCUPANCIES, getNights, parseOccupanciesParam, serializeOccupancies, toApiOccupancies, totalGuests } from "@/lib/occupancy";
import type { Occupancy } from "@/lib/occupancy";
import {
  parseResultsSearchParams,
  buildResultsQueryParams,
  resultsUrl,
  serializeResultsQuery,
  backgroundSearchParamsSignature,
  PRELOADED_SEARCH_RESULT_KEY,
  type ResultsSortOption
} from "@/lib/results-query";
import { normalizeForSearch } from "@/lib/normalize-search-text";
import { getLastSearch, setLastSearch, pushRecentSearch } from "@/lib/lastSearch";
import { useBackgroundSearch } from "@/hooks/useBackgroundSearch";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense, useRef } from "react";
import { useScrollDirection } from "@/hooks/useScrollDirection";

const INITIAL_BATCH = 24;
const BATCH_SIZE = 24;
/** Phase 4: must match server FIRST_N_HOTELS_TO_ENRICH. */
const FIRST_N_HOTELS_TO_ENRICH = 80;
const WAVE2_BATCH_SIZE = 80;
const MAX_DETAILS_WAVES = 4;
const WAVE2_DEBOUNCE_MS = 2000;

interface PriceInfo {
  amount: number;
  currency: string;
  refundableTag?: string;
  taxIncluded?: boolean;
}

interface LiteAPIHotel {
  id: string;
  name: string;
  main_photo?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  persona?: string;
  style?: string;
  location_type?: string;
  tags?: string[];
}

interface SearchResponse {
  mode: "place" | "vibe";
  raw: {
    data: any[];
    hotels?: LiteAPIHotel[];
  };
  pricesByHotelId: Record<string, PriceInfo>;
  /** Per hotelId: true if the hotel has at least one refundable rate (any room/rate). */
  hasRefundableRateByHotelId?: Record<string, boolean>;
  /** Enriched from hotel details API (Phase 4: rating, reviewCount, starRating). */
  hotelDetailsByHotelId?: Record<string, { reviewCount?: number; rating?: number; starRating?: number }>;
}

function ResultsLoading({ locationLabel }: { locationLabel?: string }) {
  return (
    <div className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      {locationLabel && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-2">
          Searching hotels in {locationLabel}…
        </p>
      )}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden animate-pulse"
          >
            <div className="h-52 w-full bg-[var(--muted)]" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-[var(--muted)] rounded w-3/4" />
              <div className="h-3 bg-[var(--muted)] rounded w-1/2" />
              <div className="h-3 bg-[var(--muted)] rounded w-1/3" />
              <div className="h-6 bg-[var(--muted)] rounded w-1/4 mt-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Phase 2: URL as single source of truth — parse canonical query from URL
  const queryParams = useMemo(
    () => parseResultsSearchParams(searchParams),
    [searchParams]
  );
  const {
    mode,
    placeId: placeIdParam,
    placeName: placeNameParam,
    placeAddress: placeAddressParam,
    placeTypes: placeTypesFromUrl,
    aiSearch: aiSearchParam,
    checkin: checkinParam,
    checkout: checkoutParam,
    occupancies: effectiveOccupanciesParam,
    nationality: nationalityParam,
    sort: sortOrder,
    refundableOnly: refundableOnlyParam,
    minPrice: minPriceParam,
    maxPrice: maxPriceParam,
    name: nameFilterParam,
    stars: starsParam,
    minRating: minRatingParam,
    minReviewsCount: minReviewsCountParam,
    facilities: facilitiesParam
  } = queryParams;
  const placeTypesParam = queryParams.placeTypes.length
    ? placeTypesFromUrl.join(",")
    : null;
  const occupancies = useMemo(
    () => parseOccupanciesParam(effectiveOccupanciesParam),
    [effectiveOccupanciesParam]
  );
  const guestsCount = totalGuests(occupancies);
  const nights = getNights(checkinParam, checkoutParam);

  const { currency, locale } = useLocaleCurrency();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [countLineVisible, setCountLineVisible] = useState(true);
  // Phase 8: lazy-load "Show all properties" — second request without quality filters
  const [lazyLoadResult, setLazyLoadResult] = useState<SearchResponse | null>(null);
  const [lazyLoadLoading, setLazyLoadLoading] = useState(false);
  const [lazyLoadError, setLazyLoadError] = useState<string | null>(null);
  const lastScrollY = useRef(0);
  // Phase 4: cascaded enrichment (wave 2+). Only merge batch when this matches current search.
  const searchGenerationRef = useRef(0);
  const batchInFlightRef = useRef(false);
  const nextWaveStartRef = useRef(0);
  const backgroundSearch = useBackgroundSearch({
    currency,
    locale,
    nationality: nationalityParam,
  });
  const prevBgLocationKeyRef = useRef<string>("");

  // Hide "X hotels in Y" line when user scrolls down; show when near top or scrolling up
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      const threshold = 60;
      if (y <= threshold) {
        setCountLineVisible(true);
      } else if (y > lastScrollY.current) {
        setCountLineVisible(false);
      } else {
        setCountLineVisible(true);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Editable search state (for modal and single bar); synced from URL
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchCheckin, setGlobalSearchCheckin] = useState(checkinParam);
  const [globalSearchCheckout, setGlobalSearchCheckout] = useState(checkoutParam);
  const [globalSearchOccupanciesParam, setGlobalSearchOccupanciesParam] = useState("");
  const [editOccupancies, setEditOccupancies] = useState<Occupancy[]>(occupancies);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);
  const [selectedPlaceAddress, setSelectedPlaceAddress] = useState<string | null>(null);
  const [selectedPlaceTypes, setSelectedPlaceTypes] = useState<string[]>([]);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { isFavorite, toggleFavorite } = useFavoriteHotels();
  const bottomNavVisible = useScrollDirection();

  // Phase 6: local state for filters panel (synced from URL when panel opens; applied to URL on "Apply")
  const [filterRefundable, setFilterRefundable] = useState(false);
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterSort, setFilterSort] = useState<ResultsSortOption>(sortOrder);
  const [filterStars, setFilterStars] = useState<number[]>(starsParam ?? []);
  const [filterMinRating, setFilterMinRating] = useState(minRatingParam != null ? String(minRatingParam) : "");
  useEffect(() => {
    if (!filterPanelOpen) return;
    setFilterRefundable(!!refundableOnlyParam);
    setFilterMinPrice(minPriceParam != null ? String(minPriceParam) : "");
    setFilterMaxPrice(maxPriceParam != null ? String(maxPriceParam) : "");
    setFilterName(nameFilterParam ?? "");
    setFilterSort(sortOrder);
    setFilterStars(starsParam ?? []);
    setFilterMinRating(minRatingParam != null ? String(minRatingParam) : "");
  }, [filterPanelOpen, refundableOnlyParam, minPriceParam, maxPriceParam, nameFilterParam, sortOrder, starsParam, minRatingParam]);

  // Sync state with URL params on load/change (Phase 2: URL is source of truth)
  useEffect(() => {
    setGlobalSearchCheckin(checkinParam);
    setGlobalSearchCheckout(checkoutParam);
    setGlobalSearchOccupanciesParam(effectiveOccupanciesParam);
    setEditOccupancies(occupancies);

    const initialQuery = mode === "place" ? (placeNameParam ?? "") : (aiSearchParam ?? "");
    setGlobalSearchQuery(initialQuery);

    if (mode === "place" && placeIdParam) {
      setSelectedPlaceId(placeIdParam);
      setSelectedPlaceName(placeNameParam);
      setSelectedPlaceAddress(placeAddressParam);
      setSelectedPlaceTypes(placeTypesFromUrl);
    } else {
      setSelectedPlaceId(null);
      setSelectedPlaceTypes([]);
      setSelectedPlaceName(null);
      setSelectedPlaceAddress(null);
    }

    setVisibleCount(INITIAL_BATCH);
  }, [mode, placeIdParam, placeNameParam, placeAddressParam, placeTypesFromUrl, aiSearchParam, checkinParam, checkoutParam, effectiveOccupanciesParam, occupancies]);

  // Only run search when we have required params (avoids 400 from API) — must be before effects that use it
  const hasRequiredSearchParams =
    !!checkinParam &&
    !!checkoutParam &&
    (mode === "place" ? !!placeIdParam : !!aiSearchParam?.trim());

  // Phase 3.5: optional redirect when landing on /results with no params
  useEffect(() => {
    if (hasRequiredSearchParams) return;
    const last = getLastSearch();
    if (!last) return;
    router.replace(resultsUrl(last));
  }, [hasRequiredSearchParams, router]);

  // Phase 3.5: persist current URL to lastSearch when params are valid; push to recent on successful load
  useEffect(() => {
    if (!hasRequiredSearchParams) return;
    setLastSearch(queryParams);
  }, [hasRequiredSearchParams, queryParams]);

  // Phase 5.5: background search when modal is open and we have location + dates
  const hasLocationForBackground =
    ((!!(selectedPlaceId && selectedPlaceName) || !!globalSearchQuery?.trim()) &&
      !!globalSearchCheckin &&
      !!globalSearchCheckout);
  useEffect(() => {
    if (!searchModalOpen || !hasLocationForBackground) return;
    const hasPlace = !!(selectedPlaceId && selectedPlaceName);
    const params = buildResultsQueryParams({
      mode: hasPlace ? "place" : "vibe",
      placeId: hasPlace ? selectedPlaceId! : null,
      placeName: hasPlace ? selectedPlaceName! : null,
      placeAddress: hasPlace ? selectedPlaceAddress ?? null : null,
      placeTypes: hasPlace ? selectedPlaceTypes : undefined,
      aiSearch: hasPlace ? null : (globalSearchQuery?.trim() || null),
      checkin: globalSearchCheckin,
      checkout: globalSearchCheckout,
      occupancies: editOccupancies,
      nationality: nationalityParam,
      sort: sortOrder,
    });
    const locationKey = hasPlace ? selectedPlaceId ?? "" : (globalSearchQuery?.trim() ?? "");
    const trigger =
      prevBgLocationKeyRef.current !== locationKey ? "location" : "dateOrOccupancy";
    prevBgLocationKeyRef.current = locationKey;
    backgroundSearch.startBackgroundSearch(params, { trigger });
  }, [
    searchModalOpen,
    hasLocationForBackground,
    selectedPlaceId,
    selectedPlaceName,
    selectedPlaceAddress,
    selectedPlaceTypes,
    globalSearchQuery,
    globalSearchCheckin,
    globalSearchCheckout,
    editOccupancies,
    nationalityParam,
    sortOrder,
    backgroundSearch,
  ]);

  useEffect(() => {
    if (!searchModalOpen) backgroundSearch.cancel();
  }, [searchModalOpen, backgroundSearch]);

  // Phase 1: search type (Type 1 = specific hotel, Type 2 = city/area). Used in Phase 5 for API dispatch.
  const isSpecificHotelSearch = isSpecificHotelPlace(placeTypesFromUrl);

  // Fetch results (refetches when currency changes so list reloads with new prices)
  // Fetch results (refetches when currency changes so list reloads with new prices).
  useEffect(() => {
    if (!hasRequiredSearchParams) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    const abortController = new AbortController();
    let didAbort = false;
    async function run() {
      try {
        // Phase 5.5: use preloaded result from background search if it matches current URL
        try {
          const raw = typeof window !== "undefined" ? sessionStorage.getItem(PRELOADED_SEARCH_RESULT_KEY) : null;
          if (raw) {
            const parsed = JSON.parse(raw) as { signature?: string; data?: SearchResponse };
            const currentSig = backgroundSearchParamsSignature(queryParams);
            if (parsed?.signature === currentSig && parsed?.data) {
              sessionStorage.removeItem(PRELOADED_SEARCH_RESULT_KEY);
              setData(parsed.data);
              searchGenerationRef.current += 1;
              nextWaveStartRef.current = FIRST_N_HOTELS_TO_ENRICH;
              setLastSearch(queryParams);
              pushRecentSearch(queryParams);
              setLoading(false);
              return;
            }
          }
        } catch {
          // ignore
        }
        setLoading(true);
        setError(null);
        setLazyLoadResult(null);
        setLazyLoadError(null);
        // Either place (placeId + placeName) or vibe (aiSearch), not both — LiteAPI expects one location method.
        const body = {
          mode,
          ...(mode === "place"
            ? {
                placeId: placeIdParam ?? undefined,
                placeName: placeNameParam ?? undefined,
                placeTypes: placeTypesParam ? placeTypesParam.split(",").filter(Boolean) : undefined
              }
            : { aiSearch: aiSearchParam ?? undefined }),
          checkin: checkinParam,
          checkout: checkoutParam,
          occupancies: toApiOccupancies(occupancies),
          currency,
          guestNationality: nationalityParam,
          language: locale,
          timeout: getRatesSearchTimeout(),
          ...(starsParam != null && starsParam.length > 0 && { starRating: starsParam }),
          ...(minRatingParam != null && !Number.isNaN(minRatingParam) && { minRating: minRatingParam }),
          ...(minReviewsCountParam != null && !Number.isNaN(minReviewsCountParam) && minReviewsCountParam >= 0 && { minReviewsCount: minReviewsCountParam }),
          ...(facilitiesParam != null && facilitiesParam.length > 0 && { facilities: facilitiesParam })
        };
        const res = await fetch("/api/rates/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
          signal: abortController.signal
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) {
          const { message } = getSearchErrorMessage(res.status, json?.error);
          throw new Error(message);
        }
        setData(json as SearchResponse);
        searchGenerationRef.current += 1;
        nextWaveStartRef.current = FIRST_N_HOTELS_TO_ENRICH;
        const currentParams = parseResultsSearchParams(searchParams);
        setLastSearch(currentParams);
        pushRecentSearch(currentParams);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          didAbort = true;
          return;
        }
        // Network failure (no response) or timeout: use friendly message
        const msg =
          err?.message &&
          !/Failed to fetch|Load failed|NetworkError/i.test(String(err?.message))
            ? err.message
            : getSearchErrorMessage(0, null).message;
        setError(msg);
      } finally {
        if (!didAbort) setLoading(false);
      }
    }

    run();
    return () => {
      abortController.abort();
    };
  }, [hasRequiredSearchParams, mode, placeIdParam, placeNameParam, placeTypesParam, aiSearchParam, checkinParam, checkoutParam, occupancies, currency, locale, nationalityParam, searchParams, retryCount]);

  // Phase 4: same order as server and as displayed in Recommended (raw.hotels first, then raw.data). Used for wave 2+ batch order.
  const allHotelIdsInRecommendedOrder = useMemo(() => {
    const raw = data?.raw?.hotels ?? data?.raw?.data;
    if (!raw || !Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    const list = raw as any[];
    for (const item of list) {
      const id = item?.id ?? item?.hotelId ?? item?.hotel?.id;
      if (id && typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }, [data?.raw?.hotels, data?.raw?.data]);

  // Phase 4: cascaded enrichment wave 2+. Request next batch after delay or when scrolling near bottom; merge only if search unchanged.
  useEffect(() => {
    if (!data || batchInFlightRef.current) return;
    const ids = allHotelIdsInRecommendedOrder;
    const start = nextWaveStartRef.current;
    if (start >= ids.length) return;
    const waveNumber = Math.floor(start / WAVE2_BATCH_SIZE) + 1;
    if (waveNumber > MAX_DETAILS_WAVES) return;

    const timer = setTimeout(async () => {
      const batchIds = ids.slice(start, start + WAVE2_BATCH_SIZE);
      if (batchIds.length === 0) return;
      const generationAtStart = searchGenerationRef.current;
      batchInFlightRef.current = true;
      try {
        const res = await fetch("/api/hotel/details/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hotelIds: batchIds, language: locale })
        });
        const json = await res.json();
        if (!res.ok || json?.error) return;
        if (searchGenerationRef.current !== generationAtStart) return;
        const batch = json.hotelDetailsByHotelId as Record<string, { reviewCount?: number; rating?: number; starRating?: number }>;
        if (batch && Object.keys(batch).length > 0) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  hotelDetailsByHotelId: { ...prev.hotelDetailsByHotelId, ...batch }
                }
              : null
          );
        }
        nextWaveStartRef.current = start + WAVE2_BATCH_SIZE;
      } finally {
        batchInFlightRef.current = false;
      }
    }, WAVE2_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [data, allHotelIdsInRecommendedOrder, locale]);

  function buildHotelsFromResponse(res: SearchResponse | null): LiteAPIHotel[] {
    if (!res) return [];
    const raw = res.raw?.hotels ??
      (Array.isArray(res.raw?.data)
        ? res.raw.data.map((item: any) => item.hotel).filter(Boolean)
        : []);
    const detailsByHotelId = res.hotelDetailsByHotelId ?? {};
    return (raw as any[]).map((h: any) => {
      const id = h?.id ?? h?.hotelId;
      const details = id ? detailsByHotelId[id] : undefined;
      return {
        ...h,
        id,
        reviewCount: h?.reviewCount ?? h?.review_count ?? details?.reviewCount ?? undefined,
        rating: h?.rating ?? details?.rating ?? undefined,
        starRating: h?.starRating ?? h?.star_rating ?? details?.starRating ?? undefined
      };
    });
  }

  const allHotels: LiteAPIHotel[] = useMemo(
    () => buildHotelsFromResponse(data),
    [data?.raw?.hotels, data?.raw?.data, data?.hotelDetailsByHotelId]
  );

  // Phase 8: main hotel ids for dedupe; lazy-only hotels from "Show all properties" response
  const mainHotelIds = useMemo(() => new Set(allHotels.map((h) => h.id)), [allHotels]);
  const lazyAllHotels = useMemo(() => buildHotelsFromResponse(lazyLoadResult), [lazyLoadResult]);
  const lazyOnlyHotels = useMemo(
    () => lazyAllHotels.filter((h) => !mainHotelIds.has(h.id)),
    [lazyAllHotels, mainHotelIds]
  );

  // Phase 8: merged lookups so cards can use one source for both main and lazy segments
  const mergedPricesByHotelId = useMemo(
    () => ({ ...(data?.pricesByHotelId ?? {}), ...(lazyLoadResult?.pricesByHotelId ?? {}) }),
    [data?.pricesByHotelId, lazyLoadResult?.pricesByHotelId]
  );
  const mergedHasRefundableByHotelId = useMemo(
    () => ({ ...(data?.hasRefundableRateByHotelId ?? {}), ...(lazyLoadResult?.hasRefundableRateByHotelId ?? {}) }),
    [data?.hasRefundableRateByHotelId, lazyLoadResult?.hasRefundableRateByHotelId]
  );

  // Phase 6: client-side filters (refundable, price range, property name) — no new request; state in URL.
  const filteredHotels = useMemo(() => {
    let list = allHotels;
    if (refundableOnlyParam && mergedHasRefundableByHotelId) {
      list = list.filter((h) => mergedHasRefundableByHotelId[h.id] === true);
    }
    if (minPriceParam != null && !Number.isNaN(minPriceParam)) {
      list = list.filter((h) => (mergedPricesByHotelId[h.id]?.amount ?? 0) >= minPriceParam);
    }
    if (maxPriceParam != null && !Number.isNaN(maxPriceParam)) {
      list = list.filter((h) => (mergedPricesByHotelId[h.id]?.amount ?? Infinity) <= maxPriceParam);
    }
    if (nameFilterParam != null && nameFilterParam.trim() !== "") {
      const q = normalizeForSearch(nameFilterParam.trim());
      list = list.filter((h) => normalizeForSearch(h.name ?? "").includes(q));
    }
    return list;
  }, [allHotels, mergedHasRefundableByHotelId, mergedPricesByHotelId, refundableOnlyParam, minPriceParam, maxPriceParam, nameFilterParam]);

  const sortedHotels = useMemo(() => {
    const list = [...filteredHotels];
    if (sortOrder === "recommended") return list;
    if (sortOrder === "price_asc") {
      return list.sort((a, b) => {
        const pa = mergedPricesByHotelId[a.id]?.amount ?? Infinity;
        const pb = mergedPricesByHotelId[b.id]?.amount ?? Infinity;
        return pa - pb;
      });
    }
    if (sortOrder === "price_desc") {
      return list.sort((a, b) => {
        const pa = mergedPricesByHotelId[a.id]?.amount ?? 0;
        const pb = mergedPricesByHotelId[b.id]?.amount ?? 0;
        return pb - pa;
      });
    }
    if (sortOrder === "rating_desc") {
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [filteredHotels, sortOrder, mergedPricesByHotelId]);

  // Phase 8: same filters and sort applied to lazy-only segment
  const filteredLazyHotels = useMemo(() => {
    let list = lazyOnlyHotels;
    if (refundableOnlyParam && mergedHasRefundableByHotelId) {
      list = list.filter((h) => mergedHasRefundableByHotelId[h.id] === true);
    }
    if (minPriceParam != null && !Number.isNaN(minPriceParam)) {
      list = list.filter((h) => (mergedPricesByHotelId[h.id]?.amount ?? 0) >= minPriceParam);
    }
    if (maxPriceParam != null && !Number.isNaN(maxPriceParam)) {
      list = list.filter((h) => (mergedPricesByHotelId[h.id]?.amount ?? Infinity) <= maxPriceParam);
    }
    if (nameFilterParam != null && nameFilterParam.trim() !== "") {
      const q = normalizeForSearch(nameFilterParam.trim());
      list = list.filter((h) => normalizeForSearch(h.name ?? "").includes(q));
    }
    return list;
  }, [lazyOnlyHotels, mergedHasRefundableByHotelId, mergedPricesByHotelId, refundableOnlyParam, minPriceParam, maxPriceParam, nameFilterParam]);

  const sortedLazyHotels = useMemo(() => {
    const list = [...filteredLazyHotels];
    if (sortOrder === "recommended") return list;
    if (sortOrder === "price_asc") {
      return list.sort((a, b) => {
        const pa = mergedPricesByHotelId[a.id]?.amount ?? Infinity;
        const pb = mergedPricesByHotelId[b.id]?.amount ?? Infinity;
        return pa - pb;
      });
    }
    if (sortOrder === "price_desc") {
      return list.sort((a, b) => {
        const pa = mergedPricesByHotelId[a.id]?.amount ?? 0;
        const pb = mergedPricesByHotelId[b.id]?.amount ?? 0;
        return pb - pa;
      });
    }
    if (sortOrder === "rating_desc") {
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [filteredLazyHotels, sortOrder, mergedPricesByHotelId]);

  const visibleHotels = sortedHotels.slice(0, visibleCount);
  const hasMore = visibleCount < sortedHotels.length;

  const priceBounds = useMemo(() => {
    const amounts = mergedPricesByHotelId
      ? Object.values(mergedPricesByHotelId).map((p) => p.amount).filter((n) => typeof n === "number" && !Number.isNaN(n))
      : [];
    if (amounts.length === 0) return { min: 0, max: 10000 };
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return { min: Math.floor(min), max: Math.ceil(max) || Math.ceil(min) + 1 };
  }, [mergedPricesByHotelId]);

  const locationLabel =
    mode === "place" ? (placeNameParam || "this location") : "your search";

  // Phase 8: current search used server-side quality filters → we can offer "Show all properties"
  const hasQualityFilters =
    (starsParam?.length ?? 0) > 0 ||
    (minRatingParam != null && !Number.isNaN(minRatingParam)) ||
    (minReviewsCountParam != null && !Number.isNaN(minReviewsCountParam) && minReviewsCountParam >= 0) ||
    (facilitiesParam?.length ?? 0) > 0;

  const fetchShowAllProperties = async () => {
    if (!hasRequiredSearchParams || !data || lazyLoadLoading) return;
    setLazyLoadLoading(true);
    setLazyLoadError(null);
    const abortController = new AbortController();
    try {
      const body = {
        mode,
        ...(mode === "place"
          ? {
              placeId: placeIdParam ?? undefined,
              placeName: placeNameParam ?? undefined,
              placeTypes: placeTypesParam ? placeTypesParam.split(",").filter(Boolean) : undefined
            }
          : { aiSearch: aiSearchParam ?? undefined }),
        checkin: checkinParam,
        checkout: checkoutParam,
        occupancies: toApiOccupancies(occupancies),
        currency,
        guestNationality: nationalityParam,
        language: locale,
        timeout: getRatesSearchTimeout()
        // Omit starRating, minRating, minReviewsCount, facilities so we get budget & unrated options
      };
      const res = await fetch("/api/rates/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: abortController.signal
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        const { message } = getSearchErrorMessage(res.status, json?.error);
        throw new Error(message);
      }
      setLazyLoadResult(json as SearchResponse);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const msg =
          err?.message && !/Failed to fetch|Load failed|NetworkError/i.test(String(err?.message))
            ? err.message
            : getSearchErrorMessage(0, null).message;
        setLazyLoadError(msg);
      }
    } finally {
      setLazyLoadLoading(false);
    }
  };

  const activeFilterCount = [
    refundableOnlyParam,
    (minPriceParam != null && !Number.isNaN(minPriceParam)) || (maxPriceParam != null && !Number.isNaN(maxPriceParam)),
    !!nameFilterParam?.trim(),
    (starsParam?.length ?? 0) > 0,
    minRatingParam != null && !Number.isNaN(minRatingParam)
  ].filter(Boolean).length;

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setSelectedPlaceId(place.placeId);
    setSelectedPlaceName(place.displayName);
    setSelectedPlaceAddress(place.formattedAddress ?? null);
    setSelectedPlaceTypes(place.types ?? []);
    setGlobalSearchQuery(place.displayName);
  };

  const doSearchFromModal = () => {
    const hasPlace = !!(selectedPlaceId && selectedPlaceName);
    const hasVibe = !!globalSearchQuery?.trim();
    const hasDates = !!(globalSearchCheckin && globalSearchCheckout);
    if (!hasDates || (!hasPlace && !hasVibe)) return;

    const params = buildResultsQueryParams({
      mode: hasPlace ? "place" : "vibe",
      placeId: hasPlace ? selectedPlaceId! : null,
      placeName: hasPlace ? selectedPlaceName! : null,
      placeAddress: hasPlace ? selectedPlaceAddress ?? null : null,
      placeTypes: hasPlace ? selectedPlaceTypes : undefined,
      aiSearch: hasPlace ? null : (globalSearchQuery.trim() || null),
      checkin: globalSearchCheckin,
      checkout: globalSearchCheckout,
      occupancies: editOccupancies,
      nationality: nationalityParam,
      sort: sortOrder,
      refundableOnly: queryParams.refundableOnly,
      minPrice: queryParams.minPrice,
      maxPrice: queryParams.maxPrice,
      name: queryParams.name,
      stars: queryParams.stars,
      minRating: queryParams.minRating
    });
    const preloaded = backgroundSearch.getResultForParams(params);
    if (preloaded != null && typeof preloaded === "object") {
      try {
        sessionStorage.setItem(
          PRELOADED_SEARCH_RESULT_KEY,
          JSON.stringify({
            signature: backgroundSearchParamsSignature(params),
            data: preloaded,
          })
        );
      } catch {
        // ignore
      }
    }
    router.push(resultsUrl(params));
  };

  const handleSortChange = (newSort: ResultsSortOption) => {
    router.replace(
      resultsUrl({ ...queryParams, sort: newSort })
    );
  };

  const handleFiltersApply = () => {
    const stars: number[] = filterStars.filter((n) => n >= 1 && n <= 5);
    const minRatingNum = filterMinRating.trim() === "" ? undefined : Number(filterMinRating);
    const minRating = minRatingNum != null && !Number.isNaN(minRatingNum) ? minRatingNum : undefined;
    const minPrice = filterMinPrice.trim() === "" ? undefined : Number(filterMinPrice);
    const maxPrice = filterMaxPrice.trim() === "" ? undefined : Number(filterMaxPrice);
    const params = {
      ...queryParams,
      sort: filterSort,
      refundableOnly: filterRefundable || undefined,
      minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
      maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
      name: filterName.trim() || undefined,
      stars: stars.length > 0 ? stars : undefined,
      minRating
    };
    router.replace(resultsUrl(params));
    setFilterPanelOpen(false);
  };

  const toggleStarFilter = (star: number) => {
    setFilterStars((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star].sort((a, b) => a - b)
    );
  };

  const dateRangeTextBar =
    globalSearchCheckin && globalSearchCheckout && parseYYYYMMDD(globalSearchCheckin) && parseYYYYMMDD(globalSearchCheckout)
      ? formatRangeShort(
          parseYYYYMMDD(globalSearchCheckin)!,
          parseYYYYMMDD(globalSearchCheckout)!,
          locale
        )
      : "Add dates";
  const guestsSummaryBar =
    totalGuests(editOccupancies) > 0
      ? `${editOccupancies.length} Rm, ${totalGuests(editOccupancies)} Gst`
      : "Add guests";

  return (
    <>
    <main className="flex-1 flex flex-col px-4 pt-4 pb-20">
      {/* Floating pill row: Back | Pill | Filters (no container) */}
      <div className="sticky top-0 z-10 flex items-center gap-2 pb-2 -mx-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] bg-[var(--light-bg)]">
        <Link
          href="/"
          className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
          aria-label="Back to home"
        >
          ←
        </Link>
        <button
          type="button"
          onClick={() => setSearchModalOpen(true)}
          className="min-w-0 flex-1 flex items-center gap-3 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] px-3 py-2.5 text-left hover:border-[var(--ocean-blue)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
          aria-label="Edit search"
        >
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <MapPinIcon className="w-5 h-5 text-[var(--primary)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--dark-text)] truncate">
              {selectedPlaceName && selectedPlaceAddress
                ? `${selectedPlaceName}, ${selectedPlaceAddress}`
                : selectedPlaceName || "Add destination"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
              {dateRangeTextBar} · {guestsSummaryBar}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setFilterPanelOpen(true)}
          className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150 relative"
          aria-label="Filters"
        >
          <FilterIcon className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[var(--primary)] text-white text-[10px] font-semibold flex items-center justify-center px-1">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Count line: between pill and first card, smaller/lighter; collapses when scrolling. Phase 6: show filtered count when client-side filters applied. */}
      {!loading && !error && allHotels.length > 0 && (
        <p
          className={`text-xs font-normal text-[var(--muted-foreground)] text-center px-4 pt-3 pb-5 mb-1 transition-[opacity,max-height] duration-200 overflow-hidden ${
            countLineVisible ? "opacity-100 max-h-20" : "opacity-0 max-h-0"
          }`}
        >
          {lazyLoadResult
            ? `${sortedHotels.length + sortedLazyHotels.length} hotel${sortedHotels.length + sortedLazyHotels.length !== 1 ? "s" : ""} in ${locationLabel}`
            : sortedHotels.length === allHotels.length
              ? `${allHotels.length} hotel${allHotels.length !== 1 ? "s" : ""} in ${locationLabel}`
              : `${sortedHotels.length} of ${allHotels.length} hotel${allHotels.length !== 1 ? "s" : ""} in ${locationLabel}`}
        </p>
      )}

      {searchModalOpen && (
        <SearchModal
          initialView="overview"
          onClose={() => setSearchModalOpen(false)}
          onSearch={doSearchFromModal}
          placeId={selectedPlaceId}
          placeLabel={selectedPlaceName}
          placeSubAddress={selectedPlaceAddress}
          query={globalSearchQuery}
          onPlaceSelect={handleSelectPlace}
          onQueryChange={setGlobalSearchQuery}
          checkin={globalSearchCheckin}
          checkout={globalSearchCheckout}
          onDatesChange={({ checkin: c, checkout: o }) => {
            setGlobalSearchCheckin(c);
            setGlobalSearchCheckout(o);
          }}
          occupancies={editOccupancies}
          onOccupanciesChange={setEditOccupancies}
          locale={locale}
        />
      )}

      {filterPanelOpen && (
        <div
          className="fixed inset-0 z-[50] bg-[var(--dark-text)]/30 flex items-end sm:items-center justify-center"
          onClick={() => setFilterPanelOpen(false)}
        >
          <div
            className="bg-white border border-[var(--sky-blue)] rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--dark-text)] mb-3">Filters</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Sort</label>
                <div className="relative">
                  <select
                    value={filterSort}
                    onChange={(e) => setFilterSort(e.target.value as ResultsSortOption)}
                    className="w-full rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] pl-3 pr-9 py-2.5 text-sm font-medium text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="rating_desc">Rating: High to Low</option>
                  </select>
                  {filterSort !== "recommended" && (
                    <button
                      type="button"
                      onClick={() => setFilterSort("recommended")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Clear sort"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="filter-refundable"
                  checked={filterRefundable}
                  onChange={(e) => setFilterRefundable(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--sky-blue)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <label htmlFor="filter-refundable" className="text-sm font-medium text-[var(--dark-text)]">
                  Refundable only
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                  Price range ({currency})
                </label>
                <div
                  className="price-range-slider mt-2 mb-3"
                  style={{
                    ["--price-min" as string]: priceBounds.min,
                    ["--price-max" as string]: priceBounds.max,
                    ["--thumb-min" as string]: `${((filterMinPrice === "" ? priceBounds.min : Math.min(Math.max(Number(filterMinPrice), priceBounds.min), priceBounds.max)) - priceBounds.min) / (priceBounds.max - priceBounds.min || 1) * 100}%`,
                    ["--thumb-max" as string]: `${((filterMaxPrice === "" ? priceBounds.max : Math.max(Math.min(Number(filterMaxPrice), priceBounds.max), priceBounds.min)) - priceBounds.min) / (priceBounds.max - priceBounds.min || 1) * 100}%`
                  }}
                >
                  <div className="price-range-track" />
                  <input
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
                    value={filterMinPrice === "" ? priceBounds.min : Math.min(Math.max(Number(filterMinPrice), priceBounds.min), priceBounds.max)}
                    onChange={(e) => setFilterMinPrice(String(e.target.value))}
                    onMouseUp={(e) => {
                      const minVal = Number((e.currentTarget as HTMLInputElement).value);
                      const maxVal = filterMaxPrice === "" ? priceBounds.max : Number(filterMaxPrice);
                      if (minVal > maxVal) setFilterMaxPrice(String(priceBounds.max));
                    }}
                    onTouchEnd={(e) => {
                      const minVal = Number((e.currentTarget as HTMLInputElement).value);
                      const maxVal = filterMaxPrice === "" ? priceBounds.max : Number(filterMaxPrice);
                      if (minVal > maxVal) setFilterMaxPrice(String(priceBounds.max));
                    }}
                    className="price-range-input price-range-min"
                    aria-label="Minimum price"
                  />
                  <input
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
                    value={filterMaxPrice === "" ? priceBounds.max : Math.max(Math.min(Number(filterMaxPrice), priceBounds.max), priceBounds.min)}
                    onChange={(e) => setFilterMaxPrice(String(e.target.value))}
                    onMouseUp={(e) => {
                      const maxVal = Number((e.currentTarget as HTMLInputElement).value);
                      const minVal = filterMinPrice === "" ? priceBounds.min : Number(filterMinPrice);
                      if (maxVal < minVal) setFilterMinPrice("0");
                    }}
                    onTouchEnd={(e) => {
                      const maxVal = Number((e.currentTarget as HTMLInputElement).value);
                      const minVal = filterMinPrice === "" ? priceBounds.min : Number(filterMinPrice);
                      if (maxVal < minVal) setFilterMinPrice("0");
                    }}
                    className="price-range-input price-range-max"
                    aria-label="Maximum price"
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">
                  {currency} {filterMinPrice === "" ? priceBounds.min : filterMinPrice} – {currency} {filterMaxPrice === "" ? priceBounds.max : filterMaxPrice}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Min price ({currency})</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={priceBounds.min}
                      max={priceBounds.max}
                      step={1}
                      placeholder={`${priceBounds.min}`}
                      value={filterMinPrice}
                      onChange={(e) => setFilterMinPrice(e.target.value)}
                      onBlur={() => {
                        if (filterMinPrice === "" || filterMaxPrice === "") return;
                        const minVal = Number(filterMinPrice);
                        const maxVal = Number(filterMaxPrice);
                        if (!Number.isNaN(minVal) && !Number.isNaN(maxVal) && minVal > maxVal)
                          setFilterMaxPrice(String(priceBounds.max));
                      }}
                      className="w-full rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] pl-3 pr-9 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                    {filterMinPrice !== "" && (
                      <button
                        type="button"
                        onClick={() => setFilterMinPrice("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        aria-label="Clear min price"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Max price ({currency})</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={priceBounds.min}
                      max={priceBounds.max}
                      step={1}
                      placeholder={`${priceBounds.max}`}
                      value={filterMaxPrice}
                      onChange={(e) => setFilterMaxPrice(e.target.value)}
                      onBlur={() => {
                        if (filterMinPrice === "" || filterMaxPrice === "") return;
                        const minVal = Number(filterMinPrice);
                        const maxVal = Number(filterMaxPrice);
                        if (!Number.isNaN(minVal) && !Number.isNaN(maxVal) && maxVal < minVal)
                          setFilterMinPrice("0");
                      }}
                      className="w-full rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] pl-3 pr-9 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                    {filterMaxPrice !== "" && (
                      <button
                        type="button"
                        onClick={() => setFilterMaxPrice("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        aria-label="Clear max price"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Property name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by hotel name"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="w-full rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] pl-3 pr-9 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  {filterName.trim() !== "" && (
                    <button
                      type="button"
                      onClick={() => setFilterName("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Clear property name"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Star rating (new search)</span>
                <div className="flex flex-wrap gap-2">
                  {[3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => toggleStarFilter(star)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        filterStars.includes(star)
                          ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
                          : "border-[var(--sky-blue)] bg-[var(--light-bg)] text-[var(--dark-text)] hover:bg-[var(--muted)]"
                      }`}
                    >
                      {star}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Min guest rating (new search)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    placeholder="e.g. 8"
                    value={filterMinRating}
                    onChange={(e) => setFilterMinRating(e.target.value)}
                    className="w-full rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] pl-3 pr-9 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  {filterMinRating !== "" && (
                    <button
                      type="button"
                      onClick={() => setFilterMinRating("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Clear min rating"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleFiltersApply}
                className="flex-1 rounded-full border border-[var(--primary)] bg-[var(--primary)] text-white text-sm py-2.5 font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setFilterPanelOpen(false)}
                className="flex-1 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] text-[var(--dark-text)] text-sm py-2.5 hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <ResultsLoading locationLabel={locationLabel} />}

      {/* Phase 9: clear error state — muted styling, actionable "Try again" */}
      {!loading && error && (
        <div className="mt-6 mx-auto max-w-sm flex flex-col items-center gap-4 rounded-2xl border border-[var(--sky-blue)] bg-[var(--light-bg)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--dark-text)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => { setError(null); setRetryCount((c) => c + 1); }}
            className="rounded-full border border-[var(--primary)] bg-[var(--primary)] text-white text-sm font-medium px-6 py-2.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty states: neutral tone, no red */}
      {!loading && !error && allHotels.length === 0 && (
        <div className="mt-6 mx-auto max-w-sm flex flex-col items-center gap-3 rounded-2xl border border-[var(--sky-blue)] bg-[var(--light-bg)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            {!hasRequiredSearchParams
              ? "Tap the search bar above to choose a destination, dates, and guests."
              : `No hotels found for ${locationLabel} on these dates. Try different dates or search a nearby area.`}
          </p>
          {hasRequiredSearchParams && (
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium px-5 py-2 hover:bg-[var(--primary)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              Change search
            </button>
          )}
        </div>
      )}

      {!loading && !error && allHotels.length > 0 && sortedHotels.length === 0 && (
        <div className="mt-6 mx-auto max-w-sm flex flex-col items-center gap-3 rounded-2xl border border-[var(--sky-blue)] bg-[var(--light-bg)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No hotels match your current filters. Try changing refundable, price range, or property name.
          </p>
          <button
            type="button"
            onClick={() => setFilterPanelOpen(true)}
            className="rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium px-5 py-2 hover:bg-[var(--primary)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            Change filters
          </button>
        </div>
      )}

      {!loading && !error && (allHotels.length > 0 || (lazyLoadResult && sortedLazyHotels.length > 0)) && (
        <section className="space-y-4">
          {visibleHotels.map((hotel) => {
            const price = mergedPricesByHotelId[hotel.id];
            const hrefParamsStr = serializeResultsQuery(queryParams).toString();
            const hasAnyRefundable = mergedHasRefundableByHotelId[hotel.id];

            return (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                price={price}
                nights={nights}
                occupanciesLength={occupancies.length}
                hasRefundable={hasAnyRefundable}
                href={`/hotel/${hotel.id}?${hrefParamsStr}`}
                isFavorite={isFavorite(hotel.id)}
                onToggleFavorite={() => toggleFavorite(hotel.id)}
              />
            );
          })}
          {hasMore && (
            <div className="pt-2 pb-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + BATCH_SIZE)}
                className="rounded-full border border-[var(--sky-blue)] bg-white px-6 py-2.5 text-sm font-medium text-[var(--dark-text)] hover:bg-[var(--light-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
              >
                Load more
              </button>
            </div>
          )}

          {/* Phase 8: Lazy-load "Show all properties" — only when quality filters were applied */}
          {hasQualityFilters && !lazyLoadResult && !lazyLoadLoading && (
            <div className="pt-4 pb-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={fetchShowAllProperties}
                className="rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-6 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
              >
                Show all properties
              </button>
              <p className="text-xs text-[var(--muted-foreground)] text-center">
                Include budget & unrated options
              </p>
            </div>
          )}
          {lazyLoadLoading && (
            <div className="pt-4 pb-4 flex flex-col items-center gap-2">
              <p className="text-sm text-[var(--muted-foreground)]">Loading more properties…</p>
            </div>
          )}
          {lazyLoadError && (
            <div className="pt-4 pb-4 flex flex-col items-center gap-3 rounded-2xl border border-[var(--sky-blue)] bg-[var(--light-bg)] px-4 py-4 mx-2 text-center">
              <p className="text-sm text-[var(--dark-text)]">{lazyLoadError}</p>
              <button
                type="button"
                onClick={() => { setLazyLoadError(null); fetchShowAllProperties(); }}
                className="rounded-full border border-[var(--primary)] bg-[var(--primary)] text-white text-sm font-medium px-5 py-2 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                Try again
              </button>
            </div>
          )}

          {/* Phase 8: Separator and lazy-loaded (budget & unrated) hotels */}
          {lazyLoadResult && sortedLazyHotels.length > 0 && (
            <>
              <div className="pt-6 pb-2 border-t border-[var(--sky-blue)]">
                <h2 className="text-sm font-semibold text-[var(--muted-foreground)]">
                  Budget & unrated options
                </h2>
              </div>
              {sortedLazyHotels.map((hotel) => {
                const price = mergedPricesByHotelId[hotel.id];
                const hrefParamsStr = serializeResultsQuery(queryParams).toString();
                const hasAnyRefundable = mergedHasRefundableByHotelId[hotel.id];

                return (
                  <HotelCard
                    key={hotel.id}
                    hotel={hotel}
                    price={price}
                    nights={nights}
                    occupanciesLength={occupancies.length}
                    hasRefundable={hasAnyRefundable}
                    href={`/hotel/${hotel.id}?${hrefParamsStr}`}
                    isFavorite={isFavorite(hotel.id)}
                    onToggleFavorite={() => toggleFavorite(hotel.id)}
                  />
                );
              })}
            </>
          )}
        </section>
      )}
    </main>
    <BottomNav visible={bottomNavVisible} onSearchClick={() => setSearchModalOpen(true)} />
    </>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ResultsContent />
    </Suspense>
  );
}
