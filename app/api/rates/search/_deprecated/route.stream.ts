/**
 * DEPRECATED — Streaming search implementation (Phase 5).
 *
 * This file is kept for reference only. The app uses the non-stream search
 * (route.non-stream.backup.ts) via route.ts. To re-enable streaming later:
 * 1. See docs/deprecated/STREAM_SEARCH_README.md
 * 2. Optionally set USE_RATES_STREAM=true and restore the stream branch in route.ts
 *    (by copying the logic from this file), or replace route.ts POST with this handler.
 *
 * Original behaviour: main rates via LiteAPI stream (SSE), refundable in parallel,
 * Type 1/2/3 dispatch, buffer-then-stream UX on client.
 */

import { NextRequest, NextResponse } from "next/server";
import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getMarginForRequest } from "@/lib/margin-resolver";
import {
  fetchHotelRatesStream,
  RatesSearchParams,
  resolveGuestNationality,
  searchHotelRates
} from "@/lib/liteapi";

const DEFAULT_RATES_TIMEOUT_SECONDS = 5;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 30;
const CHILD_AGE_MIN = 0;
const CHILD_AGE_MAX = 17;

const ENABLE_QUALITY_FILTERS_STREAM = false;
const DEFAULT_STAR_RATING = [3, 4, 5];
const DEFAULT_MIN_RATING = 6.5;

function parsePlaceTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((t) => typeof t === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function isSpecificHotelPlace(placeTypes: string[]): boolean {
  return placeTypes.some((t) => t === "hotel" || t === "lodging");
}

export async function POST(req: NextRequest) {
  let body: Partial<
    RatesSearchParams & {
      currency?: string;
      guestNationality?: string;
      language?: string;
      adults?: number;
      timeout?: number;
      placeName?: string;
      placeTypes?: string[] | string;
    }
  > = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const {
    mode,
    placeId,
    aiSearch,
    placeName,
    checkin,
    checkout,
    occupancies: rawOccupancies,
    adults: legacyAdults,
    currency,
    guestNationality,
    language,
    timeout: requestedTimeout
  } = body;

  if (!mode || !checkin || !checkout) {
    return NextResponse.json(
      { error: { message: "mode, checkin and checkout are required" } },
      { status: 400 }
    );
  }

  const occupancies =
    Array.isArray(rawOccupancies) && rawOccupancies.length > 0
      ? rawOccupancies
          .filter((o: any) => o && typeof o.adults === "number" && o.adults >= 1)
          .map((o: any) => {
            const rawChildren = Array.isArray(o.children) ? o.children : [];
            const children = rawChildren.filter(
              (a: any) => typeof a === "number" && !Number.isNaN(a) && a >= CHILD_AGE_MIN && a <= CHILD_AGE_MAX
            );
            return { adults: o.adults, children };
          })
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

  const placeTypes = parsePlaceTypes(body.placeTypes);
  const isType1 = isSpecificHotelPlace(placeTypes) && placeId && placeName && typeof placeName === "string" && placeName.trim() !== "";
  const isType3 = mode === "vibe";

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

    const baseParams: RatesSearchParams = {
      mode,
      placeId,
      aiSearch,
      checkin,
      checkout,
      occupancies,
      currency: currency ?? "USD",
      guestNationality: guestNationalityResolved,
      language,
      limit: 1000,
      timeout: timeoutSeconds,
      maxRatesPerHotel: 1,
      ...(marginValue != null && { margin: marginValue }),
      ...(additionalMarkupValue != null && { additionalMarkup: additionalMarkupValue })
    };

    const refundablePromise = searchHotelRates(
      { ...baseParams, refundableRatesOnly: true },
      apiKey
    ).then((resp) => {
      const hasRefundableRateByHotelId: Record<string, boolean> = {};
      if (Array.isArray(resp?.data)) {
        for (const item of resp.data as any[]) {
          if (item?.hotelId) hasRefundableRateByHotelId[item.hotelId] = true;
        }
      }
      return hasRefundableRateByHotelId;
    }).catch(() => ({} as Record<string, boolean>));

    let specificHotelPromise: Promise<{ data?: any[]; hotels?: any[] } | null> = Promise.resolve(null);
    if (isType1) {
      specificHotelPromise = searchHotelRates(
        { ...baseParams, hotelName: placeName!.trim() },
        apiKey
      ).catch(() => null);
    }

    const streamParams: RatesSearchParams = {
      ...baseParams,
      stream: true
    };
    if (ENABLE_QUALITY_FILTERS_STREAM && !isType3) {
      streamParams.starRating = DEFAULT_STAR_RATING;
      streamParams.minRating = DEFAULT_MIN_RATING;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    let streamResponse: Response;
    try {
      streamResponse = await fetchHotelRatesStream(streamParams, apiKey, signal);
    } catch (e) {
      return NextResponse.json(
        { error: { message: (e as Error)?.message ?? "Stream request failed" } },
        { status: 500 }
      );
    }

    if (!streamResponse.ok) {
      const errText = await streamResponse.text();
      let message = `LiteAPI stream failed with status ${streamResponse.status}`;
      try {
        const j = JSON.parse(errText);
        if (j?.error?.message) message = j.error.message;
      } catch {
        if (errText) message = errText.slice(0, 200);
      }
      return NextResponse.json({ error: { message } }, { status: streamResponse.status });
    }

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: { message: "No response body from LiteAPI stream" } },
        { status: 502 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    function forwardCompleteMessages(ctrl: ReadableStreamDefaultController<Uint8Array>) {
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;
        ctrl.enqueue(encoder.encode(part + "\n\n"));
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        try {
          const { value, done } = await reader.read();
          if (value?.length) {
            buffer += decoder.decode(value, { stream: true });
            forwardCompleteMessages(ctrl);
          }
          if (done) {
            if (buffer.trim()) {
              const trimmed = buffer.trim();
              if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
                ctrl.enqueue(encoder.encode(trimmed + "\n\n"));
              }
            }
            const [refundableMap, specificHotelResp] = await Promise.all([
              refundablePromise,
              specificHotelPromise
            ]);
            if (isType1 && specificHotelResp?.data?.length) {
              const first = specificHotelResp.data[0];
              if (first?.hotelId) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ specificHotel: first })}\n\n`));
              }
            }
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ refundable: refundableMap })}\n\n`));
            ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
            ctrl.close();
          }
        } catch (e) {
          ctrl.error(e);
        }
      },
      cancel() {
        controller.abort();
        reader.cancel();
      }
    });

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Accel-Buffering", "no");
    return new Response(stream, { headers });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message =
      err?.message ??
      (status === 401 ? "LiteAPI rejected this request as unauthorized." : "Failed to fetch rates");
    return NextResponse.json({ error: { message } }, { status });
  }
}
