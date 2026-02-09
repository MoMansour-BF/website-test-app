/**
 * Non-streaming search implementation — ACTIVE.
 *
 * This is the implementation used for POST /api/rates/search. route.ts delegates
 * here. Streaming (Phase 5) was deprecated; see docs/deprecated/STREAM_SEARCH_README.md
 * and app/api/rates/search/_deprecated/route.stream.ts.
 *
 * Behaviour:
 * - Two parallel LiteAPI rates calls (main + refundable-only), both non-stream.
 * - Build pricesByHotelId, hasRefundableRateByHotelId.
 * - Enrich hotels in Recommended order with getCachedHotelDetails (rating/reviewCount/starRating); all hotels when ENRICH_ALL_HOTELS, else first N.
 * - Phase 7: server-side filters (starRating, minRating, minReviewsCount, facilities) and in-memory cache for full search response.
 *
 * See docs/IMPLEMENTATION_PLAN_SEARCH_SPEED_AND_STREAM.md.
 */

import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getMarginForRequest } from "@/lib/margin-resolver";
import { extractHotelDetailsFromResponse, getCachedHotelDetails, RatesSearchParams, resolveGuestNationality, searchHotelRates } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RATES_TIMEOUT_SECONDS = 5;
/** Phase 7: TTL for search response cache (seconds). Same params → cache hit. */
const RATES_SEARCH_CACHE_TTL_SECONDS = 180;
/** Phase 4: number of hotels to enrich when not enriching all. Same order as client "Recommended" (API order). */
const FIRST_N_HOTELS_TO_ENRICH = 80;
/** When true, enrich all hotels with details (rating, reviewCount, starRating). When false, enrich only first FIRST_N_HOTELS_TO_ENRICH. */
const ENRICH_ALL_HOTELS = true;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 30;

/** Phase 7: in-memory cache for full search response. Key = canonical params string; value = { at, payload }. */
const searchCache = new Map<string, { at: number; payload: unknown; headers: Headers }>();

/** Phase 7: build cache key from all params that affect the result (exclude client-only: refundable, sort, price range, name). */
function ratesSearchCacheKey(params: {
  mode: string;
  placeId?: string;
  aiSearch?: string;
  checkin: string;
  checkout: string;
  occupancies: { adults: number; children?: number[] }[];
  currency?: string;
  language?: string;
  guestNationality: string;
  timeout: number;
  margin: number | null;
  additionalMarkup: number | null;
  starRating: number[] | undefined;
  minRating: number | undefined;
  minReviewsCount: number | undefined;
  facilities: number[] | undefined;
  strictFacilityFiltering: boolean | undefined;
}): string {
  const occ = JSON.stringify(params.occupancies);
  const star = (params.starRating ?? []).slice().sort((a, b) => a - b).join(",");
  const fac = (params.facilities ?? []).slice().sort((a, b) => a - b).join(",");
  return `rates:${params.mode}:${params.placeId ?? ""}:${params.aiSearch ?? ""}:${params.checkin}:${params.checkout}:${occ}:${params.currency ?? ""}:${params.language ?? ""}:${params.guestNationality}:${params.timeout}:${params.margin ?? ""}:${params.additionalMarkup ?? ""}:${star}:${params.minRating ?? ""}:${params.minReviewsCount ?? ""}:${fac}:${params.strictFacilityFiltering ?? false}`;
}

