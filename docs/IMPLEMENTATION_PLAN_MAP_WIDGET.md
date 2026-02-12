# Implementation Plan: Google Maps Integration (Map + Search Bar)

**Decision:** We are **not** using the LiteAPI Map Widget. We will use **Google Maps** (Maps JavaScript API + Places API) for:

1. **Results page:** Interactive map with markers for our **filtered** search results, popups/cards, and optional map-driven “search this area.”
2. **Hotel page:** Single hotel address + a map (one marker or embed) using coordinates from hotel details.
3. **Search bar (later stage):** Replace LiteAPI `/data/places` with **Google Places** via **backend** so we control **biases** (location, country, types). This is deferred until map functionality is tested and access is correct.

**Priority:** Implement and **test map functionality first** (data foundation → hotel page map → results page map → optional map-driven search). Once the map works and API/key access is confirmed, **then** migrate the search bar to Google Places (backend).

---

## 1. Resolved Configuration and Decisions

- **Google Maps / Places API key:** Use the company key; store in environment (e.g. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Do not commit the raw key to the repo. Restrict the key by HTTP referrer (and/or by API) in Google Cloud Console. Maps JavaScript API and Places API should be enabled for the project; standard $200/month free credit applies.
- **LiteAPI geo search:** **Confirmed.** [LiteAPI POST /hotels/rates](https://docs.liteapi.travel/reference/post_hotels-rates) accepts **latitude, longitude, and radius** for location-based search. We will add the “Search this area” flow (map-driven search) using these parameters.
- **Hotel latitude/longitude:** We get them from the **same get-hotel-details flow** we already use for number of reviews (and rating, star rating): LiteAPI `GET /data/hotel` → `getHotelDetails()` / `getCachedHotelDetails()` / `extractHotelDetailsFromResponse()`. We add **location** to that extraction and pass-through (single details response, batch details, and search enrichment) so the map can use it. No separate “get hotel info” call; it’s the existing hotel details call extended to include `data.location`.
- **Search suggestions:** **Backend.** When we migrate places, `/api/places` will call Google Places API (with controllable biases) and return the same `PlaceSuggestion` shape. Deferred to the later “search bar → Google” phase.

---

## 2. API and Data Changes

### 2.1 Hotel data: expose `location` (latitude, longitude)

**Source:** Latitude/longitude come from the **same get-hotel-details call** we use for number of reviews (LiteAPI `GET /data/hotel`). We extend that flow to expose `data.location` everywhere we already expose rating/reviewCount/starRating.

**Single hotel details (`GET /api/hotel/details`)**

- **Current:** Returns full LiteAPI `/data/hotel` response; client types `HotelDetails` with `address`, `city`, `country` but not `location`.
- **Change:** Add to client-side `HotelDetails`: `location?: { latitude: number; longitude: number }`. The LiteAPI response already includes `data.location` (see [Displaying Hotel Details](https://docs.liteapi.travel/docs/displaying-hotel-details)); no backend change. Ensure the response is passed through unchanged so the client can read `data.location`.

**Batch hotel details (`POST /api/hotel/details/batch`)**

- **Current:** Returns `hotelDetailsByHotelId: Record<string, { rating?, reviewCount?, starRating? }>`. Uses `getCachedHotelDetails()` which returns `HotelDetailsData` (rating, reviewCount, starRating only). Raw LiteAPI `/data/hotel` includes `data.location`.
- **Change:**
  - In `src/lib/liteapi.ts`: Extend `HotelDetailsData` with `location?: { latitude: number; longitude: number }`. In `extractHotelDetailsFromResponse()`, read `data.location` (or `data.location?.latitude`, `data.location?.longitude`) and add to the returned object. Ensure `getCachedHotelDetails()` stores and returns this (cache value type updated).
  - In `app/api/hotel/details/batch/route.ts`: Extend the response type to include `location?` in each entry; when building `entry`, copy `details.location` from the cached/details result. Return `hotelDetailsByHotelId: Record<string, { rating?, reviewCount?, starRating?, location? }>`.

**Search route enrichment (optional but recommended)**

- **Current:** Non-stream search route enriches the first N hotels via `getCachedHotelDetails()` and attaches `hotelDetailsByHotelId` (rating, reviewCount, starRating) to the response.
- **Change:** Once `getCachedHotelDetails()` returns `location`, the same enrichment will provide `location` per hotel in `hotelDetailsByHotelId`. No change to the search route contract; the client will use `hotelDetailsByHotelId[id].location` for map markers when present.

### 2.2 Map-driven search (Phase 4)

- **Current:** Rates search accepts `mode: "place"` with `placeId` or `mode: "vibe"` with `aiSearch`. No latitude/longitude/radius in `buildRatesRequestBody()` or in the search route body.
- **Change:** LiteAPI [POST /hotels/rates](https://docs.liteapi.travel/reference/post_hotels-rates) supports **latitude, longitude, radius**. In `src/lib/liteapi.ts`, add to `RatesSearchParams`: `latitude?: number; longitude?: number; radius?: number` (radius in meters). In `buildRatesRequestBody()`, when these are set (e.g. for “search this area”), send them in the body per LiteAPI docs. In `app/api/rates/search` (and any route that builds the request), accept optional `latitude`, `longitude`, `radius` and pass through. Cache key and URL schema for results page should include these when present so “search this area” is bookmarkable/shareable.

### 2.3 Search bar: replace LiteAPI places with Google Places (later stage)

**Deferred until after map functionality is tested and access is correct.** When we implement:

- **Backend:** `GET /api/places?q=...&language=...` (optional: `lat`, `lng`, `radius`, `country` for biases) → call **Google Places API**. Map response to same shape: `placeId`, `displayName`, `formattedAddress`, `types`. Return `{ data: PlaceSuggestion[] }`. Use request query to set biases (`locationBias` / `locationRestriction` / `componentRestrictions`) so we control them from the server.
- **Client:** No change to `PlaceSuggestion` or SearchModal usage; only the backend data source changes. Optionally pass bias params as query params to `/api/places`.
- **Current (until then):** Keep LiteAPI `getPlaces()` → `/data/places` as-is.

---

## 3. Phased Implementation Plan

**Order:** **Phase 0** verifies the API key and a minimal map render before any structural changes. Then map functionality (Phases 1–4). Search bar migration to Google Places is **Phase 5 — Later**, after map is tested and access is correct.

---

### Phase 0 — API key check: minimal map in results filters

**Goal:** Confirm the Google Maps API key has correct access and that a map can render at all, without changing hotel data, batch details, or list structure. No real hotel markers yet — just a basic map as a sanity check.

| Step | Where | What |
|------|--------|------|
| 0.1 | Env | Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (company key); do not commit raw key. |
| 0.2 | Results page: filters block | Add a **Map** entry/button in the filters block (the same panel that has Sort, Refundable, Price range, etc.) so the user can open a “map view” or a section that contains the map. (If there was previously a map button that was removed, add it back.) |
| 0.3 | Results page: minimal map | When the user opens the map (e.g. via the new button or a “Map” tab/section inside the filters area), render a **single, basic Google Map**: load the Maps JavaScript API with the env key, create one map div (fixed height, e.g. 300–400px), center on any fixed coordinates (e.g. Cairo or a default city), no markers, no hotel data. Purpose: verify the script loads, the key is accepted, and the map tile layer displays. Handle load/init errors (e.g. invalid key, domain not allowed) with a simple message. |
| 0.4 | No other changes | Do not add `location` to hotel details, batch, or search. Do not add markers or popups. Do not change the list layout. This phase is only: button → open filters/map section → show one basic map. |

**Exit criteria:** On the hotels list (results) page, user can open the map (via the Map button in the filters block) and see a basic Google Map rendering successfully. If the API key or referrer is wrong, the UI shows a clear error instead of a blank area. Once this works, proceed to Phase 1.

---

### Phase 1 — Data foundation: hotel location everywhere

| Step | Where | What |
|------|--------|------|
| 1.1 | Client types | Add `location?: { latitude: number; longitude: number }` to `HotelDetails` on the hotel page. Use it when rendering the map block (Phase 2). |
| 1.2 | `src/lib/liteapi.ts` | Add `location?: { latitude: number; longitude: number }` to `HotelDetailsData`. In `extractHotelDetailsFromResponse()`, read `data.location` (and snake_case fallbacks if any) and set `out.location`. Ensure cached value includes `location`. |
| 1.3 | `app/api/hotel/details/batch/route.ts` | Include `location` in each `hotelDetailsByHotelId` entry (from `details.location`). Extend response type in a comment or type. |
| 1.4 | Results page types / usage | Extend the type for `hotelDetailsByHotelId` to include `location?`. When building map markers, use `hotelDetailsByHotelId[hotel.id]?.location`; fallback: no marker for that hotel if missing. |

**Exit criteria:** Single hotel details and batch details expose `location`; client can use it for maps.

---

### Phase 2 — Hotel page: address + map

| Step | Where | What |
|------|--------|------|
| 2.1 | Env / config | Reuse Google Maps API key from Phase 0 (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). If starting from Phase 2, add key to env; restrict by referrer in Google Cloud Console. |
| 2.2 | Hotel page | Ensure `details` includes `location` (from Phase 1). Add a “Location” or “Map” section below or next to the address block. |
| 2.3 | Map block | Either: (A) embed a small Google Map (Maps JavaScript API) with one marker at `details.location`, or (B) static map image (Google Static Maps API) with a marker, or (C) “View on map” link to `https://www.google.com/maps?q=lat,lng`. Recommendation: (A) for consistency with results map and better UX. Load Maps JS API once (e.g. via `@react-google-maps/api` or script loader), render map in a div, add one marker; only render when `details.location` is present. Use the same **styling and POI/clutter** approach as Phase 3 (step 3.7) so the hotel page map matches the results map. |
| 2.4 | No LiteAPI Map Widget | Do not load or reference the LiteAPI Map Widget on this page. |

**Exit criteria:** Hotel detail page shows address and a map (or map link) for the current hotel using `details.location`.

---

### Phase 3 — Results page: map with filtered hotels and popups

| Step | Where | What |
|------|--------|------|
| 3.1 | Load Google Maps | On the results page, load the Maps JavaScript API (script or dynamic import). Use the same API key as Phase 2. Ensure a single map instance per view (ref or guard to avoid duplicate init in React). |
| 3.2 | **Full-screen map view** | The map view **takes over the entire screen** (full-view mode). The map container fills the viewport; **filters remain available** on this full-screen map (e.g. filter bar at top: Sort, Popular, Price, Guest rating, etc.). Center/zoom: from first available `hotelDetailsByHotelId[id].location` or from a geocoded placeId (optional). If no locations available, show a message or hide the map. |
| 3.2b | **Close full screen → back to list with filters** | When the user closes the full-screen map (e.g. Close or back button), return them to the **hotel list (results) page** for their **current/last search**, with **all filters applied** (same URL and state). Do not lose search params, sort, refundable, price range, or other filters — the list they see after closing the map must match what they had before opening the map. |
| 3.3 | **Markers: rounded points with minimum rate + clustering** | Use the **filtered** list (same as the list view). For each hotel with `hotelDetailsByHotelId[hotel.id]?.location`, add a **rounded-point marker** that displays the **minimum rate** (e.g. “EGP6,581”) on the map — same pattern as Expedia/Booking.com. Use custom marker content (e.g. rounded rectangle, light background, price text). **Cluster** multiple properties at lower zoom or in dense areas: show a single grouped marker with count (e.g. “20 properties”, “30 properties”) that expands or navigates to the area when clicked. If many hotels lack location, optionally request batch details for visible hotel IDs and merge `location` when received. |
| 3.4 | **Hotel card on marker click (bottom of view)** | On marker click (single-hotel marker), open a **hotel card at the bottom of the view** (bottom sheet / overlay), not a small info window. Card should occupy roughly the bottom third of the screen and include: hotel image, name, star rating, location (e.g. area name), amenities (e.g. Pool), guest rating badge (e.g. “9.0 Wonderful” + review count), minimum rate and “total includes taxes & fees”, favorite icon, and close (X) button; primary CTA to go to hotel page. Reference: Expedia/Booking-style map card (see design screenshot). Style to match app. |
| 3.5 | Sync list and map | When the user changes filters or sort, the map markers and popups should reflect the same set (filtered hotels). Recompute visible hotels from the same source as the list; update markers accordingly. |
| 3.6 | Vibe search | For “vibe” (AI) search we may not have a single placeId for center. Option: center on bounds of markers; or hide map and show “Map available when you search by place.” |
| 3.7 | **Reduce clutter / design fit** | **Reduce or hide other points of interest (POIs)** so only our hotel markers stand out: e.g. set `clickableIcons: false` to disable interaction with default POIs; use a **custom mapId** with [Cloud-based map styling](https://developers.google.com/maps/documentation/javascript/cloud-customization/viz) to filter which map features (e.g. Lodging, Dining, Transit) are visible or to control [POI density](https://developers.google.com/maps/documentation/javascript/cloud-customization/poi-density). Ensure the map’s **look and design** (controls, container, info windows) fit the app’s visual style. |

**Exit criteria:** Map view is full-screen (entire viewport) with filters on it; closing the map returns the user to the hotel list for the same search with all filters applied (no state loss). Results page shows a Google Map with rounded-point markers showing minimum rate per hotel (and clustered “N properties” where appropriate); clicking a single-hotel marker opens a hotel card at the bottom of the view with image, name, stars, location, amenities, rating, price, and link to hotel page; list and map stay in sync; map has minimal POI clutter and matches app design.

---

### Phase 4 (Optional) — Map-driven “Search this area”

LiteAPI [POST /hotels/rates](https://docs.liteapi.travel/reference/post_hotels-rates) supports **latitude, longitude, radius**.

| Step | Where | What |
|------|--------|------|
| 4.1 | Backend | Add optional `latitude`, `longitude`, `radius` to rates search body and to `buildRatesRequestBody()`. When provided, send them per LiteAPI docs. Update search route and cache key. |
| 4.2 | Results page | On map `idle` (or a “Search this area” button), read map bounds or center + radius. Call search with lat/lng/radius (and current dates, occupancies, filters). Replace or merge results and update list + map markers. Optionally update URL so the view is shareable. |

**Exit criteria:** User can pan/zoom the map and trigger a new search for the visible area; results and markers update.

---

### Phase 5 — Later: Search bar → Google Places (backend)

**Do after map functionality is tested and API/key access is correct.**

| Step | Where | What |
|------|--------|------|
| 5.1 | Env / config | Same Google API key (Maps + Places); ensure Places API is enabled and key is allowed for server use if backend calls Google. |
| 5.2 | Backend | Refactor `/api/places` to call **Google Places API** (e.g. Find Place from Text or Autocomplete). Accept `q`, `language`; optionally `lat`, `lng`, `radius`, `country` for biases. Map response to `{ data: Array<{ placeId, displayName, formattedAddress, types }> }` to match current contract. Use request params for `locationBias` / `locationRestriction` / `componentRestrictions`. |
| 5.3 | Deprecate LiteAPI places | Remove `getPlaces()` from `/api/places`; keep LiteAPI for rates only. SearchModal continues to call `/api/places`; no client contract change. |

---

## 4. Summary of Call and Contract Changes

| Area | Current | After plan (map first) | Later (Phase 5) |
|------|--------|------------------------|-----------------|
| **GET /api/hotel/details** | Returns LiteAPI response; client types omit `location`. | No backend change. Client types add `location?` and use it for the map. | — |
| **POST /api/hotel/details/batch** | Returns only rating, reviewCount, starRating. | Also return `location?` per hotel (from extended `getCachedHotelDetails` / extraction). | — |
| **GET /api/places** | Calls LiteAPI `getPlaces` → `/data/places`. | Unchanged (keep LiteAPI). | Replace with **Google Places API**; same response shape; backend biases. |
| **Rates search (LiteAPI)** | placeId or aiSearch only. | Unchanged for Phases 1–3. Phase 4: optional latitude, longitude, radius. | — |
| **SearchModal** | Fetches `/api/places`, maps to PlaceSuggestion. | Unchanged. | Same contract; data source becomes Google via `/api/places`. |
| **Results page** | No map. | Google Map; markers from `hotelDetailsByHotelId[id].location`; popups with link to hotel. | — |
| **Hotel page** | Address only. | Address + map (or map link) using `details.location`. | — |

---

## 5. References

- [LiteAPI – POST /hotels/rates](https://docs.liteapi.travel/reference/post_hotels-rates) (latitude, longitude, radius for map-driven search)
- [LiteAPI – Displaying Hotel Details](https://docs.liteapi.travel/docs/displaying-hotel-details) (for `data.location`)
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) (map, markers, InfoWindow)
- [Cloud-based map styling – filter map features](https://developers.google.com/maps/documentation/javascript/cloud-customization/viz) (Phase 3.7: reduce POI clutter)
- [Control POI density](https://developers.google.com/maps/documentation/javascript/cloud-customization/poi-density) (optional, for map styling)
- [Google Places API](https://developers.google.com/maps/documentation/places) / [Places Autocomplete](https://developers.google.com/maps/documentation/javascript/place-autocomplete) (Phase 5: search bar, backend biases)
- **API key:** Store in env as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; do not commit raw key. Company key available.
- Existing: `PlaceSuggestion`, `isSpecificHotelPlace` in `src/lib/place-utils.ts`; `SearchModal` in `src/components/SearchModal.tsx`; `app/api/places/route.ts`; `app/api/hotel/details/batch/route.ts`; `src/lib/liteapi.ts` (`HotelDetailsData`, `extractHotelDetailsFromResponse`, `getCachedHotelDetails`, `buildRatesRequestBody`).
