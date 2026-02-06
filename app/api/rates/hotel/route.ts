import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getMarginForRequest } from "@/lib/margin-resolver";
import { getHotelRatesForHotel } from "@/lib/liteapi";
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

  const { hotelId, checkin, checkout, occupancies: rawOccupancies, adults: legacyAdults, currency, guestNationality, language } = body;

  if (!hotelId || !checkin || !checkout) {
    return NextResponse.json(
      {
        error: {
          message: "hotelId, checkin and checkout are required"
        }
      },
      { status: 400 }
    );
  }

  const occupancies = Array.isArray(rawOccupancies) && rawOccupancies.length > 0
    ? rawOccupancies
        .filter((o: any) => o && typeof o.adults === "number" && o.adults >= 1)
        .map((o: any) => ({
          adults: o.adults,
          children: Array.isArray(o.children) ? o.children.filter((a: any) => typeof a === "number") : []
        }))
    : [{ adults: typeof legacyAdults === "number" && legacyAdults >= 1 ? legacyAdults : 2, children: [] }];

  if (occupancies.length === 0) {
    return NextResponse.json(
      { error: { message: "At least one room with at least 1 adult is required" } },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const marginResult = getMarginForRequest(req, channel);
    const marginValue = marginResult.margin ?? null;
    const additionalMarkupValue = marginResult.additionalMarkup ?? null;

    const resp = await getHotelRatesForHotel(
      {
        hotelId,
        checkin,
        checkout,
        occupancies,
        currency,
        guestNationality,
        language,
        ...(marginValue != null && { margin: marginValue }),
        ...(additionalMarkupValue != null && { additionalMarkup: additionalMarkupValue })
      },
      apiKey
    );

    // Debug headers: verify channel and margin (inspect in DevTools → Network → response headers)
    const resHeaders = new Headers();
    resHeaders.set("X-Rate-Channel", channel);
    if (marginValue != null) resHeaders.set("X-Rate-Margin", String(marginValue));
    else resHeaders.set("X-Rate-Margin", "none");
    if (additionalMarkupValue != null) resHeaders.set("X-Rate-AdditionalMarkup", String(additionalMarkupValue));

    // Phase 4: expose promo config so client can show was/now (real or configured discount)
    const promoConfig = {
      isCug: channel === "cug",
      displayDiscountPercent: marginResult.displayDiscountPercent ?? undefined
    };

    return NextResponse.json(
      { ...resp, promoConfig },
      { headers: resHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err.message ?? "Failed to fetch hotel rates" } },
      { status: 500 }
    );
  }
}

