"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
}

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") as "place" | "vibe") ?? "place";
  const placeId = searchParams.get("placeId");
  const placeName = searchParams.get("placeName");
  const aiSearch = searchParams.get("aiSearch");
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const adults = Number(searchParams.get("adults") ?? "2");

  const router = useRouter();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOption>("recommended");
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchCheckin, setGlobalSearchCheckin] = useState(checkin);
  const [globalSearchCheckout, setGlobalSearchCheckout] = useState(checkout);
  const [globalSearchAdults, setGlobalSearchAdults] = useState(adults);
  useEffect(() => {
    setGlobalSearchCheckin(checkin);
    setGlobalSearchCheckout(checkout);
    setGlobalSearchAdults(adults);
    setGlobalSearchQuery(mode === "place" ? (placeName ?? "") : (aiSearch ?? ""));
    setVisibleCount(INITIAL_BATCH);
  }, [mode, placeName, aiSearch, checkin, checkout, adults]);

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/rates/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode,
            placeId,
            aiSearch,
            checkin,
            checkout,
            adults
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
  }, [mode, placeId, aiSearch, checkin, checkout, adults]);

  const allHotels: LiteAPIHotel[] =
    data?.raw?.hotels ??
    (Array.isArray(data?.raw?.data)
      ? data!.raw.data
        .map((item: any) => item.hotel)
        .filter(Boolean)
      : []);

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
    mode === "place" ? (placeName || "this location") : "your search";

  const title =
    mode === "place"
      ? placeName || "Destination stays"
      : "Matches for your vibe";

  const handleGlobalSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!globalSearchQuery.trim()) return;
    const params = new URLSearchParams();
    // Default to vibe mode (query-based search) - will be interpreted by backend
    params.set("mode", "vibe");
    params.set("aiSearch", globalSearchQuery.trim());
    params.set("checkin", globalSearchCheckin);
    params.set("checkout", globalSearchCheckout);
    params.set("adults", String(globalSearchAdults));
    router.push(`/results?${params.toString()}`);
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
            {checkin} → {checkout} · {adults}{" "}
            {adults === 1 ? "guest" : "guests"}
          </p>
        </div>
      </header>

      <form
        onSubmit={handleGlobalSearch}
        className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2"
      >
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          Search by destination
        </p>
        <input
          type="text"
          value={globalSearchQuery}
          onChange={(e) => setGlobalSearchQuery(e.target.value)}
          placeholder="Search destination (e.g. Paris, New York, London)"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={globalSearchCheckin}
            onChange={(e) => setGlobalSearchCheckin(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50"
          />
          <input
            type="date"
            value={globalSearchCheckout}
            onChange={(e) => setGlobalSearchCheckout(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50"
          />
          <input
            type="number"
            min={1}
            value={globalSearchAdults}
            onChange={(e) => setGlobalSearchAdults(Number(e.target.value) || 1)}
            className="w-14 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold px-3 py-1.5"
          >
            Search
          </button>
        </div>
      </form>

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
          className="fixed inset-0 z-20 bg-slate-950/80 flex items-end sm:items-center justify-center"
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

      {loading && (
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
      )}

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
            if (placeId) hrefParams.set("placeId", placeId);
            if (placeName) hrefParams.set("placeName", placeName);
            if (aiSearch) hrefParams.set("aiSearch", aiSearch);
            hrefParams.set("checkin", checkin);
            hrefParams.set("checkout", checkout);
            hrefParams.set("adults", String(adults));
            const hrefParamsStr = hrefParams.toString();

            return (
              <Link
                key={hotel.id}
                href={`/hotel/${hotel.id}?${hrefParamsStr}`}
                className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-lg shadow-slate-950/40"
              >
                <div className="flex gap-3">
                  <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                    {hotel.main_photo ? (
                      <img
                        src={hotel.main_photo}
                        alt={hotel.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-between gap-1">
                    <div>
                      <h2 className="text-sm font-semibold leading-snug">
                        {hotel.name}
                      </h2>
                      {hotel.address && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {hotel.address}
                        </p>
                      )}
                      {(hotel.rating != null || hotel.reviewCount != null) && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-emerald-300">
                          {hotel.rating != null && (
                            <>
                              ★ <span className="font-medium">{hotel.rating.toFixed(1)}</span>
                            </>
                          )}
                          {hotel.reviewCount != null && (
                            <span className="text-slate-400">
                              {hotel.reviewCount.toLocaleString()} reviews
                            </span>
                          )}
                          {hotel.reviewCount == null && hotel.rating != null && (
                            <span className="text-slate-400">— reviews</span>
                          )}
                          {hotel.persona && (
                            <span className="text-slate-400">
                              · {hotel.persona}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {price && (
                      <div className="flex items-baseline justify-between mt-2">
                        <div className="text-xs text-slate-400">
                          {price.refundableTag === "NRF" ||
                            price.refundableTag === "NRFN"
                            ? "Non-refundable"
                            : "Free cancellation (see details)"}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {price.currency}{" "}
                            {price.amount.toFixed(0)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {price.taxIncluded
                              ? "incl. taxes & fees"
                              : "+ taxes & fees"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {hotel.tags && hotel.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
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

