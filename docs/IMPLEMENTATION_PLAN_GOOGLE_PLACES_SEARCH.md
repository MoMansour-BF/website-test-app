# Implementation Plan: Google Places Autocomplete & Distance-Based Sorting

**Status:** Draft  
**Target:** Revamp search bar/autocomplete + add distance-to-center sorting & radius filtering  
**Integration:** Google Places API + LITEAPI hotel rates

---

## Executive Summary

Replace the current LITEAPI `/data/places` autocomplete with Google Places Autocomplete API for full control over search experience, better type filtering, and location data. Add distance-to-center sorting and radius filtering to results page, enabling users to find hotels near specific points of interest (hotels, attractions, cities, etc.).

**Key Benefits:**
- Better autocomplete UX with Google's superior place data
- Location type awareness (country, city, hotel, airport, attraction)
- Normalized lat/lng for all selected places → distance-based sorting
- Cost-optimized with session tokens and client-side filtering
- Seamless integration with existing LITEAPI hotel rates flow
- **Multi-layer content filtering for restricted regions (Phase 3.5)**

**Security & Compliance:**
- Comprehensive content filtering at multiple layers (client, server, data)
- Restricted country codes and place IDs blocked from all search results
- No visibility of restricted locations in autocomplete, results, or maps
- Audit logging for compliance and monitoring

---

## Phase 1: Core Data Models & Types

### 1.1 Normalized Place Object

**File:** `src/lib/place-utils.ts`

**Update `PlaceSuggestion` interface:**

```typescript
export interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  /** Normalized type for routing/sorting logic */
  type: "country" | "city" | "hotel" | "airport" | "region" | "attraction";
  /** Original Google primaryType for debugging/logging */
  primaryType?: string;
  /** Geographic coordinates for distance calculations */
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2 country code (e.g. "EG", "SA") */
  countryCode: string;
  /** Full country name (e.g. "Egypt", "Saudi Arabia") */
  countryName: string;
}
```

**Add type mapping helper:**

```typescript
/**
 * Maps Google Places primaryType to our normalized type system.
 * Used for routing logic and distance-based sorting.
 */
export function mapGooglePlaceType(primaryType: string): PlaceSuggestion["type"] {
  switch (primaryType) {
    case "country":
      return "country";
    case "locality":
    case "postal_town":
      return "city";
    case "administrative_area_level_1":
    case "administrative_area_level_2":
      return "region";
    case "lodging":
    case "hotel":
      return "hotel";
    case "airport":
      return "airport";
    case "tourist_attraction":
    case "museum":
    case "park":
    case "shopping_mall":
    case "amusement_park":
    case "zoo":
    case "aquarium":
      return "attraction";
    default:
      return "city"; // Default fallback
  }
}

/**
 * Returns true if place type should use distance-to-center sorting.
 * Hotels, attractions, and airports benefit from proximity sorting.
 */
export function shouldSortByDistance(type: PlaceSuggestion["type"]): boolean {
  return type === "hotel" || type === "attraction" || type === "airport";
}
```

---

## Phase 2: Google Places Autocomplete Configuration

### 2.1 Autocomplete Request Builder

**File:** `src/lib/google-places-autocomplete.ts`

```typescript
/**
 * Google Places Autocomplete configuration for hotel search.
 * Uses New Places API (Place Autocomplete Data API).
 * Docs: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 */

/** Session token for cost optimization - one token per search session */
export function generateSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export interface AutocompleteRequestOptions {
  input: string;
  sessionToken: string;
  languageCode: "ar" | "en";
}

/**
 * Build autocomplete request for Google Places API.
 * Location bias: Egypt-centered with 2000km radius to cover MENA region.
 * No type filtering at request level - we filter client-side for flexibility.
 */
export function buildAutocompleteRequest(options: AutocompleteRequestOptions) {
  const { input, sessionToken, languageCode } = options;

  return {
    input,
    // Bias toward Egypt/MENA region (26.8206°N, 30.8025°E = Egypt center)
    locationBias: {
      circle: {
        center: { lat: 26.8206, lng: 30.8025 },
        radius: 2000000, // 2000km radius covers Egypt, Saudi Arabia, Jordan, etc.
      },
    },
    languageCode,
    sessionToken,
    // No type filtering - we want all results and will filter client-side
  };
}
```

### 2.2 Allowed Place Types & Priority Ranking

**File:** `src/config/place-types.ts`

```typescript
/**
 * Allowed Google Places primaryTypes for hotel search autocomplete.
 * We fetch all results, then filter to these types client-side.
 */
export const ALLOWED_PRIMARY_TYPES = [
  "country",
  "locality",
  "administrative_area_level_1",
  "lodging",
  "airport",
  "train_station",
  "bus_station",
  "tourist_attraction",
  "museum",
  "park",
  "shopping_mall",
  "amusement_park",
] as const;

/**
 * Priority ranking for autocomplete results.
 * Lower number = higher priority (shown first).
 * Prioritize places most relevant to hotel search.
 */
export const TYPE_PRIORITY: Record<string, number> = {
  country: 1,
  locality: 2,
  administrative_area_level_1: 3,
  airport: 4,
  lodging: 5,
  tourist_attraction: 6,
  museum: 7,
  park: 8,
  shopping_mall: 9,
  train_station: 10,
  bus_station: 11,
  amusement_park: 12,
};

/**
 * Extract country code from Google Places address components.
 * Returns ISO 3166-1 alpha-2 code (e.g. "EG", "SA").
 */
export function extractCountryCode(addressComponents: any[]): string | null {
  const countryComponent = addressComponents.find((c: any) =>
    c.types.includes("country")
  );
  return countryComponent?.short_name || null;
}
```

---

## Phase 3: Client-Side Prediction Filtering & Ranking

### 3.1 Process Autocomplete Predictions

**File:** `src/lib/process-predictions.ts`

```typescript
import { ALLOWED_PRIMARY_TYPES, TYPE_PRIORITY, extractCountryCode } from "@/config/place-types";

export interface RawGooglePrediction {
  placeId: string;
  description: string;
  structuredFormatting?: {
    mainText?: string;
    secondaryText?: string;
  };
  types?: string[];
  primaryType?: string;
  addressComponents?: any[];
}

/**
 * Filter and rank Google Places autocomplete predictions.
 * 
 * Logic:
 * 1. Filter to allowed place types only
 * 2. Sort by type priority (countries first, then cities, etc.)
 * 3. Within same priority, boost Egypt results (primary market)
 * 4. Limit to top N results (e.g. 8-10 for UX)
 */
export function processPredictions(
  predictions: RawGooglePrediction[],
  userLanguage: "ar" | "en"
): RawGooglePrediction[] {
  // Step 1: Filter to allowed types
  const filtered = predictions.filter((p) =>
    p.primaryType && ALLOWED_PRIMARY_TYPES.includes(p.primaryType as any)
  );

  // Step 2 & 3: Sort by priority + Egypt boost
  const ranked = filtered.sort((a, b) => {
    // Primary sort: type priority
    const priorityA = TYPE_PRIORITY[a.primaryType || ""] || 999;
    const priorityB = TYPE_PRIORITY[b.primaryType || ""] || 999;
    const priorityDiff = priorityA - priorityB;

    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort: boost Egypt in ties (primary market)
    const countryA = extractCountryCode(a.addressComponents || []);
    const countryB = extractCountryCode(b.addressComponents || []);

    if (countryA === "EG" && countryB !== "EG") return -1;
    if (countryB === "EG" && countryA !== "EG") return 1;

    return 0;
  });

  // Step 4: Limit results
  return ranked.slice(0, 10);
}
```

---

## Phase 3.5: Content Filtering & Restrictions

### 3.5.1 Restricted Content Configuration

**File:** `src/config/content-restrictions.ts`

