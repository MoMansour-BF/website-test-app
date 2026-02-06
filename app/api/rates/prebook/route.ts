import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { prebookRate } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

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

  const { offerId, usePaymentSdk } = body;

  if (!offerId) {
    return NextResponse.json(
      { error: { message: "offerId is required" } },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const resp = await prebookRate(
      {
        offerId,
        usePaymentSdk: usePaymentSdk ?? true
      },
      apiKey
    );
    return NextResponse.json(resp);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to prebook rate" } },
      { status: 500 }
    );
  }
}

