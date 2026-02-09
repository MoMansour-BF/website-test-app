# Deprecated: Streaming search (Phase 5)

The **streaming** path for `POST /api/rates/search` has been deprecated. The app always uses the **non-stream** implementation so that search works reliably.

## What was deprecated

- **Server:** The route no longer checks `USE_RATES_STREAM`; it always delegates to the non-stream handler (`route.non-stream.backup.ts`).
- **Client:** The results page no longer checks for `text/event-stream` or parses SSE; it always expects a JSON response.

## Where the stream code lives (for future use)

| Location | Description |
|----------|-------------|
| `app/api/rates/search/_deprecated/route.stream.ts` | Full streaming route handler (body parsing, Type 1/2/3 dispatch, LiteAPI stream fetch, SSE pipe, refundable/specificHotel trailing chunks). |
| `src/lib/liteapi.ts` | `fetchHotelRatesStream()`, `buildRatesRequestBody()`, and params (`stream`, `hotelName`, `starRating`, `minRating`) remain; they are used by the deprecated stream handler. |

## How to re-enable streaming later

1. **Option A — env switch:** In `app/api/rates/search/route.ts`, restore the `USE_RATES_STREAM` check and the stream branch (copy the logic from `_deprecated/route.stream.ts`). On the client, restore the SSE consumption block (see git history or the implementation plan for the exact buffer/reveal/append logic).
2. **Option B — replace route:** Replace the body of `route.ts` with the contents of `_deprecated/route.stream.ts` (and fix the import path for the deprecated file if you move it), then restore client stream handling.

See `docs/IMPLEMENTATION_PLAN_SEARCH_SPEED_AND_STREAM.md` (Phase 5) for the original design (buffer-then-stream, Type 1/2/3, refundable in parallel).

## What was kept

- **Suggested destinations** in `SearchModal` use real Google Place IDs (Cairo, Makkah, Hurghada) so place-mode search works.
- **Either/or request body:** The client still sends only `placeId`/`placeName` in place mode and only `aiSearch` in vibe mode (no mixing).
- **Non-stream backup** remains the single active implementation and is not renamed.
