"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

interface PrebookPayload {
  data: {
    prebookId: string;
    offerId: string;
    hotelId: string;
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
          taxesAndFees?: { included?: boolean; amount?: number }[];
        };
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

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const hotelId = searchParams.get("hotelId") ?? "";
  const offerId = searchParams.get("offerId") ?? "";
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const adults = Number(searchParams.get("adults") ?? "2");

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
    fetch(`/api/hotel/details?hotelId=${encodeURIComponent(hotelId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || json?.error) return;
        const data = json.data;
        if (data) {
          setHotelSummary({
            name: data.name ?? "Hotel",
            address: data.address,
            city: data.city,
            country: data.country
          });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [hotelId, prebook?.data?.hotelId]);

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
      checkout,
      adults: String(adults)
    }).toString();

    const liteAPIConfig = {
      publicKey: process.env.NEXT_PUBLIC_LITEAPI_ENV || "sandbox",
      secretKey,
      returnUrl: `${origin}/confirmation?${retParams}`,
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
  }, [showPayment, prebook, paymentScriptReady, hotelId, checkin, checkout, adults]);

  const firstRate = prebook?.data?.roomTypes?.[0]?.rates?.[0];
  const total = firstRate?.retailRate?.total?.[0];
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
            const params = new URLSearchParams({
              checkin,
              checkout,
              adults: String(adults)
            });
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
            {checkin} → {checkout} · {adults}{" "}
            {adults === 1 ? "guest" : "guests"}
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
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Your booking
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                  Hotel
                </p>
                <p className="font-medium text-slate-50">
                  {hotelSummary?.name ?? "Loading…"}
                </p>
                {(hotelSummary?.address || hotelSummary?.city || hotelSummary?.country) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[hotelSummary.address, hotelSummary.city, hotelSummary.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                  Room
                </p>
                <p className="text-slate-50">
                  {roomName ?? "Room"}
                  {boardName ? ` · ${boardName}` : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    Check-in
                  </p>
                  <p className="text-slate-200">{checkin}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    Check-out
                  </p>
                  <p className="text-slate-200">{checkout}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    Nights
                  </p>
                  <p className="text-slate-200">{nights}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    Guests
                  </p>
                  <p className="text-slate-200">
                    {adults} {adults === 1 ? "adult" : "adults"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2 text-sm">
            <h2 className="text-sm font-semibold text-slate-100">
              Price
            </h2>
            {total && (
              <>
                {taxes && !taxes.included && typeof taxes.amount === "number" && (
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span>
                      {total.currency}{" "}
                      {(total.amount - taxes.amount).toFixed(2)}
                    </span>
                  </div>
                )}
                {taxes && typeof taxes.amount === "number" && (
                  <div className="flex justify-between text-slate-300">
                    <span>Taxes & fees</span>
                    <span>
                      {total.currency} {taxes.amount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1 border-t border-slate-700">
                  <span className="font-medium text-slate-200">
                    Total {taxes?.included ? "(incl. taxes)" : ""}
                  </span>
                  <span className="text-base font-semibold text-slate-50">
                    {total.currency} {total.amount.toFixed(0)}
                    {taxes?.included && (
                      <span className="block text-[11px] font-normal text-slate-400">
                        includes taxes & fees
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
            <p className="text-[11px] text-slate-400 pt-1">
              {refundableTag === "NRF" || refundableTag === "NRFN"
                ? "This booking is non-refundable."
                : cancelInfo
                  ? `Free cancellation until ${cancelInfo}.`
                  : "Flexible cancellation policy; see full details in hotel terms."}
            </p>
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

