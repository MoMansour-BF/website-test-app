import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getPlaces } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || searchParams.get("textQuery") || "";
  const language = searchParams.get("language") ?? undefined;

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const resp = await getPlaces(q.trim(), language, apiKey);
    return NextResponse.json(resp);
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message =
      err?.message ??
      (status === 401
        ? "LiteAPI rejected this request as unauthorized."
        : "Failed to fetch places");
    return NextResponse.json(
      { error: { message } },
      { status }
    );
  }
}

