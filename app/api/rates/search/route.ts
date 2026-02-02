import { NextRequest, NextResponse } from "next/server";
import { RatesSearchParams, searchHotelRates } from "@/lib/liteapi";

export async function POST(req: NextRequest) {
  let body: Partial<RatesSearchParams & { currency?: string; guestNationality?: string }> = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { mode, placeId, aiSearch, checkin, checkout, adults, currency, guestNationality } = body;

  if (!mode || !checkin || !checkout || !adults) {
    return NextResponse.json(
      { error: { message: "mode, checkin, checkout and adults are required" } },
      { status: 400 }
    );
  }

  if (mode === "place" && !placeId) {
    return NextResponse.json(
      { error: { message: "placeId is required for place mode" } },
      { status: 400 }
    );
  }

  if (mode === "vibe" && !aiSearch) {
    return NextResponse.json(
      { error: { message: "aiSearch is required for vibe mode" } },
      { status: 400 }
    );
  }

  try {
    const resp = await searchHotelRates({
      mode,
      placeId,
      aiSearch,
      checkin,
      checkout,
      adults,
      currency,
      guestNationality
    });

    // Build a simple price lookup by hotelId for UI convenience
    const pricesByHotelId: Record<
      string,
      {
        amount: number;
        currency: string;
        refundableTag?: string;
        taxIncluded?: boolean;
      }
    > = {};

    if (Array.isArray(resp.data)) {
      for (const item of resp.data) {
        const hotelId = item.hotelId;
        const roomTypes = item.roomTypes ?? [];
        const firstRoom = roomTypes[0];
        const firstRate = firstRoom?.rates?.[0];
        if (hotelId && firstRate?.retailRate?.total?.[0]) {
          const total = firstRate.retailRate.total[0];
          const includedTax = firstRate.retailRate.taxesAndFees?.[0]?.included ?? false;
          pricesByHotelId[hotelId] = {
            amount: total.amount,
            currency: total.currency,
            refundableTag: firstRate.cancellationPolicies?.refundableTag,
            taxIncluded: includedTax
          };
        }
      }
    }

    return NextResponse.json({
      mode,
      raw: resp,
      pricesByHotelId
    });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message =
      err?.message ??
      (status === 401
        ? "LiteAPI rejected this request as unauthorized."
        : "Failed to fetch rates");
    return NextResponse.json(
      { error: { message } },
      { status }
    );
  }
}

