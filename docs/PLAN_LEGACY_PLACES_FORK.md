# Implementation Plan: Legacy Google Places Fork (Temporary) & Easy Revert

**Status:** Ready for implementation  
**Goal:** Run the app on legacy Google Places API until Places API (New) is enabled; revert with one env flip.

**Contract:** Frontend and `PlaceSuggestion` stay unchanged. Only backend routes and adapters switch between New and Legacy via `USE_LEGACY_GOOGLE_PLACES`.

---

## Phase 1: Environment & Feature Flag

**Objective:** Add a single switch so routes can choose Legacy vs New. No behavior change until later phases.

### 1.1 Environment variable

**File:** `.env.example`

Add:

```bash
# Use legacy Google Places (autocomplete + details) when Places API (New) is not enabled.
# Set to false or remove once New API is available.
# USE_LEGACY_GOOGLE_PLACES=true
```

**File:** `.env.local` (local only; do not commit)

Set when using legacy:

```bash
USE_LEGACY_GOOGLE_PLACES=true
```

### 1.2 Read flag in code

**File:** `src/lib/places-api-config.ts` (new)

Create a small module so all places-related routes use one source of truth:

```typescript
/**
 * Feature flag for Google Places backend.
 * When true, API routes call Legacy Places (autocomplete + details).
 * When false or unset, routes use Places API (New).
 * Revert to New API by setting USE_LEGACY_GOOGLE_PLACES=false or removing the env var.
 */
export const USE_LEGACY_GOOGLE_PLACES =
  process.env.USE_LEGACY_GOOGLE_PLACES === "true";
```

**Completion:** Env var documented; `USE_LEGACY_GOOGLE_PLACES` is importable. No route logic changed yet.

---

## Phase 2: Legacy Response Adapters

**Objective:** Implement mappers that turn legacy API responses into the same shapes the app already uses (New-like). Routes will call these when the flag is true.

### 2.1 Adapter module

**File:** `src/lib/legacy-places-adapter.ts` (new)

Implement two functions so the rest of the app never sees legacy shapes.

**Legacy autocomplete response type (for reference):**

```typescript
// Legacy: GET .../place/autocomplete/json → { predictions: [...], status }
interface LegacyAutocompletePrediction {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
}
```

**Function 1: `mapLegacyAutocompleteToNewShape(legacyResponse)`**

- Input: `{ predictions: LegacyAutocompletePrediction[], status: string }`
- Output: `{ suggestions: GoogleAutocompleteSuggestion[] }` (same shape as New API so `processPredictions` works)
- Map each prediction:
  - `place_id` → `placePrediction.placeId`
  - `description` → `placePrediction.text.text`
  - `structured_formatting.main_text` → `placePrediction.structuredFormat.mainText.text`
  - `structured_formatting.secondary_text` → `placePrediction.structuredFormat.secondaryText.text`
  - `types` → `placePrediction.types`
- If `status !== "OK"` or no predictions, return `{ suggestions: [] }`.

**Legacy details response type (for reference):**

```typescript
// Legacy: GET .../place/details/json → { result: {...}, status }
interface LegacyPlaceDetailsResult {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  types?: string[];
}
```

**Function 2: `mapLegacyDetailsToNewShape(legacyResult)`**

- Input: `LegacyPlaceDetailsResult` (the `result` object from legacy details response)
- Output: New API–shaped object that `normalizePlace()` accepts (see `PlaceDetailsResponse` in `normalize-location.ts`):
  - `place_id` → `id` and `placeId`
  - `name` → `displayName`
  - `formatted_address` → `formattedAddress`
  - `geometry.location` → `location: { latitude, longitude }`
  - `address_components` → `addressComponents: [ { longText: long_name, shortText: short_name, types } ]`
  - `types` → `types`; set `primaryType` from `types[0]` if present

**Completion:** Both functions implemented and exported. Unit tests optional but recommended.

---

## Phase 3: Autocomplete Route – Legacy Branch

**Objective:** When `USE_LEGACY_GOOGLE_PLACES` is true, call legacy autocomplete and return New-like response. Otherwise keep current New API behavior.

### 3.1 Legacy autocomplete request

- **URL:** `GET https://maps.googleapis.com/maps/api/place/autocomplete/json`
- **Query params:** `input`, `key`, `sessiontoken`, `language`. Optional: `location` and `radius` for bias (e.g. center 26.8206,30.8025 and radius 2000000 for MENA).
- **Response:** `{ predictions: [...], status }`

### 3.2 Route changes

**File:** `app/api/google-places/autocomplete/route.ts`

1. At top: `import { USE_LEGACY_GOOGLE_PLACES } from "@/lib/places-api-config";` and `import { mapLegacyAutocompleteToNewShape } from "@/lib/legacy-places-adapter";`
2. After parsing body and validating `input`/key:
   - **If `USE_LEGACY_GOOGLE_PLACES`:**
     - Build legacy URL with `input`, `key=apiKey`, `sessiontoken=sessionToken`, `language=languageCode` (map "ar"|"en" to e.g. "ar" or "en").
     - Optional: add `location=26.8206,30.8025&radius=2000000` for bias.
     - `fetch` the GET URL.
     - If not ok, return same error pattern as today (status + optional detail).
     - Parse JSON, run `mapLegacyAutocompleteToNewShape(data)`.
     - Apply **same server-side content filter** as today (e.g. `shouldFilterPlace` on each prediction’s placeId) to the mapped `suggestions`.
     - Return `NextResponse.json(mapped)`.
   - **Else:** Keep existing New API POST logic unchanged.
