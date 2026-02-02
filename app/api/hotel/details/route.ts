import { NextRequest, NextResponse } from "next/server";
import { getHotelDetails } from "@/lib/liteapi";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hotelId = searchParams.get("hotelId");

  if (!hotelId) {
    return NextResponse.json(
      { error: { message: "hotelId is required" } },
      { status: 400 }
    );
  }

  try {
    const resp = await getHotelDetails(hotelId);
    return NextResponse.json(resp);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to fetch hotel details" } },
      { status: 500 }
    );
  }
}