```typescript
/**
 * Content filtering configuration.
 * Defines restricted countries and places that should never appear in search results.
 */

/** ISO 3166-1 alpha-2 country codes to exclude from all search functionality */
export const RESTRICTED_COUNTRY_CODES = ["IL"] as const;

/**
 * Specific Google Place IDs to block (e.g. known Israel-related places).
 * Add IDs here as they're discovered to ensure comprehensive filtering.
 */
export const RESTRICTED_PLACE_IDS = [
  // Israel country-level place ID
  "ChIJi8mnMiRJABURuiw1EyBCa2o",
  
  // Major Israeli cities (add more as needed)
  "ChIJH3w7GaZMHRURkD-WwKJy-8E", // Tel Aviv
  "ChIJkZGDg9VI1xQRMp_RiQvR2SQ", // Jerusalem
  "ChIJZbCvRZwpHRURuFW0I3D1p5I", // Haifa
  
  // Add additional place IDs here as discovered
] as const;

/**
 * Check if a country code is restricted.
 */
export function isCountryRestricted(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return RESTRICTED_COUNTRY_CODES.includes(countryCode.toUpperCase() as any);
}

/**
 * Check if a place ID is restricted.
 */
export function isPlaceIdRestricted(placeId: string | null | undefined): boolean {
  if (!placeId) return false;
  return RESTRICTED_PLACE_IDS.includes(placeId as any);
}

/**
 * Check if a place should be filtered out based on any restriction criteria.
 * Returns true if the place should be EXCLUDED.
 */
export function shouldFilterPlace(place: {
  placeId?: string;
  countryCode?: string;
}): boolean {
  // Block by place ID
  if (isPlaceIdRestricted(place.placeId)) {
    return true;
  }
  
  // Block by country code
  if (isCountryRestricted(place.countryCode)) {
    return true;
  }
  
  return false;
}
```

### 3.5.2 Update Prediction Filtering

**File:** `src/lib/process-predictions.ts`

Update the `processPredictions` function to apply content restrictions:

```typescript
import { ALLOWED_PRIMARY_TYPES, TYPE_PRIORITY, extractCountryCode } from "@/config/place-types";
import { shouldFilterPlace } from "@/config/content-restrictions"; // ADD THIS

export interface RawGooglePrediction {
  placeId: string;
  description: string;
  structuredFormatting?: {
    mainText?: string;
    secondaryText?: string;
  };
  types?: string[];
  primaryType?: string;
  addressComponents?: any[];
}

/**
 * Filter and rank Google Places autocomplete predictions.
 * 
 * Logic:
 * 1. Filter out restricted content (e.g. specific countries)
 * 2. Filter to allowed place types only
 * 3. Sort by type priority (countries first, then cities, etc.)
 * 4. Within same priority, boost Egypt results (primary market)
 * 5. Limit to top N results (e.g. 8-10 for UX)
 */
export function processPredictions(
  predictions: RawGooglePrediction[],
  userLanguage: "ar" | "en"
): RawGooglePrediction[] {
  // Step 0: Filter out restricted content (CRITICAL FIRST STEP)
  const unrestricted = predictions.filter((p) => {
    const countryCode = extractCountryCode(p.addressComponents || []);
    return !shouldFilterPlace({
      placeId: p.placeId,
      countryCode: countryCode || undefined,
    });
  });

  // Step 1: Filter to allowed types
  const filtered = unrestricted.filter((p) =>
    p.primaryType && ALLOWED_PRIMARY_TYPES.includes(p.primaryType as any)
  );

  // Step 2 & 3: Sort by priority + Egypt boost
  const ranked = filtered.sort((a, b) => {
    // Primary sort: type priority
    const priorityA = TYPE_PRIORITY[a.primaryType || ""] || 999;
    const priorityB = TYPE_PRIORITY[b.primaryType || ""] || 999;
    const priorityDiff = priorityA - priorityB;

    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort: boost Egypt in ties (primary market)
    const countryA = extractCountryCode(a.addressComponents || []);
    const countryB = extractCountryCode(b.addressComponents || []);

    if (countryA === "EG" && countryB !== "EG") return -1;
    if (countryB === "EG" && countryA !== "EG") return 1;

    return 0;
  });

  // Step 4: Limit results
  return ranked.slice(0, 10);
}
```

### 3.5.3 Server-Side Filtering (Defense in Depth)

**File:** `app/api/google-places/autocomplete/route.ts`

