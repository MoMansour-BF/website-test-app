import { NextRequest, NextResponse } from "next/server";
import { getHotelRatesForHotel } from "@/lib/liteapi";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { hotelId, checkin, checkout, adults, currency, guestNationality } = body;

  if (!hotelId || !checkin || !checkout || !adults) {
    return NextResponse.json(
      {
        error: {
          message: "hotelId, checkin, checkout and adults are required"
        }
      },
      { status: 400 }
    );
  }

  try {
    const resp = await getHotelRatesForHotel({
      hotelId,
      checkin,
      checkout,
      adults,
      currency,
      guestNationality
    });
    return NextResponse.json(resp);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to fetch hotel rates" } },
      { status: 500 }
    );
  }
}