export async function POST(req: NextRequest) {
  let body: Partial<RatesSearchParams & { currency?: string; guestNationality?: string; language?: string; adults?: number; timeout?: number; minReviewsCount?: number; facilities?: number[]; strictFacilityFiltering?: boolean }> = {};

  /** Phase 9: stable error shape { error: { message, code? } } for client to map to friendly copy. */
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request", code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }

  const { mode, placeId, aiSearch, checkin, checkout, occupancies: rawOccupancies, adults: legacyAdults, currency, guestNationality, language, timeout: requestedTimeout, starRating: bodyStarRating, minRating: bodyMinRating, minReviewsCount: bodyMinReviewsCount, facilities: bodyFacilities, strictFacilityFiltering: bodyStrictFacility } = body;

  if (!mode || !checkin || !checkout) {
    return NextResponse.json(
      { error: { message: "Something's missing in your search.", code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }

  // Support occupancies array or legacy single "adults". Child ages must be 0–17 (LiteAPI rejects invalid values).
  const CHILD_AGE_MIN = 0;
  const CHILD_AGE_MAX = 17;
  const occupancies = Array.isArray(rawOccupancies) && rawOccupancies.length > 0
    ? rawOccupancies
        .filter((o: any) => o && typeof o.adults === "number" && o.adults >= 1)
        .map((o: any) => {
          const rawChildren = Array.isArray(o.children) ? o.children : [];
          const children = rawChildren
            .filter((a: any) => typeof a === "number" && !Number.isNaN(a) && a >= CHILD_AGE_MIN && a <= CHILD_AGE_MAX);
          return { adults: o.adults, children };
        })
    : [{ adults: typeof legacyAdults === "number" && legacyAdults >= 1 ? legacyAdults : 2, children: [] }];

  if (occupancies.length === 0) {
    return NextResponse.json(
      { error: { message: "Something's missing in your search.", code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }

  if (mode === "place" && !placeId) {
    return NextResponse.json(
      { error: { message: "Something's missing in your search.", code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }

  if (mode === "vibe" && !aiSearch) {
    return NextResponse.json(
      { error: { message: "Something's missing in your search.", code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const marginResult = getMarginForRequest(req, channel);
    const marginValue = marginResult.margin ?? null;
    const additionalMarkupValue = marginResult.additionalMarkup ?? null;

    const timeoutSeconds =
      typeof requestedTimeout === "number" && !Number.isNaN(requestedTimeout)
        ? Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, Math.round(requestedTimeout)))
        : DEFAULT_RATES_TIMEOUT_SECONDS;

    const guestNationalityResolved = resolveGuestNationality(guestNationality);
    // Phase 6/7: server-side filters (LiteAPI starRating, minRating, minReviewsCount, facilities). Omit for vibe (Type 3) per plan.
    const starRating = Array.isArray(bodyStarRating) && bodyStarRating.length > 0
      ? bodyStarRating.filter((n: unknown) => typeof n === "number" && !Number.isNaN(n))
      : undefined;
    const minRating = typeof bodyMinRating === "number" && !Number.isNaN(bodyMinRating) ? bodyMinRating : undefined;
    const minReviewsCount = typeof bodyMinReviewsCount === "number" && !Number.isNaN(bodyMinReviewsCount) && bodyMinReviewsCount >= 0 ? bodyMinReviewsCount : undefined;
    const facilities = Array.isArray(bodyFacilities) && bodyFacilities.length > 0
      ? bodyFacilities.filter((n: unknown) => typeof n === "number" && !Number.isNaN(n))
      : undefined;
    const strictFacilityFiltering = bodyStrictFacility === true;

    const baseParams = {
      mode,
      placeId,
      aiSearch,
      checkin,
      checkout,
      occupancies,
      currency,
      guestNationality: guestNationalityResolved,
      language,
      limit: 1000,
      timeout: timeoutSeconds,
      maxRatesPerHotel: 1,
      ...(marginValue != null && { margin: marginValue }),
      ...(additionalMarkupValue != null && { additionalMarkup: additionalMarkupValue }),
      ...(starRating != null && starRating.length > 0 && { starRating }),
      ...(minRating != null && { minRating }),
      ...(minReviewsCount != null && { minReviewsCount }),
      ...(facilities != null && facilities.length > 0 && { facilities }),
      ...(strictFacilityFiltering && { strictFacilityFiltering: true as const })
    };

    // Phase 7: check cache before calling LiteAPI (same key = same result)
    const cacheKey = ratesSearchCacheKey({
      mode,
      placeId,
      aiSearch,
      checkin,
      checkout,
      occupancies,
      currency,
      language,
      guestNationality: guestNationalityResolved,
      timeout: timeoutSeconds,
      margin: marginValue ?? null,
      additionalMarkup: additionalMarkupValue ?? null,
      starRating,
      minRating,
      minReviewsCount,
      facilities,
      strictFacilityFiltering: strictFacilityFiltering || undefined
    });
    const now = Date.now();
    const cached = searchCache.get(cacheKey);
    if (cached && (now - cached.at) / 1000 <= RATES_SEARCH_CACHE_TTL_SECONDS) {
      return NextResponse.json(cached.payload, { headers: cached.headers });
    }

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

    // Phase 9: no availability for these dates (hotels returned but no rates)
    const dataArray = Array.isArray(resp.data) ? resp.data : [];
    if (dataArray.length > 0 && Object.keys(pricesByHotelId).length === 0) {
      return NextResponse.json(
        {
          error: {
            message: "We don't have availability for these dates in this area. Try changing your dates or looking at a nearby area.",
            code: "NO_RATES"
          }
        },
        { status: 404 }
      );
    }

    // Enrich with hotel details (rating, reviewCount, starRating) for list cards (Phase 4)
    const hotelDetailsByHotelId: Record<string, { reviewCount?: number; rating?: number; starRating?: number }> = {};

    // 1) Use any rating/reviewCount/starRating from the rates response hotel object (canonical + fallbacks)
    if (Array.isArray(resp.data)) {
      for (const item of resp.data as any[]) {
        const id = item?.hotelId;
        const h = item?.hotel;
        if (!id || !h) continue;
        const extracted = extractHotelDetailsFromResponse(h);
        if (extracted && Object.keys(extracted).length > 0) {
          hotelDetailsByHotelId[id] = { ...hotelDetailsByHotelId[id], ...extracted };
        }
      }
    }

    // 2) Recommended order must match client: client uses raw.hotels first, then raw.data. Use same here so first N = what user sees at top.
    const fromHotels = Array.isArray((resp as any).hotels)
      ? (resp as any).hotels.map((h: any) => h?.id ?? h?.hotelId).filter(Boolean)
      : [];
    const fromData = Array.isArray(resp.data)
      ? (resp.data as any[]).map((d: any) => d.hotelId).filter(Boolean)
      : [];
    const orderedIds = fromHotels.length > 0 ? fromHotels : fromData;
    const uniqueOrderedIds: string[] = [...new Set(orderedIds)].map((x) => String(x));
    const hotelIdsToEnrich = ENRICH_ALL_HOTELS
      ? uniqueOrderedIds
      : uniqueOrderedIds.slice(0, FIRST_N_HOTELS_TO_ENRICH);

    if (hotelIdsToEnrich.length > 0) {
      const detailsResults = await Promise.allSettled(
        hotelIdsToEnrich.map((id) => getCachedHotelDetails(id, language, apiKey))
      );
      detailsResults.forEach((result, i) => {
        const id = hotelIdsToEnrich[i];
        if (!id || result.status !== "fulfilled") return;
        const details = result.value;
        if (details && Object.keys(details).length > 0) {
          if (!hotelDetailsByHotelId[id]) hotelDetailsByHotelId[id] = {};
          if (details.rating != null) hotelDetailsByHotelId[id].rating = details.rating;
          if (details.reviewCount != null) hotelDetailsByHotelId[id].reviewCount = details.reviewCount;
          if (details.starRating != null) hotelDetailsByHotelId[id].starRating = details.starRating;
        }
      });
    }

    // Phase 4: expose promo config so client can show was/now (real or configured discount)
    const promoConfig = {
      isCug: channel === "cug",
      displayDiscountPercent: marginResult.displayDiscountPercent ?? undefined
    };

    const payload = {
      mode,
      raw: resp,
      pricesByHotelId,
      hasRefundableRateByHotelId,
      hotelDetailsByHotelId,
      promoConfig
    };

    // Phase 7: store in cache for subsequent identical requests
    searchCache.set(cacheKey, { at: Date.now(), payload, headers: resHeaders });

    return NextResponse.json(payload, { headers: resHeaders });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const msg = err?.message ?? "";
    const isTimeout =
      status === 408 ||
      status === 504 ||
      /timeout|timed out/i.test(String(msg));
    const is4xx = status >= 400 && status < 500;

    let code: string | undefined;
    let message: string;
    if (isTimeout) {
      code = "TIMEOUT";
      message =
        "The search is taking longer than usual. Try again in a moment, or adjust your dates or destination.";
    } else if (is4xx) {
      code = "INVALID_PARAMS";
      message =
        "Something's missing in your search. Please check destination, dates, and guests and try again.";
    } else {
      code = "SEARCH_FAILED";
      message =
        "We couldn't load results right now. Please check your connection and try again.";
    }

    return NextResponse.json(
      { error: { message, code } },
      { status: isTimeout ? 408 : status }
    );
  }
}