Add server-side filtering as a safety layer:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { shouldFilterPlace } from "@/config/content-restrictions"; // ADD THIS
import { extractCountryCode } from "@/config/place-types"; // ADD THIS

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, sessionToken, languageCode } = body;

    if (!input || input.trim().length < 2) {
      return NextResponse.json({ predictions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    const requestBody = {
      input: input.trim(),
      locationBias: {
        circle: {
          center: { latitude: 26.8206, longitude: 30.8025 },
          radius: 2000000,
        },
      },
      languageCode,
      sessionToken,
    };

    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Places Autocomplete error:", error);
      return NextResponse.json(
        { error: "Failed to fetch autocomplete suggestions" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // SERVER-SIDE FILTER: Remove restricted content before sending to client
    if (data.predictions && Array.isArray(data.predictions)) {
      data.predictions = data.predictions.filter((prediction: any) => {
        const countryCode = extractCountryCode(prediction.addressComponents || []);
        const isRestricted = shouldFilterPlace({
          placeId: prediction.placeId,
          countryCode: countryCode || undefined,
        });
        
        // Log filtered items for monitoring (optional)
        if (isRestricted) {
          console.log(`[Content Filter] Blocked prediction: ${prediction.description}`);
        }
        
        return !isRestricted;
      });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Autocomplete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 3.5.4 Filter Place Details Response

**File:** `app/api/google-places/details/route.ts`

Prevent fetching details for restricted places:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { isPlaceIdRestricted } from "@/config/content-restrictions"; // ADD THIS

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { placeId, fields, sessionToken, languageCode } = body;

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 }
      );
    }

    // BLOCK RESTRICTED PLACE IDS
    if (isPlaceIdRestricted(placeId)) {
      console.log(`[Content Filter] Blocked place details request: ${placeId}`);
      return NextResponse.json(
        { error: "Place not available" },
        { status: 404 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    const fieldMask = fields?.join(",") || "id,displayName,formattedAddress,location,addressComponents,types";

    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=${fieldMask}&languageCode=${languageCode}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
          ...(sessionToken ? { "X-Goog-Session-Token": sessionToken } : {}),
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Places Details error:", error);
      return NextResponse.json(
        { error: "Failed to fetch place details" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // DOUBLE-CHECK: Filter by country code in response
    const countryComponent = data.addressComponents?.find((c: any) =>
      c.types.includes("country")
    );
    const countryCode = countryComponent?.short_name;
    
    if (isCountryRestricted(countryCode)) {
      console.log(`[Content Filter] Blocked place details by country: ${data.displayName?.text || placeId}`);
      return NextResponse.json(
        { error: "Place not available" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Place details API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 3.5.5 Filter Top Cities Data

**File:** `src/data/top-cities.ts`

Ensure no restricted countries in top cities data:

```typescript
// Remove IL (Israel) from TOP_CITIES map entirely
// Ensure it's never added in the future

export const TOP_CITIES: Record<string, TopCityData[]> = {
  EG: [
    { name: "Cairo", placeId: "ChIJizKuijrlXhURq4X1S9OGLpY" },
    { name: "Sharm El Sheikh", placeId: "ChIJzV6FCfWtXhQR8J0O2_kHuC0" },
    { name: "Hurghada", placeId: "ChIJs7s9zbKHUhQRYMPTi_kHuC0" },
    { name: "Alexandria", placeId: "ChIJ7a_R3kBhUhQRPPKjKSKOXAw" },
    { name: "Luxor", placeId: "ChIJa1DpLfXiXhQRF0kHuC0" },
  ],
  SA: [
    { name: "Makkah", placeId: "ChIJdYeB7UwbwhURzslwz2kkq5g" },
    { name: "Riyadh", placeId: "ChIJXRHm28VNXz4RBB0F0G6jrB4" },
    { name: "Jeddah", placeId: "ChIJ0RaWS3A7whURzbVU2hKOXAw" },
    { name: "Madinah", placeId: "ChIJ-78KmFH9wBURCpxVB_kHuC0" },
  ],
  // ... other countries ...
  
  // IL: INTENTIONALLY EXCLUDED - content restriction
};

/**
 * Get top cities for a country code.
 * Returns empty array if country not in our curated list OR if country is restricted.
 */
export function getTopCitiesForCountry(countryCode: string): TopCityData[] {
  // Additional safety check
  if (isCountryRestricted(countryCode)) {
    return [];
  }
  
  return TOP_CITIES[countryCode] || [];
}
```

### 3.5.6 Filter Results Page Hotels & Geographic Boundary Protection

**File:** `app/results/page.tsx`

Add client-side filtering as final safety layer:

```typescript
import { shouldFilterPlace, isCountryRestricted } from "@/config/content-restrictions"; // ADD THIS

// Add to existing filtered hotels logic
const filteredHotels = useMemo(() => {
  let list = allHotels;
  
  // CRITICAL: Filter out hotels from restricted countries
  // This is a safety net in case LITEAPI returns restricted hotels despite our request parameters
  list = list.filter((hotel) => {
    const details = data?.hotelDetailsByHotelId?.[hotel.id];
    
    // Check if hotel has country code metadata (from LITEAPI response)
    // LITEAPI may include country code in hotel data
    const hotelCountryCode = hotel.countryCode || hotel.country_code || hotel.country;
    
    if (hotelCountryCode && isCountryRestricted(hotelCountryCode)) {
      console.log(`[Content Filter] Blocked hotel: ${hotel.name} (${hotelCountryCode})`);
      return false;
    }
    
    // Additional check: if we have lat/lng, verify not in restricted geographic area
    // Israel approximate bounding box: 29.5°N to 33.3°N, 34.3°E to 35.9°E
    const location = details?.location;
    if (location?.latitude != null && location?.longitude != null) {
      const lat = location.latitude;
      const lng = location.longitude;
      
      // Check if coordinates fall within Israel's bounding box
      if (lat >= 29.5 && lat <= 33.3 && lng >= 34.3 && lng <= 35.9) {
        console.log(`[Content Filter] Blocked hotel by coordinates: ${hotel.name} (${lat}, ${lng})`);
        return false;
      }
    }
    
    return true;
  });
  
  // ... existing filters (distance, refundable, price, name)
  
  return list;
}, [allHotels, data?.hotelDetailsByHotelId, /* ... */]);
```

**File:** `src/config/content-restrictions.ts`

Add geographic boundary checking utility:

```typescript
/**
 * Geographic bounding boxes for restricted regions.
 * Format: [minLat, maxLat, minLng, maxLng]
 */
const RESTRICTED_GEOGRAPHIC_BOUNDS: Record<string, [number, number, number, number]> = {
  // Israel approximate boundaries
  IL: [29.5, 33.3, 34.3, 35.9],
  // Add other restricted regions as needed
};

/**
 * Check if coordinates fall within a restricted geographic area.
 * Returns true if the location should be BLOCKED.
 */
export function isLocationRestricted(lat: number, lng: number): boolean {
  for (const [countryCode, [minLat, maxLat, minLng, maxLng]] of Object.entries(RESTRICTED_GEOGRAPHIC_BOUNDS)) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return true;
    }
  }
  return false;
}
```

### 3.5.7 Testing & Monitoring

**Testing Checklist:**

```markdown
## Content Filtering Tests

### Autocomplete Tests:
- [ ] Searching "tel aviv" returns no results
- [ ] Searching "jerusalem" returns no results  
- [ ] Searching "israel" returns no results
- [ ] Searching "haifa" returns no results
- [ ] Searching nearby countries (Jordan, Lebanon, Egypt) works normally

### Place Details Tests:
- [ ] Direct API call with Israel place ID returns 404
- [ ] Attempting to use Israel place ID in search redirects or fails gracefully

### Results Tests:
- [ ] LITEAPI results never include hotels with country code "IL"
- [ ] Map view never shows markers in Israel
- [ ] Distance sorting never includes Israel hotels
- [ ] **Geographic boundary filter blocks hotels by lat/lng in Israel bounding box**

### Radius Search Tests (CRITICAL):
- [ ] Searching hotels in Gaza (near Israel border) shows NO Israel hotels
- [ ] Searching hotels in Aqaba, Jordan (10km from Eilat, Israel) shows NO Israel hotels
- [ ] Searching hotels in Southern Lebanon (near Israel border) shows NO Israel hotels
- [ ] Radius search centered in Egypt near Sinai shows only Egyptian hotels
- [ ] Map "Search this area" when panned near Israel border excludes Israel hotels

### Top Cities Tests:
- [ ] IL not in TOP_CITIES map
- [ ] getTopCitiesForCountry("IL") returns empty array

### Edge Cases:
- [ ] Places with "Israel" in description but different country code (e.g. "Israel" in Brazil) handled correctly
- [ ] Nearby places (Gaza, West Bank) handled according to business rules
- [ ] Hotel coordinates exactly on border (edge of bounding box) handled correctly
```

**Monitoring:**

Add logging to track filtered content:

```typescript
// In server-side filter functions:
if (isRestricted) {
  console.log(`[Content Filter] Blocked: ${prediction.description} (${countryCode})`);
  
  // Optional: Send to monitoring service
  // analytics.track('content_filtered', {
  //   placeId: prediction.placeId,
  //   countryCode,
  //   timestamp: new Date().toISOString()
  // });
}
```

### 3.5.8 Important Notes

**Multi-Layer Defense Strategy:**

1. **Layer 1 (Google Places - Autocomplete)**: Client-side filtering in `process-predictions.ts`
2. **Layer 2 (Google Places - Server)**: Server-side filtering in API routes (primary defense for autocomplete)
3. **Layer 3 (LITEAPI - Geographic Boundary)**: Send country code to LITEAPI to restrict hotel search geographically (Phase 7.2)
4. **Layer 4 (Results - Safety Net)**: Client-side filtering on results page by country code + lat/lng bounding box (Phase 3.5.6)
5. **Layer 5 (Data)**: Exclude from `TOP_CITIES` map

**Why Multiple Layers:**
- **Defense in depth**: If one layer fails, others catch it
- **Performance**: LITEAPI filtering (Layer 3) reduces data transfer
- **Compliance**: Multiple checkpoints ensure audit trail
- **Border scenarios**: Geographic bounding box (Layer 4) catches edge cases near borders

**Critical for Radius Searches:**
- User searches near Israel border → Layer 3 (country code) prevents LITEAPI from returning Israeli hotels
- If LITEAPI doesn't support country code → Layer 4 (geographic bounds) filters by lat/lng
- Map "Search this area" → Inherit country code from initial place selection, or use Layer 4 only

**Maintenance:**
- Update `RESTRICTED_PLACE_IDS` as new places are discovered
- Monitor logs for attempts to access restricted content
- Periodically audit autocomplete results for leaks
- Test LITEAPI country code parameter support (verify in Phase 7)
- Update geographic bounding boxes if borders change

**Performance:**
- Filtering is O(n) but happens on small result sets (< 20 autocomplete, < 200 hotels)
- No impact on API call volume (happens after fetch)
- Country code extraction already implemented in Phase 2
- LITEAPI filtering reduces response payload size

**Privacy & Compliance:**
- Log filtering events at each layer for audit purposes
- Don't expose reason for filtering to end users (just show "no results")
- Country code sent to LITEAPI ensures server-side enforcement
- Geographic bounding box provides mathematical certainty for border cases

---

## Phase 4: Place Details Fetch & Normalization

### 4.1 Fetch Place Details

**File:** `src/lib/google-place-details.ts`

```typescript
/**
 * Fetch full place details from Google Places API.
 * Called once when user selects an autocomplete suggestion.
 * Uses same session token for cost optimization.
 */
export interface PlaceDetailsOptions {
  placeId: string;
  sessionToken: string;
  languageCode: "ar" | "en";
}

/**
 * Fields to request from Google Places Details API.
 * Optimized for hotel search: name, location, address, type.
 */
export const PLACE_DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
  "types",
] as const;

export async function getPlaceDetails(
  options: PlaceDetailsOptions
): Promise<any> {
  const { placeId, sessionToken, languageCode } = options;

  // This will call Google Places API (New) - implement in API route
  const response = await fetch("/api/google-places/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      placeId,
      fields: PLACE_DETAILS_FIELDS,
      sessionToken,
      languageCode,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch place details");
  }

  return response.json();
}
```

### 4.2 Normalize Place to Standard Format

**File:** `src/lib/normalize-location.ts`

```typescript
import { mapGooglePlaceType } from "@/lib/place-utils";
import type { PlaceSuggestion } from "@/lib/place-utils";

/**
 * Normalize Google Place Details response to our standard format.
 * This is the single source of truth for place data sent to LITEAPI.
 */
export function normalizePlace(details: any): PlaceSuggestion {
  // Extract country info from address components
  const countryComponent = details.addressComponents?.find((c: any) =>
    c.types.includes("country")
  );

  const countryCode = countryComponent?.short_name || "";
  const countryName = countryComponent?.long_name || "";

  // Extract coordinates
  const lat = details.location?.lat ?? details.location?.latitude ?? 0;
  const lng = details.location?.lng ?? details.location?.longitude ?? 0;

  // Map Google type to our normalized type
  const type = mapGooglePlaceType(details.types?.[0] || details.primaryType || "");

  return {
    placeId: details.id || details.placeId,
    displayName: details.displayName?.text || details.displayName || "",
    formattedAddress: details.formattedAddress || "",
    type,
    primaryType: details.types?.[0] || details.primaryType,
    lat,
    lng,
    countryCode,
    countryName,
  };
}
```

---

## Phase 5: Top Cities Data (Country Selection UX)

### 5.1 Static Top Cities Map

**File:** `src/data/top-cities.ts`

```typescript
/**
 * Top cities for country-level searches.
 * When user selects a country, show these cities as quick suggestions.
 * 
 * Manually curated for now - can be enhanced with Google Places search later.
 * Each city should have a real Google Place ID for consistency.
 */

export interface TopCityData {
  name: string;
  /** Optional: Google Place ID for one-click search */
  placeId?: string;
  /** Optional: for display ordering */
  popularity?: number;
}

export const TOP_CITIES: Record<string, TopCityData[]> = {
  EG: [
    { name: "Cairo", placeId: "ChIJizKuijrlXhURq4X1S9OGLpY" },
    { name: "Sharm El Sheikh", placeId: "ChIJzV6FCfWtXhQR8J0O2_kHuC0" },
    { name: "Hurghada", placeId: "ChIJs7s9zbKHUhQRYMPTi_kHuC0" },
    { name: "Alexandria", placeId: "ChIJ7a_R3kBhUhQRPPKjKSKOXAw" },
    { name: "Luxor", placeId: "ChIJa1DpLfXiXhQRF0kHuC0" },
  ],
  SA: [
    { name: "Makkah", placeId: "ChIJdYeB7UwbwhURzslwz2kkq5g" },
    { name: "Riyadh", placeId: "ChIJXRHm28VNXz4RBB0F0G6jrB4" },
    { name: "Jeddah", placeId: "ChIJ0RaWS3A7whURzbVU2hKOXAw" },
    { name: "Madinah", placeId: "ChIJ-78KmFH9wBURCpxVB_kHuC0" },
  ],
  MA: [
    { name: "Marrakech", placeId: "ChIJsaKOUCy4pw0R0F0F0G6jrB4" },
    { name: "Casablanca", placeId: "ChIJ0RaS3A7whURzbVU2hKOXAw" },
    { name: "Rabat", placeId: "ChIJ2Z1F0G6jrB4R0F0F0G6jrB4" },
    { name: "Fes", placeId: "ChIJ3bU2hKOXAw0R0F0F0G6jrB4" },
  ],
  TR: [
    { name: "Istanbul", placeId: "ChIJJwx2F0G_yhQR0F0F0G6jrB4" },
    { name: "Antalya", placeId: "ChIJWxV6F0G_yhQR0F0F0G6jrB4" },
    { name: "Cappadocia", placeId: "ChIJRdF0G_yhQR0F0F0G6jrB4" },
    { name: "Bodrum", placeId: "ChIJYhQR0F0F0G6jrB4" },
  ],
  AE: [
    { name: "Dubai", placeId: "ChIJRYkMpMY5Xz4RhKOXAw" },
    { name: "Abu Dhabi", placeId: "ChIJXz4RhKOXAw0R0F0F0G6jrB4" },
    { name: "Sharjah", placeId: "ChIJOXAw0R0F0F0G6jrB4" },
  ],
  JO: [
    { name: "Amman", placeId: "ChIJF0G6jrB4R0F0F0G6jrB4" },
    { name: "Petra", placeId: "ChIJ6jrB4R0F0F0G6jrB4" },
    { name: "Aqaba", placeId: "ChIJB4R0F0F0G6jrB4" },
  ],
};

/**
 * Get top cities for a country code.
 * Returns empty array if country not in our curated list.
 */
export function getTopCitiesForCountry(countryCode: string): TopCityData[] {
  return TOP_CITIES[countryCode] || [];
}
```

---

## Phase 6: API Routes

### 6.1 Google Places Autocomplete Endpoint

**File:** `app/api/google-places/autocomplete/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

/**
 * Google Places Autocomplete API endpoint.
 * Proxies requests to Google Places API (New) for cost control and security.
 * 
 * Cost optimization:
 * - Session tokens ensure autocomplete + details = 1 SKU charge
 * - Client-side filtering reduces unnecessary detail fetches
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, sessionToken, languageCode } = body;

    if (!input || input.trim().length < 2) {
      return NextResponse.json({ predictions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    // Build request to Google Places Autocomplete (New API)
    const requestBody = {
      input: input.trim(),
      locationBias: {
        circle: {
          center: { latitude: 26.8206, longitude: 30.8025 },
          radius: 2000000,
        },
      },
      languageCode,
      sessionToken,
    };

    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Places Autocomplete error:", error);
      return NextResponse.json(
        { error: "Failed to fetch autocomplete suggestions" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Autocomplete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 6.2 Google Places Details Endpoint

**File:** `app/api/google-places/details/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

/**
 * Google Places Details API endpoint.
 * Fetches full place details when user selects an autocomplete suggestion.
 * Uses session token for cost optimization.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { placeId, fields, sessionToken, languageCode } = body;

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    // Build field mask for efficient API usage
    const fieldMask = fields?.join(",") || "id,displayName,formattedAddress,location,addressComponents,types";

    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=${fieldMask}&languageCode=${languageCode}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
          ...(sessionToken ? { "X-Goog-Session-Token": sessionToken } : {}),
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Places Details error:", error);
      return NextResponse.json(
        { error: "Failed to fetch place details" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Place details API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## Phase 7: LITEAPI Integration

### 7.1 Update Results Query Types

**File:** `src/lib/results-query.ts`

Add new fields to results query params:

```typescript
// Add to existing parseResultsSearchParams / buildResultsQueryParams

export interface ResultsQueryParams {
  // ... existing fields ...
  
  /** Geographic center for distance-based sorting */
  centerLat?: number;
  centerLng?: number;
  /** Search radius in meters (for "Search this area" + distance filtering) */
  searchRadius?: number;
  /** Place type for routing and sorting logic */
  placeType?: PlaceSuggestion["type"];
  /** Country code for country-level searches AND geographic restrictions */
  countryCode?: string;
}
```

### 7.2 Update LITEAPI Request Body Builder (with Country Restriction)

**File:** `src/lib/liteapi.ts`

Update `buildRatesRequestBody` to include country code for geographic boundaries:

```typescript
import { isCountryRestricted } from "@/config/content-restrictions"; // ADD THIS

export interface RatesSearchParams {
  // ... existing params ...
  countryCode?: string; // ADD THIS - from normalized place
  latitude?: number;
  longitude?: number;
  radius?: number;
}

export function buildRatesRequestBody(params: RatesSearchParams): Record<string, unknown> {
  const {
    // ... existing params ...
    countryCode,
    latitude,
    longitude,
    radius,
  } = params;

  const body: Record<string, unknown> = {
    // ... existing body ...
  };

  // CRITICAL: Add country code to LITEAPI request for geographic boundary
  // This tells LITEAPI to only return hotels within this country
  // Primary defense against cross-border hotel results (e.g., radius searches near borders)
  if (countryCode && !isCountryRestricted(countryCode)) {
    body.countryCode = countryCode;
    console.log(`[LITEAPI Request] Restricting search to country: ${countryCode}`);
  }

  // Phase 4: "search this area" uses lat/lng/radius
  // NEW: Also used for distance-to-center when user selects a specific point
  // IMPORTANT: When using area params WITH countryCode, LITEAPI will respect both constraints
  const hasAreaParams =
    latitude != null && typeof latitude === "number" && !Number.isNaN(latitude) &&
    longitude != null && typeof longitude === "number" && !Number.isNaN(longitude) &&
    radius != null && typeof radius === "number" && !Number.isNaN(radius) && radius > 0;

  if (hasAreaParams) {
    body.latitude = latitude;
    body.longitude = longitude;
    body.radius = radius;
    // When using area params, still send placeId for place-based search
    // (LITEAPI supports both - placeId for base search, lat/lng/radius for refinement)
    if (mode === "place" && placeId) body.placeId = placeId;
  } else {
    if (mode === "place" && placeId) body.placeId = placeId;
    else if (mode === "vibe" && aiSearch) body.aiSearch = aiSearch;
  }

  return body;
}
```

### 7.3 Update Search API Route to Pass Country Code

**File:** `app/api/rates/search/route.ts` (or your search route)

Ensure country code is extracted from place and passed to LITEAPI:

```typescript
// In your search route handler:
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode,
      placeId,
      placeName,
      placeTypes,
      countryCode, // ADD THIS - should come from normalized place
      checkin,
      checkout,
      occupancies,
      // ... other params
    } = body;

    // Build LITEAPI request with country code
    const liteApiParams = {
      mode,
      placeId,
      checkin,
      checkout,
      occupancies,
      countryCode, // PASS THIS to restrict geographic search
      // ... other params
    };

    const result = await searchHotelRates(liteApiParams, apiKey);
    
    // ... process and return results
  } catch (error) {
    // ... error handling
  }
}
```

### 7.4 Update Results Page to Send Country Code

**File:** `app/results/page.tsx`

Pass country code from URL params to search request:

```typescript
// In the search effect:
useEffect(() => {
  if (!hasRequiredSearchParams) {
    // ... early return
  }
  
  const abortController = new AbortController();
  
  async function run() {
    try {
      // ... loading/error setup
      
      const body = {
        mode,
        ...(mode === "place"
          ? {
              placeId: placeIdParam ?? undefined,
              placeName: placeNameParam ?? undefined,
              placeTypes: placeTypesParam ? placeTypesParam.split(",").filter(Boolean) : undefined,
              countryCode: queryParams.countryCode, // ADD THIS
            }
          : { aiSearch: aiSearchParam ?? undefined }),
        checkin: checkinParam,
        checkout: checkoutParam,
        occupancies: toApiOccupancies(occupancies),
        currency,
        guestNationality: nationalityParam,
        language: locale,
        timeout: getRatesSearchTimeout(),
        // ... other params including lat/lng/radius if present
      };
      
      const res = await fetch("/api/rates/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: abortController.signal
      });
      
      // ... process response
    } catch (err) {
      // ... error handling
    }
  }
  
  run();
}, [/* ... dependencies including countryCode */]);
```

### 7.5 Important Notes on Country Code Restriction

**How it works:**
1. User selects place from Google Places autocomplete
2. We extract `countryCode` from place details (Phase 4 normalization)
3. Country code is stored in URL and passed to LITEAPI
4. LITEAPI uses country code to restrict hotel search geographically
5. Even if radius crosses border, LITEAPI only returns hotels in specified country

**Benefits:**
- **Primary defense** against cross-border hotel results
- Works at LITEAPI level (server-side, can't be bypassed)
- Reduces response size (fewer hotels to filter client-side)
- Better performance (LITEAPI does the filtering)

**Example scenarios:**
- Search "Aqaba, Jordan" (10km from Eilat, Israel)
  - `countryCode: "JO"` sent to LITEAPI
  - LITEAPI returns ONLY Jordanian hotels
  - No Israeli hotels in response, even within radius
  
- Search "Gaza" with 20km radius
  - `countryCode: "PS"` (Palestine) sent to LITEAPI
  - LITEAPI returns ONLY Palestinian territory hotels
  - Israeli hotels excluded at source

- Map "Search this area" near border
  - If user selected a place initially, we use that place's country code
  - If pure map search (no place context), we omit country code but rely on client-side geographic filtering (Phase 3.5.6)

**Fallback:**
- If LITEAPI doesn't support `countryCode` parameter, client-side filtering (Phase 3.5.6) acts as safety net
- Test LITEAPI API to confirm country code parameter support
- If unsupported, consider using `latitude + longitude + smaller radius` to avoid cross-border results

---

## Phase 8: Distance Calculation & Sorting

### 8.1 Distance Utilities

**File:** `src/lib/distance-utils.ts`

```typescript
/**
 * Calculate distance between two lat/lng points using Haversine formula.
 * Returns distance in meters.
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Format distance for display.
 * < 1km: "500 m"
 * >= 1km: "1.5 km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Calculate distances from center point to all hotels.
 * Returns map of hotelId -> distance in meters.
 */
export function calculateHotelDistances(
  hotels: any[],
  hotelDetailsByHotelId: Record<string, { location?: { latitude: number; longitude: number } }>,
  centerLat: number,
  centerLng: number
): Record<string, number> {
  const distances: Record<string, number> = {};

  for (const hotel of hotels) {
    const details = hotelDetailsByHotelId[hotel.id];
    const location = details?.location;

    if (location?.latitude != null && location?.longitude != null) {
      distances[hotel.id] = calculateDistance(
        centerLat,
        centerLng,
        location.latitude,
        location.longitude
      );
    }
  }

  return distances;
}
```

### 8.2 Add Distance Sorting to Results Page

**File:** `app/results/page.tsx`

Update sorting logic to support distance-based sorting:

```typescript
// Add new sort option
export type ResultsSortOption = "recommended" | "price_asc" | "price_desc" | "rating_desc" | "distance_asc";

// Calculate distances when center point is available
const hotelDistances = useMemo(() => {
  if (centerLatParam == null || centerLngParam == null) return {};
  return calculateHotelDistances(
    allHotels,
    data?.hotelDetailsByHotelId ?? {},
    centerLatParam,
    centerLngParam
  );
}, [allHotels, data?.hotelDetailsByHotelId, centerLatParam, centerLngParam]);

// Update sorted hotels logic
const sortedHotels = useMemo(() => {
  const list = [...filteredHotels];
  
  if (sortOrder === "recommended") return list;
  
  if (sortOrder === "distance_asc") {
    return list.sort((a, b) => {
      const distA = hotelDistances[a.id] ?? Infinity;
      const distB = hotelDistances[b.id] ?? Infinity;
      return distA - distB;
    });
  }
  
  // ... existing sort logic (price_asc, price_desc, rating_desc)
  
  return list;
}, [filteredHotels, sortOrder, mergedPricesByHotelId, hotelDistances]);

// Auto-select distance sorting when place type benefits from it
useEffect(() => {
  if (!placeTypeParam) return;
  if (shouldSortByDistance(placeTypeParam as any) && sortOrder === "recommended") {
    handleSortChange("distance_asc");
  }
}, [placeTypeParam, sortOrder]);
```

---

## Phase 9: Radius Filter UI

### 9.1 Add Radius Slider to Filters Panel

**File:** `app/results/page.tsx` (filters panel section)

```typescript
// Add state for radius filter
const [filterRadius, setFilterRadius] = useState<number>(10000); // 10km default

// Sync from URL
useEffect(() => {
  if (!filterPanelOpen) return;
  // ... existing filters sync ...
  setFilterRadius(searchRadiusParam ?? 10000);
}, [filterPanelOpen, /* ... */, searchRadiusParam]);

// Add to filters panel UI (after price range section):
<div>
  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
    Distance from center
  </label>
  <div className="radius-slider mt-2 mb-3">
    <input
      type="range"
      min={1000}
      max={50000}
      step={1000}
      value={filterRadius}
      onChange={(e) => setFilterRadius(Number(e.target.value))}
      className="w-full"
      aria-label="Search radius"
    />
  </div>
  <p className="text-xs text-[var(--muted-foreground)] mb-2">
    Within {formatDistance(filterRadius)}
  </p>
  <p className="text-xs text-[var(--muted-foreground-light)] italic">
    Only shows hotels with location data
  </p>
</div>

// Update handleFiltersApply to include radius
const handleFiltersApply = () => {
  const params = {
    ...queryParams,
    // ... existing filters ...
    searchRadius: centerLatParam != null && centerLngParam != null ? filterRadius : undefined,
  };
  router.replace(resultsUrl(params));
  setFilterPanelOpen(false);
};
```

### 9.2 Client-Side Radius Filtering

```typescript
// Add to filteredHotels logic (before price/refundable filters)
const filteredHotels = useMemo(() => {
  let list = allHotels;
  
  // Distance filter: only when center point and radius are set
  if (
    centerLatParam != null &&
    centerLngParam != null &&
    searchRadiusParam != null &&
    Object.keys(hotelDistances).length > 0
  ) {
    list = list.filter((h) => {
      const distance = hotelDistances[h.id];
      return distance != null && distance <= searchRadiusParam;
    });
  }
  
  // ... existing filters (refundable, price, name)
  
  return list;
}, [allHotels, centerLatParam, centerLngParam, searchRadiusParam, hotelDistances, /* ... */]);
```

---

## Phase 10: Routing Logic

### 10.1 Route Decision Matrix

**File:** `src/lib/search-routing.ts`

```typescript
import { getTopCitiesForCountry } from "@/data/top-cities";
import type { PlaceSuggestion } from "@/lib/place-utils";

export interface SearchRoutingDecision {
  /** Where to navigate */
  destination: "hotel-page" | "results-list" | "country-landing";
  /** Additional context for the route */
  context: {
    /** For hotel-page: attempt to find hotelId from place */
    hotelId?: string;
    /** For results-list: enable distance sorting */
    enableDistanceSorting?: boolean;
    /** For results-list: center point for sorting */
    centerLat?: number;
    centerLng?: number;
    /** For country-landing: top cities to suggest */
    topCities?: any[];
  };
}

/**
 * Determine routing based on selected place type.
 * 
 * Routing matrix:
 * - hotel → try hotel page (if we can get hotelId), else list with distance sort
 * - city/region → results list (normal)
 * - country → country landing page OR results with country filter + top cities
 * - airport → results list with distance sort (center = airport)
 * - attraction → results list with distance sort (center = attraction)
 */
export function determineSearchRoute(
  place: PlaceSuggestion
): SearchRoutingDecision {
  const { type, placeId, lat, lng, countryCode } = place;

  switch (type) {
    case "hotel":
      // Ideal: navigate to hotel page directly
      // Problem: we need LITEAPI hotelId, not Google placeId
      // Solution: navigate to results with distance sort, user clicks top result
      // Future enhancement: maintain Google placeId → LITEAPI hotelId mapping
      return {
        destination: "results-list",
        context: {
          enableDistanceSorting: true,
          centerLat: lat,
          centerLng: lng,
        },
      };

    case "city":
    case "region":
      // Standard city search - no distance sorting needed (LITEAPI handles it)
      return {
        destination: "results-list",
        context: {},
      };

    case "country":
      // Show country landing with top cities OR results with country filter
      const topCities = getTopCitiesForCountry(countryCode);
      
      // If we have curated top cities, could show landing page
      // For now: go to results and let LITEAPI handle country-level search
      return {
        destination: "results-list",
        context: {
          topCities: topCities.length > 0 ? topCities : undefined,
        },
      };

    case "airport":
    case "attraction":
      // These benefit from "hotels near X" with distance sorting
      return {
        destination: "results-list",
        context: {
          enableDistanceSorting: true,
          centerLat: lat,
          centerLng: lng,
        },
      };

    default:
      // Fallback: standard results
      return {
        destination: "results-list",
        context: {},
      };
  }
}
```

### 10.2 Apply Routing in SearchModal

**File:** `src/components/SearchModal.tsx`

```typescript
// Update handleSelectPlace to use routing logic
const handleSelectPlaceFullScreen = async (place: PlaceSuggestion) => {
  // Step 1: Fetch place details (with session token)
  const details = await getPlaceDetails({
    placeId: place.placeId,
    sessionToken: currentSessionToken,
    languageCode: locale as "ar" | "en",
  });

  // Step 2: Normalize to our format
  const normalized = normalizePlace(details);

  // Step 3: Update parent state
  onPlaceSelect(normalized);
  onQueryChange(normalized.displayName);
  setSearchInput(normalized.displayName);

  // Step 4: Move to next step (dates)
  setView("when");
  
  // Note: routing decision happens in onSearch when user confirms search
};

// Update onSearch handler in parent (results page)
const doSearchFromModal = () => {
  const hasPlace = !!(selectedPlaceId && selectedPlaceName);
  const hasDates = !!(globalSearchCheckin && globalSearchCheckout);
  if (!hasDates || !hasPlace) return;

  // Determine routing based on place type
  const routingDecision = determineSearchRoute(selectedPlace);

  // Build params with routing context
  const params = buildResultsQueryParams({
    mode: "place",
    placeId: selectedPlaceId!,
    placeName: selectedPlaceName!,
    placeAddress: selectedPlaceAddress ?? null,
    placeTypes: selectedPlaceTypes,
    checkin: globalSearchCheckin,
    checkout: globalSearchCheckout,
    occupancies: editOccupancies,
    nationality: nationalityParam,
    sort: routingDecision.context.enableDistanceSorting ? "distance_asc" : "recommended",
    // Add distance center if applicable
    centerLat: routingDecision.context.centerLat,
    centerLng: routingDecision.context.centerLng,
    searchRadius: routingDecision.context.enableDistanceSorting ? 10000 : undefined, // 10km default
  });

  // Navigate
  if (routingDecision.destination === "hotel-page") {
    // Future: direct navigation to hotel page
    router.push(`/hotel/${routingDecision.context.hotelId}?${serializeResultsQuery(params)}`);
  } else {
    router.push(resultsUrl(params));
  }
};
```

---

## Phase 11: Display Distance in Hotel Cards

### 11.1 Update HotelCard Component

**File:** `src/components/HotelCard.tsx`

```typescript
// Add optional distance prop
interface HotelCardProps {
  // ... existing props ...
  /** Distance from search center in meters (optional) */
  distance?: number;
}

// Add distance badge to card (below address, before price):
{distance != null && (
  <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
    <MapPinIcon className="w-3 h-3" />
    <span>{formatDistance(distance)} from center</span>
  </div>
)}
```

### 11.2 Pass Distance to Cards in Results Page

```typescript
// In results page map over visibleHotels:
{visibleHotels.map((hotel) => {
  const price = mergedPricesByHotelId[hotel.id];
  const distance = hotelDistances[hotel.id];
  const hasAnyRefundable = mergedHasRefundableByHotelId[hotel.id];

  return (
    <HotelCard
      key={hotel.id}
      hotel={hotel}
      price={price}
      nights={nights}
      occupanciesLength={occupancies.length}
      hasRefundable={hasAnyRefundable}
      href={`/hotel/${hotel.id}?${hrefParamsStr}`}
      isFavorite={isFavorite(hotel.id)}
      onToggleFavorite={() => toggleFavorite(hotel.id)}
      distance={distance} // NEW
    />
  );
})}
```

---

## Phase 12: Session Token Management

### 12.1 Token Lifecycle

**File:** `src/hooks/useGooglePlacesSession.ts`

```typescript
import { useRef, useCallback } from "react";
import { generateSessionToken } from "@/lib/google-places-autocomplete";

/**
 * Manages Google Places API session token for cost optimization.
 * 
 * Lifecycle:
 * 1. New token when modal opens
 * 2. Same token for all autocomplete calls + final details call
 * 3. Token expires after successful details fetch or after selection
 * 4. New token if user changes selection (start new search)
 */
export function useGooglePlacesSession() {
  const tokenRef = useRef<string>(generateSessionToken());
  const hasUsedTokenRef = useRef(false);

  const getToken = useCallback(() => {
    return tokenRef.current;
  }, []);

  const refreshToken = useCallback(() => {
    tokenRef.current = generateSessionToken();
    hasUsedTokenRef.current = false;
  }, []);

  const markTokenUsed = useCallback(() => {
    hasUsedTokenRef.current = true;
  }, []);

  const resetSession = useCallback(() => {
    refreshToken();
  }, [refreshToken]);

  return {
    getToken,
    refreshToken,
    markTokenUsed,
    resetSession,
  };
}
```

### 12.2 Integrate Session Hook in SearchModal

```typescript
// In SearchModal component
const placesSession = useGooglePlacesSession();

// Reset session when modal opens
useEffect(() => {
  placesSession.resetSession();
}, []);

// Use session token in autocomplete calls
useEffect(() => {
  // ... existing autocomplete logic ...
  
  const fetchSuggestions = async () => {
    const response = await fetch("/api/google-places/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: searchInput.trim(),
        sessionToken: placesSession.getToken(), // Use session token
        languageCode: locale,
      }),
    });
    // ... handle response
  };
}, [searchInput, locale, placesSession]);

// Mark token as used after fetching details
const handleSelectPlace = async (place: PlaceSuggestion) => {
  const details = await getPlaceDetails({
    placeId: place.placeId,
    sessionToken: placesSession.getToken(),
    languageCode: locale as "ar" | "en",
  });
  
  placesSession.markTokenUsed(); // Session complete
  
  // ... rest of logic
};
```

---

## Phase 13: Environment Variables

### 13.1 Update .env.example

**File:** `.env.example`

```bash
# ... existing vars ...

# Google Maps & Places API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
# Note: Ensure API key has the following enabled:
# - Places API (New)
# - Maps JavaScript API
# - Geocoding API (optional, for reverse lookups)
```

### 13.2 API Key Restrictions (Documentation)

**File:** `docs/GOOGLE_MAPS_SETUP.md` (new file)

```markdown
# Google Maps API Setup

## API Keys

1. **Create API Key**
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Create API key with name "Hotel Booking Website - Places & Maps"

2. **Enable APIs**
   Required:
   - Places API (New) - for autocomplete and place details
   - Maps JavaScript API - for map rendering

   Optional:
   - Geocoding API - for reverse geocoding (future)

3. **API Restrictions**
   - Application restrictions: HTTP referrers
     - Add your production domain(s)
     - Add localhost:3000 for development
   
   - API restrictions: Restrict key to:
     - Places API (New)
     - Maps JavaScript API

4. **Billing**
   - Places Autocomplete: $2.83 per 1000 sessions
   - Places Details: Included in session (with session token)
   - Monthly free quota: $200 credit
   
   Cost optimization tips:
   - Always use session tokens (autocomplete + details = 1 charge)
   - Filter predictions client-side (reduce detail fetches)
   - Cache place details when possible

## Cost Estimates

Scenario: 10,000 monthly searches
- Autocomplete + Details: 10,000 sessions × $0.00283 = $28.30/month
- Well under $200 free monthly credit ✓

Scenario: 100,000 monthly searches
- Autocomplete + Details: 100,000 sessions × $0.00283 = $283/month
- After $200 credit: $83/month actual cost
```

---

## Phase 14: Migration & Testing

### 14.1 Feature Flag

**File:** `src/lib/feature-flags.ts`

```typescript
/**
 * Feature flags for gradual rollout.
 * In production, can be controlled by env vars or admin panel.
 */
export const FEATURES = {
  /** Use Google Places instead of LITEAPI places for autocomplete */
  USE_GOOGLE_PLACES_AUTOCOMPLETE: process.env.NEXT_PUBLIC_GOOGLE_PLACES_ENABLED === "true",
  
  /** Enable distance-based sorting in results */
  ENABLE_DISTANCE_SORTING: process.env.NEXT_PUBLIC_DISTANCE_SORTING_ENABLED === "true",
  
  /** Show distance badges on hotel cards */
  SHOW_DISTANCE_BADGES: process.env.NEXT_PUBLIC_DISTANCE_BADGES_ENABLED === "true",
} as const;
```

### 14.2 Gradual Migration Plan

1. **Week 1: Backend + API Routes**
   - Implement Google Places API routes
   - Add normalized place object & type mapping
   - Test with Postman/curl
   - No frontend changes yet

2. **Week 2: Frontend Integration (Dev Only)**
   - Update SearchModal to use Google Places
   - Feature flag: only enabled in dev environment
   - Test autocomplete, selection, normalization
   - Verify session token usage

3. **Week 3: Distance Sorting (Dev Only)**
   - Add distance calculation utilities
   - Update results page with distance sorting
   - Add radius filter to filters panel
   - Test with various place types

4. **Week 4: A/B Test (10% Production)**
   - Enable for 10% of users
   - Monitor: error rates, API costs, conversion rates
   - Compare: Google Places vs LITEAPI places performance

5. **Week 5: Gradual Rollout**
   - 25% → 50% → 100% based on metrics
   - Monitor costs daily
   - Adjust client-side filtering as needed

### 14.3 Testing Checklist

**Autocomplete:**
- [ ] Typing triggers autocomplete after 2 chars
- [ ] Results filtered to allowed types only
- [ ] Results ranked by priority (countries, cities, airports, etc.)
- [ ] Egypt results boosted in ties
- [ ] Selecting suggestion fetches details
- [ ] Session token used correctly

**Place Details:**
- [ ] Fetches all required fields (name, address, lat/lng, country)
- [ ] Normalizes to PlaceSuggestion format
- [ ] Extracts country code correctly
- [ ] Maps place type correctly

**Distance Sorting:**
- [ ] Hotels sorted by distance when enabled
- [ ] Distance displayed on hotel cards
- [ ] Distance format correct (m vs km)
- [ ] Works with hotel locations from batch details

**Radius Filtering:**
- [ ] Slider updates radius value
- [ ] Only hotels within radius shown
- [ ] Hotels without location data excluded
- [ ] Filter persists in URL

**Routing:**
- [ ] Hotel place → results with distance sort
- [ ] City place → normal results
- [ ] Country place → results (with country filter)
- [ ] Airport place → results with distance sort
- [ ] Attraction place → results with distance sort

**Cost Optimization:**
- [ ] Session token generated once per modal open
- [ ] Same token used for autocomplete + details
- [ ] Token refreshed on new search
- [ ] No unnecessary detail fetches

---

## Phase 15: Country Landing Page (Future Enhancement)

*Note: This is optional and can be implemented after core features are stable.*

When user selects a country, instead of going directly to results, show a landing page with:

1. **Hero Image** (country landmark)
2. **Top Cities** (from TOP_CITIES data)
3. **Quick Facts** (best time to visit, popular regions, etc.)
4. **CTA:** "Search hotels in [Country]" → goes to results with country filter

**File:** `app/country/[countryCode]/page.tsx`

```typescript
// Implementation details omitted for brevity
// This would be a dedicated landing page with:
// - Country name & flag
// - Top cities grid (clickable)
// - Search bar prefilled with country
// - Popular destinations carousel
```

---

## Phase 16: Known Limitations & Future Work

### Limitations

1. **Hotel Place Type → Hotel Page**
   - Problem: Google placeId ≠ LITEAPI hotelId
   - Current: Navigate to results with distance sort (user clicks top result)
   - Future: Maintain placeId → hotelId mapping table

2. **Top Cities Data**
   - Current: Manually curated in code
   - Future: Fetch from Google Places API dynamically

3. **Distance Calculation**
   - Current: Client-side Haversine formula
   - Limitation: Hotels without location data excluded
   - Future: Request LITEAPI to include lat/lng in all responses

4. **Radius Filtering**
   - Current: Client-side filter (after fetching all results)
   - Future: Send radius to LITEAPI to reduce response size

### Future Enhancements

1. **Smart Caching**
   - Cache place details locally (IndexedDB)
   - Reduce Google API calls for repeat searches
   - TTL: 7 days

2. **Recent Locations**
   - Store recent Google places in localStorage
   - Show in "Where" view as quick options
   - Sync with existing recent searches

3. **Place Photos**
   - Fetch place photos from Google Places
   - Show in autocomplete for better UX
   - Add to country landing pages

4. **Geolocation**
   - "Search near me" button in Where view
   - Reverse geocode to get current city
   - Prefill autocomplete with current location

5. **Advanced Filters**
   - "Hotels with X amenity near Y attraction"
   - Combine distance + facilities filtering
   - Multi-point routing (hotels between A and B)

---

## Cost Optimization Checklist

✅ **Session Tokens**
- One session token per search flow
- Autocomplete + Details = 1 SKU charge
- Token refreshes on new search

✅ **Client-Side Filtering**
- Filter place types client-side (no extra API calls)
- Rank predictions client-side (no extra API calls)
- Limit results to top 10 (reduce render load)

✅ **Caching**
- Server-side: No caching needed (autocomplete is real-time)
- Client-side: Cache selected place details for session

✅ **Field Masking**
- Only request needed fields from Details API
- Reduces response size and cost

✅ **Debouncing**
- 300ms debounce on autocomplete input
- Prevents API spam during typing

✅ **Error Handling**
- Graceful fallback to LITEAPI places if Google fails
- No repeated failed API calls

---

## Success Metrics

### Performance
- Autocomplete latency: < 300ms p95
- Place details fetch: < 500ms p95
- Distance calculation: < 50ms for 100 hotels

### Cost
- Google Places API: < $100/month for 30,000 sessions
- Stay within $200 free monthly credit initially

### UX
- User selects correct place on first try: > 90%
- Users who apply distance filter: > 15% (for relevant searches)
- Conversion rate (search → booking): baseline + 5%

### Technical
- API error rate: < 0.1%
- Session token usage: 100% of searches
- Client-side filter accuracy: 100%
- **Content filtering accuracy: 100% (zero restricted content shown)**
- **Content filter logs: monitored daily for attempts**

---

## Implementation Sequence

### Must-Have (MVP)
1. Phase 1-3: Core data models & Google Places integration
2. **Phase 3.5: Content filtering (CRITICAL - implement immediately)**
3. Phase 4: Place details normalization
4. Phase 6: API routes
5. Phase 7: LITEAPI integration
6. Phase 12: Session token management
7. Phase 13: Environment setup

### Should-Have (V1.1)
6. Phase 8-9: Distance sorting & radius filtering
7. Phase 10: Routing logic
8. Phase 11: Distance display in cards

### Nice-to-Have (V1.2)
9. Phase 5: Top cities for countries
10. Phase 15: Country landing pages
11. Future enhancements: caching, photos, geolocation

---

## Questions for Product/Stakeholders

1. **Country Landing Pages:** Do we want dedicated landing pages for countries, or go straight to results?
2. **Hotel Place Selection:** Should we invest in placeId→hotelId mapping for direct hotel page navigation?
3. **Default Radius:** What's the ideal default radius for distance filtering? (Current: 10km)
4. **Top Cities Priority:** Which countries should we prioritize for top cities curation?
5. **Cost Budget:** What's the acceptable monthly Google Maps API budget?

---

## Rollout Timeline

| Week | Phase | Milestone |
|------|-------|-----------|
| 1 | Backend | API routes + data models |
| 2 | Frontend | SearchModal integration (dev only) |
| 3 | Distance | Sorting + filtering (dev only) |
| 4 | Testing | A/B test 10% users |
| 5 | Rollout | Gradual rollout to 100% |
| 6 | Polish | Distance badges, routing refinements |
| 7+ | Enhancements | Top cities, caching, country pages |

---

## Appendix A: Type Definitions Reference

All new TypeScript types consolidated for reference:

```typescript
// src/lib/place-utils.ts
export interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  type: "country" | "city" | "hotel" | "airport" | "region" | "attraction";
  primaryType?: string;
  lat: number;
  lng: number;
  countryCode: string;
  countryName: string;
}

// src/lib/results-query.ts
export interface ResultsQueryParams {
  // ... existing ...
  centerLat?: number;
  centerLng?: number;
  searchRadius?: number;
  placeType?: PlaceSuggestion["type"];
  countryCode?: string;
}

// src/lib/search-routing.ts
export interface SearchRoutingDecision {
  destination: "hotel-page" | "results-list" | "country-landing";
  context: {
    hotelId?: string;
    enableDistanceSorting?: boolean;
    centerLat?: number;
    centerLng?: number;
    topCities?: any[];
  };
}
```

---

## Appendix B: API Contracts

### Google Places Autocomplete Request

```typescript
POST /api/google-places/autocomplete

Body:
{
  "input": "cairo",
  "sessionToken": "1234567890-abcdef",
  "languageCode": "en"
}

Response:
{
  "predictions": [
    {
      "placeId": "ChIJizKuijrlXhURq4X1S9OGLpY",
      "description": "Cairo, Egypt",
      "structuredFormatting": {
        "mainText": "Cairo",
        "secondaryText": "Egypt"
      },
      "types": ["locality", "political"],
      "primaryType": "locality"
    }
  ]
}
```

### Google Places Details Request

```typescript
POST /api/google-places/details

Body:
{
  "placeId": "ChIJizKuijrlXhURq4X1S9OGLpY",
  "fields": ["id", "displayName", "formattedAddress", "location", "addressComponents", "types"],
  "sessionToken": "1234567890-abcdef",
  "languageCode": "en"
}

Response:
{
  "id": "ChIJizKuijrlXhURq4X1S9OGLpY",
  "displayName": {
    "text": "Cairo",
    "languageCode": "en"
  },
  "formattedAddress": "Cairo, Egypt",
  "location": {
    "latitude": 30.0444,
    "longitude": 31.2357
  },
  "addressComponents": [
    {
      "long_name": "Cairo",
      "short_name": "Cairo",
      "types": ["locality", "political"]
    },
    {
      "long_name": "Egypt",
      "short_name": "EG",
      "types": ["country", "political"]
    }
  ],
  "types": ["locality", "political"]
}
```

---

**End of Implementation Plan**
