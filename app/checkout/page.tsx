"use client";

import { useAuth } from "@/context/AuthContext";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { parseOccupanciesParam, totalGuests } from "@/lib/occupancy";
import { ArrowLeftIcon, BreakfastIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, MapPinIcon, UsersIcon } from "@/components/Icons";
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
  phone?: string;
}

/** Stored shape: per-room guests for book API (Phase 3). Confirmation reads this. */
const GUEST_STORAGE_VERSION = 2;
interface StoredGuestPayload {
  version: number;
  guests: GuestDetails[];
}

declare global {
  interface Window {
    LiteAPIPayment?: any;
  }
}

const GUEST_STORAGE_KEY = "liteapi_guest_details";
const BOOKING_FOR_KEY = "liteapi_booking_for"; // "myself" | "someone_else"
const PROMO_STORAGE_KEY_PREFIX = "liteapi_promo_"; // + offerId
const SPECIAL_REQUESTS_KEY = "liteapi_special_requests";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim() ?? "");
}

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
      <div className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 text-sm text-[var(--muted-foreground)] animate-pulse shadow-sm">
        Checking availability and locking in your price…
      </div>
    </div>
  );
}

function getDefaultGuestsForRooms(roomCount: number): GuestDetails[] {
  return Array.from({ length: roomCount }, () => ({
    firstName: "",
    lastName: "",
    email: "",
    phone: ""
  }));
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocaleCurrency();
  const { userProfile, isReady: authReady } = useAuth();

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
  const roomCount = occupancies.length;

  const [prebook, setPrebook] = useState<PrebookPayload | null>(null);
  const [prebookError, setPrebookError] = useState<string | null>(null);
  const [loadingPrebook, setLoadingPrebook] = useState(true);
  const [hotelSummary, setHotelSummary] = useState<HotelSummary | null>(null);

  const [bookingFor, setBookingFor] = useState<"myself" | "someone_else">("myself");
  const [guestsPerRoom, setGuestsPerRoom] = useState<GuestDetails[]>(() =>
    getDefaultGuestsForRooms(roomCount)
  );
  const [activeRoomTab, setActiveRoomTab] = useState(0);
  const [guestTouched, setGuestTouched] = useState(false);

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const [paymentContainerReady, setPaymentContainerReady] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const guestSectionRef = useRef<HTMLDivElement | null>(null);
  const paymentScriptLoadedRef = useRef(false);
  const [paymentScriptReady, setPaymentScriptReady] = useState(false);
  const paymentInstanceRef = useRef<any>(null);
  const paymentHandledForPrebookRef = useRef<string | null>(null);
  /** Phase 11: Force re-run of payment init effect when user clicks "Try again" */
  const [paymentRetryKey, setPaymentRetryKey] = useState(0);
  /** Phase 6: which price summary (i) tooltip is open */
  const [priceSummaryTooltip, setPriceSummaryTooltip] = useState<null | "taxes" | "local">(null);
  /** Phase 5: which room's cancellation details are expanded (for info icon) */
  const [cancellationExpandedRoom, setCancellationExpandedRoom] = useState<number | null>(null);
  /** Phase 7: Promo code */
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    type: "percent" | "fixed";
    value: number;
    currency?: string;
    message: string;
  } | null>(null);
  /** Phase 9: Special requests */
  const [specialRequestsExpanded, setSpecialRequestsExpanded] = useState(false);
  const [specialRequests, setSpecialRequests] = useState("");

  // Phase 7: Restore applied promo from sessionStorage (keyed by offerId)
  useEffect(() => {
    if (typeof window === "undefined" || !offerId) return;
    try {
      const key = `${PROMO_STORAGE_KEY_PREFIX}${offerId}`;
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.code && (parsed.type === "percent" || parsed.type === "fixed")) {
          setAppliedPromo({
            code: parsed.code,
            type: parsed.type,
            value: parsed.value ?? 0,
            currency: parsed.currency,
            message: parsed.message ?? "Promo code applied!",
          });
        }
      }
    } catch {
      // ignore
    }
  }, [offerId]);

  // Phase 9: Restore special requests from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SPECIAL_REQUESTS_KEY);
      if (stored != null) setSpecialRequests(stored.slice(0, 500));
    } catch {
      // ignore
    }
  }, []);

  // Phase 9: Persist special requests to localStorage when changed
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (specialRequests) {
        window.localStorage.setItem(SPECIAL_REQUESTS_KEY, specialRequests.slice(0, 500));
      } else {
        window.localStorage.removeItem(SPECIAL_REQUESTS_KEY);
      }
    } catch {
      // ignore
    }
  }, [specialRequests]);

  // Sync guestsPerRoom length when room count changes
  useEffect(() => {
    setGuestsPerRoom((prev) => {
      if (prev.length === roomCount) return prev;
      if (prev.length < roomCount) {
        return [
          ...prev,
          ...getDefaultGuestsForRooms(roomCount - prev.length)
        ];
      }
      return prev.slice(0, roomCount);
    });
  }, [roomCount]);

  // Load stored guest details and "booking for" preference (Phase 3 + 4)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(GUEST_STORAGE_KEY);
      const storedBookingFor = window.localStorage.getItem(BOOKING_FOR_KEY);
      if (storedBookingFor === "myself" || storedBookingFor === "someone_else") {
        setBookingFor(storedBookingFor);
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.version === GUEST_STORAGE_VERSION && Array.isArray(parsed?.guests)) {
          const guests = (parsed as StoredGuestPayload).guests;
          if (guests.length >= roomCount) {
            setGuestsPerRoom(guests.slice(0, roomCount).map((g) => ({
              firstName: g.firstName ?? "",
              lastName: g.lastName ?? "",
              email: g.email ?? "",
              phone: g.phone ?? ""
            })));
          } else if (guests.length > 0) {
            setGuestsPerRoom((prev) => {
              const next = [...prev];
              guests.forEach((g, i) => {
                next[i] = {
                  firstName: g.firstName ?? "",
                  lastName: g.lastName ?? "",
                  email: g.email ?? "",
                  phone: g.phone ?? ""
                };
              });
              return next;
            });
          }
        } else if (parsed?.firstName != null || parsed?.email != null) {
          const single = parsed as GuestDetails;
          setGuestsPerRoom((prev) => {
            const next = [...prev];
            next[0] = {
              firstName: single.firstName ?? "",
              lastName: single.lastName ?? "",
              email: single.email ?? "",
              phone: single.phone ?? ""
            };
            return next;
          });
        }
      }
    } catch {
      // ignore
    }
  }, [roomCount]);

  // Phase 4: Pre-fill guest details when "Myself" and user is logged in
  useEffect(() => {
    if (!authReady || bookingFor !== "myself" || !userProfile) return;
    const first = userProfile.displayName?.trim().split(/\s+/) ?? [];
    const firstName = first[0] ?? "";
    const lastName = first.slice(1).join(" ") ?? "";
    const email = userProfile.email ?? "";
    const phone = userProfile.phone ?? "";
    if (!firstName && !email) return;
    setGuestsPerRoom((prev) => {
      const next = [...prev];
      next[0] = {
        firstName: next[0].firstName || firstName,
        lastName: next[0].lastName || lastName,
        email: next[0].email || email,
        phone: next[0].phone || phone
      };
      return next;
    });
  }, [authReady, bookingFor, userProfile?.userId, userProfile?.email, userProfile?.displayName, userProfile?.phone]);

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
    const allValid = guestsPerRoom.every(
      (g) =>
        !!g.firstName?.trim() &&
        !!g.lastName?.trim() &&
        !!g.email?.trim() &&
        isValidEmail(g.email)
    );
    if (!allValid) {
      // Phase 11.2: Scroll to first invalid room
      const firstInvalidIndex = guestsPerRoom.findIndex(
        (g) =>
          !g.firstName?.trim() ||
          !g.lastName?.trim() ||
          !g.email?.trim() ||
          !isValidEmail(g.email)
      );
      if (firstInvalidIndex >= 0) {
        setActiveRoomTab(firstInvalidIndex);
      }
      guestSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          GUEST_STORAGE_KEY,
          JSON.stringify({
            version: GUEST_STORAGE_VERSION,
            guests: guestsPerRoom
          } as StoredGuestPayload)
        );
        window.localStorage.setItem(BOOKING_FOR_KEY, bookingFor);
      }
    } catch {
      // ignore storage failures
    }

    paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Phase 2 + Phase 11: Preload payment SDK when prebook is available; on refresh we get fresh prebook from API.
  // After script onload, wait for window.LiteAPIPayment (script may define it async) so init effect can run.
  useEffect(() => {
    if (!prebook?.data?.secretKey) return;
    if (typeof window === "undefined") return;

    const existing = document.querySelector(
      'script[src*="liteAPIPayment.js"]'
    );
    if (existing) {
      paymentScriptLoadedRef.current = true;
      setPaymentError(null);
      // Phase 11: Only set ready when global exists (handles cached script that hasn't executed yet)
      const checkGlobal = (attempt = 0) => {
        if (typeof window.LiteAPIPayment !== "undefined") {
          setPaymentScriptReady(true);
          return;
        }
        if (attempt < 10) {
          setTimeout(() => checkGlobal(attempt + 1), 50 * (attempt + 1));
        } else {
          setPaymentScriptReady(true);
          setPaymentError("Payment form could not load. Try refreshing the page.");
        }
      };
      checkGlobal();
      return;
    }

    if (paymentScriptLoadedRef.current) return;
    setPaymentError(null);
    const script = document.createElement("script");
    script.src =
      "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
    script.async = true;
    script.onerror = () => {
      setPaymentError(
        "Unable to load secure payment form. Please check your connection and try again."
      );
      setPaymentScriptReady(true);
    };
    script.onload = () => {
      paymentScriptLoadedRef.current = true;
      // Phase 11: Wait for window.LiteAPIPayment (SDK may attach it after load)
      const checkGlobal = (attempt = 0) => {
        if (typeof window.LiteAPIPayment !== "undefined") {
          setPaymentScriptReady(true);
          return;
        }
        if (attempt < 10) {
          setTimeout(() => checkGlobal(attempt + 1), 50 * (attempt + 1));
        } else {
          setPaymentScriptReady(true);
          setPaymentError("Payment form could not load. Try refreshing the page.");
        }
      };
      checkGlobal();
    };
    document.body.appendChild(script);
  }, [prebook?.data?.secretKey]);

  // Unique id per prebook so the SDK only ever targets one container (avoids duplicate forms)
  const paymentElementId = prebook?.data?.prebookId
    ? `payment-element-${prebook.data.prebookId}`
    : "payment-element";

  // Initialize payment form when container is mounted and script is ready (Phase 11: paymentRetryKey forces re-run)
  useEffect(() => {
    if (!prebook?.data?.secretKey || !paymentScriptReady || !paymentContainerReady) return;
    if (typeof window === "undefined" || !window.LiteAPIPayment) return;
    const container = paymentContainerRef.current;
    if (!container) return;
    if (paymentHandledForPrebookRef.current === prebook.data.prebookId) return;

    paymentHandledForPrebookRef.current = prebook.data.prebookId;
    setPaymentError(null);
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

    // Clear any previous SDK injection so we never render the form twice (e.g. React Strict Mode double-mount)
    container.innerHTML = "";

    // LiteAPI publicKey is the environment ("live" or "sandbox"), not a Stripe key.
    // It must match the LiteAPI API key used for prebook; using your own Stripe publishable key causes
    // "client_secret does not match any PaymentIntent" because the PaymentIntent is from LiteAPI's Stripe account.
    const liteAPIConfig = {
      publicKey:
        process.env.NEXT_PUBLIC_LITEAPI_ENV === "live" ? "live" : "sandbox",
      secretKey,
      returnUrl: `${origin}/confirmation?${retParamsStr}`,
      targetElement: `#${paymentElementId}`,
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
  }, [prebook?.data?.prebookId, prebook?.data?.secretKey, paymentScriptReady, paymentContainerReady, paymentElementId, hotelId, checkin, checkout, occupanciesParam, paymentRetryKey]);

  const roomTypes = prebook?.data?.roomTypes ?? [];
  const firstRoomType = roomTypes[0];
  const firstRate = firstRoomType?.rates?.[0];

  // Pay now = prebook top-level price (LiteAPI: amount to pay online; includes commission + included taxes only)
  const payNow =
    prebook?.data?.price != null && prebook?.data?.currency
      ? { amount: prebook.data.price, currency: prebook.data.currency }
      : null;

  // Per LiteAPI: included = in retailRate.total (pay now); included: false = pay at property (local fees).
  // Included amounts are per-room → sum across all rates. Pay-at-property is total for all rooms, duplicated per rate → count once (first rate only).
  const { includedTaxesAndFeesTotal, localFeesTotal } = (() => {
    if (!payNow) return { includedTaxesAndFeesTotal: null as number | null, localFeesTotal: null as number | null };
    let included = 0;
    let local = 0;
    let localFeesCounted = false;
    for (const rt of roomTypes) {
      for (const r of (rt as any).rates ?? []) {
        const commission = r?.commission?.[0];
        if (commission?.amount != null && typeof commission.amount === "number") included += commission.amount;
        const taxes = r?.retailRate?.taxesAndFees;
        if (Array.isArray(taxes)) {
          for (const t of taxes) {
            if (t?.amount == null || typeof t.amount !== "number") continue;
            if (t.included) included += t.amount;
            else if (!localFeesCounted) {
              local += t.amount;
            }
          }
        }
        localFeesCounted = true; // after first rate, stop adding pay-at-property amounts
      }
    }
    return {
      includedTaxesAndFeesTotal: included > 0 ? included : null,
      localFeesTotal: local > 0 ? local : null
    };
  })();

  // Total = Pay now + Local fees (reference: Total = base + included taxes + local fees)
  const totalBeforePromo = payNow
    ? {
        amount: payNow.amount + (localFeesTotal ?? 0),
        currency: payNow.currency
      }
    : null;

  // Phase 7: Discount from applied promo (percent off total or fixed amount)
  const discountAmount = useMemo(() => {
    if (!totalBeforePromo || !appliedPromo) return 0;
    if (appliedPromo.type === "percent") {
      return Math.round((totalBeforePromo.amount * appliedPromo.value) / 100);
    }
    return Math.min(appliedPromo.value, totalBeforePromo.amount);
  }, [totalBeforePromo, appliedPromo]);

  const total = totalBeforePromo
    ? {
        amount: Math.max(0, totalBeforePromo.amount - discountAmount),
        currency: totalBeforePromo.currency
      }
    : null;

  // Base (1 room × 1 night line) = Pay now - included taxes and fees
  const baseAmount =
    payNow && includedTaxesAndFeesTotal != null
      ? payNow.amount - includedTaxesAndFeesTotal
      : payNow?.amount ?? null;

  const taxes = firstRate?.retailRate?.taxesAndFees?.[0];

  /** Phase 5: per-room rate and occupancy for "Your Rooms" (roomTypes may have one or multiple entries) */
  const roomsForDisplay = useMemo(() => {
    return occupancies.map((occ, roomIndex) => {
      const rt = roomTypes[roomIndex] ?? roomTypes[0];
      const rate = rt?.rates?.[0] ?? firstRate;
      const refundableTag = rate?.cancellationPolicies?.refundableTag;
      const cancelPolicyInfos = rate?.cancellationPolicies?.cancelPolicyInfos ?? [];
      const cancelTime = cancelPolicyInfos[0]?.cancelTime;
      const roomName = rate?.name ?? "Room";
      const boardName = rate?.boardName;
      const hasBreakfast = boardName != null && String(boardName).toLowerCase().includes("breakfast");
      return {
        roomIndex,
        roomName,
        boardName,
        occupancy: occ,
        refundableTag,
        cancelTime,
        cancelPolicyInfos,
        hasBreakfast
      };
    });
  }, [occupancies, roomTypes, firstRate]);

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
    guestsPerRoom.length >= roomCount &&
    guestsPerRoom.every(
      (g) =>
        !!g.firstName?.trim() &&
        !!g.lastName?.trim() &&
        !!g.email?.trim() &&
        isValidEmail(g.email)
    );

  const setGuestForRoom = (roomIndex: number, updater: (g: GuestDetails) => GuestDetails) => {
    setGuestsPerRoom((prev) => {
      const next = [...prev];
      if (roomIndex >= 0 && roomIndex < next.length) {
        next[roomIndex] = updater(next[roomIndex]);
      }
      return next;
    });
  };

  // Subtitle: booking dates and guest count per Phase 1 (e.g. "2026-03-09 → 2026-03-13 · 2 guests")
  const headerSubtitle =
    checkin && checkout
      ? `${checkin} → ${checkout} · ${guestsCount} ${guestsCount === 1 ? "guest" : "guests"}`
      : guestsCount > 0
        ? `${guestsCount} ${guestsCount === 1 ? "guest" : "guests"}`
        : "";

  return (
    <main className="flex-1 flex flex-col px-4 pb-6 pt-4 gap-4">
      {/* Phase 1: Page header — title, subtitle, back to hotel with search params */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams({ checkin, checkout });
            if (occupanciesParam) params.set("occupancies", occupanciesParam);
            router.push(`/hotel/${hotelId}?${params.toString()}`);
          }}
          className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
          aria-label="Back to hotel"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--dark-text)]">
            Secure your stay
          </h1>
          {headerSubtitle ? (
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">
              {headerSubtitle}
            </p>
          ) : null}
        </div>
      </header>

      {loadingPrebook && (
        <div className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 text-sm text-[var(--muted-foreground)] animate-pulse shadow-sm">
          Checking availability and locking in your price…
        </div>
      )}

      {/* Phase 11.3: Prebook missing/expired — clear message and go back to hotel */}
      {!loadingPrebook && prebookError && (
        <div className="rounded-xl border border-red-500/40 bg-red-50 px-3 py-3 text-xs text-red-700 space-y-3">
          <p>{prebookError}</p>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams({ checkin, checkout });
              if (occupanciesParam) params.set("occupancies", occupanciesParam);
              router.push(`/hotel/${hotelId}?${params.toString()}`);
            }}
            className="rounded-full bg-[var(--primary)] text-white text-sm font-semibold px-4 py-2 hover:bg-[var(--primary-hover)] transition"
          >
            Go back to hotel
          </button>
        </div>
      )}

      {!loadingPrebook && prebook && (
        <>
          {/* Phase 8: Hotel summary card — list-card style (design system) */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm">
            <div className="relative h-44 w-full overflow-hidden bg-[var(--muted)]">
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
                <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                  No photo
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2">
              <h2 className="text-lg font-bold text-[var(--dark-text)] leading-tight">
                {hotelSummary?.name ?? "Loading…"}
              </h2>
              {(hotelSummary?.address || hotelSummary?.city || hotelSummary?.country) && (
                <p className="text-sm text-[var(--muted-foreground)] flex items-start gap-1.5">
                  <MapPinIcon className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" />
                  <span>
                    {[hotelSummary?.address, hotelSummary?.city, hotelSummary?.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {hotelSummary?.starRating != null && (
                  <span className="text-sm" style={{ color: "var(--star)" }} aria-label={`${hotelSummary.starRating} stars`}>
                    {"★".repeat(hotelSummary.starRating)}
                  </span>
                )}
                {hotelSummary?.rating != null && hotelSummary?.reviewCount != null && (
                  <span className="rounded bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium px-2 py-1">
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
              <p className="text-sm text-[var(--muted-foreground)] pt-0.5 flex items-center gap-1.5">
                <span aria-hidden>📅</span>
                {formatStayDate(checkin)} – {formatStayDate(checkout)} ({nights}{" "}
                {nights === 1 ? "night" : "nights"})
              </p>
            </div>
          </section>

          {/* Phase 5: Your Rooms — per-room cards, design system */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 space-y-4 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--dark-text)]">
              Your Rooms{roomCount > 1 ? ` (${roomCount})` : ""}
            </h2>
            <div className="space-y-4">
              {roomsForDisplay.map((room) => {
                const isNonRefundable = room.refundableTag === "NRF" || room.refundableTag === "NRFN";
                const cancellationText = isNonRefundable
                  ? "Non-refundable"
                  : room.cancelTime
                    ? `Free cancellation until ${room.cancelTime}`
                    : "Flexible cancellation";
                const showCancellationDetails = cancellationExpandedRoom === room.roomIndex;
                return (
                  <div
                    key={room.roomIndex}
                    className="rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] p-3.5 space-y-2.5"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                      Room {room.roomIndex + 1}
                    </p>
                    <p className="text-base font-semibold text-[var(--dark-text)] leading-tight">
                      {room.roomName}
                      {room.boardName ? `, ${room.boardName}` : ""}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)] flex items-center gap-1.5">
                      <UsersIcon className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                      {room.occupancy.adults} {room.occupancy.adults === 1 ? "Adult" : "Adults"}
                      {room.occupancy.children?.length
                        ? `, ${room.occupancy.children.length} ${room.occupancy.children.length === 1 ? "Child" : "Children"}`
                        : ""}
                    </p>
                    {room.hasBreakfast && (
                      <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
                        <BreakfastIcon className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
                        Breakfast included
                      </p>
                    )}
                    <div className="flex flex-wrap items-start gap-1.5">
                      <span
                        className={`text-xs font-medium ${isNonRefundable ? "text-red-600" : "text-[var(--primary)]"}`}
                      >
                        {cancellationText}
                      </span>
                      <span className="text-[var(--muted-foreground)] text-xs">·</span>
                      <span className="text-xs text-[var(--muted-foreground)]">Cancellation policy applies</span>
                      {room.cancelPolicyInfos.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setCancellationExpandedRoom((prev) =>
                              prev === room.roomIndex ? null : room.roomIndex
                            )
                          }
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--dark-text)] hover:bg-[var(--muted)] transition"
                          aria-label="Cancellation policy details"
                        >
                          <InfoIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {showCancellationDetails && room.cancelPolicyInfos.length > 0 && (
                      <div className="rounded-lg bg-white border border-[var(--sky-blue)] p-2.5 text-xs text-[var(--dark-text)] space-y-1">
                        {room.cancelPolicyInfos.map((info, idx) => (
                          <p key={idx}>
                            {info.cancelTime != null
                              ? `Cancel by ${info.cancelTime} for full refund`
                              : "See property policy for details"}
                          </p>
                        ))}
                      </div>
                    )}
                    {payNow && nights > 0 && roomCount > 0 && (
                      <p className="text-sm text-[var(--muted-foreground)] pt-0.5">
                        {payNow.currency}{" "}
                        {(payNow.amount / (nights * roomCount)).toFixed(2)} average per room/night
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Phase 6: Price summary — design system colours and tooltips */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 space-y-3 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--dark-text)]">
              Price summary
            </h2>
            {payNow && total && (
              <>
                <div className="flex justify-between items-baseline text-[var(--muted-foreground)] text-sm">
                  <span>
                    {occupancies.length} {occupancies.length === 1 ? "room" : "rooms"} × {nights}{" "}
                    {nights === 1 ? "night" : "nights"}
                  </span>
                  <span className="text-base font-medium text-[var(--dark-text)]">
                    {payNow.currency} {(baseAmount != null ? baseAmount : payNow.amount).toFixed(2)}
                  </span>
                </div>
                {(includedTaxesAndFeesTotal != null || taxes?.included) && (
                  <div className="flex justify-between items-center gap-2 text-[var(--muted-foreground)] text-sm">
                    <span className="flex items-center gap-1.5">
                      Included taxes and fees
                      <button
                        type="button"
                        onClick={() =>
                          setPriceSummaryTooltip((t) => (t === "taxes" ? null : "taxes"))
                        }
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--dark-text)] hover:bg-[var(--muted)] transition"
                        aria-label="What are included taxes and fees?"
                      >
                        <InfoIcon className="w-3.5 h-3.5" />
                      </button>
                    </span>
                    <span className="text-base font-medium text-[var(--dark-text)]">
                      {includedTaxesAndFeesTotal != null
                        ? `${payNow.currency} ${includedTaxesAndFeesTotal.toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                )}
                {priceSummaryTooltip === "taxes" && (
                  <div className="text-xs text-[var(--muted-foreground)] bg-[var(--light-bg)] border border-[var(--sky-blue)] rounded-lg px-3 py-2">
                    <p className="mb-2">This charge covers:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Taxes paid by the hotel/car company or the booking service to tax authorities (sales tax, occupancy tax, VAT, etc.)</li>
                      <li>Additional fees like resort fees, cleaning fees, and other charges</li>
                      <li>Service fees retained by the booking site, hotel supplier, and/or intermediaries as compensation</li>
                    </ul>
                    <p className="mt-2">The exact breakdown varies by location, booking amount, and how you booked. Check the terms and conditions for specifics.</p>
                  </div>
                )}
                {localFeesTotal != null && localFeesTotal > 0 && (
                  <>
                    <div className="flex justify-between items-center gap-2 text-[var(--muted-foreground)] text-sm">
                      <span className="flex items-center gap-1.5">
                        Local fees
                        <button
                          type="button"
                          onClick={() =>
                            setPriceSummaryTooltip((t) => (t === "local" ? null : "local"))
                          }
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--dark-text)] hover:bg-[var(--muted)] transition"
                          aria-label="What are local fees?"
                        >
                          <InfoIcon className="w-3.5 h-3.5" />
                        </button>
                      </span>
                      <span className="text-base font-medium text-[var(--dark-text)]">
                        {payNow.currency} {localFeesTotal.toFixed(2)}
                      </span>
                    </div>
                    {priceSummaryTooltip === "local" && (
                      <p className="text-xs text-[var(--muted-foreground)] bg-[var(--light-bg)] border border-[var(--sky-blue)] rounded-lg px-3 py-2">
                        Fees paid at the property (e.g. resort fee, city tax). Amount may vary with exchange rate.
                      </p>
                    )}
                  </>
                )}
                {appliedPromo && discountAmount > 0 && totalBeforePromo && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-[var(--primary)] font-medium">Discount ({appliedPromo.code})</span>
                    <span className="text-[var(--primary)] font-medium">
                      -{totalBeforePromo.currency} {discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-3 border-t border-[var(--sky-blue)]">
                  <span className="font-semibold text-[var(--dark-text)]">Total</span>
                  <span className="flex items-baseline gap-2">
                    {appliedPromo && discountAmount > 0 && totalBeforePromo && (
                      <span className="text-sm font-normal text-[var(--muted-foreground)] line-through">
                        {totalBeforePromo.currency} {totalBeforePromo.amount.toFixed(2)}
                      </span>
                    )}
                    <span className="text-lg font-bold text-[var(--dark-text)]">
                      {total.currency} {total.amount.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
                    <span aria-hidden>💵</span>
                    Pay now
                  </span>
                  <span className="text-lg font-bold text-[var(--primary)]">
                    {payNow.currency} {payNow.amount.toFixed(2)}
                  </span>
                </div>
                {localFeesTotal != null && localFeesTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm text-[var(--muted-foreground)] flex items-center gap-1">
                        <span aria-hidden>🏨</span>
                        Pay at property
                      </span>
                      <span className="text-base font-medium text-[var(--muted-foreground)]">
                        {payNow.currency} {localFeesTotal.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)] pt-1">
                      Pay at property amount is an approximate price based on the current exchange rate and may change before your stay.
                    </p>
                  </>
                )}
              </>
            )}
          </section>

          {/* Who is this booking for? — design system buttons */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--dark-text)]">
              Who is this booking for?
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBookingFor("myself")}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  bookingFor === "myself"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--sky-blue)] bg-white text-[var(--dark-text)] hover:bg-[var(--light-bg)]"
                }`}
              >
                Myself
              </button>
              <button
                type="button"
                onClick={() => setBookingFor("someone_else")}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  bookingFor === "someone_else"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--sky-blue)] bg-white text-[var(--dark-text)] hover:bg-[var(--light-bg)]"
                }`}
              >
                Someone else
              </button>
            </div>
          </section>

          {/* Promo code — design system card and inputs */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setPromoExpanded((e) => !e)}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--light-bg)] transition"
            >
              <span className="text-sm font-medium text-[var(--dark-text)]">
                Have a promo code?
              </span>
              {promoExpanded ? (
                <ChevronUpIcon className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
              )}
            </button>
            {promoExpanded && (
              <div className="px-4 pb-4 pt-0 space-y-3 border-t border-[var(--sky-blue)]">
                {appliedPromo ? (
                  <div className="flex items-center justify-between gap-2 pt-3">
                    <p className="text-sm text-[var(--primary)] font-medium">
                      {appliedPromo.message} ({appliedPromo.code})
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedPromo(null);
                        setPromoError(null);
                        if (typeof window !== "undefined" && offerId) {
                          try {
                            window.sessionStorage.removeItem(`${PROMO_STORAGE_KEY_PREFIX}${offerId}`);
                          } catch {}
                        }
                      }}
                      className="text-xs text-[var(--muted-foreground)] hover:text-[var(--dark-text)] underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value);
                          setPromoError(null);
                        }}
                        placeholder="Enter promo code"
                        className="flex-1 rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-sm text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                      <button
                        type="button"
                        disabled={!promoInput.trim() || promoLoading}
                        onClick={async () => {
                          const code = promoInput.trim();
                          if (!code) return;
                          setPromoLoading(true);
                          setPromoError(null);
                          try {
                            const res = await fetch("/api/promo/validate", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ code, offerId }),
                            });
                            const json = await res.json();
                            if (json.valid && (json.type === "percent" || json.type === "fixed")) {
                              setAppliedPromo({
                                code: code.toUpperCase(),
                                type: json.type,
                                value: json.value ?? 0,
                                currency: json.currency,
                                message: json.message ?? "Promo code applied!",
                              });
                              setPromoInput("");
                              if (typeof window !== "undefined" && offerId) {
                                try {
                                  window.sessionStorage.setItem(
                                    `${PROMO_STORAGE_KEY_PREFIX}${offerId}`,
                                    JSON.stringify({
                                      code: code.toUpperCase(),
                                      type: json.type,
                                      value: json.value,
                                      currency: json.currency,
                                      message: json.message ?? "Promo code applied!",
                                    })
                                  );
                                } catch {}
                              }
                            } else {
                              setPromoError(json?.message ?? "Invalid or expired code");
                            }
                          } catch {
                            setPromoError("Could not validate code. Try again.");
                          } finally {
                            setPromoLoading(false);
                          }
                        }}
                        className="rounded-xl bg-[var(--primary)] text-white text-sm font-medium px-4 py-2 hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {promoLoading ? "…" : "Apply"}
                      </button>
                    </div>
                    {promoError && (
                      <p className="text-xs text-red-600">{promoError}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* Special requests — design system */}
          <section className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setSpecialRequestsExpanded((e) => !e)}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--light-bg)] transition"
            >
              <div className="min-w-0 flex-1 text-left">
                <span className="text-sm font-medium text-[var(--dark-text)] block">
                  Special requests (optional)
                </span>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Not guaranteed, but the property will do its best.
                </p>
              </div>
              {specialRequestsExpanded ? (
                <ChevronUpIcon className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
              )}
            </button>
            {specialRequestsExpanded && (
              <div className="px-4 pb-4 pt-0 border-t border-[var(--sky-blue)]">
                <textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value.slice(0, 500))}
                  placeholder="E.g., early check-in, high floor, adjacent rooms…"
                  rows={4}
                  className="w-full mt-3 rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-sm text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y min-h-[80px]"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1.5 text-right">
                  {specialRequests.length}/500
                </p>
              </div>
            )}
          </section>

          {/* Phase 3: Guest details per room — design system */}
          <section
            ref={guestSectionRef}
            className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 space-y-3 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-[var(--dark-text)]">
              Guest details
              {roomCount > 1 ? ` (${roomCount} rooms)` : ""}
            </h2>

            {roomCount > 1 ? (
              <div className="flex gap-1 p-0.5 rounded-xl bg-[var(--light-bg)] border border-[var(--sky-blue)]">
                {guestsPerRoom.slice(0, roomCount).map((_, i) => {
                  const roomComplete =
                    !!guestsPerRoom[i]?.firstName?.trim() &&
                    !!guestsPerRoom[i]?.lastName?.trim() &&
                    !!guestsPerRoom[i]?.email?.trim();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveRoomTab(i)}
                      className={`flex-1 min-w-0 rounded-lg px-2 py-2 text-xs font-medium transition flex items-center justify-center gap-1 ${
                        activeRoomTab === i
                          ? "bg-white border border-[var(--sky-blue)] text-[var(--dark-text)] shadow-sm"
                          : "text-[var(--muted-foreground)] hover:text-[var(--dark-text)]"
                      }`}
                    >
                      Room {i + 1}
                      {roomComplete && (
                        <span className="text-[var(--primary)]" aria-hidden>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <form className="space-y-3" onSubmit={handleGuestSubmit}>
              {roomCount > 1 ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Primary guest – Room {activeRoomTab + 1}
                </p>
              ) : null}
              {guestsPerRoom[activeRoomTab] != null && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[var(--dark-text)]">
                        First name
                      </label>
                      <input
                        type="text"
                        value={guestsPerRoom[activeRoomTab].firstName}
                        onChange={(e) =>
                          setGuestForRoom(activeRoomTab, (g) => ({
                            ...g,
                            firstName: e.target.value
                          }))
                        }
                        className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[var(--dark-text)]">
                        Last name
                      </label>
                      <input
                        type="text"
                        value={guestsPerRoom[activeRoomTab].lastName}
                        onChange={(e) =>
                          setGuestForRoom(activeRoomTab, (g) => ({
                            ...g,
                            lastName: e.target.value
                          }))
                        }
                        className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--dark-text)]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={guestsPerRoom[activeRoomTab].email}
                      onChange={(e) =>
                        setGuestForRoom(activeRoomTab, (g) => ({
                          ...g,
                          email: e.target.value
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--dark-text)]">
                      Phone <span className="text-[var(--muted-foreground)]">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={guestsPerRoom[activeRoomTab].phone ?? ""}
                      onChange={(e) =>
                        setGuestForRoom(activeRoomTab, (g) => ({
                          ...g,
                          phone: e.target.value
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-sm text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                </>
              )}
              {guestTouched && guestsPerRoom[activeRoomTab] && !isValidEmail(guestsPerRoom[activeRoomTab].email) && guestsPerRoom[activeRoomTab].email?.trim() && (
                <p className="text-[11px] text-red-600">
                  Please enter a valid email address.
                </p>
              )}
              {guestTouched && !guestValid && (
                <p className="text-[11px] text-red-600">
                  Please fill in primary guest details for all rooms before continuing.
                </p>
              )}

              {/* Phase 11.1: Continue to payment only when guest valid; payment SDK readiness shown in payment section */}
              <button
                type="submit"
                className="w-full mt-1 rounded-full bg-[var(--primary)] text-white text-sm font-semibold py-2.5 shadow-md active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--primary-hover)]"
                disabled={!prebook || !guestValid}
              >
                Continue to payment
              </button>
            </form>
          </section>

          {/* Payment section — design system */}
          <section
            ref={paymentSectionRef}
            className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 space-y-2 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-[var(--dark-text)]">
              Payment
            </h2>
              {/* Phase 2: Loading state while SDK initializes */}
              {!paymentScriptReady && (
                <div className="mt-1 rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] p-4 text-center">
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-[var(--muted)] rounded w-3/4 mx-auto"></div>
                    <div className="h-3 bg-[var(--muted)] rounded w-1/2 mx-auto"></div>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">
                    Loading secure payment form…
                  </p>
                </div>
              )}
              {/* SDK injects card fields + a pay button; we hide the pay button and use our "Confirm booking" CTA */}
              <div
                id={paymentElementId}
                ref={(el) => {
                  (paymentContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  setPaymentContainerReady(!!el);
                }}
                className={`checkout-payment-element mt-1 space-y-2 min-h-[120px] ${!paymentScriptReady ? "hidden" : ""}`}
              />
              {/* Phase 11.3: Payment init failure — user-friendly message and retry */}
              {paymentError && (
                <div className="rounded-lg bg-red-50 border border-red-500/40 px-3 py-3 text-xs text-red-700 space-y-2">
                  <p>{paymentError}</p>
                  <p className="text-[11px] text-red-600">
                    Refresh the page to try again, or contact support if the problem continues.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError(null);
                      paymentHandledForPrebookRef.current = null;
                      setPaymentRetryKey((k) => k + 1);
                    }}
                    className="rounded-full bg-[var(--primary)] text-white text-sm font-semibold px-4 py-2 hover:bg-[var(--primary-hover)] transition"
                  >
                    Try again
                  </button>
                </div>
              )}
            </section>

          {/* Phase 11.1: Confirm booking — disabled until guest valid and payment SDK ready */}
          <div className="pt-2 pb-6 px-1">
            {!paymentScriptReady && !paymentError && prebook && (
              <p className="text-xs text-[var(--muted-foreground)] mb-2 text-center">
                Loading payment form…
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                if (!guestValid) {
                  setGuestTouched(true);
                  const firstInvalid = guestsPerRoom.findIndex(
                    (g) =>
                      !g.firstName?.trim() ||
                      !g.lastName?.trim() ||
                      !g.email?.trim() ||
                      !isValidEmail(g.email)
                  );
                  if (firstInvalid >= 0) setActiveRoomTab(firstInvalid);
                  guestSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                } else {
                  paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              disabled={!prebook || !guestValid || !paymentScriptReady || !!paymentError}
              className="w-full rounded-full py-3.5 px-6 text-base font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] shadow-md transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm booking
            </button>
          </div>
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
