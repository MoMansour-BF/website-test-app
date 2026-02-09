"use client";

import { parseOccupanciesParam, totalGuests } from "@/lib/occupancy";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

const GUEST_STORAGE_VERSION = 2;
interface StoredGuestPayload {
  version: number;
  guests: GuestDetails[];
}

interface BookingResponse {
  data: {
    bookingId: string;
    status: string;
    hotelConfirmationCode?: string;
    checkin: string;
    checkout: string;
    hotel: {
      hotelId: string;
      name: string;
    };
    price: number;
    currency: string;
    cancellationPolicies?: {
      refundableTag?: string;
      cancelPolicyInfos?: { cancelTime?: string }[];
    };
  };
}

const GUEST_STORAGE_KEY = "liteapi_guest_details";

function ConfirmationLoading() {
  return (
    <div className="flex-1 flex flex-col px-4 pb-6 pt-6 gap-4">
      <div className="space-y-1">
        <div className="h-6 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="h-4 w-64 bg-slate-800 rounded animate-pulse" />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300 animate-pulse">
        We are confirming your reservation with the hotel. This can
        take up to 10 seconds…
      </div>
    </div>
  );
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const prebookId = searchParams.get("prebookId") ?? "";
  const transactionId = searchParams.get("transactionId") ?? "";
  const hotelId = searchParams.get("hotelId") ?? "";
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const occupanciesParam = searchParams.get("occupancies");
  const occupancies = useMemo(
    () => parseOccupanciesParam(occupanciesParam),
    [occupanciesParam]
  );
  const guestsCount = totalGuests(occupancies);

  const [guestsForBook, setGuestsForBook] = useState<GuestDetails[] | null>(null);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load guest details from storage (Phase 3: per-room or legacy single)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(GUEST_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const roomCount = Math.max(1, occupancies.length);
      if (parsed?.version === GUEST_STORAGE_VERSION && Array.isArray(parsed?.guests)) {
        const guests = (parsed as StoredGuestPayload).guests;
        if (guests.length >= roomCount) {
          setGuestsForBook(guests.slice(0, roomCount));
        } else if (guests.length > 0) {
          const filled = guests.slice(0, roomCount);
          while (filled.length < roomCount) {
            filled.push(filled[0]);
          }
          setGuestsForBook(filled);
        }
      } else if (parsed?.firstName != null || parsed?.email != null) {
        const single = parsed as GuestDetails;
        setGuestsForBook(
          Array.from({ length: roomCount }, () => ({
            firstName: single.firstName ?? "",
            lastName: single.lastName ?? "",
            email: single.email ?? ""
          }))
        );
      }
    } catch {
      // ignore
    }
  }, [occupancies.length]);

  // Call book endpoint once guest details are available
  useEffect(() => {
    if (!guestsForBook || guestsForBook.length === 0) return;
    if (!prebookId || !transactionId) {
      setError("Missing payment information. Please try booking again.");
      setLoading(false);
      return;
    }

    const holder = guestsForBook[0];
    const roomCount = Math.max(1, occupancies.length);
    const guestsPayload = guestsForBook.slice(0, roomCount).map((g, i) => ({
      occupancyNumber: i + 1,
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email
    }));

    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/rates/book", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prebookId,
            holder: {
              firstName: holder.firstName,
              lastName: holder.lastName,
              email: holder.email
            },
            payment: {
              method: "TRANSACTION_ID",
              transactionId
            },
            guests:
              guestsPayload.length > 0
                ? guestsPayload
                : [
                    {
                      occupancyNumber: 1,
                      firstName: holder.firstName,
                      lastName: holder.lastName,
                      email: holder.email
                    }
                  ]
          })
        });
        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(
            json?.error?.message ?? "Failed to finalize booking"
          );
        }
        setBooking(json as BookingResponse);
      } catch (err: any) {
        setError(err.message ?? "Failed to finalize booking");
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [guestsForBook, prebookId, transactionId, occupancies.length]);

  const policy = booking?.data?.cancellationPolicies;
  const cancelInfo = policy?.cancelPolicyInfos?.[0]?.cancelTime;

  const hotelLinkParams = new URLSearchParams({ checkin, checkout });
  if (occupanciesParam) hotelLinkParams.set("occupancies", occupanciesParam);
  const hotelLinkParamsStr = hotelLinkParams.toString();

  return (
    <main className="flex-1 flex flex-col px-4 pb-6 pt-6 gap-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {booking ? "Booking confirmed" : "Finalizing your booking"}
        </h1>
        <p className="text-[11px] text-slate-400">
          Thank you for booking with LiteAPI Demo Travel.
        </p>
      </header>

      {loading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300 animate-pulse">
          We are confirming your reservation with the hotel. This can
          take up to 10 seconds…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && booking && (
        <>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] text-slate-400">
                  Confirmation #
                </p>
                <p className="text-sm font-semibold">
                  {booking.data.bookingId}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40">
                {booking.data.status}
              </span>
            </div>

            {booking.data.hotelConfirmationCode && (
              <p className="text-[11px] text-slate-400">
                Hotel reference:{" "}
                <span className="font-mono">
                  {booking.data.hotelConfirmationCode}
                </span>
              </p>
            )}

            <div className="mt-2 text-[11px] text-slate-400">
              <p>
                Check-in:{" "}
                <span className="text-slate-100">
                  {booking.data.checkin}
                </span>
              </p>
              <p>
                Check-out:{" "}
                <span className="text-slate-100">
                  {booking.data.checkout}
                </span>
              </p>
            </div>

            <div className="mt-2 text-[11px] text-slate-400">
              <p>
                Hotel:{" "}
                <span className="text-slate-100">
                  {booking.data.hotel.name}
                </span>
              </p>
            </div>

            <div className="mt-2 text-[11px] text-slate-400">
              <p>
                Total paid:{" "}
                <span className="text-slate-100 font-semibold">
                  {booking.data.currency} {booking.data.price}
                </span>
              </p>
            </div>

            {policy && (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-[11px]">
                <p className="font-semibold text-slate-100 mb-1">
                  Cancellation policy
                </p>
                <p className="text-slate-300">
                  {policy.refundableTag === "NRF" ||
                    policy.refundableTag === "NRFN"
                    ? "This booking is non-refundable."
                    : cancelInfo
                      ? `Free cancellation until ${cancelInfo}.`
                      : "See your confirmation email for full cancellation terms."}
                </p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <Link
              href={
                hotelId
                  ? `/hotel/${hotelId}?${hotelLinkParamsStr}`
                  : "/"
              }
              className="block w-full rounded-full bg-slate-100 text-slate-900 text-sm font-semibold py-2.5 text-center"
            >
              View hotel details
            </Link>
            <Link
              href="/"
              className="block w-full rounded-full border border-slate-600 text-slate-100 text-sm font-semibold py-2.5 text-center"
            >
              Make another booking
            </Link>
          </section>
        </>
      )}
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationLoading />}>
      <ConfirmationContent />
    </Suspense>
  );
}
