"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImageGallery } from "@/components/ImageGallery";

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
    photos?: { url: string }[];
  }[];
}

interface Rate {
  name: string;
  mappedRoomId: number;
  boardName: string;
  offerId: string;
  retailRate: {
    total: { amount: number; currency: string }[];
    taxesAndFees?: { included?: boolean; amount?: number }[];
  };
  cancellationPolicies?: {
    refundableTag?: string;
    cancelPolicyInfos?: { cancelTime?: string }[];
  };
}

interface RoomGroup {
  roomId: number;
  roomName: string;
  image?: string;
  offers: Rate[];
}

export default function HotelPage() {
  const params = useParams<{ hotelId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const hotelId = params.hotelId;
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const adults = Number(searchParams.get("adults") ?? "2");

  const [details, setDetails] = useState<HotelDetails | null>(null);
  const [ratesData, setRatesData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ url: string }[]>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError(null);

        const [detailsRes, ratesRes] = await Promise.all([
          fetch(`/api/hotel/details?hotelId=${encodeURIComponent(hotelId)}`),
          fetch("/api/rates/hotel", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              hotelId,
              checkin,
              checkout,
              adults
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
  }, [hotelId, checkin, checkout, adults]);

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

  const roomGroups: RoomGroup[] = useMemo(() => {
    const map = new Map<number, RoomGroup>();
    if (!ratesData?.data || !Array.isArray(ratesData.data)) return [];
    const hotel = ratesData.data[0];
    const roomTypes = hotel?.roomTypes ?? [];

    for (const rt of roomTypes) {
      const roomRates: Rate[] = (rt.rates ?? []).map((rate: any) => ({
        name: rate.name,
        mappedRoomId: rate.mappedRoomId,
        boardName: rate.boardName,
        offerId: rt.offerId,
        retailRate: rate.retailRate,
        cancellationPolicies: rate.cancellationPolicies
      }));

      for (const rate of roomRates) {
        const roomId = rate.mappedRoomId;
        if (!roomId) continue;
        const existing = map.get(roomId);
        const roomMeta = details?.rooms?.find((r) => r.id === roomId);
        const image =
          roomMeta?.photos?.[0]?.url ??
          heroImage;
        const group: RoomGroup = existing ?? {
          roomId,
          roomName: roomMeta?.roomName ?? rate.name,
          image,
          offers: []
        };
        group.offers.push(rate);
        map.set(roomId, group);
      }
    }

    return Array.from(map.values());
  }, [ratesData, details, heroImage]);

  const handleSelectOffer = (offer: Rate) => {
    const params = new URLSearchParams({
      hotelId,
      offerId: offer.offerId,
      checkin,
      checkout,
      adults: String(adults)
    }).toString();
    router.push(`/checkout?${params}`);
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
            {checkin} → {checkout} · {adults}{" "}
            {adults === 1 ? "guest" : "guests"}
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
            {roomGroups.length === 0 && (
              <p className="text-xs text-slate-400">
                No rooms are currently available for your dates.
              </p>
            )}
            <div className="space-y-3">
              {roomGroups.map((room) => (
                <div
                  key={room.roomId}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 space-y-2"
                >
                  <div className="flex gap-2">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                      {room.image ? (
                        <button
                          type="button"
                          onClick={() => {
                            const roomMeta = details?.rooms?.find((r) => r.id === room.roomId);
                            const photos = roomMeta?.photos ?? [];
                            if (photos.length > 0) {
                              openRoomGallery(
                                room.roomId,
                                photos.findIndex((p) => p.url === room.image) >= 0
                                  ? photos.findIndex((p) => p.url === room.image)
                                  : 0
                              );
                            }
                          }}
                          className="w-full h-full block"
                        >
                          <img
                            src={room.image}
                            alt={room.roomName}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                        </button>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold leading-snug">
                        {room.roomName}
                      </h4>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {room.offers.map((offer) => {
                      const total = offer.retailRate.total[0];
                      const tax =
                        offer.retailRate.taxesAndFees?.[0];
                      const cancel =
                        offer.cancellationPolicies
                          ?.cancelPolicyInfos?.[0]
                          ?.cancelTime;
                      const refundableTag =
                        offer.cancellationPolicies
                          ?.refundableTag;

                      return (
                        <div
                          key={offer.offerId + offer.boardName}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex-1">
                            <p className="text-xs font-medium text-slate-50">
                              {offer.boardName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {refundableTag === "NRF" ||
                                refundableTag === "NRFN"
                                ? "Non-refundable"
                                : cancel
                                  ? `Free cancellation until ${cancel}`
                                  : "Flexible cancellation"}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold">
                              {total.currency}{" "}
                              {total.amount.toFixed(0)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {tax?.included
                                ? "incl. taxes"
                                : "+ taxes"}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectOffer(offer)}
                              className="mt-1 inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-900 active:scale-[0.97]"
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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

