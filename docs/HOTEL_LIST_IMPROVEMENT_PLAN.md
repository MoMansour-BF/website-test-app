# Hotel list page improvement plan: filters, caching, and speed

**Goal:** Add filters without sacrificing speed. Avoid “every filter change = full refetch from scratch” so the list feels fast and responsive. Persist user choices so that back-from-hotel and “recently searched” (e.g. on the homepage) work correctly.

**Scope:** Plan and structured implementation outline — no code in this doc.

**See also:** `docs/IMPLEMENTATION_PLAN_SEARCH_SPEED_AND_STREAM.md` — phased implementation order for streaming, place types, nationality (Phase 0), refundable strategy, hotel details fix, and backup of the current non-stream search route.

---

## 0. LiteAPI rates endpoint: `stream` and `includeHotelData`

From the [Retrieve rates for hotels](https://docs.liteapi.travel/reference/post_hotels-rates) endpoint and [Rate and Hotel Query Guide](https://docs.liteapi.travel/docs/rate-request-parameters-guide):

| Parameter | Type | Purpose |
|-----------|------|---------|
| **`includeHotelData`** | boolean | When `true`, the response can include hotel information (name, photos, address). When searching by **placeId** or **aiSearch**, hotel data is **automatically included**; for **hotelIds** searches you must set this to get names and photos. We already send `includeHotelData: true` in `searchHotelRates`. |
| **`stream`** | boolean | When `true`, the API returns data **incrementally** (streaming) instead of one JSON payload. See [Stream Hotel Rates](https://docs.liteapi.travel/docs/stream-hotel-rates): response is SSE-style (`data:` lines, then `data: [DONE]`). Use to show results as they arrive (faster time-to-first-result); requires handling a streaming response. |

**Why star rating and guest rating cannot be client-side (today):** The API’s “What You Get” mentions “ratings” when searching by filters, but the [Hotel Rates API JSON Data Structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure) does **not** define `rating`, `reviewCount`, or `starRating` on the hotel object in the rates response. We also only enrich the **first 40** hotels with `getHotelDetails(id)`; hotels 41–1000 do not have rating/reviewCount in our payload. So we cannot filter by “min guest rating” or “star rating” on the client for the full list. **Server-side** filters (`minRating`, `minReviewsCount`, `starRating`) ask the API to return only hotels that meet the bar, so the result set is correct. If the API later documents that every hotel in the response includes those fields, we could revisit client-side for instant UX.

---

## 1. Popular OTA filter set (reference)

Typical “Sort & Filter” screens (e.g. Booking, Expedia, and the reference image) include:

| OTA pattern | Example | Our recommendation |
|-------------|---------|--------------------|
| **Sort by** | Recommended, Price, Rating | Already client-side. |
| **Search by property name** | e.g. “Marriott” | **Client-side** (hotel names are in the response). |
| **Popular filters** | Resort, All inclusive, Area, Airport shuttle | Map to **facilities** (server-side) when we have facility IDs. |
| **Total price** | Min/Max inputs + range slider ($0 – $1,000+) | **Client-side** (we have `pricesByHotelId` with total amount per hotel). |
| **Refundable only** | Checkbox | Client-side (`hasRefundableRateByHotelId`). |
| **Star rating** | 3★, 4★, 5★ | Server-side (LiteAPI `starRating`). |
| **Guest rating / reviews** | Min rating, min review count | Server-side (LiteAPI `minRating`, `minReviewsCount`). |

**Price** is a vital filter: users expect a range (slider and/or min/max inputs) and instant updates. Doing it **client-side** keeps it instant and avoids any new API call. LiteAPI’s [Rate and Hotel Query Guide](https://docs.liteapi.travel/docs/rate-request-parameters-guide) does **not** expose `minPrice`/`maxPrice`, so price filtering must be applied on our side from the existing `pricesByHotelId` data.

**Price filter – currency and range:** All amounts in the list are in the **same currency** as the search (the request sends `currency` and the API returns amounts in that currency; `pricesByHotelId` entries use that currency). To avoid any currency issues:
- **Min** = 0 (in the search currency).
- **Max** = highest total available in the **current result set** (i.e. `max(pricesByHotelId[].amount)`), in that same currency.
- Slider and min/max inputs must use this currency for labels and comparison (e.g. “$0 – $1,200” when USD). Do not mix currencies or use a fixed max (e.g. $1,000) that might be above or below the real range.

---

## 2. Filter options: client-side vs server-side (definitive list)

| Filter option | Logic / example | Client-side or server-side | Reason |
|---------------|-----------------|----------------------------|--------|
| **Star rating** | Min logic: e.g. “4★ and above”, or checkboxes 3★, 4★, 5★ | **Server-side** | LiteAPI `starRating` (array). We don’t have star for all hotels in the response. |
| **Guest rating** | Min logic: e.g. “8+”, “9+ only” | **Server-side** | LiteAPI `minRating`. Ensures only hotels meeting the bar are returned. |
| **Min review count** | Min logic: e.g. “100+ reviews” | **Server-side** | LiteAPI `minReviewsCount`. |
| **Board types** | e.g. Room only, Bed & breakfast, Half board, All inclusive | **Client-side** | Rate response includes `boardType` / `boardName` per offer. We have one rate (cheapest) per hotel, so we can filter by “show only hotels whose cheapest rate has this board type”. Expose board on the list payload and filter in the UI. |
| **Refund or not** | Refundable only vs any | **Client-side** | We already have `hasRefundableRateByHotelId` from the second (refundable-only) rates call. |
| **Price (total)** | Min/max range (min = 0, max = highest total in result set) | **Client-side** | `pricesByHotelId` has amount per hotel; same currency as search. LiteAPI has no minPrice/maxPrice. |
| **Radius / distance to point of interest** | e.g. “Within 2 km of center” | **Server-side** | LiteAPI supports `latitude`, `longitude`, `radius` (meters). Distance filter = narrow the search origin, not a per-hotel attribute we get back. |
| **Property type** | e.g. Hotel, Resort, Apartment, Villa | **Server-side** | LiteAPI has hotel types (from data/hoteltypes); filter is applied in the search request. We don’t get a full property-type list per hotel in the rates response for client-side filtering. |
| **Facilities** | e.g. Pool, gym, airport shuttle, Wi‑Fi | **Server-side** | LiteAPI `facilities` (and optionally `strictFacilityFiltering`). Facility IDs from data/facilities. |
| **Search by property name** | Text match on hotel name | **Client-side** | Hotel names are in the response; instant filter without a new request. (LiteAPI also has `hotelName` for server-side if needed.) |
| **Sort** | Recommended, price low→high, price high→low, rating | **Client-side** | Reorder the same set; no new data. |

**Others to consider (no implementation here):**

| Filter | Suggested side | Note |
|--------|----------------|------|
| **Chain / brand** | Client-side if in response | If the hotel object includes chain/brand name, filter client-side; otherwise server-side if the API supports it. |
| **Free cancellation** | Client-side | Same as “Refund or not” (refundable tag). |
| **Bed type / room attribute** | Usually N/A for list | Typically used on the hotel/room page, not as a list filter; if needed and in response, client-side. |

---

## 3. Current behaviour and constraint

- **Single entry point:** Results page calls `POST /api/rates/search` once per “search” (destination + dates + guests + currency/locale). No filter params today.
- **Heavy server work per request:**
  - Two parallel LiteAPI rates calls (main + refundable-only).
  - Up to 40 `getHotelDetails(id)` calls for rating/reviewCount (and optionally star rating when present).
  - Timeout 15s on rates; total latency = max(main, refundable) + details batch.
- **Constraint:** Any change that forces a new `/api/rates/search` means starting from zero: two rates calls + details again. So the lever for speed is: **minimise how often we need a new search**, and **reuse work** when we do.

### 3.1 Rates response structure (LiteAPI) — reference for filters

The plan’s client-side filters are derived from the [Hotel Rates API JSON Data Structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure). Mapping:

| What we use in the plan | LiteAPI response location | Notes |
|-------------------------|---------------------------|--------|
| **Price (total) per hotel** | `data[]` → each item has `roomTypes[]` → first offer has **`offerRetailRate`** `{ amount, currency }`. Doc: *"the total amount in our requested currency that is needed to book this room"*. Fallback: `suggestedSellingPrice` or `rates[0].retailRate.total[0]`. | Our `pricesByHotelId[hotelId].amount` / `.currency` come from here. Same currency as request. |
| **Board type (meal plan)** | `data[].roomTypes[].rates[]` → each rate has **`boardType`** (short code: RO, BB, HB, FB, AI, TI, etc.) and **`boardName`** (e.g. "Room Only", "All Inclusive"). | We have one rate per hotel (cheapest); that rate’s `boardType`/`boardName` support the board filter client-side. |
| **Refundable or not** | `data[].roomTypes[].rates[].cancellationPolicies.refundableTag` — **`RFN`** (refundable) or **`NRFN`** (non-refundable). | We also call the API again with `refundableRatesOnly: true` and build `hasRefundableRateByHotelId` so we know “has any refundable rate” per hotel. |
| **Hotel name** | From the search response’s hotel object (e.g. `item.hotel` when `includeHotelData: true`). Not in the rates JSON structure doc linked above; it’s part of the same rates response when searching by place/aiSearch. | Used for “Search by property name” client-side. |

The rates response does **not** include star rating, review count, property type, or distance in each `data[]` item; those filters rely on LiteAPI request parameters (server-side) or on a separate hotel-details enrichment step.

---

## 4. How this matches OTA best practices (Booking, Expedia, etc.)

Findings from typical OTA behaviour and hotel search design:

- **Instant feedback wins:** Users expect filter/sort changes to update the list immediately when possible, without a full reload or long spinner.
- **Client-side when data is small and present:** With a bounded result set (e.g. your 1000-hotel cap), filtering and sorting on already-loaded data is fast and avoids extra network round-trips. OTAs do this where the backend has already returned the needed attributes.
- **Server-side when data is missing or unbounded:** Filters that require the supplier to exclude properties (e.g. star rating, facilities, strict min rating/reviews) must go to the API; then caching and clear loading states matter.
- **Caching is standard:** Search results are cached with a key that includes search params and server-side filters; TTLs (e.g. 2–5 minutes) balance freshness and speed. Repeat requests (same URL, same filters) are served from cache when possible.
- **URL = source of truth:** Filters and sort are encoded in the URL so results are shareable and back/forward work. Same URL → same cache key → fast or instant when cached.

So the direction is: **maximise client-side filtering/sorting on one “base” payload**, and **use server-side only where necessary**, with **server + optional client caching** so that when we do refetch, we don’t repeat work unnecessarily.

---

## 5. Recommended filter taxonomy (for UX and speed)

Split filters by **where they run** and **whether they require a new API request**.

### 5.1 Client-side only (no new request — instant)

| Filter / control | Why client-side | Data today |
|------------------|-----------------|------------|
| **Refundable only** | Boolean per hotel already in response | `hasRefundableRateByHotelId` from the second (refundable-only) rates call. |
| **Sort** (recommended, price low→high, price high→low, rating) | Reordering the same set; no new data | Already implemented; uses `pricesByHotelId`, `hotelDetailsByHotelId` / list rating. |
| **Price range (total or per night)** | We have price per hotel; LiteAPI has **no** `minPrice`/`maxPrice` params | `pricesByHotelId[hotelId].amount` = total for stay. Per night = amount ÷ nights (same data). |
| **Search by property name** | Hotel names are in the response | `raw.hotels` / `item.hotel.name` in search response. |

**Price filter UI (OTA-style):** Offer both a **range slider** (dual handles for min/max) and **min/max inputs**, bound to the same state. Use **min = 0** and **max = highest total in the current result set** (in the search currency). Label as “Total price” and show the currency (e.g. “Min USD 0”, “Max USD 1,200”). You can optionally show a “per night” equivalent in the label or tooltip (total ÷ nights). Apply the range filter client-side so the list updates instantly with no new request.

**Recommendation:** Keep all of the above 100% client-side. None of them should trigger `POST /api/rates/search`. Use the existing response and filter/sort in the UI for instant feedback and zero extra LiteAPI load.

### 5.2 Server-side (new request, but cacheable)

These require LiteAPI parameters; changing them changes the result set, so a new search is needed. The gain is from **caching**, not from avoiding the call.

| Filter | LiteAPI param(s) | Note |
|--------|-------------------|------|
| **Star rating** (e.g. 3★, 4★, 5★) | `starRating: number[]` | We don’t have star rating for all hotels in the current response (only for up to 40 from details). So this must be server-side. |
| **Minimum guest rating** (e.g. “8+”) | `minRating` | API can filter; we don’t have rating for every hotel in the payload, so server-side for correctness. |
| **Minimum review count** (e.g. “100+ reviews”) | `minReviewsCount` | Same as above. |
| **Facilities** (e.g. pool, gym) | `facilities`, `strictFacilityFiltering` | Only LiteAPI can filter by facility IDs. |

**Recommendation:** Add these as optional request body params to `POST /api/rates/search`, pass them through to `searchHotelRates` (and to the refundable-only call) so counts and refundable flags stay in sync. Include them in the **cache key** (see below). When the user changes only these, the app will make one new request; subsequent identical requests (e.g. same URL) hit cache.

### 5.3 Optional hybrid (if you expand data later)

If in the future the **rates response** (or a single details pass) included **rating**, **reviewCount**, and **starRating** for every hotel in the list, you could move “minimum rating” and “minimum review count” (and possibly star) to client-side for instant UX, and reserve server-side for facilities and for “first load” or “refine search” behaviour. For now, the doc’s recommendation to treat minRating/minReviewsCount/starRating as server-side is the safe choice.

---

## 6. Caching strategy (to make server-side filters “fast enough”)

Right now, every new search hits LiteAPI with no cache. To make filter changes less painful:

### 6.1 Server-side cache (recommended)

- **What to cache**
  - **Full `/api/rates/search` response** (raw, pricesByHotelId, hasRefundableRateByHotelId, hotelDetailsByHotelId, promoConfig).
  - Key = **canonical string of all inputs that change the result**: e.g.  
    `rates:${mode}:${placeId|aiSearch}:${checkin}:${checkout}:${occupancies}:${currency}:${locale}:${starRating}:${minRating}:${minReviewsCount}:${facilities}`  
    (normalise arrays to a stable string, e.g. sorted and joined).  
    **Do not** include price range or property name in the cache key — those are client-side filters applied after load.
- **Where:** In-memory (e.g. Node cache) or Redis. TTL **2–5 minutes** is a good starting point (align with your FILTERS_AND_CACHING.md).
- **Hotel details:** Optionally cache `getHotelDetails(id)` by `hotelId` + language with a longer TTL (e.g. 1 h). Then when the same hotel appears in multiple searches (e.g. user changes star filter), details don’t need to be re-fetched.

**Effect:** When the user changes only **client-side** filters (refundable, sort), no new request — instant. When they change **server-side** filters, one request runs; if they (or someone with the same URL) hit the same combination again within TTL, the response is served from cache, so “repeat” filter combinations feel fast.

### 6.2 Client-side “session” cache (optional)

- Keep the **last** (or last N) search result(s) in memory or sessionStorage keyed by something like “base search” (no server-side filters).
- Use it so that toggling “Refundable only” or changing sort never refetches; you just filter/sort on the cached payload.
- When the user changes **server-side** filters or core search params (dates, place, guests), then either invalidate and refetch or fetch with the new params and update the cache.

This complements the server cache: server cache avoids duplicate LiteAPI work across requests; client cache avoids duplicate requests when the user only toggles client-side options.

---

## 7. Request behaviour and UX

- **Refundable / Sort / Price range / Property name:** Do **not** include these in the request body for `/api/rates/search`. They are derived on the client from the existing response. No loading state for these.
- **Star, min rating, min reviews, facilities:** Include in the request body when set. When the user changes any of these:
  - Update the URL (so the state is shareable and cache key matches).
  - Call `POST /api/rates/search` once with the new params.
  - Show a loading state (e.g. list skeleton or spinner) only for this request. If you have client-side cache, you can optionally show previous results dimmed until the new response arrives.
- **Debouncing (optional):** If you expose multiple server-side filters (e.g. several facility checkboxes), you can debounce (e.g. 300–500 ms) so one request is sent after the user stops changing filters, instead of one request per click.
- **Result count (e.g. “300+ available properties”):** For client-side-only filters (refundable, sort, price range, property name), derive the count from the filtered list length so it updates instantly with no request. For server-side filter changes, the count comes from the new response (or cached response).

---

## 8. URL and state

- Persist **all** active filters (and sort) in the URL (e.g. `?refundableOnly=1&minPrice=50&maxPrice=500&name=Marriott&stars=4,5&minRating=8&sort=price_asc`).
- On load, read query params and:
  - Send **server-side** filter params to `POST /api/rates/search`.
  - Apply **client-side** filters (refundable, sort, price range, property name) to the response in the UI.
- Benefits: shareable links, back/forward works, and the same URL consistently hits the same server cache key.

---

## 9. User choice persistence (back navigation, recently searched)

We want to **cache user choices** so that:

1. **Back from hotel page to results:** When the user goes Results → Hotel detail → Back, they see the **same results page** with the **same parameters** (filters, sort, scroll) as when they left. No re-run of search with default filters.
2. **Recently searched / homepage:** The same stored “last search” (or last N searches) can drive a “Recently searched” or “Continue your search” list on the homepage and support “Search again” flows.

**Single source of truth:** The **URL of the results page** holds all parameters that define the search and view: `mode`, `placeId`, `placeName`, `aiSearch`, `checkin`, `checkout`, `occupancies`, and all filter/sort params (e.g. `refundableOnly`, `minPrice`, `maxPrice`, `name`, `stars`, `minRating`, `sort`). When the user navigates to a hotel, use normal navigation (e.g. `<Link>`) so the results URL stays in history; when they click Back, the browser returns to that URL and the app reads params from it — no extra persistence needed for “back” itself.

**Persist “last search” for reuse:**

- **Where:** `sessionStorage` (or a client store) for the **current session**; optionally `localStorage` for “recent searches” across sessions.
- **What to store:** A canonical representation of the **last run search** (and optionally last N): e.g. `{ mode, placeId, placeName, aiSearch, checkin, checkout, occupancies, currency, filters, sort }`. This is the same set of values that appears in the results URL.
- **When to write:** After a successful load of the results page (or when user changes search/filters and the results URL is updated). Optionally push to a “recent searches” list (dedupe by core params: place + dates + guests).
- **When to read:** (1) When building the results page, read from URL first (URL wins). (2) On the **homepage**, read from “last search” / “recent searches” to show “Continue your search” or “Recent: Paris, Dec 20–22” and link to `/results?…` with those params. (3) Optional: when user lands on results with no params, redirect or prefill from last search.

**Implications:**

- Results page must **read all state from URL on load** (and when URL changes, e.g. back/forward). Do not rely only on in-memory state so that when the user returns from the hotel page, the same URL restores the same view.
- When navigating **to** the hotel page, pass the **current results URL** (or at least do not replace history with a state that loses the results URL) so that Back brings the user to results with the right params.
- “Recently searched” on the homepage is simply: read the stored list of past search params and render links to `/results?{params}`. Same params can be used for “Search again” from the results page (e.g. change dates but keep destination and filters).

---

## 10. Summary: best (UX + speed) filtering logic under your constraints

| Aspect | Recommendation |
|--------|----------------|
| **Refundable only** | Client-side only; use `hasRefundableRateByHotelId`. No new API call. |
| **Sort** | Client-side only; keep current behaviour. No new API call. |
| **Price range (total or per night)** | Client-side only; filter by `pricesByHotelId[].amount` (and optionally amount ÷ nights). Use slider + min/max inputs (OTA-style). No new API call. |
| **Search by property name** | Client-side only; filter by hotel name from response. No new API call. |
| **Board types** | Client-side only; filter by `boardType`/`boardName` on the cheapest rate per hotel (see [LiteAPI rates structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure)). No new API call. |
| **Star rating, min rating, min reviews, facilities** | Server-side (LiteAPI params). One new request when these change; include in server cache key so repeats are fast. |
| **Caching** | Server: cache full search response by full param key, TTL 2–5 min. Optional: cache hotel details by id + language. Optional: client/session cache for “base” result so client-only toggles never refetch. |
| **URL** | Encode all filters and sort; read on load and use for both API request and client-side filtering. |
| **Loading** | Show loading only when a new `POST /api/rates/search` is in flight (i.e. when core search or server-side filters change). |

This keeps the “one heavy search” model but ensures that **filter changes that can be satisfied with existing data don’t trigger it**, and **when they do**, **caching** makes repeated or shared URLs fast. That aligns with how major OTAs balance instant feedback (client-side) with correct, cacheable server-side filtering.

---

## 12. Structured implementation plan

Phased approach so that each step is shippable and testable. Order respects dependencies (URL state before persistence, server cache before optional stream).

### Phase 1: URL as single source of truth for results

**Goal:** Results page state (search + filters + sort) is fully encoded in the URL and read from the URL on load and on navigation.

| Step | What | Notes |
|------|------|--------|
| 1.1 | Define a **canonical query schema** for the results page | All params: `mode`, `placeId`, `placeName`, `aiSearch`, `checkin`, `checkout`, `occupancies`, `currency`, and filter/sort: `refundableOnly`, `minPrice`, `maxPrice`, `name`, `stars`, `minRating`, `minReviews`, `facilities`, `sort`. Document in code or a small constants/schema file. |
| 1.2 | **Read** all state from `useSearchParams()` (or equivalent) on mount and when URL changes | No default in-memory state that overrides URL. When user lands on `/results?placeId=...&checkin=...`, the page uses exactly those params. |
| 1.3 | **Write** every user change (search form submit, filter toggle, sort change) to the URL | Use `router.push` or `router.replace` with the new query string so the URL always reflects current choices. |
| 1.4 | Ensure **links to hotel page** do not replace results URL in history | Use `<Link href={...}>` (or navigate without `replace`) so that Back from hotel returns to the results URL with same params. |

**Exit criteria:** Changing filters/sort updates the URL; refreshing or using Back restores the same view.

### Phase 2: Client-side filters and sort (no new API call)

**Goal:** Refundable, price range, property name, board type, and sort apply instantly from the current response; no refetch.

| Step | What | Notes |
|------|------|--------|
| 2.1 | Add **refundable** filter | Filter list by `hasRefundableRateByHotelId[hotelId]`. State in URL: `refundableOnly=1`. |
| 2.2 | Add **price range** filter (min/max + slider) | Min = 0, max = max total in result set; currency from search. Store `minPrice`, `maxPrice` in URL. Filter by `pricesByHotelId[id].amount`. |
| 2.3 | Add **search by property name** | Text input; filter hotel name by substring. State in URL: `name=...`. |
| 2.4 | Add **board type** filter | Expose `boardType`/`boardName` from the cheapest rate per hotel in the list payload; filter by selected board(s). State in URL: e.g. `board=AI,BB`. |
| 2.5 | Keep **sort** URL-driven | Already have sort; ensure it's in URL (e.g. `sort=price_asc`) and read on load. |
| 2.6 | **Result count** | Show "X properties" from the length of the filtered list (client-side filters only) or from the response (after server-side filter change). |

**Exit criteria:** Toggling any of these updates the URL and the list immediately with no loading spinner or new `/api/rates/search` call.

### Phase 3: Server-side filters and API contract

**Goal:** Star rating, min guest rating, min review count, facilities (and optionally property type, radius) sent to the API; server cache key includes them.

| Step | What | Notes |
|------|------|--------|
| 3.1 | Extend **request body** of `POST /api/rates/search` | Optional: `starRating`, `minRating`, `minReviewsCount`, `facilities`, `strictFacilityFiltering`. Pass through to `searchHotelRates` in both main and refundable-only calls. |
| 3.2 | Extend **liteapi** `RatesSearchParams` and body in `searchHotelRates` | Add the above params to the LiteAPI request body when present. Keep `includeHotelData: true`. |
| 3.3 | **URL → API:** When results page loads with server-side filter params, send them in the search request | So that shareable links and Back restore the same filtered result set. |
| 3.4 | **Server cache** (optional but recommended) | Cache full search response by canonical key (all request params that affect the result). TTL 2–5 min. Exclude client-only params (price range, name, refundable, sort) from cache key. |
| 3.5 | **Hotel details cache** (optional) | Cache `getHotelDetails(id)` by `hotelId` + language to speed up repeat searches. |

**Exit criteria:** Changing star/rating/reviews/facilities triggers one new search; identical request (same URL params) within TTL is served from cache. Back/refresh with those params returns the same results.

### Phase 4: User choice persistence (back-from-hotel, recently searched)

**Goal:** Back from hotel restores results with same params; last (or recent) search can drive homepage "Recently searched".

| Step | What | Notes |
|------|------|--------|
| 4.1 | **Persist "last search"** on results page | After a successful results load (or when URL is updated by user), write to `sessionStorage` a canonical object: core search (mode, place, dates, occupancies, currency) + filters + sort. Same shape as results URL params. |
| 4.2 | **Results page: read URL only** | No need to read from sessionStorage for the results view itself; URL is source of truth. Persistence is for other pages (homepage) and for "no params" fallback if desired. |
| 4.3 | **Homepage: "Recently searched"** | Read from sessionStorage (and optionally localStorage) last N searches; render as links to `/results?{params}`. Dedupe by core search (e.g. place + dates + guests). |
| 4.4 | **Optional: "Continue your search"** | If user has a last search and lands on homepage, show a CTA that links to `/results?{lastSearchParams}`. |
| 4.5 | **Optional: restore scroll position** | When returning from hotel to results, restore scroll (e.g. via `sessionStorage` or scroll-restoration API) so the user finds the same place in the list. |

**Exit criteria:** Back from hotel shows same filters/sort; homepage can show recent searches and "Continue" using the same param set.

### Phase 5 (Optional): Streaming and performance

**Goal:** Faster time-to-first-result and better perceived performance.

| Step | What | Notes |
|------|------|--------|
| 5.1 | **Evaluate `stream: true`** | Per [Stream Hotel Rates](https://docs.liteapi.travel/docs/stream-hotel-rates), add `stream: true` to the rates request and handle SSE response: incrementally update UI as hotel chunks arrive; handle `data: [DONE]`. Requires server route to proxy/stream and client to consume stream. |
| 5.2 | **Client-side "session" cache** | Keep last search result in memory so that switching only client-side filters (e.g. refundable, price) never refetches; only refetch when core params or server-side filters change. |
| 5.3 | **Debounce server-side filter changes** | If multiple server-side toggles (e.g. facilities), debounce (300–500 ms) so one request is sent after the user stops changing. |

**Exit criteria:** Optional; ship when stream and session cache are stable and tested.

### Implementation order summary

| Phase | Focus | Depends on |
|-------|--------|------------|
| 1 | URL as source of truth | — |
| 2 | Client-side filters + sort | 1 |
| 3 | Server-side filters + cache | 1 |
| 4 | Persist user choices + recently searched | 1, 2 (and 3 if you want recent searches to include server filters) |
| 5 | Stream + session cache (optional) | 1–3 |

---

## 11. Reference

- **LiteAPI Hotel Rates API JSON Data Structure (authoritative):** [https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure) — use this for exact field names and response shape for the rates call.
- **Current flow and LiteAPI params:** `docs/FILTERS_AND_CACHING.md`
- **Search API:** `app/api/rates/search/route.ts`
- **LiteAPI client:** `src/lib/liteapi.ts` (`RatesSearchParams`, `searchHotelRates`)
- **List UI and sort:** `app/results/page.tsx`
