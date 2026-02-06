import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getMarginForRequest } from "@/lib/margin-resolver";
import { getHotelDetails, RatesSearchParams, searchHotelRates } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: Partial<RatesSearchParams & { currency?: string; guestNationality?: string; language?: string; adults?: number }> = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { mode, placeId, aiSearch, checkin, checkout, occupancies: rawOccupancies, adults: legacyAdults, currency, guestNationality, language } = body;

  if (!mode || !checkin || !checkout) {
    return NextResponse.json(
      { error: { message: "mode, checkin and checkout are required" } },
      { status: 400 }
    );
  }

  // Support occupancies array or legacy single "adults"
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
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const marginResult = getMarginForRequest(req, channel);
    const marginValue = marginResult.margin ?? null;
    const additionalMarkupValue = marginResult.additionalMarkup ?? null;

    const baseParams = {
      mode,
      placeId,
      aiSearch,
      checkin,
      checkout,
      occupancies,
      currency,
      guestNationality,
      language,
      limit: 1000,
      timeout: 15,
      maxRatesPerHotel: 1,
      ...(marginValue != null && { margin: marginValue }),
      ...(additionalMarkupValue != null && { additionalMarkup: additionalMarkupValue })
    };

    // Parallel: main results (cheapest rate per hotel) + refundable-only (LiteAPI: refundableRatesOnly=true)
    const [resp, refundableResp] = await Promise.all([
      searchHotelRates(baseParams, apiKey),
      searchHotelRates({ ...baseParams, refundableRatesOnly: true }, apiKey)
    ]);

    // Debug headers: verify channel and margin (inspect in DevTools → Network → response headers)
    const resHeaders = new Headers();
    resHeaders.set("X-Rate-Channel", channel);
    if (marginValue != null) resHeaders.set("X-Rate-Margin", String(marginValue));
    else resHeaders.set("X-Rate-Margin", "none");
    if (additionalMarkupValue != null) resHeaders.set("X-Rate-AdditionalMarkup", String(additionalMarkupValue));

    // Hotels in refundable-only response have at least one refundable rate (refundableRatesOnly parameter)
    const hasRefundableRateByHotelId: Record<string, boolean> = {};
    if (Array.isArray(refundableResp.data)) {
      for (const item of refundableResp.data as any[]) {
        if (item?.hotelId) hasRefundableRateByHotelId[item.hotelId] = true;
      }
    }

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
        const firstRoomType = roomTypes[0];
        const firstRate = firstRoomType?.rates?.[0];
        const offerTotal = firstRoomType?.offerRetailRate ?? firstRoomType?.suggestedSellingPrice ?? firstRate?.retailRate?.total?.[0];
        if (hotelId && offerTotal?.amount != null) {
          const amount = typeof offerTotal.amount === "number" ? offerTotal.amount : (offerTotal as any).amount;
          const currency = (offerTotal as any).currency ?? firstRate?.retailRate?.total?.[0]?.currency ?? "USD";
          const includedTax = firstRate?.retailRate?.taxesAndFees?.[0]?.included ?? false;
          pricesByHotelId[hotelId] = {
            amount,
            currency,
            refundableTag: firstRate?.cancellationPolicies?.refundableTag,
            taxIncluded: includedTax
          };
        }
      }
    }

    // Enrich with hotel details (rating, reviewCount) for list cards
    const hotelDetailsByHotelId: Record<string, { reviewCount?: number; rating?: number }> = {};

    // 1) Use any rating/reviewCount from the rates response hotel object (when API includes it)
    if (Array.isArray(resp.data)) {
      for (const item of resp.data as any[]) {
        const id = item?.hotelId;
        const h = item?.hotel;
        if (!id || !h) continue;
        const reviewCount =
          h.reviewCount ?? h.review_count ?? h.reviewsCount ?? h.numberOfReviews;
        const rating = h.rating;
        if (reviewCount != null || rating != null) {
          if (!hotelDetailsByHotelId[id]) hotelDetailsByHotelId[id] = {};
          if (reviewCount != null) hotelDetailsByHotelId[id].reviewCount = Number(reviewCount);
          if (rating != null) hotelDetailsByHotelId[id].rating = Number(rating);
        }
      }
    }

    // 2) Overlay with details API (fills gaps and overwrites with fresher data when available)
    const hotelIds = Array.isArray(resp.data)
      ? [...new Set((resp.data as any[]).map((d: any) => d.hotelId).filter(Boolean))].slice(0, 40)
      : [];
    if (hotelIds.length > 0) {
      const detailsResults = await Promise.allSettled(
        hotelIds.map((id) => getHotelDetails(id, language, apiKey))
      );
      detailsResults.forEach((result, i) => {
        const id = hotelIds[i];
        if (!id || result.status !== "fulfilled") return;
        // API may return { data: hotel } or hotel at top level
        const data = result.value?.data ?? result.value;
        if (!data || typeof data !== "object") return;
        const reviewCount =
          data.reviewCount ?? data.review_count ?? data.reviewsCount ?? data.numberOfReviews;
        const rating = data.rating;
        if (reviewCount != null || rating != null) {
          if (!hotelDetailsByHotelId[id]) hotelDetailsByHotelId[id] = {};
          if (reviewCount != null) hotelDetailsByHotelId[id].reviewCount = Number(reviewCount);
          if (rating != null) hotelDetailsByHotelId[id].rating = Number(rating);
        }
      });
    }

    // Phase 4: expose promo config so client can show was/now (real or configured discount)
    const promoConfig = {
      isCug: channel === "cug",
      displayDiscountPercent: marginResult.displayDiscountPercent ?? undefined
    };

    return NextResponse.json(
      {
        mode,
        raw: resp,
        pricesByHotelId,
        hasRefundableRateByHotelId,
        hotelDetailsByHotelId,
        promoConfig
      },
      { headers: resHeaders }
    );
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

