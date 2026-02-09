# Implementation plan: search speed, place types, and filters

**Goal:** Improve load speeds for search, integrate place `types` for search-type detection and autocomplete icons, fix hotel details (rating/reviewCount), and define refundable + filters strategy—all in logical implementation order. **Streaming (Phase 5) is not proceeding;** all search uses the **non-stream** API (`POST /api/rates/search`). The backup file is kept for reference only.

**References:**
- [LiteAPI Stream Hotel Rates](https://docs.liteapi.travel/docs/stream-hotel-rates)
- [LiteAPI Displaying Essential Hotel Details](https://docs.liteapi.travel/docs/displaying-hotel-details) — `rating`, `reviewCount`, `starRating` from `/data/hotel`
- [LiteAPI Rate and Hotel Query Guide](https://docs.liteapi.travel/docs/rate-request-parameters-guide)
- Existing: `docs/HOTEL_LIST_IMPROVEMENT_PLAN.md`, `docs/FILTERS_AND_CACHING.md`

---

## Phase 0: Nationality (guestNationality) — critical foundation

**Goal:** Introduce a **nationality** variable so we can eventually let the user pick their country; for now default to **EG (Egypt)** for Egyptians.

| Step | What | Notes |
|------|------|--------|
| 0.1 | **Default guestNationality = EG** | In `RatesSearchParams` and wherever we build the rates request body, use `guestNationality: "EG"` when not provided. LiteAPI uses this for pricing/availability. |
| 0.2 | **API contract** | Accept optional `guestNationality` in `POST /api/rates/search` body; validate against a known list or ISO 3166-1 alpha-2; default to `EG` if missing. |
| 0.3 | **URL and state** | Add optional query param `nationality=EG` to results page URL. Read on load; when we add a picker later, writing this param will drive the search. For now, do not require the param in URL—default EG server-side. |
| 0.4 | **Single source** | Document that all rates calls (main, refundable) must use the same `guestNationality` for the same search. |

**Exit criteria:** All rates requests use `guestNationality: "EG"` by default; optional param in API and URL for future picker.

**Single source (Phase 0.4):** All rates calls for the same search must use the same `guestNationality`. This includes: main search (`POST /api/rates/search`), refundable-only call (same route, parallel), and hotel-level rates (`POST /api/rates/hotel`). The value is resolved once (from request body or URL) and passed through; use `resolveGuestNationality()` from `@/lib/liteapi` in every route that builds a LiteAPI rates request.

---

## Place types: data and search-type detection

LiteAPI `/data/places` returns (among other fields):

- `placeId`, `displayName`, `formattedAddress`, **`types`** (array of strings, e.g. `["hotel","lodging","establishment","point_of_interest"]`).

**Use of `types`:**
1. **Search type (Type 1 vs Type 2):** If the user selects a place whose `types` include `"hotel"` or `"lodging"`, treat as **specific-hotel search** (Type 1): call with `hotelName` + optional area search (both non-stream). Otherwise treat as **city/area search** (Type 2): one search by `placeId` (non-stream).
2. **Autocomplete UX:** Show an icon per suggestion based on primary type (e.g. hotel, locality, establishment).

**Implementation (spread across phases):**
- **API:** Ensure `/api/places` passes through `types` from LiteAPI response (no stripping). Confirm client receives it.
- **Types:** Extend `PlaceSuggestion` (or equivalent) with `types?: string[]`.
- **URL/state:** Persist place type for the selected place so the results page knows search type without re-calling places. Options: (a) add `placeTypes=hotel,lodging` (or first type) to results URL, or (b) derive from a stored `placeTypes` when we only have one selected place. Prefer storing `placeTypes` in URL (e.g. `placeTypes=hotel,lodging`) so results load is deterministic.
- **Helper:** `function isSpecificHotelPlace(types: string[] | undefined): boolean` — return `types?.some(t => t === "hotel" || t === "lodging") ?? false`.
- **Icons:** Map `types[0]` or primary type to an icon (hotel, city, establishment, etc.) in the search bar autocomplete list.

---

## Refundable strategy (recommended)

**Recommendation: keep exactly two parallel calls — no third call, no separate “filter” call.**

| Call | Role | Why |
|------|------|-----|
| **1. Main rates** | Cheapest rate per hotel, full result set | Single `POST /api/rates/search` (non-stream); returns full JSON. |
| **2. Refundable-only** | Which hotels have at least one refundable rate | Same params with `refundableRatesOnly: true`; we merge into `hasRefundableRateByHotelId`. |

**Why not one call?** With a single call we only have the cheapest rate per hotel; we cannot know if the hotel has *any* refundable offer without a second request. So “Refundable only” would be inaccurate.

**Why not a separate “refundable filter” call when user toggles?** That would be a new search (different result set), require loading state, and replace the list. Client-side “Refundable only” filter requires knowing per-hotel refundable flag up front—hence two calls in parallel.

**Conclusion:** Two calls total, both non-stream. Run in parallel; total wait = max(main, refundable).

---

## Hotel details (rating, reviewCount, starRating)

Per [Displaying Essential Hotel Details](https://docs.liteapi.travel/docs/displaying-hotel-details), `/data/hotel` returns in `data`:

- **`starRating`** — amenity level (e.g. 2, 4).
- **`rating`** — guest review score.
- **`reviewCount`** — number of reviews.

**Why many hotels lack review count today:**
1. We only enrich the **first 40** hotels with `getHotelDetails(id)`; the rest never get a details call.
2. Some LiteAPI properties may genuinely omit `reviewCount` or `rating`; we should handle missing values in the UI.

**Recommendations:**

| Item | Action |
|------|--------|
| **Canonical fields** | In the code that reads details response, use the doc’s field names first: `data.rating`, `data.reviewCount`, `data.starRating`. Keep existing fallbacks (`review_count`, `reviewsCount`, `numberOfReviews`) for robustness. |
| **Enrich more hotels** | Increase from 40 to **first 60–80** (or “first screen + one more screen”) so the initial view has ratings for most visible cards. Tune so details batch doesn’t become the bottleneck (e.g. 60–80 parallel requests with timeout). |
| **Cache details** | Cache `getHotelDetails(id)` by `hotelId` + `language` (e.g. TTL 1 hour). Use in the search route so repeat searches or same hotel in multiple results don’t re-fetch. |
| **Missing data** | If `reviewCount` or `rating` is missing after details fetch, show “—” or “No reviews” in the list card; do not hide the hotel. |

**Implementation:** Apply canonical fields and cache in the same place we currently call `getHotelDetails`. Increase the "first N" to 60–80 and document the choice.

---

## Search path: non-stream only

- **Current and only path:** All search uses the **non-stream** API: `POST /api/rates/search` returns full JSON (main + refundable in parallel, then enrichment). No streaming implementation.
- **Backup file:** `route.non-stream.backup.ts` is kept for **reference only** (historical copy of the non-stream logic). The active route is `route.ts` (non-stream). Streaming (Phase 5) is **not proceeding**.

---

## Search types (Type 1 / 2 / 3)

| Type | Trigger | API behaviour |
|------|--------|----------------|
| **Type 1: Specific hotel** | User selected a place with `types` including `hotel` or `lodging` (use `placeTypes` in URL or stored place). | **Two parallel calls:** (A) Target hotel by `hotelName` (from `displayName`). (B) Area search by same `placeId` (and location) with quality filters. Both non-stream. Show specific hotel at top (or “Not available”); then “Other hotels in [location]” from (B); dedupe by `hotelId`. |
| **Type 2: City/area** | User selected a city/area (e.g. locality, administrative_area) or place without hotel/lodging in `types`. | **One call (non-stream):** `placeId` + quality filters; full JSON response. |
| **Type 3: Free-text (vibe)** | User did not select an autocomplete suggestion; search with raw text (`mode: vibe`, `aiSearch`). | **One call (non-stream):** `aiSearch` only; **do not** apply star/rating filters (AI handles intent). |

**Quality filters (Type 1 Call B, Type 2 only):** `starRating: [3, 4, 5]`, `minRating: 6.5` (or your chosen defaults). Skip for Type 3 and for “Show all properties” lazy-load.

---

## Buffer-then-stream UX *(not implementing — Phase 5 cancelled)*

1. Start stream immediately; show skeletons + “Searching hotels in [location]…”
2. **Buffer:** Collect all chunks for **1.5–2 s** without updating the list.
3. **Reveal:** Sort collected hotels (e.g. by price or rating); replace skeletons with sorted cards; show “Found [X] hotels”.
4. **Append:** New chunks after the buffer append to the **bottom** (no re-sort) so the list doesn’t jump; update count.
5. On `[DONE]`: show final count; optionally show “Show all properties” (lazy-load) if applicable.

---

## Lazy-load “Show all properties”

After the main search/results load completes: offer a button “Show [X] more properties” (or similar). On action:

- One **new** request: same location/params **except** remove `starRating` and `minRating` (and optionally `minReviewsCount`).
- Dedupe by `hotelId` against already-shown list; append with a clear separator (e.g. “Budget & unrated options”).

---

## Logical implementation order (phases)

### Phase 0: Nationality (see above)

Default `guestNationality` to `EG`; optional in API and URL.

### Phase 1: Place types and autocomplete icons

| Step | What | Notes |
|------|------|--------|
| 1.1 | **Places API** | Ensure `/api/places` returns `types` from LiteAPI (passthrough). Confirm response shape in client. |
| 1.2 | **PlaceSuggestion type** | Add `types?: string[]` to the type used by SearchModal and results page. |
| 1.3 | **URL for place type** | When building results URL from place selection, add `placeTypes` (e.g. comma-separated: `placeTypes=hotel,lodging`). Read on results load to decide Type 1 vs Type 2. |
| 1.4 | **isSpecificHotelPlace(types)** | Implement helper; use when deciding search type on results page. |
| 1.5 | **Autocomplete icons** | In the search bar autocomplete list, map each suggestion’s `types` (e.g. first or primary) to an icon: hotel, lodging, locality, establishment, etc. |

**Exit criteria:** Selecting a place stores and uses `types`; results page can distinguish specific-hotel vs city search; autocomplete shows type-based icons.

### Phase 2: URL as single source of truth (results)

- Same as in `HOTEL_LIST_IMPROVEMENT_PLAN.md` Phase 1: canonical query schema, read/write URL, links to hotel page preserve results URL.
- Include `placeTypes` (and later filters/sort) in the schema.

### Phase 3: Backup current search route

| Step | What | Notes |
|------|------|--------|
| 3.1 | **Copy current route** | Copy `app/api/rates/search/route.ts` to `app/api/rates/search/route.non-stream.backup.ts`. **Done:** backup file exists; Next.js only serves `route.ts`, so the backup is for code preservation only. |
| 3.2 | **Document** | In the backup file header and in this doc, state that this is a reference copy; streaming is not proceeding, so `route.ts` remains non-stream. To restore this exact logic: replace `route.ts` contents with the backup file’s logic. Optionally add an env var (e.g. `USE_RATES_STREAM=true`) to switch between implementations later if both live in the codebase. |

**Done:** Backup file exists for reference. Streaming (Phase 5) is not proceeding; `route.ts` is and remains the non-stream implementation.

**Exit criteria:** Current behaviour preserved in a backup file; team can revert by restoring or switching.

### Phase 3.5: Last-search persistence (search bar, cross-page)

**Goal:** The app always remembers the user's last search. The search bar (home page or any page that shows it) reflects and updates this. Tapping Home shows last place, occupancies, and dates. Changes to dates or occupancies on other pages (e.g. hotel detail) are remembered. Back from hotel detail returns to the list using the latest search (including any changes made on the hotel page).

**Where to store**

| Store | Key | Use | Limit |
|-------|-----|-----|--------|
| **sessionStorage** | e.g. `hotelApp.lastSearch` | Single "last search" object for the current tab/session. Survives refresh, cleared when tab closes. | 1 |
| **localStorage** | e.g. `hotelApp.recentSearches` | List of recent searches (same canonical shape as last search). For future "Recently searched" section on homepage. | **10** |
| **localStorage** | e.g. `hotelApp.recentHotels` | List of recent hotels (e.g. by `hotelId`; can store minimal payload like `{ hotelId, name?, viewedAt? }`). For future "Recently viewed hotels" section on homepage. | **10** |

- **lastSearch:** sessionStorage — drives search bar prefill and Back-to-list.
- **Recent searches:** localStorage, **max 10**. Push new search on each successful results load or search submit; evict oldest when over 10. **For now: capture the data only; no homepage UI yet.** See `docs/FUTURE_PLANS.md`.
- **Recent hotels:** localStorage, **max 10**. Push (or move to front) when user opens a hotel detail page; key by `hotelId`; evict oldest when over 10. **For now: capture the data only; no homepage UI yet.** See `docs/FUTURE_PLANS.md`.

**What to store**

Canonical object that matches the results URL query shape so we can build `/results?…` from it:

- `mode`, `placeId`, `placeName`, `placeAddress?`, `placeTypes?`, `aiSearch?`
- `checkin`, `checkout`, `occupancies` (serialized as used in URL)
- `currency?`, `nationality?`
- Filter/sort params if present: `refundableOnly`, `minPrice`, `maxPrice`, `name`, `stars`, `minRating`, `sort`, etc.

Same schema as the results page canonical query (Phase 2). Use a shared serializer/deserializer (e.g. from URL or a small `lastSearch.ts` util).

**When to write**

| Place | When |
|-------|------|
| **Results page** | After a successful search load; and whenever the results URL is updated (user changed filters, sort, or core params). Write current URL params to `lastSearch`. |
| **Home page** | When user submits search (navigates to results). Write the params they submitted to `lastSearch`. |
| **Hotel detail page** | Whenever the user **commits** a change to dates or occupancies (e.g. Search modal "Done" or "Search", or inline bar update). Write the new dates/occupancies (and current place from context) to `lastSearch`. |

Detect "all changes" by writing on every commit of place/dates/occupancies (and filters when applicable): form submit, modal confirm, or explicit "Update search" — not on every keystroke.

**When to read**

| Place | When |
|-------|------|
| **Home page** | On mount (and when opening the search bar if it's in a modal): read `lastSearch` and **prefill** the search bar: place (placeId, placeName, placeAddress, placeTypes), checkin, checkout, occupancies. So the bar always shows last searched place, dates, and occupancies. |
| **Any page with search bar** | Same as home: when the search bar is shown, prefill from `lastSearch`. |
| **Results page** | Results page uses **URL as source of truth**; do not override URL from `lastSearch`. Optional: if user lands on `/results` with no params, redirect or prefill from `lastSearch` and then navigate to `/results?${params}`. |
| **Hotel detail page** | When opening the search bar/modal, prefill from `lastSearch`. After they change dates/occupancies and commit, write to `lastSearch` (see above). |

**Back from hotel detail to list**

- User expectation: "Back" returns to the list that matches their **latest** search (including any dates/occupancies they changed on the hotel page).
- **Recommended behaviour:** On the hotel detail page, treat "Back to results" as navigation to the **current last-search params**, not necessarily the URL they came from. So: Back button (or browser Back) should go to `/results?${serialize(lastSearch)}`. That way, if they changed dates/occupancies on the hotel page (already written to `lastSearch`), the list re-runs with those params and they see results for their latest choice.
- **Implementation options:** (A) Hotel page "Back" uses `router.push(\`/results?${params}\`)` with params from `lastSearch` (so one step back = list with latest search). (B) Use browser history as usual; when results page mounts, compare URL to `lastSearch` and if they differ (e.g. user changed dates on hotel), optionally prompt "Update list to your new dates?" or auto-navigate to `lastSearch`. Recommendation: **A** — Back from hotel goes to `/results?${lastSearch}` so the list always reflects the last search without an extra prompt.

**Where to implement**

| Area | Responsibility |
|------|----------------|
| **Shared util** | `getLastSearch()`, `setLastSearch(payload)` (sessionStorage). `getRecentSearches()`, `pushRecentSearch(payload)` — localStorage, max 10, evict oldest. `getRecentHotels()`, `pushRecentHotel({ hotelId, name?, viewedAt? })` — localStorage, max 10, dedupe by hotelId (move to front if exists), evict oldest. Optional: `serializeLastSearchToQuery(params)`, `parseQueryToLastSearch(searchParams)` for results URL. |
| **Results page** | On successful load and on URL change: `setLastSearch(currentParams)` and `pushRecentSearch(currentParams)` (so recent searches list is populated). |
| **Home page** | On mount / when opening search bar: `getLastSearch()` and prefill. On search submit: `setLastSearch(submittedParams)` then navigate. (Recent searches/hotels are read only when we add homepage sections later.) |
| **Hotel detail page** | On opening search bar/modal: prefill from `getLastSearch()`. On commit of date/occupancy change: `setLastSearch(updated)`. On mount or when hotel is viewed: `pushRecentHotel({ hotelId, name })` so we capture recent hotels. "Back to results": `router.push(\`/results?${serializeLastSearchToQuery(getLastSearch())}\`)`. |
| **Layout / search bar component** | Prefill from `getLastSearch()` when it mounts or opens; on "Search", update `lastSearch` before navigation. |

**Done:** Shared util `src/lib/lastSearch.ts`: `getLastSearch()`, `setLastSearch()`, `lastSearchResultsUrl()`, `getRecentSearches()`, `pushRecentSearch()`, `getRecentHotels()`, `pushRecentHotel()`. Home prefills from lastSearch on mount and writes on submit; results page writes lastSearch on URL change and pushes to recent on successful load; optional redirect from `/results` with no params to lastSearch URL. Hotel page: Back uses lastSearch URL; setLastSearch on modal commit; pushRecentHotel on view; modal prefills from lastSearch when URL params missing.

**Exit criteria:** Home (and any search bar) shows last place, dates, occupancies; changing dates/occupancies on hotel page updates last search; Back from hotel goes to list with latest search params. Recent searches (max 10) and recent hotels (max 10, by hotelId) are written to localStorage; no UI for these lists yet (see `docs/FUTURE_PLANS.md`).

---

### Phase 4: Hotel details fix and cache

| Step | What | Notes |
|------|------|--------|
| 4.1 | **Canonical fields** | In the code that processes `getHotelDetails` response, read `data.rating`, `data.reviewCount`, `data.starRating` first; keep snake_case/alternate fallbacks. |
| 4.2 | **Enrich count** | Increase “first N hotels” to enrich from 40 to 60–80 (or configurable). |
| 4.3 | **Enrich in sorted order (so "first" = what users see first)** | The hotels we enrich must be the ones that appear at the **top of the list** on **first paint** — i.e. the **default "Recommended"** sort (same logic as the client uses for `sortOrder === "recommended"`). **Do not** enrich by raw API order (LiteAPI order is arbitrary). **Rule:** Before choosing which hotelIds to enrich, sort the rates response using the **same Recommended logic** as the client (e.g. API order preserved, or a defined mix of rating/price/relevance — document this in code). Take the first N (60–80) hotelIds from that sorted list and call `getHotelDetails` for those. Then when the user sees the default view (Recommended), the top-visible hotels will have rating/reviewCount. For "Price: Low to High", "Rating: High to Low", etc., some top-visible hotels may still be non-enriched; treat missing rating as 0 when sorting (so they go to the bottom for rating_desc) and show "—" / "No reviews" in the card. |
| 4.4 | **Details cache** | Add server-side cache for `getHotelDetails(hotelId, language)` keyed by `hotelId` + `language`, TTL e.g. 1 hour. Use in the search route. |
| 4.5 | **Missing ratings** | UI: show “—” or “No reviews” when `reviewCount`/`rating` absent; do not hide the hotel. |
| 4.6 | **Cascaded enrichment (wave 2+)** | After wave 1, client requests details for more hotelIds in batches via batch API; merge when they arrive. Use same canonical order (default Recommended sort). See **Cascaded enrichment** and **Filtering and cascaded enrichment** below. |

**What happens to non-enriched hotels (e.g. when user sorts "Price: Low to High")**

- Non-enriched hotels **stay in the list**. They have price, name, photo (from rates/includeHotelData), and any data already in the rates response; they just lack `rating` and `reviewCount` (and optionally `starRating`) from the details API.
- **Display:** The list card shows "—" or "No reviews" (and no stars) where rating/reviewCount would be. The hotel is not removed or greyed out.
- **Sort by price (low to high or high to low):** They appear in the correct price position; no special treatment. Many will have details if they were in the first N in the default Recommended order (wave 1).
- **Sort by rating (high to low):** Treat missing rating as **0** when comparing (e.g. `(b.rating ?? 0) - (a.rating ?? 0)`). Non-enriched hotels then sort to the **bottom** of the list; they remain visible when the user scrolls.

**Cascaded enrichment (wave 2+)**

- **Wave 1:** Server enriches first N (60–80) by **default Recommended sort** in the initial response (already in step 4.3). Client receives the list with `hotelDetailsByHotelId` for those — first paint matches this order.
- **Wave 2+:** Client requests details for **more** hotelIds in batches (e.g. next 80: indices 80–159 in the same canonical order — **default Recommended sort**). Use a **batch details API** (e.g. `POST /api/hotel/details/batch` with `{ hotelIds: string[] }`) that returns `{ hotelDetailsByHotelId }`; server calls `getHotelDetails` for each id (with cache and a concurrency cap) and aggregates. When each batch response arrives, client **merges** into existing `hotelDetailsByHotelId` and re-renders. Same canonical order as wave 1: sort full list by Recommended once, then wave 1 = 0..(N-1), wave 2 = N..(2N-1), etc.
- **When to request wave 2+:** After wave 1 is shown, trigger the next batch when (a) user scrolls near the bottom of the list, or (b) after a short delay (e.g. 2 s). One batch in flight at a time (or a small concurrency limit) to avoid thundering herd. Stop when all hotelIds in the current result set have been requested (or cap total e.g. 200–300 for cost).
- **Server:** Batch endpoint should use the same details cache (step 4.4) and a concurrency limit (e.g. 10–20 parallel `getHotelDetails` per batch) so it doesn’t overload LiteAPI.

**Filtering and cascaded enrichment**

| Scenario | Behaviour |
|----------|-----------|
| **Client-side filter/sort change** (refundable, price range, property name, sort by price/rating) | **No reset.** Same result set; we only re-apply filter/sort to the current list. Continue merging wave 2+ details as they arrive; re-run client-side filter/sort so the list updates with more ratings over time. No new search; no need to cancel or re-key batches. |
| **Server-side filter change** (star rating, min rating, facilities) | **New search = new result set.** Set a **current search signature** (e.g. params hash: placeId, dates, occupancies, plus server-side filter params). When the new search response arrives, (1) replace the list and wave-1 details with the new response, (2) **cancel** any in-flight wave 2+ request(s) for the previous search, (3) **ignore** any wave 2+ response that returns after the new search and whose signature doesn’t match the **current** signature. Only merge batch details when the batch’s search signature matches the current one. Then start wave 2+ for the **new** list (same canonical order: default Recommended sort over the new list). |
| **Request identity for batches** | Each wave 2+ request (or the client’s merge) is tied to a **search signature** (e.g. hash of placeId + checkin + checkout + occupancies + server-side filter params). When a batch returns, only merge into state if `signature(batch) === currentSearchSignature`. If the user changed server-side filters in the meantime, discard the batch. |

**Exit criteria:** More list cards show rating/reviewCount; enriched set = first N by **default Recommended sort** so first paint (Recommended view) is covered; cache reduces duplicate details calls; non-enriched hotels remain in list with "—" / "No reviews" and sort correctly (rating = 0 for rating_desc). Cascaded: wave 2+ batches requested in same order (Recommended), merged when they arrive; client-side filter/sort does not reset; server-side filter change resets search signature and cancels/ignores old batches.

### Phase 5: Not proceeding (streaming cancelled)


We are **not** implementing LiteAPI streaming. All search uses the **non-stream** API: `POST /api/rates/search` returns full JSON (main + refundable in parallel, then enrichment). Phases 5.5, 6, 7, 8, 9 use this non-stream path only. The backup file (`route.non-stream.backup.ts`) is kept for reference.

### Phase 5.5: Full debounced background search (modal) — optimize for speed & UX

**Goal:** Run hotel searches in the background while the user is still in the search modal (selecting location, dates, guests). When they click “Show Results,” the search is already finished or nearly finished so results feel instant. Optimize for perceived performance; API call count is secondary.

**Flow**

1. User opens search modal (home, results bar, or hotel detail).
2. User selects **location** (place or aiSearch) → start a background search with **current** params (use default dates/occupancy if not yet set).
3. User changes **dates** or **occupancy** (rooms, adults, children) → each change resets the debounce timer; after inactivity, a new background search runs.
4. When user clicks **“Show Results”**: if we have a completed result whose params match current params, navigate to results and use it (instant). If not, run one search and then navigate (or navigate and let results page run it). Never show results for params that don’t match the user’s current choices.

**Implementation rules**

| Rule | What | Why |
|------|------|-----|
| **Debounce (different times)** | **First** search after location selected: **0.5 s** inactivity. **Later** searches (after date/occupancy change): **1.5 s** inactivity. Reset timer on every relevant change. | Start initial search quickly; avoid spamming API on rapid date/occupancy tweaks. |
| **Cancel in-flight** | When the user changes location, dates, or occupancy, **cancel** the current in-flight request (AbortController) and, after debounce, start a new one. | Prevents an older request from finishing and overwriting the correct result. |
| **Major vs minor** | Trigger background search **only** for: **location** (placeId/aiSearch), **dates** (checkin, checkout), **occupancy** (rooms, adults, children). **Do not** trigger for filters (star, price, amenities, etc.) — those are applied client-side on the results page. | Keeps background search aligned with what actually changes the result set; filters don’t need a new API call from the modal. |
| **No duplicate** | Before starting a background search, compare **current params** (location, dates, occupancy) to **last searched params**. Only run if they are **different**. Store last searched params when a search is started (or completes). | Avoids redundant identical requests. |
| **Request identity (critical)** | Every request is tagged with a **params signature** (e.g. hash or serialized string of location + dates + occupancy). When a response completes, **only** accept it if its signature **matches the current params** at completion time. When user clicks “Show Results,” **only** use a cached/buffered result if its signature **matches current params**. Ignore or discard any result that doesn’t match. | Prevents a slow or late response from an older request from being shown; guarantees the user never sees results for the wrong search. |

**Risk mitigation**

| Risk | Mitigation |
|------|------------|
| Stale result shown | Request identity (above). Never apply a result to the UI or to “Show Results” unless params match. On “Show Results,” if no matching result exists, run one search (or navigate and let results page run it). |
| Too many calls | Debounce (0.5s / 1.5s) and cancel in-flight reduce bursts. Duplicate check avoids same search twice. Accept that some background searches may be abandoned when user closes modal or changes params. |
| Search in background | Run a **non-stream** fetch (`POST /api/rates/search`); when the response completes, store the JSON. When user clicks "Show Results," if stored result params match current params, use it and navigate; otherwise run one search (or navigate and let results page run it). Use AbortController to cancel the fetch when params change. *(Phase 5 streaming cancelled; no stream.)* |
| Modal closed before search completes | No-op: discard the result when modal closes if user didn’t click “Show Results.” Don’t navigate automatically. Optional: still cache by params so if they reopen and pick same params, you could reuse later (low priority). |
| Race: two requests in flight | Only one “current” request per modal session; starting a new one cancels the previous. Request identity ensures that if an old request somehow completes after a new one started, its result is ignored. |

**Where to implement**

| Area | Responsibility |
|------|----------------|
| **Shared hook or util** | `useBackgroundSearch()` or equivalent: holds debounce timer, AbortController, `lastSearchedParams`, `cachedResultBySignature` (or single cached result + signature). Exposes `startBackgroundSearch(params)`, `getResultForParams(params)`, `cancel()`. Params = canonical shape (mode, placeId, placeName, placeTypes?, aiSearch?, checkin, checkout, occupancies). |
| **Search modal** | When location is selected (and when dates/occupancy change): call `startBackgroundSearch(currentParams)` so debounce runs. On “Show Results”: read `getResultForParams(currentParams)`. If hit, navigate to `/results?${params}` and pass the cached result to the results page (e.g. via React state, context, or sessionStorage key) so it can render immediately without refetch. If miss, navigate with params only; results page runs search as today. Clear or cancel background search when modal closes. |
| **Results page** | On mount: if received a preloaded result (e.g. from navigation state or sessionStorage) and its params match URL params, render it immediately and optionally mark as “from background search.” If no preloaded result or params don’t match, run search as normal (non-stream). |
| **AbortController** | Pass `signal` from AbortController into the fetch call for the background search; call `abort()` when params change (before starting new search) or when modal closes. |

**Params signature**

- Use a **stable serialization** of the “major” params: e.g. `mode`, `placeId` or `aiSearch`, `placeName`, `checkin`, `checkout`, `occupancies` (serialized). Same as used for “no duplicate” comparison and for URL. Do not include filters in the signature for background search.

**Exit criteria:** Selecting location starts a background search after 0.5 s; date/occupancy changes debounce (1.5 s) and cancel in-flight; “Show Results” shows results instantly when a matching background result exists; user never sees results for wrong params; modal close cancels and discards in-flight search.

---

### Phase 6: Client-side filters and Filters button

- Refundable, sort, price range, property name, board type: client-side; no new request; state in URL. Filters panel (button) includes these and, when implemented, server-side filters.
- When user changes **server-side** filters (star, min rating, facilities): one new request to the current search API, loading state, URL updated.

**Implemented:** Filters panel (Refundable only, Sort, Min/Max price, Property name, Star rating 3/4/5★, Min guest rating). Client-side filters (refundable, price, name) applied to list and reflected in URL; star rating and min rating sent to API and trigger a new search when changed. URL schema and parse/serialize in `results-query.ts`; API accepts `starRating` and `minRating` in `route.non-stream.backup.ts`. Board type left for when list data supports it; see `docs/FILTERS_AND_CACHING.md`.

### Phase 7: Server-side filters and cache

- Add `starRating`, `minRating`, `minReviewsCount`, `facilities` to request body and LiteAPI params; include in cache key; same as in `HOTEL_LIST_IMPROVEMENT_PLAN.md` Phase 3.

**Implemented:** `starRating` and `minRating` were already in the API and URL. Added `minReviewsCount` and `facilities` (and optional `strictFacilityFiltering`) to: `RatesSearchParams` and `buildRatesRequestBody` in `src/lib/liteapi.ts`; request body parsing and `baseParams` in `app/api/rates/search/route.non-stream.backup.ts`; URL schema in `src/lib/results-query.ts` (parse/serialize/build); results page sends them in the search request body. In-memory server cache for full search response: key = canonical string of mode, placeId, aiSearch, checkin, checkout, occupancies, currency, language, guestNationality, timeout, margin, additionalMarkup, starRating, minRating, minReviewsCount, facilities, strictFacilityFiltering; TTL 3 minutes. Cache check before the two parallel LiteAPI calls; on hit return cached payload; on miss run search and store result in cache.

### Phase 8: Lazy-load “Show all properties”

- Button after results load completes; second request without quality filters; dedupe and append with separator.
- **Implemented:** Results page shows "Show all properties" when the current search used quality filters (stars, minRating, minReviewsCount, facilities). On click, a second `POST /api/rates/search` is sent with same params but without those filters; response is deduped by `hotelId` and appended below a "Budget & unrated options" separator. Merged prices/refundable/details used for both segments; client-side filters and sort apply to both.

### Phase 9: Polish — clear end-user error messages and behaviour

**Principle:** Show **clear, friendly, actionable** messages to the user. Avoid red boxes with technical codes or vague text like "Failed to search", "No properties", or "No rates". Every error state should explain what happened and what the user can do next.

**Error scenarios and recommended user-facing copy**

| Scenario | Cause | User-facing message (example) | Action |
|----------|--------|-------------------------------|--------|
| **Search failed (network / server)** | Request failed, 5xx, or timeout | "We couldn't load results right now. Please check your connection and try again." | Show "Try again" button that retriggers the search. |
| **Search took too long** | Client or server timeout | "The search is taking longer than usual. Try again in a moment, or adjust your dates or destination." | "Try again" button. |
| **No hotels found** | API returned success but 0 hotels for this search (place + dates + filters) | "No hotels found for [location] on these dates. Try different dates or search a nearby area." | No red error; use neutral/muted styling. Same as empty state. |
| **No rates / no availability** | Hotels returned but no prices (e.g. no availability for dates) | "We don't have availability for these dates in [location]. Try changing your dates or looking at a nearby area." | Suggest date or area change. |
| **Filters too strict** | Search succeeded but client-side filters removed all (e.g. refundable + price) | "No hotels match your current filters. Try changing refundable, price range, or property name." | Already in place; keep copy and styling consistent. |
| **Invalid or missing search params** | 400 from API (e.g. missing placeId, invalid dates) | "Something's missing in your search. Please check destination, dates, and guests and try again." | Don't show raw validation message; generic friendly line. |
| **Aborted (e.g. user navigated away)** | AbortController / user left | No message; do not set error state. | Already handled (didAbort). |

**Implementation**

| Where | What |
|-------|------|
| **API (search route)** | Return a stable **error shape**: e.g. `{ error: { message: string, code?: string } }`. Prefer **user-friendly** `message` when possible (e.g. "No availability for these dates" instead of "No rates"). For 400 validation, message can be short; client will replace with generic copy. Optionally add `code` (e.g. `TIMEOUT`, `NO_RESULTS`, `NO_RATES`) so the client can map to the right copy. |
| **Client (results page)** | **Do not** display `json?.error?.message` raw if it looks technical. Map by status and optional `code`: e.g. 408 or timeout → "search is taking longer..."; 4xx → "Something's missing..."; 5xx or network error → "We couldn't load results..."; success but 0 hotels → empty state copy above. Use a single **error/empty state component**: consistent typography, muted or warning style (not necessarily bright red), and a primary "Try again" or "Change search" CTA where useful. |
| **Empty states** | Keep "No hotels found..." and "No hotels match your current filters..." as they are; treat them as **empty states**, not errors (neutral tone, no red). |
| **Timeouts and retries** | Keep existing timeout behaviour (e.g. rates timeout in API). Optional: client-side retry once on failure before showing the error message, or a "Try again" button that re-runs the same search. |

**What not to do**

- Do not show raw API error messages (e.g. "placeId is required for place mode") to the end user.
- Do not use a harsh red-only box for every failure; reserve strong red for critical/blocking cases if at all, and use calmer styling for "no results" and "try again".
- No streaming fallback or stream-specific polish; search is non-stream only.

**Exit criteria:** Every failure path shows a clear, actionable message and (where appropriate) a "Try again" or search-change CTA; no technical codes or vague "Failed to load results"; empty states and error states are distinct and consistently styled.

**Background search (hotel details / results / home): debounce and latest selection**

- Ensure the background search always uses the **user’s current selection** (dates, guests, place), not an older one. The debounce must not cause a run with stale params.
- **Hook (`useBackgroundSearch`):** Return a **stable** object from the hook (e.g. `useMemo`) so consumers’ `useEffect` dependencies don’t change every render and reset the debounce timer on every keystroke/re-render. When the debounced callback runs, use the params for **that** scheduled run (e.g. store in a ref when scheduling and read in the callback) so the request always matches the selection that was current when the timer was set.
- **Consumers (hotel page, results, home):** Effect that calls `startBackgroundSearch` should depend only on modal open state and the actual search params (place, dates, occupancies). With a stable hook return value, the effect runs only when those params change, so the debounce runs to completion with the correct params.

---

## Summary table

| Phase | Focus |
|-------|--------|
| 0 | Nationality default EG; optional param for future picker |
| 1 | Place `types` in API/URL/state; search-type detection; autocomplete icons |
| 2 | URL as single source of truth for results |
| 3 | Backup current search route (non-stream) |
| **3.5** | **Last-search persistence: sessionStorage; search bar prefills (home, hotel detail); Back from hotel to list with latest params** |
| 4 | Hotel details: canonical fields, enrich 60–80 in sorted order, cache, missing-data UI; cascaded enrichment (wave 2+) with filtering rules |
| 5 | Not proceeding (streaming cancelled); search path is non-stream only |
| **5.5** | **Full debounced background search in modal: 0.5s/1.5s debounce, cancel in-flight, request identity, instant “Show Results” when params match** |
| 6 | Client-side filters and Filters button |
| 7 | Server-side filters and cache |
| 8 | Lazy-load “Show all properties” |
| 9 | Polish: clear end-user error messages, map scenarios to friendly copy, "Try again" CTA, no technical/red-only errors |

---

## Reference

- **LiteAPI Stream Hotel Rates:** https://docs.liteapi.travel/docs/stream-hotel-rates  
- **LiteAPI Displaying Hotel Details:** https://docs.liteapi.travel/docs/displaying-hotel-details  
- **Existing plans:** `docs/HOTEL_LIST_IMPROVEMENT_PLAN.md`, `docs/FILTERS_AND_CACHING.md`
- **Future features:** `docs/FUTURE_PLANS.md` (scrappy bullet list; includes Recent searches / Recent hotels homepage sections)  
- **Search API:** `app/api/rates/search/route.ts` (non-stream); `route.non-stream.backup.ts` (reference only)  
- **Places API:** `app/api/places/route.ts`  
- **LiteAPI client:** `src/lib/liteapi.ts`
