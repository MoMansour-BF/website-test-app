"use client";

import { SearchModal } from "@/components/SearchModal";
import { ImageGallery } from "@/components/ImageGallery";
import { RoomDetailSheet } from "@/components/RoomDetailSheet";
import { HotelPageMap } from "@/components/HotelPageMap";
import { MapPinIcon, CalendarIcon, UsersIcon, WifiIcon, BreakfastIcon, BedIcon, ShareIcon, HeartIcon, HeartIconFilled, ArrowLeftIcon } from "@/components/Icons";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { useFavoriteHotels } from "@/context/FavoriteHotelsContext";
import { formatRangeShort, parseYYYYMMDD } from "@/lib/date-utils";
import { parsePlaceTypes, serializePlaceTypes, type PlaceSuggestion } from "@/lib/place-utils";
import { getNights, parseOccupanciesParam, serializeOccupancies, toApiOccupancies, totalGuests } from "@/lib/occupancy";
import { buildResultsQueryParams, serializeResultsQuery, resultsUrl, parseResultsSearchParams, DEFAULT_NATIONALITY, backgroundSearchParamsSignature, PRELOADED_SEARCH_RESULT_KEY } from "@/lib/results-query";
import { getLastSearch, setLastSearch, lastSearchResultsUrl, pushRecentHotel } from "@/lib/lastSearch";
import { useBackgroundSearch } from "@/hooks/useBackgroundSearch";
import type { Occupancy } from "@/lib/occupancy";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface HotelDetails {
  id: string;
  name: string;
  hotelDescription?: string;
  hotelImages?: { url: string; defaultImage?: boolean }[];
  main_photo?: string;
  city?: string;
  country?: string;
  address?: string;
  /** Phase 1: from LiteAPI data.location — for map block (Phase 2). */
  location?: { latitude: number; longitude: number };
  hotelFacilities?: string[];
  starRating?: number;
  rating?: number;
  reviewCount?: number;
  sentiment_analysis?: {
    pros?: string[];
    cons?: string[];
  };
  rooms?: {
    id: number;
    roomName: string;
    description?: string;
    roomSizeSquare?: number;
    roomSizeUnit?: string;
    maxOccupancy?: number;
    bedTypes?: { quantity?: number; bedType?: string; bedSize?: string }[];
    roomAmenities?: { name?: string }[];
    photos?: { url: string }[];
  }[];
}

/** One selectable rate option (one offerId) under a room type. */
interface RoomTypeOffer {
  offerId: string;
  boardName: string;
  /** Total to pay now (offerRetailRate = commission + included taxes). */
  totalAmount: number;
  currency: string;
  taxIncluded?: boolean;
  /** Sum of taxesAndFees where included: false (pay at property). */
  payAtPropertyAmount?: number;
  refundableTag?: string;
  cancelTime?: string;
  mappedRoomId?: number;
}

/** One card = one room type; contains deduplicated, sorted rate options. */
interface RoomGroup {
  roomId: number;
  roomName: string;
  displayName: string;
  image?: string;
  offers: RoomTypeOffer[];
}

/** Tier = board + refundability; for deduplication we keep cheapest per tier. */
function tierKey(offer: RoomTypeOffer): string {
  const rf = offer.refundableTag === "NRF" || offer.refundableTag === "NRFN" ? "NRF" : "RF";
  return `${(offer.boardName ?? "Room Only").trim()}|${rf}`;
}

/** Canonical order: Room Only NRF → RF → Breakfast NRF → RF → Half/Full/All → NRF then RF. */
const BOARD_ORDER: Record<string, number> = {
  "Room Only": 0,
  "Breakfast": 1,
  "Breakfast Included": 1,
  "Half Board": 2,
  "Full Board": 3,
  "All Inclusive": 4
};
function offerSortRank(o: RoomTypeOffer): number {
  const board = (o.boardName ?? "Room Only").trim();
  const boardRank = BOARD_ORDER[board] ?? 5;
  const rfRank = o.refundableTag === "NRF" || o.refundableTag === "NRFN" ? 0 : 1;
  return boardRank * 2 + rfRank;
}

function deduplicateAndSortOffers(offers: RoomTypeOffer[]): RoomTypeOffer[] {
  const byTier = new Map<string, RoomTypeOffer>();
  for (const o of offers) {
    const key = tierKey(o);
    const existing = byTier.get(key);
    if (!existing || o.totalAmount < existing.totalAmount) byTier.set(key, o);
  }
  return Array.from(byTier.values()).sort((a, b) => offerSortRank(a) - offerSortRank(b));
}