3. Ensure both paths return the same response shape so the client never needs to branch.

**Completion:** Autocomplete works with legacy when flag is true; with New when flag is false. Client and `processPredictions` unchanged.

---

## Phase 4: Place Details Route – Legacy Branch

**Objective:** When `USE_LEGACY_GOOGLE_PLACES` is true, call legacy place details and return New-shaped object. Otherwise keep current New API behavior.

### 4.1 Legacy place details request

- **URL:** `GET https://maps.googleapis.com/maps/api/place/details/json`
- **Query params:** `place_id`, `key`, `session_token`, `fields=name,formatted_address,geometry,address_components,types`
- **Response:** `{ result: {...}, status }`

### 4.2 Route changes

**File:** `app/api/google-places/details/route.ts`

1. At top: `import { USE_LEGACY_GOOGLE_PLACES } from "@/lib/places-api-config";` and `import { mapLegacyDetailsToNewShape } from "@/lib/legacy-places-adapter";`
2. After validating `placeId` and applying `isPlaceIdRestricted`:
   - **If `USE_LEGACY_GOOGLE_PLACES`:**
     - Build legacy URL with `place_id`, `key=apiKey`, `session_token=sessionToken`, `fields=name,formatted_address,geometry,address_components,types`.
     - `fetch` the GET URL.
     - If not ok or status in body !== "OK", return appropriate error (e.g. 404).
     - Parse JSON, run `mapLegacyDetailsToNewShape(data.result)`.
     - Apply **same country restriction** as today: read country from mapped `addressComponents`, call `isCountryRestricted(countryCode)`; if restricted, return 404.
     - Return `NextResponse.json(mapped)` so client’s `normalizePlace()` receives New-shaped object.
   - **Else:** Keep existing New API GET + field mask logic unchanged.
3. Both paths must return a body that `normalizePlace()` can consume.

**Completion:** Place details works with legacy when flag is true; with New when flag is false. Client and `normalizePlace` unchanged.

---

## Phase 5: Testing & Documentation

**Objective:** Verify legacy path end-to-end and document revert steps.

### 5.1 Testing checklist

- [ ] With `USE_LEGACY_GOOGLE_PLACES=true` and valid legacy API key:
  - [ ] Open search modal, type 2+ characters; autocomplete returns suggestions (no 403).
  - [ ] Select a suggestion; place details load; no console/network errors.
  - [ ] Selected place shows correct name/address; search runs and results page works.
- [ ] With `USE_LEGACY_GOOGLE_PLACES=false` (or var unset) and New API enabled:
  - [ ] Same flow uses New API; behavior matches pre-fork (when New was used).

### 5.2 Revert checklist (when New API is available)

1. Set `USE_LEGACY_GOOGLE_PLACES=false` in `.env.local` (or remove the variable and treat absence as “use New” in `places-api-config.ts` if desired).
2. Ensure `GOOGLE_MAPS_API_KEY` is the key that has **Places API (New)** enabled.
3. Restart the dev server / redeploy.
4. No changes needed to: SearchModal, `PlaceSuggestion`, `processPredictions`, `normalizePlace`, `useGooglePlacesSession`, `google-place-details.ts`.
5. Optional: remove legacy branches and adapter code, or leave them behind the flag.

**Completion:** Legacy fork verified; revert steps documented and tested.

---

## Reference: API & Data Shape Comparison

### Autocomplete

| Aspect | New API (current) | Legacy API |
|--------|-------------------|------------|
| Method / URL | POST `places.googleapis.com/v1/places:autocomplete` | GET `maps.googleapis.com/maps/api/place/autocomplete/json` |
| Auth | Header `X-Goog-Api-Key` | Query `key=` |
| Request | Body: `input`, `locationBias`, `languageCode`, `sessionToken` | Query: `input`, `language`, `sessiontoken` |
| Response | `suggestions[].placePrediction` (placeId, text, structuredFormat, types) | `predictions[]` (description, place_id, structured_formatting, types) |

### Place Details

| Aspect | New API (current) | Legacy API |
|--------|-------------------|------------|
| Method / URL | GET `places.googleapis.com/v1/places/{placeId}` | GET `maps.googleapis.com/maps/api/place/details/json` |
| Auth | Headers: Api-Key, FieldMask, Session-Token | Query: `key=`, `session_token=` |
| Response | id, displayName, formattedAddress, location, addressComponents, types | result.place_id, name, formatted_address, geometry.location, address_components, types |

### What stays the same (no revert changes)

- **PlaceSuggestion** – unchanged
- **Client requests** – same body for `/api/google-places/autocomplete` and `/api/google-places/details`
- **SearchModal, results, LITEAPI** – no changes
- **processPredictions** – still receives New-like `suggestions`
- **normalizePlace** – still receives New-like details object

---

## Summary

| Phase | Deliverable |
|-------|-------------|
| 1 | Env var + `places-api-config.ts` with `USE_LEGACY_GOOGLE_PLACES` |
| 2 | `legacy-places-adapter.ts` with `mapLegacyAutocompleteToNewShape` and `mapLegacyDetailsToNewShape` |
| 3 | Autocomplete route: legacy branch + content filter; New path unchanged |
| 4 | Details route: legacy branch + country filter; New path unchanged |
| 5 | Testing checklist + revert checklist |

Revert = set `USE_LEGACY_GOOGLE_PLACES=false` (or remove var); no other code changes required.
