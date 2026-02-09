"use client";

import { BottomNav } from "@/components/BottomNav";
import { HomeHeader } from "@/components/HomeHeader";
import { HotelCard } from "@/components/HotelCard";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { SearchModal } from "@/components/SearchModal";
import { useFavoriteHotels } from "@/context/FavoriteHotelsContext";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import {
  formatDateForInput,
  formatRangeShort,
  parseYYYYMMDD,
} from "@/lib/date-utils";
import {
  DEFAULT_OCCUPANCIES,
  type Occupancy,
  parseOccupanciesParam,
  serializeOccupancies,
  totalGuests,
} from "@/lib/occupancy";
import { getLastSearch, setLastSearch, pushRecentSearch } from "@/lib/lastSearch";
import {
  buildResultsQueryParams,
  resultsUrl,
  backgroundSearchParamsSignature,
  PRELOADED_SEARCH_RESULT_KEY,
} from "@/lib/results-query";
import { useBackgroundSearch } from "@/hooks/useBackgroundSearch";
import { useRouter } from "next/navigation";
import {
  CalendarIcon,
  HeartIcon,
  HeartIconFilled,
  MapPinIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/Icons";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { serializePlaceTypes, type PlaceSuggestion } from "@/lib/place-utils";

type SearchMode = "place" | "vibe";

const POPULAR_DESTINATIONS = [
  {
    placeId: "ChIJdYeB7UwbwhURzslwz2kkq5g",
    name: "Makkah",
    image:
      "https://images.unsplash.com/photo-1592326871020-04f58c1a52f3?q=80&w=930&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    placeId: "ChIJs7s9zbKHUhQRYMPTi_kHuC0",
    name: "Hurghada",
    image:
      "https://images.unsplash.com/photo-1722264222007-3e4f1808db3e?q=80&w=2066&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    placeId: "ChIJu46S-ZZhLxMROG5lkwZ3D7k",
    name: "Rome",
    image:
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1696&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    placeId: "ChIJoQ8Q6NNB0S0RkOYkS7EPkSQ",
    name: "Bali",
    image:
      "https://images.unsplash.com/photo-1555400038-63f5ba517a47?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    placeId: "ChIJ51cu8IcbXWARiRtXIothAS4",
    name: "Tokyo",
    image:
      "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?q=80&w=1136&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
];

/** Shuffle array (Fisher–Yates). Used so popular destinations display in random order. */
function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Featured / recommended hotel IDs (prerender links: checkin tomorrow, checkout day after). */
const FEATURED_HOTEL_IDS = [
  { id: "lp3424b8", name: "Voco Makkah" },
  { id: "lp6555a80a", name: "JAZ Soma Beach" },
  { id: "lpa93b7", name: "Black Penny Villas Ubud" },
  { id: "lp1bf25", name: "Swissôtel Amsterdam" },
];

interface LikedHotelDetails {
  id: string;
  name: string;
  main_photo?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
}

export default function HomePage() {
  const router = useRouter();
  const { locale, currency } = useLocaleCurrency();
  const chromeVisible = useScrollDirection();
  const { favoriteIds, isFavorite, toggleFavorite } = useFavoriteHotels();
  const [likedHotelsDetails, setLikedHotelsDetails] = useState<
    LikedHotelDetails[]
  >([]);
  const [likedHotelsLoading, setLikedHotelsLoading] = useState(false);
  const [featuredHotelsDetails, setFeaturedHotelsDetails] = useState<
    LikedHotelDetails[]
  >([]);
  const [featuredHotelsLoading, setFeaturedHotelsLoading] = useState(true);
  const [mode, setMode] = useState<SearchMode>("place");
  const [query, setQuery] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [placeFormattedAddress, setPlaceFormattedAddress] = useState<string | null>(null);
  const [placeTypes, setPlaceTypes] = useState<string[]>([]);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [occupancies, setOccupancies] = useState<Occupancy[]>(() => DEFAULT_OCCUPANCIES);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalInitialView, setSearchModalInitialView] = useState<
    "overview" | "where" | "when" | "who" | undefined
  >(undefined);
  const dateDefaultsInitializedRef = useRef(false);
  const lastSearchPrefilledRef = useRef(false);
  const backgroundSearch = useBackgroundSearch({
    currency,
    locale,
    nationality: "EG",
  });
  const prevBgLocationKeyRef = useRef<string>("");

  useEffect(() => {
    if (dateDefaultsInitializedRef.current) return;
    dateDefaultsInitializedRef.current = true;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setCheckin((prev) => (prev === "" ? formatDateForInput(today) : prev));
    setCheckout((prev) => (prev === "" ? formatDateForInput(tomorrow) : prev));
  }, []);

  // Phase 3.5: prefill search bar from last search (after date defaults)
  useEffect(() => {
    if (lastSearchPrefilledRef.current) return;
    const last = getLastSearch();
    if (!last) return;
    lastSearchPrefilledRef.current = true;
    setMode(last.mode);
    setPlaceId(last.placeId);
    setPlaceLabel(last.placeName);
    setPlaceFormattedAddress(last.placeAddress ?? null);
    setPlaceTypes(last.placeTypes ?? []);
    setQuery(last.mode === "place" ? (last.placeName ?? "") : (last.aiSearch ?? ""));
    if (last.checkin) setCheckin(last.checkin);
    if (last.checkout) setCheckout(last.checkout);
    setOccupancies(parseOccupanciesParam(last.occupancies));
  }, []);

  // Fetch details for liked hotels (for "Your liked hotels" section)
  useEffect(() => {
    if (favoriteIds.length === 0) {
      setLikedHotelsDetails([]);
      return;
    }
    const controller = new AbortController();
    setLikedHotelsLoading(true);
    Promise.all(
      favoriteIds.map((id) =>
        fetch(
          `/api/hotel/details?hotelId=${encodeURIComponent(id)}${locale ? `&language=${locale}` : ""}`,
          { credentials: "include", signal: controller.signal }
        )
          .then((r) => r.json())
          .then((json) => {
            if (json?.error) return null;
            const d = json?.data;
            return d
              ? {
                  id: d.id ?? id,
                  name: d.name ?? "Hotel",
                  main_photo: d.main_photo,
                  address: d.address ?? d.city,
                  rating: d.rating,
                  reviewCount: d.reviewCount,
                }
              : null;
          })
          .catch(() => null)
      )
    )
      .then((results) => {
        setLikedHotelsDetails(
          results.filter((r) => r != null) as LikedHotelDetails[]
        );
      })
      .finally(() => setLikedHotelsLoading(false));
    return () => controller.abort();
  }, [favoriteIds, locale]);

  /** Featured section: checkin tomorrow, checkout day after tomorrow. */
  const featuredDates = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return {
      checkin: formatDateForInput(tomorrow),
      checkout: formatDateForInput(dayAfter),
    };
  }, []);

  /** Popular destinations: original order for SSR/first paint to avoid hydration mismatch; shuffled after mount. */
  const [popularDestinationsOrdered, setPopularDestinationsOrdered] = useState<typeof POPULAR_DESTINATIONS>(POPULAR_DESTINATIONS);
  useEffect(() => {
    setPopularDestinationsOrdered(shuffleArray(POPULAR_DESTINATIONS));
  }, []);

  const featuredSearchParams = useMemo(
    () =>
      new URLSearchParams({
        checkin: featuredDates.checkin,
        checkout: featuredDates.checkout,
        occupancies: serializeOccupancies(DEFAULT_OCCUPANCIES),
      }),
    [featuredDates.checkin, featuredDates.checkout]
  );

  // Fetch details for featured hotels (prerender / recommended list)
  useEffect(() => {
    const ids = FEATURED_HOTEL_IDS.map((h) => h.id);
    const controller = new AbortController();
    setFeaturedHotelsLoading(true);
    Promise.all(
      ids.map((id) =>
        fetch(
          `/api/hotel/details?hotelId=${encodeURIComponent(id)}${locale ? `&language=${locale}` : ""}`,
          { credentials: "include", signal: controller.signal }
        )
          .then((r) => r.json())
          .then((json) => {
            if (json?.error) return null;
            const d = json?.data;
            return d
              ? {
                  id: d.id ?? id,
                  name: d.name ?? FEATURED_HOTEL_IDS.find((h) => h.id === id)?.name ?? "Hotel",
                  main_photo: d.main_photo,
                  address: d.address ?? d.city,
                  rating: d.rating,
                  reviewCount: d.reviewCount,
                }
              : null;
          })
          .catch(() => null)
      )
    )
      .then((results) => {
        setFeaturedHotelsDetails(
          results.filter((r) => r != null) as LikedHotelDetails[]
        );
      })
      .finally(() => setFeaturedHotelsLoading(false));
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (mode !== "place") return;
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setPlacesError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoadingPlaces(true);
        setPlacesError(null);
        const params = new URLSearchParams({ q: query.trim() });
        if (locale) params.set("language", locale);
        const res = await fetch(`/api/places?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error("Failed to load places");
        }
        const json = await res.json();
        const data = (json?.data ?? []) as any[];
        setSuggestions(
          data.map((p: any) => ({
            placeId: p.placeId,
            displayName: p.displayName,
            formattedAddress: p.formattedAddress,
            types: Array.isArray(p.types) ? p.types : undefined,
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
  }, [mode, query, locale]);

  const canSubmit =
    !!checkin &&
    !!checkout &&
    ((mode === "place" && !!placeId) ||
      (mode === "vibe" && !!query.trim()));

  // Phase 5.5: background search when modal is open and we have location
  const hasLocationForBackground =
    (mode === "place" && !!placeId) || (mode === "vibe" && !!query.trim());
  useEffect(() => {
    if (!searchModalOpen || !hasLocationForBackground) return;
    const params = buildResultsQueryParams({
      mode: mode === "place" ? "place" : "vibe",
      placeId: mode === "place" ? placeId : null,
      placeName: mode === "place" ? placeLabel : null,
      placeAddress: mode === "place" ? placeFormattedAddress ?? null : null,
      placeTypes: mode === "place" ? placeTypes : undefined,
      aiSearch: mode === "vibe" ? query.trim() : null,
      checkin: checkin || featuredDates.checkin,
      checkout: checkout || featuredDates.checkout,
      occupancies: occupancies.length ? occupancies : DEFAULT_OCCUPANCIES,
      nationality: "EG",
    });
    const locationKey = mode === "place" ? placeId ?? "" : (query?.trim() ?? "");
    const trigger =
      prevBgLocationKeyRef.current !== locationKey ? "location" : "dateOrOccupancy";
    prevBgLocationKeyRef.current = locationKey;
    backgroundSearch.startBackgroundSearch(params, { trigger });
  }, [
    searchModalOpen,
    hasLocationForBackground,
    mode,
    placeId,
    placeLabel,
    placeFormattedAddress,
    placeTypes,
    query,
    checkin,
    checkout,
    occupancies,
    featuredDates.checkin,
    featuredDates.checkout,
    backgroundSearch,
  ]);

  useEffect(() => {
    if (!searchModalOpen) backgroundSearch.cancel();
  }, [searchModalOpen, backgroundSearch]);

  const doSearch = () => {
    if (!canSubmit) return;
    const params = buildResultsQueryParams({
      mode: mode === "place" ? "place" : "vibe",
      placeId: mode === "place" ? placeId : null,
      placeName: mode === "place" ? placeLabel : null,
      placeAddress: mode === "place" ? placeFormattedAddress ?? null : null,
      placeTypes: mode === "place" ? placeTypes : undefined,
      aiSearch: mode === "vibe" ? query.trim() : null,
      checkin,
      checkout,
      occupancies,
      nationality: "EG",
    });
    setLastSearch(params);
    pushRecentSearch(params);
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSearch();
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setPlaceId(place.placeId || null);
    setPlaceLabel(place.displayName || null);
    setPlaceFormattedAddress(place.formattedAddress ?? null);
    setPlaceTypes(place.types ?? []);
    setQuery(place.displayName);
    setSuggestions([]);
    setPlacesError(null);
  };

  const dateRangeText =
    checkin && checkout && parseYYYYMMDD(checkin) && parseYYYYMMDD(checkout)
      ? formatRangeShort(
          parseYYYYMMDD(checkin)!,
          parseYYYYMMDD(checkout)!,
          locale
        )
      : "Add dates";

  const guestsCount = totalGuests(occupancies);
  const roomsCount = occupancies.length;
  const guestsSummary =
    guestsCount > 0
      ? `${roomsCount} Rm, ${guestsCount} Gst`
      : "Add guests";

  return (
    <>
      <HomeHeader visible={chromeVisible} />
      <main className="flex-1 flex flex-col min-h-screen bg-[var(--light-bg)] pb-24">
        {/* Hero: background image + centered text (swap image via src below) */}
        <div className="relative h-[400px] overflow-hidden flex flex-col justify-center items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://plus.unsplash.com/premium_photo-1719843013722-c2f4d69db940?q=80&w=1035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="relative z-10 px-6 text-center">
            <h1 className="text-white text-[2rem] sm:text-[2.75rem] font-bold leading-[1.15] tracking-tight">
              Unbeatable hotel deals
            </h1>
            <p className="text-white/90 text-base sm:text-lg mt-3 max-w-[320px] mx-auto leading-snug">
              Discover and book thousands of stays at prices you'll love.
            </p>
          </div>
        </div>

        {/* Search card: overlay between hero and next section */}
        <div className="px-4 -mt-16 relative z-20">
          <div className="bg-white rounded-2xl shadow-xl p-5 border border-slate-200 max-w-md mx-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Destination — opens modal directly to Where */}
              <button
                type="button"
                onClick={() => {
                  setSearchModalInitialView("where");
                  setSearchModalOpen(true);
                }}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 w-full text-left hover:border-slate-200 hover:bg-slate-100/50 transition-colors"
              >
                <MapPinIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Destination
                  </span>
                  <span className="block text-sm font-semibold text-slate-700 truncate">
                    {placeLabel || "Where are you going?"}
                  </span>
                  {placeFormattedAddress && (
                    <span className="block text-xs text-slate-500 truncate">
                      {placeFormattedAddress}
                    </span>
                  )}
                </div>
              </button>

              <div className="grid grid-cols-2 gap-3">
                {/* Dates — opens modal directly to When */}
                <button
                  type="button"
                  onClick={() => {
                    setSearchModalInitialView("when");
                    setSearchModalOpen(true);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 w-full text-left hover:border-slate-200 hover:bg-slate-100/50 transition-colors"
                >
                  <CalendarIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
                  <div className="min-w-0">
<span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Dates
                    </span>
                    <span className="block text-sm font-semibold text-slate-700 truncate">
                      {dateRangeText}
                    </span>
                  </div>
                </button>
                {/* Rooms/Guests — opens modal directly to Who */}
                <button
                  type="button"
                  onClick={() => {
                    setSearchModalInitialView("who");
                    setSearchModalOpen(true);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 w-full text-left hover:border-slate-200 hover:bg-slate-100/50 transition-colors"
                >
                  <UsersIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Rooms/Guests
                    </span>
                    <span className="block text-sm font-semibold text-slate-700 truncate">
                      {guestsSummary}
                    </span>
                  </div>
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-xl font-bold py-4 flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canSubmit}
              >
                <SearchIcon className="w-4 h-4" />
                Search Journeys
              </button>
            </form>
          </div>
        </div>

        {/* Popular Destinations — horizontal scroll, links to results (tomorrow → day after checkout) */}
        <section className="py-8 mt-2">
          <div className="flex items-center justify-between mb-4 px-6">
            <h2 className="text-xl font-bold text-[var(--dark-text)] tracking-tight">
              Popular Destinations
            </h2>
            <button type="button" className="text-[var(--primary)] text-sm font-medium">
              See all
            </button>
          </div>
          <div className="overflow-x-auto px-6 -mx-6 sm:mx-0 sm:px-6">
            <div className="flex gap-4 pb-2 min-w-0" style={{ width: "max-content" }}>
              {popularDestinationsOrdered.map((dest) => {
                const params = buildResultsQueryParams({
                  mode: "place",
                  placeId: dest.placeId,
                  placeName: dest.name,
                  checkin: featuredDates.checkin,
                  checkout: featuredDates.checkout,
                  occupancies: DEFAULT_OCCUPANCIES,
                  nationality: "EG"
                });
                return (
                  <Link
                    key={dest.placeId}
                    href={resultsUrl(params)}
                    className="relative rounded-2xl overflow-hidden h-40 w-[160px] shrink-0 block text-left focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dest.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-4 left-4 text-white font-semibold">
                      {dest.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Your liked hotels (when list non-empty) or Featured Hotels (placeholder) */}
        <section className="px-6 pb-10">
          {favoriteIds.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
<h2 className="text-xl font-bold text-[var(--dark-text)] tracking-tight">
                Your liked hotels
                </h2>
              </div>
              {likedHotelsLoading ? (
                <div className="space-y-4">
                  {favoriteIds.map((id) => (
                    <div
                      key={id}
                      className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden animate-pulse"
                    >
                      <div className="h-52 w-full bg-[var(--muted)]" />
                      <div className="p-4 space-y-2">
                        <div className="h-4 bg-[var(--muted)] rounded w-3/4" />
                        <div className="h-3 bg-[var(--muted)] rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {likedHotelsDetails.map((hotel) => (
                    <HotelCard
                      key={hotel.id}
                      hotel={hotel}
                      nights={0}
                      occupanciesLength={1}
                      href={`/hotel/${hotel.id}`}
                      isFavorite={isFavorite(hotel.id)}
                      onToggleFavorite={() => toggleFavorite(hotel.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
<h2 className="text-xl font-bold text-[var(--dark-text)] tracking-tight">
                Featured Hotels
                </h2>
              </div>
              {featuredHotelsLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {FEATURED_HOTEL_IDS.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-xl border border-[var(--sky-blue)] bg-white overflow-hidden animate-pulse"
                    >
                      <div className="h-28 w-full bg-[var(--muted)]" />
                      <div className="p-2.5">
                        <div className="h-3.5 bg-[var(--muted)] rounded w-4/5" />
                        <div className="h-3 bg-[var(--muted)] rounded w-1/3 mt-1.5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {featuredHotelsDetails.map((hotel) => {
                    const href = `/hotel/${hotel.id}?${featuredSearchParams.toString()}`;
                    return (
                      <div
                        key={hotel.id}
                        className="relative rounded-xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm"
                      >
                        <Link
                          href={href}
                          className="block focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-inset rounded-xl"
                        >
                          <div className="relative h-28 w-full overflow-hidden bg-[var(--muted)]">
                            {hotel.main_photo ? (
                              <img
                                src={hotel.main_photo}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
                                No photo
                              </div>
                            )}
                          </div>
                          <div className="p-2.5">
                            <h3 className="font-semibold text-sm text-[var(--dark-text)] truncate">
                              {hotel.name}
                            </h3>
                            {hotel.rating != null && (
                              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                {hotel.rating.toFixed(1)}
                                {hotel.reviewCount != null &&
                                  ` · ${hotel.reviewCount.toLocaleString()} reviews`}
                              </p>
                            )}
                          </div>
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite(hotel.id);
                          }}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-[var(--muted-foreground)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] z-10"
                          aria-label={
                            isFavorite(hotel.id)
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                        >
                          {isFavorite(hotel.id) ? (
                            <HeartIconFilled className="w-4 h-4 text-[var(--primary)]" />
                          ) : (
                            <HeartIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <p className="text-[11px] text-[var(--muted-foreground)] text-center px-4 pb-6">
          Powered by LiteAPI sandbox. This is a demo experience; prices and
          availability may not reflect real inventory.
        </p>
      </main>

      {searchModalOpen && (
        <SearchModal
          initialView={searchModalInitialView}
          onClose={() => setSearchModalOpen(false)}
          onSearch={doSearch}
          placeId={placeId}
          placeLabel={placeLabel}
          placeSubAddress={placeFormattedAddress}
          query={query}
          onPlaceSelect={handleSelectPlace}
          onQueryChange={setQuery}
          checkin={checkin}
          checkout={checkout}
          onDatesChange={({ checkin: c, checkout: o }) => {
            setCheckin(c);
            setCheckout(o);
          }}
          occupancies={occupancies}
          onOccupanciesChange={setOccupancies}
          locale={locale}
        />
      )}
      <BottomNav visible={chromeVisible} onSearchClick={() => setSearchModalOpen(true)} />
    </>
  );
}
