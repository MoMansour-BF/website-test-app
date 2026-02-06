import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getHotelDetails } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hotelId = searchParams.get("hotelId");
  const language = searchParams.get("language") ?? undefined;

  if (!hotelId) {
    return NextResponse.json(
      { error: { message: "hotelId is required" } },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const resp = await getHotelDetails(hotelId, language, apiKey);
    return NextResponse.json(resp);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to fetch hotel details" } },
      { status: 500 }
    );
  }
}

