"use client";

import { ImageGallery } from "@/components/ImageGallery";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { getNights, parseOccupanciesParam, toApiOccupancies, totalGuests } from "@/lib/occupancy";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface HotelDetails {
  id: string;
  name: string;
  hotelDescription?: string;
  hotelImages?: { url: string; defaultImage?: boolean }[];
  main_photo?: string;
  city?: string;
  country?: string;
  address?: string;
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

/** One card = one room type; contains all rate options (board + refundability). */
interface RoomGroup {
  roomId: number;
  roomName: string;
  displayName: string;
  image?: string;
  offers: RoomTypeOffer[];
}

export default function HotelPage() {
  const params = useParams<{ hotelId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currency, locale } = useLocaleCurrency();

  const hotelId = params.hotelId;
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
  const [error, setError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ url: string }[]>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError(null);

        const detailsUrl = new URL("/api/hotel/details", window.location.origin);
        detailsUrl.searchParams.set("hotelId", hotelId);
        if (locale) detailsUrl.searchParams.set("language", locale);

        const [detailsRes, ratesRes] = await Promise.all([
          fetch(detailsUrl.toString(), { credentials: "include" }),
          fetch("/api/rates/hotel", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              hotelId,
              checkin,
              checkout,
              occupancies: toApiOccupancies(occupancies),
              currency,
              language: locale
            })
          })
        ]);

        const detailsJson = await detailsRes.json();
        const ratesJson = await ratesRes.json();

        if (!detailsRes.ok || detailsJson?.error) {
          throw new Error(
            detailsJson?.error?.message ?? "Failed to load hotel details"
          );
        }
        if (!ratesRes.ok || ratesJson?.error) {
          throw new Error(
            ratesJson?.error?.message ?? "Failed to load rates"
          );
        }

        setDetails(detailsJson.data as HotelDetails);
        setRatesData(ratesJson);
      } catch (err: any) {
        setError(err.message ?? "Failed to load hotel");
      } finally {
        setLoading(false);
      }
    }

    run();
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

      // Pay at property = sum of taxesAndFees where included: false (LiteAPI)
      let payAtProperty = 0;
      for (const r of rt.rates ?? []) {
        const fees = r?.retailRate?.taxesAndFees;
        if (Array.isArray(fees)) {
          for (const f of fees) {
            if (f?.included === false && typeof f?.amount === "number") payAtProperty += f.amount;
          }
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

    return Array.from(map.values());
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

  return (
    <main className="flex-1 flex flex-col pb-6">
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-900">
        <button
          type="button"
          onClick={() => {
            // Preserve all search parameters when going back to results
            const params = new URLSearchParams(searchParams.toString());
            router.push(`/results?${params.toString()}`);
          }}
          className="h-9 w-9 rounded-full border border-slate-700 flex items-center justify-center text-slate-200 text-sm"
          aria-label="Back to results"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">
            {details?.name ?? "Hotel"}
          </h1>
          <p className="text-[11px] text-slate-400 truncate">
            {checkin} → {checkout} · {guestsCount}{" "}
            {guestsCount === 1 ? "guest" : "guests"}
          </p>
        </div>
      </header>

      {loading && (
        <div className="px-4 pt-4 space-y-4 animate-pulse">
          <div className="h-40 rounded-2xl bg-slate-800" />
          <div className="h-4 rounded bg-slate-800 w-2/3" />
          <div className="h-3 rounded bg-slate-800 w-1/2" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3"
              >
                <div className="h-20 rounded-xl bg-slate-800 mb-2" />
                <div className="h-3 rounded bg-slate-800 w-1/2 mb-1" />
                <div className="h-3 rounded bg-slate-800 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="px-4 pt-4">
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && details && (
        <div className="px-4 pt-4 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 h-44">
            {heroImage ? (
              <button
                type="button"
                onClick={() =>
                  hotelImagesForGallery.length > 0
                    ? openHotelGallery(
                      hotelImagesForGallery.findIndex((i) => i.url === heroImage) >= 0
                        ? hotelImagesForGallery.findIndex((i) => i.url === heroImage)
                        : 0
                    )
                    : undefined
                }
                className="w-full h-full block text-left"
              >
                <img
                  src={heroImage}
                  alt={details.name}
                  className="w-full h-full object-cover cursor-pointer"
                />
              </button>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                No image available
              </div>
            )}
          </div>

          <section className="space-y-1">
            <h2 className="text-base font-semibold">
              {details.name}
            </h2>
            <p className="text-[11px] text-slate-400">
              {[details.address, details.city, details.country]
                .filter(Boolean)
                .join(", ")}
            </p>
            {details.starRating && (
              <p className="text-[11px] text-amber-300 mt-1">
                {"★".repeat(details.starRating)} ·{" "}
                {details.starRating}-star hotel
              </p>
            )}
          </section>

          {details.hotelFacilities && details.hotelFacilities.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-200">
                Highlights
              </h3>
              <div className="flex flex-wrap gap-1">
                {details.hotelFacilities.slice(0, 6).map((fac) => (
                  <span
                    key={fac}
                    className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    {fac}
                  </span>
                ))}
              </div>
            </section>
          )}

          {details.sentiment_analysis &&
            (details.sentiment_analysis.pros?.length ||
              details.sentiment_analysis.cons?.length) && (
              <section className="grid grid-cols-2 gap-3 text-[11px]">
                {details.sentiment_analysis.pros?.length ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2">
                    <div className="font-semibold text-emerald-300 mb-1">
                      Guests liked
                    </div>
                    <ul className="space-y-0.5 text-emerald-100/90">
                      {details.sentiment_analysis.pros
                        .slice(0, 3)
                        .map((p) => (
                          <li key={p}>• {p}</li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                {details.sentiment_analysis.cons?.length ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-2">
                    <div className="font-semibold text-slate-200 mb-1">
                      Keep in mind
                    </div>
                    <ul className="space-y-0.5 text-slate-200/90">
                      {details.sentiment_analysis.cons
                        .slice(0, 3)
                        .map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

          {details.rating != null && details.reviewCount != null && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">
                Guest Reviews
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">
                      {details.rating.toFixed(1)}
                    </div>
                    <div className="text-xs text-amber-300">
                      {"★".repeat(Math.round(details.rating / 2))}
                      {"☆".repeat(5 - Math.round(details.rating / 2))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {details.rating >= 9
                        ? "Exceptional"
                        : details.rating >= 8
                          ? "Excellent"
                          : details.rating >= 7
                            ? "Very Good"
                            : details.rating >= 6
                              ? "Good"
                              : "Fair"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Based on {details.reviewCount.toLocaleString()}{" "}
                      {details.reviewCount === 1 ? "review" : "reviews"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">
              Choose your room
            </h3>
            <p className="text-[11px] text-slate-400">
              Prices are total for {nights} {nights === 1 ? "night" : "nights"} for {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"}.
            </p>
            {roomGroups.length === 0 && (
              <p className="text-xs text-slate-400">
                No rooms are currently available for your dates.
              </p>
            )}
            <div className="space-y-3">
              {roomGroups.map((room) => {
                const isExpanded = expandedRoomId === room.roomId;
                const minOffer = room.offers.reduce((a, b) =>
                  a.totalAmount <= b.totalAmount ? a : b
                );
                const roomMeta = details?.rooms?.find((r) => r.id === room.roomId);
                const fromPrice =
                  room.offers.length > 0
                    ? `${minOffer.currency} ${minOffer.totalAmount.toFixed(0)}`
                    : null;
                return (
                  <div
                    key={room.roomId}
                    className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRoomId((id) => (id === room.roomId ? null : room.roomId))
                      }
                      className="w-full p-3 flex gap-2 text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                        {room.image ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (roomMeta?.photos?.length) {
                                openRoomGallery(
                                  room.roomId,
                                  roomMeta.photos.findIndex((p) => p.url === room.image) >= 0
                                    ? roomMeta.photos.findIndex((p) => p.url === room.image)
                                    : 0
                                );
                              }
                            }}
                            className="block w-full h-full"
                          >
                            <img
                              src={room.image}
                              alt={room.roomName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                            No photo
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4 className="text-sm font-semibold leading-snug text-slate-50">
                          {room.displayName}
                        </h4>
                        {fromPrice && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            From {fromPrice} total
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {room.offers.length} rate{room.offers.length !== 1 ? "s" : ""} available
                        </p>
                        <span
                          className={`inline-block mt-1 text-[11px] font-medium text-emerald-400 ${isExpanded ? "rotate-180" : ""}`}
                        >
                          ▼
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 space-y-3 border-t border-slate-800">
                        {roomMeta && (
                          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-1.5 text-[11px] text-slate-300">
                            <h5 className="text-xs font-semibold text-slate-200">
                              Room details
                            </h5>
                            {(roomMeta.roomSizeSquare != null && roomMeta.roomSizeUnit) && (
                              <p>
                                Size: {roomMeta.roomSizeSquare} {roomMeta.roomSizeUnit}
                              </p>
                            )}
                            {roomMeta.maxOccupancy != null && (
                              <p>Max occupancy: {roomMeta.maxOccupancy} guests</p>
                            )}
                            {roomMeta.bedTypes && roomMeta.bedTypes.length > 0 && (
                              <p>
                                Beds:{" "}
                                {roomMeta.bedTypes
                                  .map(
                                    (b) =>
                                      `${b.quantity ?? 1} ${b.bedType ?? "Bed"}${b.bedSize ? ` (${b.bedSize})` : ""}`
                                  )
                                  .join(", ")}
                              </p>
                            )}
                            {roomMeta.description && (
                              <p className="text-slate-400 leading-snug">
                                {roomMeta.description}
                              </p>
                            )}
                            {roomMeta.roomAmenities && roomMeta.roomAmenities.length > 0 && (
                              <p>
                                Amenities:{" "}
                                {roomMeta.roomAmenities
                                  .map((a) => a.name)
                                  .filter(Boolean)
                                  .slice(0, 5)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          {room.offers.map((offer) => {
                            const perNight =
                              nights > 0 ? offer.totalAmount / nights : offer.totalAmount;
                            const hasPayAtProperty =
                              offer.payAtPropertyAmount != null && offer.payAtPropertyAmount > 0;
                            return (
                              <div
                                key={offer.offerId}
                                className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 flex items-center justify-between gap-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-50">
                                    {offer.boardName}
                                  </p>
                                  <p className="text-[11px] text-slate-400">
                                    {offer.refundableTag === "NRF" ||
                                    offer.refundableTag === "NRFN"
                                      ? "Non-refundable"
                                      : offer.cancelTime
                                        ? `Free cancellation until ${offer.cancelTime}`
                                        : "Flexible cancellation"}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-semibold text-slate-50">
                                    {offer.currency}{" "}
                                    {perNight.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    <span className="font-normal text-slate-400 text-xs"> / night</span>
                                  </div>
                                  <div className="text-xs font-medium text-slate-200 mt-0.5">
                                    {offer.currency}{" "}
                                    {offer.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                                    Total
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {nights} {nights === 1 ? "night" : "nights"}
                                    {occupancies.length > 1
                                      ? `, ${occupancies.length} rooms`
                                      : ", 1 room"}
                                    {hasPayAtProperty ? (
                                      <>
                                        {" "}
                                        (+{offer.currency}{" "}
                                        {offer.payAtPropertyAmount!.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                                        taxes and fees)
                                      </>
                                    ) : (
                                      <> · {offer.taxIncluded ? "incl. taxes & fees" : "+ taxes & fees"}</>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectOffer(offer)}
                                    className="mt-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-900 active:scale-[0.97]"
                                  >
                                    Select
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {galleryOpen && (
        <ImageGallery
          images={galleryImages}
          initialIndex={galleryInitialIndex}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </main>
  );
}
