"use client";

import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { parseOccupanciesParam, totalGuests } from "@/lib/occupancy";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, Suspense } from "react";

interface PrebookPayload {
  data: {
    prebookId: string;
    offerId: string;
    hotelId: string;
    /** Total to charge (source of truth per PRICING_AND_CALCULATIONS). */
    price: number;
    currency: string;
    transactionId: string;
    secretKey: string;
    roomTypes: {
      rates: {
        name?: string;
        boardName?: string;
        retailRate: {
          total: { amount: number; currency: string }[];
          taxesAndFees?: { included?: boolean; amount?: number; currency?: string }[];
        };
        /** Commission (seller margin) for this rate; included in retailRate.total. */
        commission?: { amount?: number; currency?: string }[];
        cancellationPolicies?: {
          refundableTag?: string;
          cancelPolicyInfos?: { cancelTime?: string }[];
        };
      }[];
    }[];
  };
}

interface HotelSummary {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  main_photo?: string;
  hotelImages?: { url: string; defaultImage?: boolean }[];
  starRating?: number;
  rating?: number;
  reviewCount?: number;
}

interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
}

declare global {
  interface Window {
    LiteAPIPayment?: any;
  }
}

const GUEST_STORAGE_KEY = "liteapi_guest_details";

function formatStayDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function CheckoutLoading() {
  return (
    <div className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300 animate-pulse">
        Checking availability and locking in your price…
      </div>
    </div>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocaleCurrency();

  const hotelId = searchParams.get("hotelId") ?? "";
  const offerId = searchParams.get("offerId") ?? "";
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const occupanciesParam = searchParams.get("occupancies");
  const occupancies = useMemo(
    () => parseOccupanciesParam(occupanciesParam),
    [occupanciesParam]
  );
  const guestsCount = totalGuests(occupancies);

  const [prebook, setPrebook] = useState<PrebookPayload | null>(null);
  const [prebookError, setPrebookError] = useState<string | null>(null);
  const [loadingPrebook, setLoadingPrebook] = useState(true);
  const [hotelSummary, setHotelSummary] = useState<HotelSummary | null>(null);

  const [guest, setGuest] = useState<GuestDetails>({
    firstName: "",
    lastName: "",
    email: ""
  });
  const [guestTouched, setGuestTouched] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const paymentScriptLoadedRef = useRef(false);
  const [paymentScriptReady, setPaymentScriptReady] = useState(false);
  const paymentInstanceRef = useRef<any>(null);
  const paymentHandledForPrebookRef = useRef<string | null>(null);

  // Load any stored guest details
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GuestDetails;
        setGuest(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Prebook when offerId is available
  useEffect(() => {
    if (!offerId) {
      setPrebookError("Missing offer. Please go back and select a room.");
      setLoadingPrebook(false);
      return;
    }

    async function run() {
      try {
        setLoadingPrebook(true);
        setPrebookError(null);
        const res = await fetch("/api/rates/prebook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            offerId,
            usePaymentSdk: true
          })
        });
        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(
            json?.error?.message ?? "Failed to prebook this offer"
          );
        }
        setPrebook(json as PrebookPayload);
      } catch (err: any) {
        setPrebookError(err.message ?? "Failed to prebook this offer");
      } finally {
        setLoadingPrebook(false);
      }
    }

    run();
  }, [offerId]);

  // Fetch hotel name/address for booking summary when we have hotelId and prebook
  useEffect(() => {
    if (!hotelId || !prebook?.data?.hotelId) return;
    let cancelled = false;
    const detailsUrl = new URL("/api/hotel/details", window.location.origin);
    detailsUrl.searchParams.set("hotelId", hotelId);
    if (locale) detailsUrl.searchParams.set("language", locale);
    fetch(detailsUrl.toString(), { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || json?.error) return;
        const data = json.data;
        if (data) {
          setHotelSummary({
            name: data.name ?? "Hotel",
            address: data.address,
            city: data.city,
            country: data.country,
            main_photo: data.main_photo,
            hotelImages: data.hotelImages,
            starRating: data.starRating,
            rating: data.rating,
            reviewCount: data.reviewCount
          });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [hotelId, prebook?.data?.hotelId, locale]);

  const handleGuestSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGuestTouched(true);
    if (!guest.firstName || !guest.lastName || !guest.email) return;

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          GUEST_STORAGE_KEY,
          JSON.stringify(guest)
        );
      }
    } catch {
      // ignore storage failures
    }

    setShowPayment(true);
  };

  // Load payment script once (do not remove on unmount so SDK keeps working)
  useEffect(() => {
    if (!showPayment || paymentScriptLoadedRef.current) return;
    if (typeof window === "undefined") return;

    const existing = document.querySelector(
      'script[src*="liteAPIPayment.js"]'
    );
    if (existing) {
      paymentScriptLoadedRef.current = true;
      setPaymentScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
    script.async = true;
    script.onerror = () => {
      setPaymentError("Failed to load payment SDK script");
    };
    script.onload = () => {
      paymentScriptLoadedRef.current = true;
      setPaymentScriptReady(true);
    };
    document.body.appendChild(script);
    // Intentionally no cleanup: do not remove script so payment form stays usable
  }, [showPayment]);

  // Defer handlePayment until container is mounted and script is loaded (once per prebook)
  useEffect(() => {
    if (!showPayment || !prebook?.data?.secretKey || !paymentScriptReady) return;
    if (typeof window === "undefined" || !window.LiteAPIPayment) return;
    if (!paymentContainerRef.current) return;
    if (paymentHandledForPrebookRef.current === prebook.data.prebookId) return;

    paymentHandledForPrebookRef.current = prebook.data.prebookId;
    const { secretKey, prebookId, transactionId } = prebook.data;
    const origin = window.location.origin;
    const retParams = new URLSearchParams({
      prebookId,
      transactionId,
      hotelId,
      checkin,
      checkout
    });
    if (occupanciesParam) retParams.set("occupancies", occupanciesParam);
    const retParamsStr = retParams.toString();

    const liteAPIConfig = {
      publicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "sandbox",
      secretKey,
      returnUrl: `${origin}/confirmation?${retParamsStr}`,
      targetElement: "#payment-element",
      appearance: { theme: "flat" },
      options: {
        business: { name: "LiteAPI Demo Travel" }
      }
    };

    try {
      const payment = new window.LiteAPIPayment(liteAPIConfig);
      paymentInstanceRef.current = payment;
      payment.handlePayment();
    } catch (err: any) {
      setPaymentError(
        err?.message ?? "Failed to initialize payment form"
      );
    }
  }, [showPayment, prebook, paymentScriptReady, hotelId, checkin, checkout, occupanciesParam]);

  const roomTypes = prebook?.data?.roomTypes ?? [];
  const firstRoomType = roomTypes[0];
  const firstRate = firstRoomType?.rates?.[0];

  // Pay now = prebook top-level price (LiteAPI: amount to pay online; includes commission + included taxes only)
  const payNow =
    prebook?.data?.price != null && prebook?.data?.currency
      ? { amount: prebook.data.price, currency: prebook.data.currency }
      : null;

  // Per LiteAPI: included = in retailRate.total (pay now); included: false = pay at property (local fees)
  const { includedTaxesAndFeesTotal, localFeesTotal } = (() => {
    if (!payNow) return { includedTaxesAndFeesTotal: null as number | null, localFeesTotal: null as number | null };
    let included = 0;
    let local = 0;
    for (const rt of roomTypes) {
      for (const r of (rt as any).rates ?? []) {
        const commission = r?.commission?.[0];
        if (commission?.amount != null && typeof commission.amount === "number") included += commission.amount;
        const taxes = r?.retailRate?.taxesAndFees;
        if (Array.isArray(taxes)) {
          for (const t of taxes) {
            if (t?.amount == null || typeof t.amount !== "number") continue;
            if (t.included) included += t.amount;
            else local += t.amount;
          }
        }
      }
    }
    return {
      includedTaxesAndFeesTotal: included > 0 ? included : null,
      localFeesTotal: local > 0 ? local : null
    };
  })();

  // Total = Pay now + Local fees (reference: Total = base + included taxes + local fees)
  const total = payNow
    ? {
        amount: payNow.amount + (localFeesTotal ?? 0),
        currency: payNow.currency
      }
    : null;

  // Base (1 room × 1 night line) = Pay now - included taxes and fees
  const baseAmount =
    payNow && includedTaxesAndFeesTotal != null
      ? payNow.amount - includedTaxesAndFeesTotal
      : payNow?.amount ?? null;

  const taxes = firstRate?.retailRate?.taxesAndFees?.[0];
  const cancelInfo = firstRate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime;
  const refundableTag = firstRate?.cancellationPolicies?.refundableTag;
  const roomName = firstRate?.name;
  const boardName = firstRate?.boardName;

  const nights =
    checkin && checkout
      ? Math.max(
        0,
        Math.ceil(
          (new Date(checkout).getTime() - new Date(checkin).getTime()) /
          (1000 * 60 * 60 * 24)
        )
      )
      : 0;

  const guestValid =
    !!guest.firstName && !!guest.lastName && !!guest.email;

  return (
    <main className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams({ checkin, checkout });
            if (occupanciesParam) params.set("occupancies", occupanciesParam);
            router.push(`/hotel/${hotelId}?${params.toString()}`);
          }}
          className="h-9 w-9 rounded-full border border-slate-700 flex items-center justify-center text-slate-200 text-sm"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Secure your stay
          </h1>
          <p className="text-[11px] text-slate-400">
            {checkin} → {checkout} · {guestsCount}{" "}
            {guestsCount === 1 ? "guest" : "guests"}
          </p>
        </div>
      </header>

      {loadingPrebook && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300 animate-pulse">
          Checking availability and locking in your price…
        </div>
      )}

      {!loadingPrebook && prebookError && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {prebookError}
        </div>
      )}

      {!loadingPrebook && prebook && (
        <>
          {/* Booking-style hotel header */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
            <div className="p-4 flex gap-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                {(hotelSummary?.hotelImages?.find((i) => i.defaultImage)?.url ??
                  hotelSummary?.main_photo ??
                  hotelSummary?.hotelImages?.[0]?.url) ? (
                  <img
                    src={
                      hotelSummary?.hotelImages?.find((i) => i.defaultImage)?.url ??
                      hotelSummary?.main_photo ??
                      hotelSummary?.hotelImages?.[0]?.url
                    }
                    alt={hotelSummary?.name ?? "Hotel"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                    No photo
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-50 leading-tight">
                  {hotelSummary?.name ?? "Loading…"}
                </h2>
                {(hotelSummary?.address || hotelSummary?.city || hotelSummary?.country) && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <span aria-hidden>📍</span>
                    {[hotelSummary?.address, hotelSummary?.city, hotelSummary?.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {hotelSummary?.starRating != null && (
                    <span className="text-amber-300 text-xs">
                      {"★".repeat(hotelSummary.starRating)}
                    </span>
                  )}
                  {hotelSummary?.rating != null && hotelSummary?.reviewCount != null && (
                    <span className="rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-medium px-1.5 py-0.5">
                      {hotelSummary.rating.toFixed(1)}{" "}
                      {hotelSummary.rating >= 9
                        ? "Wonderful"
                        : hotelSummary.rating >= 8
                          ? "Excellent"
                          : hotelSummary.rating >= 7
                            ? "Very Good"
                            : "Good"}{" "}
                      ({hotelSummary.reviewCount.toLocaleString()})
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4 pb-3">
              <p className="text-xs text-slate-400">
                {formatStayDate(checkin)} – {formatStayDate(checkout)} ({nights}{" "}
                {nights === 1 ? "night" : "nights"})
              </p>
            </div>
          </section>

          {/* Your Rooms */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Your Rooms
            </h2>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-slate-50">
                {occupancies.length > 1
                  ? `${occupancies.length} x ${roomName ?? "Room"}${boardName ? `, ${boardName}` : ""}`
                  : `${roomName ?? "Room"}${boardName ? `, ${boardName}` : ""}`}
              </p>
              <p className="text-xs text-slate-400">
                {occupancies
                  .map(
                    (o) =>
                      `${o.adults} ${o.adults === 1 ? "Adult" : "Adults"}${
                        o.children?.length
                          ? `, ${o.children.length} ${o.children.length === 1 ? "Child" : "Children"}`
                          : ""
                      }`
                  )
                  .join(" · ")}
              </p>
              <p className="text-[11px] text-slate-500">
                {refundableTag === "NRF" || refundableTag === "NRFN"
                  ? "Non-refundable"
                  : cancelInfo
                    ? `Free cancellation until ${cancelInfo}`
                    : "Flexible cancellation"}
                {" · "}
                Cancellation policy applies
              </p>
              {payNow && nights > 0 && occupancies.length > 0 && (
                <p className="text-xs text-slate-400">
                  {payNow.currency}{" "}
                  {(payNow.amount / (nights * occupancies.length)).toFixed(2)} average per
                  room/night
                </p>
              )}
            </div>
          </section>

          {/* Price breakdown (LiteAPI: included = pay now; included: false = pay at property. Match reference layout.) */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2 text-sm">
            <h2 className="text-sm font-semibold text-slate-100">
              Price summary
            </h2>
            {payNow && total && (
              <>
                <div className="flex justify-between text-slate-300">
                  <span>
                    {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"} × {nights}{" "}
                    {nights === 1 ? "night" : "nights"}
                  </span>
                  <span>
                    {payNow.currency}{" "}
                    {(baseAmount != null ? baseAmount : payNow.amount).toFixed(2)}
                  </span>
                </div>
                {(includedTaxesAndFeesTotal != null || taxes?.included) && (
                  <div className="flex justify-between text-slate-400 text-xs items-center gap-1">
                    <span className="flex items-center gap-1">
                      Included taxes and fees
                      <span className="text-slate-500" title="Commission and taxes included in the price above">
                        (i)
                      </span>
                    </span>
                    <span>
                      {includedTaxesAndFeesTotal != null
                        ? `${payNow.currency} ${includedTaxesAndFeesTotal.toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                )}
                {localFeesTotal != null && localFeesTotal > 0 && (
                  <div className="flex justify-between text-slate-400 text-xs items-center gap-1">
                    <span className="flex items-center gap-1">
                      Local fees
                      <span className="text-slate-500" title="Fees paid at the property">
                        (i)
                      </span>
                    </span>
                    <span>{payNow.currency} {localFeesTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-2 border-t border-slate-700">
                  <span className="font-medium text-slate-200">Total</span>
                  <span className="text-base font-semibold text-slate-50">
                    {total.currency} {total.amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <span aria-hidden>💵</span>
                    Pay now
                  </span>
                  <span className="text-base font-semibold text-slate-50">
                    {payNow.currency} {payNow.amount.toFixed(2)}
                  </span>
                </div>
                {localFeesTotal != null && localFeesTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span aria-hidden>🏨</span>
                        Pay at property
                      </span>
                      <span className="text-sm font-medium text-slate-300">
                        {payNow.currency} {localFeesTotal.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 pt-1">
                      Pay at property amount is an approximate price based on the current exchange rate and may change before your stay.
                    </p>
                  </>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">
              Guest details
            </h2>
            <form className="space-y-3" onSubmit={handleGuestSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">
                    First name
                  </label>
                  <input
                    type="text"
                    value={guest.firstName}
                    onChange={(e) =>
                      setGuest((g) => ({
                        ...g,
                        firstName: e.target.value
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={guest.lastName}
                    onChange={(e) =>
                      setGuest((g) => ({
                        ...g,
                        lastName: e.target.value
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  value={guest.email}
                  onChange={(e) =>
                    setGuest((g) => ({
                      ...g,
                      email: e.target.value
                    }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {guestTouched && !guestValid && (
                <p className="text-[11px] text-red-300">
                  Please fill in all guest details before continuing.
                </p>
              )}

              <button
                type="submit"
                className="w-full mt-1 rounded-full bg-emerald-500 text-slate-900 text-sm font-semibold py-2.5 shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!prebook}
              >
                Continue to payment
              </button>

              <p className="text-[11px] text-slate-500 mt-1">
                Sandbox mode: use test card <span className="font-mono">4242
                  4242 4242 4242</span>, any 3-digit CVC, and any future
                expiry date.
              </p>
            </form>
          </section>

          {showPayment && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
              <h2 className="text-sm font-semibold">
                Payment
              </h2>
              {!paymentScriptReady && (
                <div className="mt-1 rounded-xl border border-slate-700 bg-slate-950 p-4 text-center">
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4 mx-auto"></div>
                    <div className="h-3 bg-slate-800 rounded w-1/2 mx-auto"></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Loading secure payment form...
                  </p>
                </div>
              )}
              <div
                id="payment-element"
                ref={paymentContainerRef}
                className={`mt-1 space-y-2 min-h-[120px] ${!paymentScriptReady ? 'hidden' : ''}`}
              />
              {paymentError && (
                <p className="text-[11px] text-red-300">
                  {paymentError}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutContent />
    </Suspense>
  );
}
