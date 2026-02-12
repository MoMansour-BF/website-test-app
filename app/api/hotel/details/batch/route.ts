/**
 * Phase 4: Batch hotel details for cascaded enrichment (wave 2+).
 * POST body: { hotelIds: string[], language?: string }
 * Returns: { hotelDetailsByHotelId: Record<string, { rating?, reviewCount?, starRating?, location? }> }
 * Phase 1: location (latitude, longitude) for map markers. Uses same cache and concurrency cap as initial search enrichment.
 */

import { getChannelFromRequest } from "@/auth";
import { getLiteApiKeyForChannel } from "@/lib/channel-keys";
import { getCachedHotelDetails } from "@/lib/liteapi";
import { NextRequest, NextResponse } from "next/server";

const BATCH_CONCURRENCY = 15;
const MAX_HOTEL_IDS_PER_REQUEST = 80;

async function runInChunks<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function POST(req: NextRequest) {
  let body: { hotelIds?: string[]; language?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { hotelIds: rawIds, language } = body;
  const hotelIds = Array.isArray(rawIds)
    ? (rawIds as string[]).filter((id) => typeof id === "string" && id.length > 0).slice(0, MAX_HOTEL_IDS_PER_REQUEST)
    : [];

  if (hotelIds.length === 0) {
    return NextResponse.json(
      { error: { message: "hotelIds array is required and must contain at least one id" } },
      { status: 400 }
    );
  }

  try {
    const channel = getChannelFromRequest(req);
    const apiKey = getLiteApiKeyForChannel(channel);
    const lang = typeof language === "string" ? language : undefined;

    const detailsResults = await runInChunks(
      hotelIds,
      BATCH_CONCURRENCY,
      (id) => getCachedHotelDetails(id, lang, apiKey)
    );

    const hotelDetailsByHotelId: Record<string, { rating?: number; reviewCount?: number; starRating?: number; location?: { latitude: number; longitude: number } }> = {};
    detailsResults.forEach((details, i) => {
      const id = hotelIds[i];
      if (!id || !details || typeof details !== "object") return;
      const entry: { rating?: number; reviewCount?: number; starRating?: number; location?: { latitude: number; longitude: number } } = {};
      if (details.rating != null) entry.rating = details.rating;
      if (details.reviewCount != null) entry.reviewCount = details.reviewCount;
      if (details.starRating != null) entry.starRating = details.starRating;
      if (details.location && typeof details.location.latitude === "number" && typeof details.location.longitude === "number") {
        entry.location = details.location;
      }
      if (Object.keys(entry).length > 0) {
        hotelDetailsByHotelId[id] = entry;
      }
    });

    return NextResponse.json({ hotelDetailsByHotelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch hotel details batch";
    return NextResponse.json(
      { error: { message } },
      { status: 500 }
    );
  }
}