export default function HotelPage() {
  const params = useParams<{ hotelId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currency, locale } = useLocaleCurrency();

  const hotelId = params.hotelId;
  const placeIdParam = searchParams.get("placeId");
  const placeNameParam = searchParams.get("placeName");
  const placeAddressParam = searchParams.get("placeAddress");
  const placeTypesParam = searchParams.get("placeTypes");
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const occupanciesParam = searchParams.get("occupancies");
  const adultsLegacy = searchParams.get("adults");
  const occupancies = useMemo(() => {
    if (occupanciesParam) return parseOccupanciesParam(occupanciesParam);
    const a = Number(adultsLegacy);
    if (a >= 1) return [{ adults: a, children: [] }];
    return parseOccupanciesParam(null);
  }, [occupanciesParam, adultsLegacy]);
  const effectiveOccupanciesParam =
    occupanciesParam ?? (adultsLegacy ? `${adultsLegacy}` : "");
  const guestsCount = totalGuests(occupancies);
  const nights = getNights(checkin, checkout);

  const [details, setDetails] = useState<HotelDetails | null>(null);
  const [ratesData, setRatesData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedScrollYRef = useRef<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ url: string }[]>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [roomDetailRoom, setRoomDetailRoom] = useState<RoomGroup | null>(null);
  const [roomSheetExiting, setRoomSheetExiting] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [roomsSectionVisible, setRoomsSectionVisible] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [aboutHotelExpanded, setAboutHotelExpanded] = useState(false);

  const roomsSectionRef = useRef<HTMLElement>(null);
  const carouselScrollRef = useRef<HTMLDivElement>(null);

  const { isFavorite, toggleFavorite } = useFavoriteHotels();
  const backgroundSearch = useBackgroundSearch({
    currency,
    locale,
    nationality: DEFAULT_NATIONALITY,
  });

  // Editable search state for modal; synced from URL
  const [editPlaceId, setEditPlaceId] = useState<string | null>(placeIdParam);
  const [editPlaceName, setEditPlaceName] = useState<string | null>(placeNameParam);
  const [editPlaceAddress, setEditPlaceAddress] = useState<string | null>(placeAddressParam);
  const [editPlaceTypes, setEditPlaceTypes] = useState<string[]>(() => parsePlaceTypes(placeTypesParam));
  const [editCheckin, setEditCheckin] = useState(checkin);
  const [editCheckout, setEditCheckout] = useState(checkout);
  const [editOccupancies, setEditOccupancies] = useState<Occupancy[]>(occupancies);

  useEffect(() => {
    setEditPlaceId(placeIdParam);
    setEditPlaceName(placeNameParam);
    setEditPlaceAddress(placeAddressParam);
    setEditPlaceTypes(parsePlaceTypes(placeTypesParam));
    setEditCheckin(checkin);
    setEditCheckout(checkout);
    setEditOccupancies(occupancies);
  }, [placeIdParam, placeNameParam, placeAddressParam, placeTypesParam, checkin, checkout, occupancies]);

  // Phase 5.5: background search when modal is open (dates/occupancy; place from URL)
  const hasParamsForBackground =
    !!(editPlaceId && editCheckin && editCheckout);
  useEffect(() => {
    if (!searchModalOpen || !hasParamsForBackground) return;
    const params = buildResultsQueryParams({
      mode: "place",
      placeId: editPlaceId ?? undefined,
      placeName: editPlaceName ?? undefined,
      placeAddress: editPlaceAddress ?? undefined,
      placeTypes: editPlaceTypes,
      checkin: editCheckin,
      checkout: editCheckout,
      occupancies: editOccupancies,
      nationality: DEFAULT_NATIONALITY,
    });
    backgroundSearch.startBackgroundSearch(params, { trigger: "dateOrOccupancy" });
  }, [
    searchModalOpen,
    hasParamsForBackground,
    editPlaceId,
    editPlaceName,
    editPlaceAddress,
    editPlaceTypes,
    editCheckin,
    editCheckout,
    editOccupancies,
    backgroundSearch,
  ]);

  useEffect(() => {
    if (!searchModalOpen) backgroundSearch.cancel();
  }, [searchModalOpen, backgroundSearch]);

  // Phase 3.5: when opening search modal, prefill from lastSearch if URL params are missing (e.g. deep link)
  const prevSearchModalOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = searchModalOpen && !prevSearchModalOpenRef.current;
    prevSearchModalOpenRef.current = searchModalOpen;
    if (!justOpened) return;
    const hasUrlParams = !!(placeIdParam && checkin && checkout);
    if (hasUrlParams) return;
    const last = getLastSearch();
    if (!last) return;
    if (!checkin && last.checkin) setEditCheckin(last.checkin);
    if (!checkout && last.checkout) setEditCheckout(last.checkout);
    if (!placeIdParam && last.placeId) {
      setEditPlaceId(last.placeId);
      setEditPlaceName(last.placeName);
      setEditPlaceAddress(last.placeAddress ?? null);
      setEditPlaceTypes(last.placeTypes ?? []);
    }
    if (!occupanciesParam && last.occupancies) {
      setEditOccupancies(parseOccupanciesParam(last.occupancies));
    }
  }, [searchModalOpen, placeIdParam, checkin, checkout, occupanciesParam]);

  // Sticky CTA: hide when room section is in view
  useEffect(() => {
    const el = roomsSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setRoomsSectionVisible(e.isIntersecting),
      { threshold: 0.1, rootMargin: "0px 0px -80px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [details]);

  const scrollToRooms = () => {
    roomsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = details?.name ?? "Hotel";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard?.writeText(url);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      }
    } catch {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  };

  // Effect 1: fetch hotel details only when hotel or locale changes (keep details in state on search update)
  useEffect(() => {
    if (!hotelId) return;
    let cancelled = false;
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const detailsUrl = new URL("/api/hotel/details", window.location.origin);
        detailsUrl.searchParams.set("hotelId", hotelId);
        if (locale) detailsUrl.searchParams.set("language", locale);
        const res = await fetch(detailsUrl.toString(), { credentials: "include" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json?.error) {
          throw new Error(json?.error?.message ?? "Failed to load hotel details");
        }
        const raw = json.data as HotelDetails & { location?: { latitude?: number; longitude?: number; lat?: number; lng?: number } };
        const data: HotelDetails = { ...raw };
        if (raw?.location && typeof raw.location === "object") {
          const loc = raw.location;
          const lat = loc.latitude ?? loc.lat;
          const lng = loc.longitude ?? loc.lng;
          if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
            data.location = { latitude: lat, longitude: lng };
          }
        }
        setDetails(data);
        pushRecentHotel({ hotelId, name: data?.name });
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Failed to load hotel");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hotelId, locale]);

  // Effect 2: fetch rates when search params change; when details already exist, show loading only on room section
  useEffect(() => {
    if (!hotelId || !checkin || !checkout) return;
    const hasDetails = details !== null;
    if (hasDetails) setRatesLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const ratesRes = await fetch("/api/rates/hotel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            hotelId,
            checkin,
            checkout,
            occupancies: toApiOccupancies(occupancies),
            currency,
            guestNationality: DEFAULT_NATIONALITY,
            language: locale
          })
        });
        const ratesJson = await ratesRes.json();
        if (cancelled) return;
        if (!ratesRes.ok || ratesJson?.error) {
          if (hasDetails) setRatesLoading(false);
          return;
        }
        setRatesData(ratesJson);
      } finally {
        if (!cancelled && hasDetails) setRatesLoading(false);
        if (!cancelled && savedScrollYRef.current != null) {
          const y = savedScrollYRef.current;
          savedScrollYRef.current = null;
          requestAnimationFrame(() => { window.scrollTo({ top: y, behavior: "auto" }); });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [hotelId, checkin, checkout, occupancies, currency, locale]);

  const heroImage =
    details?.hotelImages?.find((img) => img.defaultImage)?.url ??
    details?.main_photo ??
    details?.hotelImages?.[0]?.url;

  const hotelImagesForGallery: { url: string }[] = useMemo(() => {
    if (!details) return [];
    const list: { url: string }[] = [];
    if (details.main_photo) list.push({ url: details.main_photo });
    for (const img of details.hotelImages ?? []) {
      if (img.url && img.url !== details.main_photo) list.push({ url: img.url });
    }
    if (list.length === 0 && details.hotelImages?.[0]?.url) {
      list.push({ url: details.hotelImages[0].url });
    }
    return list;
  }, [details]);

  const openHotelGallery = (initialIndex: number) => {
    setGalleryImages(hotelImagesForGallery);
    setGalleryInitialIndex(initialIndex);
    setGalleryOpen(true);
  };

  const openRoomGallery = (roomId: number, initialIndex: number) => {
    const roomMeta = details?.rooms?.find((r) => r.id === roomId);
    const photos = roomMeta?.photos ?? [];
    if (photos.length === 0) return;
    setGalleryImages(photos);
    setGalleryInitialIndex(initialIndex);
    setGalleryOpen(true);
  };

  /** Group offers by room type (mappedRoomId). One card per room, "Nx" when multiple rooms. */
  const roomGroups: RoomGroup[] = useMemo(() => {
    if (!ratesData?.data || !Array.isArray(ratesData.data)) return [];
    const hotel = ratesData.data[0];
    const roomTypes = hotel?.roomTypes ?? [];
    const map = new Map<number, RoomGroup>();

    for (const rt of roomTypes) {
      const firstRate = rt.rates?.[0];
      if (!firstRate || !rt.offerId) continue;
      const offerLevel = rt.offerRetailRate ?? rt.suggestedSellingPrice;
      let amount: number | undefined;
      let curr: string | undefined;
      if (offerLevel?.amount != null && typeof offerLevel.amount === "number") {
        amount = offerLevel.amount;
        curr = offerLevel.currency;
      } else {
        const rates = rt.rates ?? [];
        let sum = 0;
        for (const r of rates) {
          const t = r?.retailRate?.total?.[0];
          if (t?.amount != null && typeof t.amount === "number") {
            sum += t.amount;
            curr = t.currency;
          }
        }
        amount = sum > 0 ? sum : undefined;
      }
      if (amount == null || typeof amount !== "number") continue;
      curr = curr ?? firstRate.retailRate?.total?.[0]?.currency ?? "USD";
      const mappedRoomId = firstRate.mappedRoomId ?? 0;
      const roomMeta = details?.rooms?.find((r) => r.id === mappedRoomId);
      const roomName = firstRate.name ?? roomMeta?.roomName ?? "Room";
      const taxInfo = firstRate.retailRate?.taxesAndFees?.[0];
      const cancelInfo = firstRate.cancellationPolicies?.cancelPolicyInfos?.[0];
      const image = roomMeta?.photos?.[0]?.url ?? heroImage;

      // Pay at property = taxesAndFees where included: false (LiteAPI). Total for all rooms, duplicated per rate — count once (first rate only).
      let payAtProperty = 0;
      const fees = firstRate?.retailRate?.taxesAndFees;
      if (Array.isArray(fees)) {
        for (const f of fees) {
          if (f?.included === false && typeof f?.amount === "number") payAtProperty += f.amount;
        }
      }

      const offer: RoomTypeOffer = {
        offerId: rt.offerId,
        boardName: firstRate.boardName ?? "Room Only",
        totalAmount: amount,
        currency: curr ?? "USD",
        taxIncluded: taxInfo?.included,
        payAtPropertyAmount: payAtProperty > 0 ? payAtProperty : undefined,
        refundableTag: firstRate.cancellationPolicies?.refundableTag,
        cancelTime: cancelInfo?.cancelTime,
        mappedRoomId: mappedRoomId || undefined
      };

      const existing = map.get(mappedRoomId);
      if (existing) {
        existing.offers.push(offer);
      } else {
        const displayName =
          occupancies.length > 1 ? `${occupancies.length}x ${roomName}` : roomName;
        map.set(mappedRoomId, {
          roomId: mappedRoomId,
          roomName,
          displayName,
          image,
          offers: [offer]
        });
      }
    }

    // Deduplicate by tier (board + refundability), keep cheapest per tier, then sort
    return Array.from(map.values()).map((g) => ({
      ...g,
      offers: deduplicateAndSortOffers(g.offers)
    }));
  }, [ratesData, details, heroImage, occupancies.length]);

  const handleSelectOffer = (offer: RoomTypeOffer) => {
    const params = new URLSearchParams({
      hotelId,
      offerId: offer.offerId,
      checkin,
      checkout
    });
    if (effectiveOccupanciesParam) params.set("occupancies", effectiveOccupanciesParam);
    router.push(`/checkout?${params.toString()}`);
  };

  const doSearchFromModal = () => {
    const params = buildResultsQueryParams({
      mode: "place",
      placeId: editPlaceId ?? undefined,
      placeName: editPlaceName ?? undefined,
      placeAddress: editPlaceAddress ?? undefined,
      placeTypes: editPlaceTypes,
      checkin: editCheckin,
      checkout: editCheckout,
      occupancies: editOccupancies,
      nationality: DEFAULT_NATIONALITY
    });
    setLastSearch(params);
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
    if (typeof window !== "undefined") savedScrollYRef.current = window.scrollY;
    setSearchModalOpen(false);
    router.replace(`/hotel/${hotelId}?${serializeResultsQuery(params).toString()}`);
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setEditPlaceId(place.placeId || null);
    setEditPlaceName(place.displayName || null);
    setEditPlaceAddress(place.formattedAddress ?? null);
    setEditPlaceTypes(place.types ?? []);
  };

  const dateRangeTextBar =
    editCheckin && editCheckout && parseYYYYMMDD(editCheckin) && parseYYYYMMDD(editCheckout)
      ? formatRangeShort(
          parseYYYYMMDD(editCheckin)!,
          parseYYYYMMDD(editCheckout)!,
          locale
        )
      : "Add dates";
  const guestsSummaryBar =
    totalGuests(editOccupancies) > 0
      ? `${editOccupancies.length} Rm, ${totalGuests(editOccupancies)} Gst`
      : "Add guests";

  /** Score band label for review badge (Figma: "Wonderful", etc.) */
  const ratingLabel = (rating: number) =>
    rating >= 9 ? "Wonderful" : rating >= 8 ? "Excellent" : rating >= 7 ? "Very Good" : rating >= 6 ? "Good" : "Fair";

  const scrollToReviews = () => {
    document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div role="main" className="flex-1 flex flex-col pb-6">

      {searchModalOpen && (
        <SearchModal
          initialView="overview"
          hideDestination
          onClose={() => setSearchModalOpen(false)}
          onSearch={doSearchFromModal}
          placeId={editPlaceId}
          placeLabel={editPlaceName}
          placeSubAddress={editPlaceAddress}
          query={editPlaceName ?? ""}
          onPlaceSelect={handleSelectPlace}
          onQueryChange={(q) => setEditPlaceName(q || null)}
          checkin={editCheckin}
          checkout={editCheckout}
          onDatesChange={({ checkin: c, checkout: o }) => {
            setEditCheckin(c);
            setEditCheckout(o);
          }}
          occupancies={editOccupancies}
          onOccupanciesChange={setEditOccupancies}
          locale={locale}
        />
      )}

      {loading && (
        <div className="px-4 pt-4 space-y-4 animate-pulse">
          <div className="h-40 rounded-2xl bg-[var(--muted)]" />
          <div className="h-4 rounded bg-[var(--muted)] w-2/3" />
          <div className="h-3 rounded bg-[var(--muted)] w-1/2" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-[var(--sky-blue)] bg-white p-3"
              >
                <div className="h-20 rounded-xl bg-[var(--muted)] mb-2" />
                <div className="h-3 rounded bg-[var(--muted)] w-1/2 mb-1" />
                <div className="h-3 rounded bg-[var(--muted)] w-2/3" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="px-4 pt-4">
          <div className="rounded-xl border border-[var(--dark-text)]/30 bg-[var(--dark-text)]/10 px-3 py-2 text-xs text-[var(--dark-text)]">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && details && (
        <div className="flex flex-col">
          {/* Hero carousel with overlay header (back, share, heart) */}
          <div className="relative h-72 w-full bg-[var(--light-bg)]">
            {hotelImagesForGallery.length > 0 ? (
              <>
                <div
                  ref={carouselScrollRef}
                  className="absolute inset-0 overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scroll-smooth"
                  style={{ scrollSnapType: "x mandatory" }}
                  onScroll={() => {
                    const el = carouselScrollRef.current;
                    if (!el) return;
                    const w = el.offsetWidth;
                    const i = Math.round(el.scrollLeft / w);
                    setCarouselIndex(Math.min(i, hotelImagesForGallery.length - 1));
                  }}
                >
                  {hotelImagesForGallery.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openHotelGallery(i)}
                      className="flex-shrink-0 w-full h-full snap-start snap-always text-left"
                      style={{ scrollSnapAlign: "start" }}
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
                {/* Dot indicators */}
                {hotelImagesForGallery.length > 1 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                    {hotelImagesForGallery.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Image ${i + 1}`}
                        onClick={() => {
                          const el = carouselScrollRef.current;
                          if (el) {
                            el.scrollTo({ left: el.offsetWidth * i, behavior: "smooth" });
                            setCarouselIndex(i);
                          }
                        }}
                        className={`h-1.5 rounded-full transition-all ${i === carouselIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                      />
                    ))}
                  </div>
                )}
                {/* Image counter badge */}
                <div className="absolute bottom-3 right-3 rounded-md px-2 py-1 text-[10px] font-medium text-white bg-[var(--dark-text)]/70">
                  {carouselIndex + 1}/{hotelImagesForGallery.length}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                No image available
              </div>
            )}
            {/* Header overlay: back, share, heart */}
            <div
              className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
              aria-hidden="true"
            >
              <button
                type="button"
                onClick={() => {
                  const last = getLastSearch();
                  const url = last ? lastSearchResultsUrl(last) : resultsUrl(parseResultsSearchParams(searchParams));
                  router.push(url);
                }}
                className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
                aria-label="Back to results"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="h-10 w-10 rounded-full bg-white/95 shadow-md border border-[var(--sky-blue)] flex items-center justify-center text-[var(--dark-text)] shrink-0"
                  aria-label="Share"
                >
                  <ShareIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => hotelId && toggleFavorite(hotelId)}
                  className="h-10 w-10 rounded-full bg-white/95 shadow-md border border-[var(--sky-blue)] flex items-center justify-center shrink-0"
                  aria-label={isFavorite(hotelId ?? "") ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFavorite(hotelId ?? "") ? (
                    <HeartIconFilled className="w-5 h-5 text-[var(--primary)]" />
                  ) : (
                    <HeartIcon className="w-5 h-5 text-[var(--dark-text)]" />
                  )}
                </button>
              </div>
            </div>
            {shareToast && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 rounded-lg bg-[var(--dark-text)] text-white text-xs font-medium px-3 py-2 shadow-lg">
                Link copied
              </div>
            )}
          </div>

          <div className="px-4 pt-4 space-y-4">
          {/* 3.1 Property summary: name, address under name, star rating, review badge (tappable) */}
          <section className="space-y-2" aria-label="Property summary">
            <h1 className="text-[22px] font-bold leading-tight text-[var(--dark-text)]">
              {details.name}
            </h1>
            {([details.address, details.city, details.country].filter(Boolean).length > 0) && (
              <p className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
                <MapPinIcon className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                <span>
                  {[details.address, details.city, details.country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </p>
            )}
            {details.starRating != null && details.starRating > 0 && (
              <p className="text-sm" style={{ color: "var(--star)" }} aria-label={`${details.starRating}-star hotel`}>
                {"★".repeat(Math.min(5, Math.round(details.starRating)))}
                {"☆".repeat(5 - Math.min(5, Math.round(details.starRating)))}
                <span className="ml-1.5 text-[var(--muted-foreground)]">
                  {details.starRating}-star hotel
                </span>
              </p>
            )}
            {details.rating != null && details.reviewCount != null && (
              <button
                type="button"
                onClick={scrollToReviews}
                className="flex items-center gap-2 rounded-xl border border-[var(--sky-blue)] bg-[var(--primary)]/10 px-3 py-2 text-left transition-colors hover:bg-[var(--primary)]/15 active:opacity-90"
                aria-label={`Rating ${details.rating.toFixed(1)}, ${details.reviewCount} reviews. Go to reviews.`}
              >
                <span className="text-lg font-bold text-[var(--primary)]">
                  {details.rating.toFixed(1)}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--dark-text)]">
                    {ratingLabel(details.rating)}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Based on {details.reviewCount.toLocaleString()}{" "}
                    {details.reviewCount === 1 ? "review" : "reviews"}
                  </span>
                </div>
              </button>
            )}
          </section>

          {/* Phase 2: Location / Map — only when details.location is present; no LiteAPI Map Widget */}
          {details.location &&
            typeof details.location.latitude === "number" &&
            typeof details.location.longitude === "number" && (
              <section className="space-y-2" aria-label="Location and map">
                <h3 className="text-sm font-semibold text-[var(--dark-text)]">
                  Location
                </h3>
                <HotelPageMap
                  location={details.location}
                  hotelName={details.name}
                />
                <a
                  href={`https://www.google.com/maps?q=${details.location.latitude},${details.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  <MapPinIcon className="w-4 h-4 shrink-0" />
                  View on Google Maps
                </a>
              </section>
            )}

          {/* About the Hotel: short description before highlights; See more / Show less */}
          {details.hotelDescription && (() => {
            const plain = details.hotelDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const isLong = plain.length > 400;
            const showTruncated = isLong && !aboutHotelExpanded;
            return plain ? (
              <section className="space-y-2" aria-label="About the hotel">
                <h3 className="text-sm font-semibold text-[var(--dark-text)]">
                  About the Hotel
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                  {showTruncated ? `${plain.slice(0, 400)}…` : plain}
                </p>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => setAboutHotelExpanded((e) => !e)}
                    className="text-sm font-semibold text-[var(--primary)] hover:underline"
                  >
                    {aboutHotelExpanded ? "Show less" : "See more"}
                  </button>
                )}
              </section>
            ) : null;
          })()}

          {/* 3.2 Highlights: pill/chip style, icons where feasible, horizontal scroll */}
          {details.hotelFacilities && details.hotelFacilities.length > 0 && (
            <section className="space-y-2" aria-label="Highlights">
              <h3 className="text-sm font-semibold text-[var(--dark-text)]">
                Highlights
              </h3>
              <div className="flex overflow-x-auto gap-2 pb-1 -mx-4 px-4 scroll-smooth snap-x snap-mandatory touch-pan-x">
                {details.hotelFacilities.map((fac) => {
                  const facLower = fac.toLowerCase();
                  const Icon =
                    facLower.includes("wifi") || facLower.includes("internet") ? WifiIcon
                    : facLower.includes("breakfast") ? BreakfastIcon
                    : facLower.includes("pool") || facLower.includes("swim") ? null
                    : null;
                  return (
                    <span
                      key={fac}
                      className="flex items-center gap-1.5 shrink-0 rounded-full border border-[var(--sky-blue)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--dark-text)] shadow-sm snap-start"
                    >
                      {Icon && <Icon className="w-4 h-4 shrink-0 text-[var(--primary)]" />}
                      {fac}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3.3 Guests Liked / Keep in Mind: design tokens, distinct from background */}
          {details.sentiment_analysis &&
            (details.sentiment_analysis.pros?.length ||
              details.sentiment_analysis.cons?.length) && (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Guest sentiment">
                {details.sentiment_analysis.pros?.length ? (
                  <div className="rounded-2xl border border-[var(--sky-blue)] bg-[var(--primary)]/5 p-3">
                    <h3 className="text-sm font-semibold text-[var(--dark-text)] mb-1.5">
                      Guests liked
                    </h3>
                    <ul className="space-y-1 text-sm text-[var(--dark-text)] list-none">
                      {details.sentiment_analysis.pros.slice(0, 5).map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className="text-[var(--primary)] shrink-0">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {details.sentiment_analysis.cons?.length ? (
                  <div className="rounded-2xl border border-[var(--muted)] bg-[var(--muted)]/30 p-3">
                    <h3 className="text-sm font-semibold text-[var(--dark-text)] mb-1.5">
                      Keep in mind
                    </h3>
                    <ul className="space-y-1 text-sm text-[var(--muted-foreground)] list-none">
                      {details.sentiment_analysis.cons.slice(0, 5).map((c) => (
                        <li key={c} className="flex gap-2">
                          <span className="text-[var(--muted-foreground)] shrink-0">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

          {/* Change Dates bar: directly before rooms, subtitle "Change Dates" */}
          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">
              Change Dates
            </h3>
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="w-full rounded-2xl border border-[var(--sky-blue)] bg-white shadow-sm p-3 text-left hover:border-[var(--ocean-blue)] hover:shadow transition-colors flex items-center gap-3"
              aria-label="Change dates and guests"
            >
              <CalendarIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[var(--dark-text)]">
                  {dateRangeTextBar}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {guestsSummaryBar}
                </span>
              </div>
            </button>
          </section>

          <section id="rooms" ref={roomsSectionRef} className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--dark-text)]">
              Choose your room
            </h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Prices are total for {nights} {nights === 1 ? "night" : "nights"} for {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"}.
            </p>
            {(ratesLoading || (details && ratesData === null && checkin && checkout)) && (
              <div className="flex overflow-x-auto gap-4 pb-2 -mx-4 px-4" aria-busy="true" aria-label="Loading rooms">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[80%] min-w-[280px] max-w-[340px] rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[4/3] bg-[var(--muted)]" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 rounded bg-[var(--muted)] w-3/4" />
                      <div className="h-4 rounded bg-[var(--muted)] w-1/2" />
                      <div className="h-9 rounded-xl bg-[var(--muted)] w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!ratesLoading && ratesData !== null && roomGroups.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)]">
                No rooms are currently available for your dates.
              </p>
            )}
            {!ratesLoading && ratesData !== null && (
            <div
              className={`flex overflow-x-auto gap-4 pb-2 -mx-4 px-4 scroll-smooth ${roomGroups.length === 1 ? "justify-center" : "snap-x snap-mandatory"}`}
              style={{ scrollSnapType: roomGroups.length === 1 ? undefined : "x mandatory" }}
            >
              {roomGroups.map((room) => {
                const minOffer = room.offers.length > 0
                  ? room.offers.reduce((a, b) => (a.totalAmount <= b.totalAmount ? a : b))
                  : null;
                const roomMeta = details?.rooms?.find((r) => r.id === room.roomId);
                const fromPrice = minOffer
                  ? `${minOffer.currency} ${minOffer.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : null;
                const hasWifi = roomMeta?.roomAmenities?.some((a) =>
                  (a.name ?? "").toLowerCase().includes("wifi") || (a.name ?? "").toLowerCase().includes("internet")
                );
                const hasBreakfast = room.offers.some((o) =>
                  (o.boardName ?? "").toLowerCase().includes("breakfast")
                );
                const isSingleCard = roomGroups.length === 1;
                return (
                  <div
                    key={room.roomId}
                    className={`flex-shrink-0 rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm hover:border-[var(--ocean-blue)] hover:shadow-md transition-all ${isSingleCard ? "w-full max-w-[340px]" : "w-[80%] min-w-[280px] max-w-[340px] snap-start"}`}
                    style={isSingleCard ? undefined : { scrollSnapAlign: "start" }}
                  >
                    <div className="aspect-[4/3] bg-[var(--light-bg)] relative">
                      {room.image ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (roomMeta?.photos?.length) {
                              openRoomGallery(
                                room.roomId,
                                roomMeta.photos.findIndex((p) => p.url === room.image) >= 0
                                  ? roomMeta.photos.findIndex((p) => p.url === room.image)
                                  : 0
                              );
                            } else if (hotelImagesForGallery.length > 0) {
                              setGalleryImages(hotelImagesForGallery);
                              setGalleryInitialIndex(0);
                              setGalleryOpen(true);
                            }
                          }}
                          className="block w-full h-full text-left"
                        >
                          <img
                            src={room.image}
                            alt={room.roomName}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="text-base font-bold text-[var(--dark-text)] leading-snug">
                        {room.displayName}
                      </h4>
                      {fromPrice && (
                        <p className="text-sm font-semibold text-[var(--dark-text)] mt-1">
                          From {fromPrice} total
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[var(--muted-foreground)]">
                        {roomMeta?.maxOccupancy != null && (
                          <span className="flex items-center gap-1 text-xs" title="Max guests">
                            <UsersIcon className="w-4 h-4 shrink-0" />
                            {roomMeta.maxOccupancy}
                          </span>
                        )}
                        {hasWifi && (
                          <span className="flex items-center gap-1 text-xs" title="Wi‑Fi">
                            <WifiIcon className="w-4 h-4 shrink-0" />
                          </span>
                        )}
                        {hasBreakfast && (
                          <span className="flex items-center gap-1 text-xs" title="Breakfast option">
                            <BreakfastIcon className="w-4 h-4 shrink-0" />
                          </span>
                        )}
                        {roomMeta?.bedTypes && roomMeta.bedTypes.length > 0 && (
                          <span className="flex items-center gap-1 text-xs" title="Bed">
                            <BedIcon className="w-4 h-4 shrink-0" />
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRoomDetailRoom(room)}
                        className="mt-3 w-full rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] py-2 text-sm font-semibold text-[var(--dark-text)] hover:bg-[var(--muted)] hover:border-[var(--ocean-blue)] transition-colors"
                      >
                        View details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>

          {/* Guest Reviews: after rooms, with See more to expand extra details */}
          {details.rating != null && details.reviewCount != null && (
            <section id="reviews" className="space-y-2" aria-labelledby="reviews-heading">
              <h2 id="reviews-heading" className="text-base font-semibold text-[var(--dark-text)]">
                Guest Reviews
              </h2>
              {!reviewsExpanded ? (
                <>
                  <div className="rounded-2xl border border-[var(--sky-blue)] bg-white p-3 shadow-sm flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl font-bold text-[var(--primary)] shrink-0">
                        {details.rating.toFixed(1)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--dark-text)]">
                          {ratingLabel(details.rating)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Based on {details.reviewCount.toLocaleString()}{" "}
                          {details.reviewCount === 1 ? "review" : "reviews"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReviewsExpanded(true)}
                      className="shrink-0 text-sm font-semibold text-[var(--primary)] hover:underline"
                    >
                      See more
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[var(--primary)]">
                          {details.rating.toFixed(1)}
                        </div>
                        <div className="text-xs" style={{ color: "var(--star)" }} aria-hidden>
                          {"★".repeat(Math.round(details.rating / 2))}
                          {"☆".repeat(5 - Math.round(details.rating / 2))}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[var(--dark-text)]">
                          {ratingLabel(details.rating)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Based on {details.reviewCount.toLocaleString()}{" "}
                          {details.reviewCount === 1 ? "review" : "reviews"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewsExpanded(false)}
                    className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--dark-text)]"
                  >
                    Show less
                  </button>
                </>
              )}
            </section>
          )}

          </div>
        </div>
      )}

      {/* Sticky CTA: visible above room section, scrolls to rooms on tap */}
      {!loading && !error && details && !roomsSectionVisible && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[var(--light-bg)] to-transparent pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={scrollToRooms}
              className="w-full rounded-full py-3.5 text-base font-semibold text-white shadow-lg transition-opacity hover:opacity-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              View rooms
            </button>
          </div>
        </div>
      )}

      {galleryOpen && (
        <ImageGallery
          images={galleryImages}
          initialIndex={galleryInitialIndex}
          onClose={() => setGalleryOpen(false)}
        />
      )}

      {roomDetailRoom && (
        <RoomDetailSheet
          room={roomDetailRoom}
          roomMeta={details?.rooms?.find((r) => r.id === roomDetailRoom.roomId)}
          fallbackImages={hotelImagesForGallery}
          nights={nights}
          occupanciesCount={occupancies.length}
          onSelectOffer={handleSelectOffer}
          onClose={() => {
            setRoomSheetExiting(true);
            let ms = 220;
            if (typeof window !== "undefined") {
              const d = window.getComputedStyle(document.documentElement).getPropertyValue("--modal-exit-duration").trim();
              if (d.endsWith("ms")) ms = parseInt(d, 10) || 220;
              else if (d.endsWith("s")) ms = parseFloat(d) * 1000;
            }
            setTimeout(() => {
              setRoomDetailRoom(null);
              setRoomSheetExiting(false);
            }, ms);
          }}
          isExiting={roomSheetExiting}
        />
      )}
    </div>
  );
}
