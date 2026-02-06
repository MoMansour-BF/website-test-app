"use client";

import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { DEFAULT_OCCUPANCIES, getNights, parseOccupanciesParam, serializeOccupancies, toApiOccupancies, totalGuests } from "@/lib/occupancy";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, Suspense, useRef } from "react";

const INITIAL_BATCH = 24;
const BATCH_SIZE = 24;

type SortOption = "recommended" | "price_asc" | "price_desc" | "rating_desc";

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
  /** Enriched from hotel details API (rates response doesn't include reviewCount). */
  hotelDetailsByHotelId?: Record<string, { reviewCount?: number; rating?: number }>;
}

interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
}

function ResultsLoading() {
  return (
    <div className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 flex gap-3 animate-pulse"
          >
            <div className="w-24 h-24 rounded-xl bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-800 rounded" />
              <div className="h-3 bg-slate-800 rounded w-2/3" />
              <div className="h-3 bg-slate-800 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") as "place" | "vibe") ?? "place";
  const placeIdParam = searchParams.get("placeId");
  const placeNameParam = searchParams.get("placeName");
  const aiSearchParam = searchParams.get("aiSearch");
  const checkinParam = searchParams.get("checkin") ?? "";
  const checkoutParam = searchParams.get("checkout") ?? "";
  const occupanciesParam = searchParams.get("occupancies");
  const adultsLegacy = searchParams.get("adults");
  const occupancies = useMemo(() => {
    if (occupanciesParam) return parseOccupanciesParam(occupanciesParam);
    const a = Number(adultsLegacy);
    if (a >= 1) return [{ adults: a, children: [] }];
    return parseOccupanciesParam(null);
  }, [occupanciesParam, adultsLegacy]);
  const effectiveOccupanciesParam =
    occupanciesParam ??
    (adultsLegacy ? `${adultsLegacy}` : serializeOccupancies(DEFAULT_OCCUPANCIES));
  const guestsCount = totalGuests(occupancies);
  const nights = getNights(checkinParam, checkoutParam);

  const router = useRouter();
  const { currency, locale } = useLocaleCurrency();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOption>("recommended");
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Search form state
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchCheckin, setGlobalSearchCheckin] = useState(checkinParam);
  const [globalSearchCheckout, setGlobalSearchCheckout] = useState(checkoutParam);
  const [globalSearchOccupanciesParam, setGlobalSearchOccupanciesParam] = useState("");

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);

  // Sync state with URL params on load/change
  useEffect(() => {
    setGlobalSearchCheckin(checkinParam);
    setGlobalSearchCheckout(checkoutParam);
    setGlobalSearchOccupanciesParam(effectiveOccupanciesParam);

    // Initialize query logic
    const initialQuery = mode === "place" ? (placeNameParam ?? "") : (aiSearchParam ?? "");
    setGlobalSearchQuery(initialQuery);

    // If it's a place mode, set the selected place ID so we know it's "locked in"
    if (mode === "place" && placeIdParam) {
      setSelectedPlaceId(placeIdParam);
      setSelectedPlaceName(placeNameParam);
    } else {
      setSelectedPlaceId(null);
      setSelectedPlaceName(null);
    }

    setVisibleCount(INITIAL_BATCH);
  }, [mode, placeIdParam, placeNameParam, aiSearchParam, checkinParam, checkoutParam, effectiveOccupanciesParam]);

  // Fetch results (refetches when currency changes so list reloads with new prices)
  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/rates/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            mode,
            placeId: placeIdParam,
            aiSearch: aiSearchParam,
            checkin: checkinParam,
            checkout: checkoutParam,
            occupancies: toApiOccupancies(occupancies),
            currency,
            language: locale
          })
        });
        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(json?.error?.message ?? "Failed to load results");
        }
        setData(json as SearchResponse);
      } catch (err: any) {
        setError(err.message ?? "Failed to load results");
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [mode, placeIdParam, aiSearchParam, checkinParam, checkoutParam, occupancies, currency, locale]);

  // Places autocomplete effect
  useEffect(() => {
    // Only search if user is typing and hasn't just selected a place (implied by query matching name)
    // Actually, simpler: if query changes, we search, unless it matches the selected place name perfectly?
    // Let's just search always on query change if query is long enough.

    if (!globalSearchQuery || globalSearchQuery.trim().length < 2) {
      setSuggestions([]);
      setPlacesError(null);
      return;
    }

    // Don't search if the query is exactly what we just selected
    if (selectedPlaceName && globalSearchQuery === selectedPlaceName) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoadingPlaces(true);
        setPlacesError(null);
        const params = new URLSearchParams({ q: globalSearchQuery.trim() });
        if (locale) params.set("language", locale);
        const res = await fetch(`/api/places?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) throw new Error("Failed to load places");

        const json = await res.json();
        const data = (json?.data ?? []) as any[];
        setSuggestions(
          data.map((p) => ({
            placeId: p.placeId,
            displayName: p.displayName,
            formattedAddress: p.formattedAddress
          }))
        );
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setPlacesError("Could not load destinations");
      } finally {
        setLoadingPlaces(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [globalSearchQuery, selectedPlaceName, locale]);

  const allHotels: LiteAPIHotel[] = useMemo(() => {
    const raw = data?.raw?.hotels ??
      (Array.isArray(data?.raw?.data)
        ? data!.raw.data
          .map((item: any) => item.hotel)
          .filter(Boolean)
        : []);
    const detailsByHotelId = data?.hotelDetailsByHotelId ?? {};
    return (raw as any[]).map((h: any) => {
      const id = h?.id ?? h?.hotelId;
      const details = id ? detailsByHotelId[id] : undefined;
      return {
        ...h,
        id,
        reviewCount: h?.reviewCount ?? h?.review_count ?? details?.reviewCount ?? undefined,
        rating: h?.rating ?? details?.rating ?? undefined
      };
    });
  }, [data?.raw?.hotels, data?.raw?.data, data?.hotelDetailsByHotelId]);

  const sortedHotels = useMemo(() => {
    const list = [...allHotels];
    if (sortOrder === "recommended") return list;
    if (sortOrder === "price_asc") {
      return list.sort((a, b) => {
        const pa = data?.pricesByHotelId[a.id]?.amount ?? Infinity;
        const pb = data?.pricesByHotelId[b.id]?.amount ?? Infinity;
        return pa - pb;
      });
    }
    if (sortOrder === "price_desc") {
      return list.sort((a, b) => {
        const pa = data?.pricesByHotelId[a.id]?.amount ?? 0;
        const pb = data?.pricesByHotelId[b.id]?.amount ?? 0;
        return pb - pa;
      });
    }
    if (sortOrder === "rating_desc") {
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    return list;
  }, [allHotels, sortOrder, data?.pricesByHotelId]);

  const visibleHotels = sortedHotels.slice(0, visibleCount);
  const hasMore = visibleCount < sortedHotels.length;

  const locationLabel =
    mode === "place" ? (placeNameParam || "this location") : "your search";

  const title =
    mode === "place"
      ? placeNameParam || "Destination stays"
      : "Matches for your vibe";

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setSelectedPlaceId(place.placeId);
    setSelectedPlaceName(place.displayName);
    setGlobalSearchQuery(place.displayName);
    setSuggestions([]);
    setPlacesError(null);
  };

  const handleGlobalSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!globalSearchQuery.trim()) return;

    // If query was cleared, reset selected place
    if (!globalSearchQuery) {
      setSelectedPlaceId(null);
      setSelectedPlaceName(null);
    }

    const params = new URLSearchParams();

    // Check if we have a selected place that matches the current query text
    // (fuzzy check: if query contains the place name or vice versa, or just relying on selectedPlaceId if set)
    // Strongest signal: user clicked a suggestion, so selectedPlaceId is set.
    // However, if they typed something else afterwards, we should clear it. 
    // Effect above doesn't clear ID on text change, so we effectively "stick" to the ID unless they clear text?
    // Let's rely on: if selectedPlaceId is set AND query is roughly similar (or we just trust the ID if they didn't clear it).
    // Better: if they type something new, we should probably reset ID.
    // Re-implementing simplified logic: If selectedPlaceId is present, we allow it.

    if (selectedPlaceId) {
      params.set("mode", "place");
      params.set("placeId", selectedPlaceId);
      params.set("placeName", selectedPlaceName || globalSearchQuery);
    } else {
      // Fallback to vibe/text search
      params.set("mode", "vibe");
      params.set("aiSearch", globalSearchQuery.trim());
    }

    params.set("checkin", globalSearchCheckin);
    params.set("checkout", globalSearchCheckout);
    if (globalSearchOccupanciesParam) params.set("occupancies", globalSearchOccupanciesParam);
    router.push(`/results?${params.toString()}`);
    setSuggestions([]); // close dropdown
  };

  // Clear selected place if user changes text significantly (basic heuristic)
  const onInputChange = (val: string) => {
    setGlobalSearchQuery(val);
    if (selectedPlaceName && val !== selectedPlaceName) {
      setSelectedPlaceId(null);
      setSelectedPlaceName(null);
    }
  };

  return (
    <main className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="h-9 w-9 rounded-full border border-slate-700 flex items-center justify-center text-slate-200 text-sm shrink-0"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight truncate">
            {title}
          </h1>
          <p className="text-[11px] text-slate-400">
            {checkinParam} → {checkoutParam} · {guestsCount}{" "}
            {guestsCount === 1 ? "guest" : "guests"}
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2 relative z-20">
        <form onSubmit={handleGlobalSearch} className="space-y-2">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            Search by destination
          </p>
          <div className="relative">
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Search destination (e.g. Paris, New York, London)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoComplete="off"
            />

            {/* Autocomplete Dropdown */}
            {(suggestions.length > 0 || loadingPlaces || placesError) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                {loadingPlaces && (
                  <div className="p-3 text-[11px] text-slate-500">
                    Searching destinations…
                  </div>
                )}
                {placesError && (
                  <div className="p-3 text-[11px] text-red-400">
                    {placesError}
                  </div>
                )}
                {suggestions.length > 0 && (
                  <ul className="divide-y divide-slate-800/50">
                    {suggestions.map((place) => (
                      <li key={place.placeId}>
                        <button
                          type="button"
                          onClick={() => handleSelectPlace(place)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-50 hover:bg-slate-800/80 hover:text-emerald-400 transition-colors"
                        >
                          <div className="font-medium">
                            {place.displayName}
                          </div>
                          {place.formattedAddress && (
                            <div className="text-[11px] text-slate-400 truncate">
                              {place.formattedAddress}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <input
              type="date"
              value={globalSearchCheckin}
              onChange={(e) => setGlobalSearchCheckin(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 [color-scheme:dark]"
            />
            <input
              type="date"
              value={globalSearchCheckout}
              onChange={(e) => setGlobalSearchCheckout(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 [color-scheme:dark]"
            />
            <span className="text-xs text-slate-400 py-1.5">
              {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"} · {guestsCount} guests
            </span>
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold px-3 py-1.5"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {!loading && !error && allHotels.length > 0 && (
        <section className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800 space-y-2">
          <p className="text-sm font-medium text-slate-200">
            {allHotels.length} hotel{allHotels.length !== 1 ? "s" : ""} in {locationLabel}
          </p>
          <div className="flex gap-2 items-center">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOption)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="recommended">Sort: Recommended</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating_desc">Rating: High to Low</option>
            </select>
            <button
              type="button"
              onClick={() => setFilterPanelOpen(true)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            >
              Filters
            </button>
          </div>
        </section>
      )}

      {filterPanelOpen && (
        <div
          className="fixed inset-0 z-[50] bg-slate-950/80 flex items-end sm:items-center justify-center"
          onClick={() => setFilterPanelOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Filters</h3>
            <p className="text-xs text-slate-400">Filters coming soon.</p>
            <button
              type="button"
              onClick={() => setFilterPanelOpen(false)}
              className="mt-3 w-full rounded-full border border-slate-600 text-slate-200 text-sm py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {loading && <ResultsLoading />}

      {!loading && error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && allHotels.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">
          No hotels found for this search. Try adjusting your dates or
          searching a nearby area.
        </p>
      )}

      {!loading && !error && visibleHotels.length > 0 && (
        <section className="space-y-3">
          {visibleHotels.map((hotel) => {
            const price = data?.pricesByHotelId[hotel.id];
            const hrefParams = new URLSearchParams();
            if (mode) hrefParams.set("mode", mode);
            if (placeIdParam) hrefParams.set("placeId", placeIdParam);
            if (placeNameParam) hrefParams.set("placeName", placeNameParam);
            if (aiSearchParam) hrefParams.set("aiSearch", aiSearchParam);
            hrefParams.set("checkin", checkinParam);
            hrefParams.set("checkout", checkoutParam);
            if (effectiveOccupanciesParam) hrefParams.set("occupancies", effectiveOccupanciesParam);
            const hrefParamsStr = hrefParams.toString();

            const hasAnyRefundable = data?.hasRefundableRateByHotelId?.[hotel.id];
            return (
              <Link
                key={hotel.id}
                href={`/hotel/${hotel.id}?${hrefParamsStr}`}
                className="block rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-lg shadow-slate-950/40"
              >
                <div className="flex min-h-[140px]">
                  <div className="w-36 min-w-[140px] flex-shrink-0 overflow-hidden bg-slate-800">
                    {hotel.main_photo ? (
                      <img
                        src={hotel.main_photo}
                        alt={hotel.name}
                        className="w-full h-full min-h-[140px] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[140px] flex items-center justify-center text-[10px] text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-between gap-1 p-3 min-w-0">
                    <div>
                      <h2 className="text-sm font-semibold leading-snug text-slate-50">
                        {hotel.name}
                      </h2>
                      {hotel.address && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {hotel.address}
                        </p>
                      )}
                      {(hotel.rating != null || hotel.reviewCount != null) && (
                        <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[11px]">
                          {hotel.rating != null && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-medium text-emerald-300">
                              {hotel.rating.toFixed(1)}
                            </span>
                          )}
                          {hotel.reviewCount != null ? (
                            <span className="text-slate-400">
                              {hotel.reviewCount.toLocaleString()} reviews
                            </span>
                          ) : hotel.rating != null ? (
                            <span className="text-slate-400">reviews</span>
                          ) : null}
                          {hotel.persona && (
                            <span className="text-slate-400">· {hotel.persona}</span>
                          )}
                        </p>
                      )}
                      {/* Refundability: one tag in same section (green Refundable / red Non-refundable / neutral Free cancellation) */}
                      {hasAnyRefundable ? (
                        <p className="mt-1 text-[11px] font-medium text-emerald-400">
                          Refundable
                        </p>
                      ) : price ? (
                        <p
                          className={
                            price.refundableTag === "NRF" || price.refundableTag === "NRFN"
                              ? "mt-1 text-[11px] font-medium text-red-400"
                              : "mt-1 text-[11px] font-medium text-slate-400"
                          }
                        >
                          {price.refundableTag === "NRF" || price.refundableTag === "NRFN"
                            ? "Non-refundable"
                            : "Free cancellation (see details)"}
                        </p>
                      ) : null}
                    </div>
                    {price && (
                      <div className="flex items-baseline justify-between mt-2 gap-2">
                        <div className="text-xs text-slate-400 min-w-0" />
                        <div className="text-right shrink-0">
                          <div className="text-base font-semibold text-slate-50">
                            {price.currency}
                            {nights > 0
                              ? (price.amount / nights).toLocaleString(undefined, { maximumFractionDigits: 0 })
                              : price.amount.toFixed(0)}
                            <span className="font-normal text-slate-400 text-sm"> / night</span>
                          </div>
                          {nights > 0 && (
                            <div className="text-sm font-medium text-slate-200 mt-0.5">
                              {price.currency}
                              {price.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                              Total
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {nights} {nights === 1 ? "night" : "nights"}
                            {", "}
                            {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"}
                            {", "}
                            {price.taxIncluded ? "incl. taxes & fees" : "+ taxes & fees"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {hotel.tags && hotel.tags.length > 0 && (
                  <div className="px-3 pb-3 pt-0 flex flex-wrap gap-1">
                    {hotel.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
          {hasMore && (
            <div className="pt-2 pb-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + BATCH_SIZE)}
                className="rounded-full border border-slate-600 bg-slate-900 px-6 py-2.5 text-sm font-medium text-slate-200"
              >
                Load more
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ResultsContent />
    </Suspense>
  );
}
