# Hotel list filters, caching, and call speed

Reference for implementing filters on the results page and for optimizing latency and caching.

---

## 1. Current search flow (results page)

When the user runs a search (destination + dates + guests), the client calls **one** endpoint:

- **`POST /api/rates/search`**

That route does the following **server-side**:

| Step | What | Purpose |
|------|------|---------|
| 1 | Two **parallel** LiteAPI calls | Main: cheapest rate per hotel (`maxRatesPerHotel: 1`). Second: same search with `refundableRatesOnly: true`. |
| 2 | Build `pricesByHotelId` | From main response: price, currency, refundableTag, taxIncluded per hotel. |
| 3 | Build `hasRefundableRateByHotelId` | From refundable-only response: any hotel that appears has at least one refundable rate. |
| 4 | Build `hotelDetailsByHotelId` | Rating and reviewCount: first from rates response `item.hotel`, then overlay with **up to 40** `getHotelDetails(id)` calls in parallel. |
| 5 | Return | `raw`, `pricesByHotelId`, `hasRefundableRateByHotelId`, `hotelDetailsByHotelId`, `promoConfig`. |

**Rough latency:** `max(main search, refundable search)` + `max(40 × hotel details)`. Timeout for rates is 15s; details run in parallel.

---

## 2. LiteAPI parameters relevant to filters

From the [Retrieve rates for hotels](https://docs.liteapi.travel/reference/post_hotels-rates) and [Rate and Hotel Query Guide](https://docs.liteapi.travel/docs/rate-request-parameters-guide):

| Parameter | Type | Use for filtering |
|-----------|------|--------------------|
| `refundableRatesOnly` | boolean | If `true`, only refundable (RFN) rates. We use a **second parallel call** with this to know “has any refundable rate” per hotel; list filter can be client-side from `hasRefundableRateByHotelId`. |
| `maxRatesPerHotel` | number | We use `1` for listing (cheapest only). |
| `minRating` | number | **Server-side filter**: only hotels with at least this rating. |
| `minReviewsCount` | integer | **Server-side filter**: only hotels with at least this many reviews. |
| `starRating` | number[] | **Server-side filter**: e.g. `[3.5, 4, 5]` to include only those star ratings. |
| `facilities` | number[] | **Server-side filter**: facility IDs (e.g. pool, gym). |
| `strictFacilityFiltering` | boolean | When `true`, hotel must have **all** listed facilities. |
| `hotelName` | string | Loose name match. |
| `limit` | number | Max hotels returned (we use 1000). |
| `offset` | number | Pagination. |

**Refundable:** No single “refundable only” filter that keeps cheapest price. So we use two calls (main + `refundableRatesOnly: true`) and derive `hasRefundableRateByHotelId`; “Refundable only” filter on the list is **client-side** from that map.

---

## 3. Recommended filter implementation

### 3.1 Server-side (pass to LiteAPI)

- **Star rating:** Add `starRating` to the search request from UI (e.g. checkboxes 3★, 4★, 5★).
- **Minimum rating:** Add `minRating` (e.g. slider or “8+ only”).
- **Minimum reviews:** Add `minReviewsCount` (e.g. “100+ reviews”).
- **Facilities:** Add `facilities` (and optionally `strictFacilityFiltering`) when you have facility IDs.

**Implementation:** Extend the request body to `/api/rates/search` with optional `starRating`, `minRating`, `minReviewsCount`, `facilities`, etc. Pass them through to `searchHotelRates` in `src/lib/liteapi.ts` and include them in both the main and the refundable-only call so counts and flags stay in sync.

### 3.2 Client-side (no extra API params)

- **Refundable only:** Filter `visibleHotels` (or the list before sort) with `hasRefundableRateByHotelId[hotel.id] === true`. No second request needed; data is already in the search response.

### 3.3 URL / state

- Encode active filters in the URL (e.g. `?refundableOnly=1&stars=4,5&minRating=8`) so:
  - Results are shareable and back/forward work.
  - On load, read query params and send them to `POST /api/rates/search` (and use them for client-side refundable filter).

---

## 4. Caching strategies

### 4.1 What to cache

| Data | Key idea | Where |
|------|----------|--------|
| **Search results** | Key = hash of (placeId/mode, checkin, checkout, occupancies, currency, filters). TTL e.g. 2–5 min. | Server: in-memory (e.g. Node cache) or Redis. Or client: sessionStorage/memory for the current session. |
| **Hotel details** | Key = `hotelId` (and optionally language). TTL longer (e.g. 1 h). | Server cache for the enrichment step so repeated searches don’t re-fetch same hotels. |
| **Refundable set** | Same as search: it’s part of the same search response. | No separate cache; cache the full search payload. |

### 4.2 Where to cache

- **Server (recommended for search + details):**
  - Cache the full `/api/rates/search` response by a canonical key (params above). Reduces duplicate LiteAPI calls when users change sort/filters client-side without changing search params.
  - Cache `getHotelDetails(id)` per hotel (and language). Use this inside the search route so the “up to 40 details” step hits cache for popular hotels.
- **Client:**
  - Optional: cache the last search result in memory (or sessionStorage) so switching “Refundable only” on/off doesn’t refetch; only refetch when search params or server-side filters change.

### 4.3 Cache keys (examples)

- Search: `rates:${mode}:${placeId || aiSearch}:${checkin}:${checkout}:${occupancies}:${currency}:${starRating}:${minRating}:${minReviewsCount}` (and any other server-side filter you add).
- Hotel details: `hotel:${hotelId}:${language}`.

---

## 5. Call speed and timeouts

- **Rates API:** We use `timeout: 15`. LiteAPI suggests 4–10s for production; 15s trades latency for completeness. If you need faster response, reduce to 8–10s and accept that some slow suppliers may be missing.
- **Two parallel rates calls:** Total wait is ~max of the two, not sum. Keeps “refundable” detection without doubling user wait.
- **Hotel details:** 40 parallel `getHotelDetails` calls. To speed up:
  - Reduce the cap (e.g. 20) for the first page.
  - Cache details by `hotelId` (and language) so repeat searches reuse them.
  - Optionally run details only for “visible” hotels (e.g. first 20) and load more on scroll (more complex).

---

## 6. Checklist for adding a new filter

1. **Decide:** Server-side (LiteAPI param) vs client-side (filter on existing list).
2. **If server-side:** Add the param to the client request → `/api/rates/search` → `searchHotelRates` (both main and refundable-only). Update cache key if you cache search results.
3. **If client-side:** Use existing response (e.g. `hasRefundableRateByHotelId`) and filter the list in the UI.
4. **URL:** Persist the filter in the URL and read it on load so the same request (and cache key) is used when the user shares or refreshes.

---

## 7. Reference: where things live in code

| Concern | File(s) |
|--------|---------|
| Rates search (main + refundable-only) | `app/api/rates/search/route.ts` |
| LiteAPI params (refundableRatesOnly, maxRatesPerHotel, etc.) | `src/lib/liteapi.ts` (`RatesSearchParams`, `searchHotelRates`) |
| Hotel details enrichment | `app/api/rates/search/route.ts` (hotelDetailsByHotelId) |
| List UI (refundable label, rating/reviews, price) | `app/results/page.tsx` |
| Refundable-only filter (client-side) | Use `data.hasRefundableRateByHotelId` in `app/results/page.tsx` when you add a filter bar. |
