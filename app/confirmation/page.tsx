"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
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

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const prebookId = searchParams.get("prebookId") ?? "";
  const transactionId = searchParams.get("transactionId") ?? "";
  const hotelId = searchParams.get("hotelId") ?? "";
  const checkin = searchParams.get("checkin") ?? "";
  const checkout = searchParams.get("checkout") ?? "";
  const adults = Number(searchParams.get("adults") ?? "2");

  const [guest, setGuest] = useState<GuestDetails | null>(null);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load guest details from storage
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

  // Call book endpoint once guest details are available
  useEffect(() => {
    if (!guest) return;
    if (!prebookId || !transactionId) {
      setError("Missing payment information. Please try booking again.");
      setLoading(false);
      return;
    }

    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/rates/book", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prebookId,
            holder: guest,
            payment: {
              method: "TRANSACTION_ID",
              transactionId
            },
            guests: [
              {
                occupancyNumber: 1,
                firstName: guest.firstName,
                lastName: guest.lastName,
                email: guest.email
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
  }, [guest, prebookId, transactionId]);

  const policy = booking?.data?.cancellationPolicies;
  const cancelInfo = policy?.cancelPolicyInfos?.[0]?.cancelTime;

  const hotelLinkParams = new URLSearchParams({
    checkin,
    checkout,
    adults: String(adults)
  }).toString();

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
                  ? `/hotel/${hotelId}?${hotelLinkParams}`
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

