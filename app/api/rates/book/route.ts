import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { bookRate } from "@/lib/liteapi";
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

  if (!body?.prebookId || !body?.payment?.transactionId || !body?.holder) {
    return NextResponse.json(
      {
        error: {
          message:
            "prebookId, holder and payment.transactionId are required for booking"
        }
      },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const resp = await bookRate(body, apiKey);
    return NextResponse.json(resp);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to book rate" } },
      { status: 500 }
    );
  }
}

