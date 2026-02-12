import { NextRequest, NextResponse } from "next/server";
import {
  shouldFilterPlace,
  isSuggestionTextIndicatingRestrictedCountry,
} from "@/config/content-restrictions";
import { mapLegacyAutocompleteToNewShape } from "@/lib/legacy-places-adapter";
import { USE_LEGACY_GOOGLE_PLACES } from "@/lib/places-api-config";

/**
 * Google Places Autocomplete API endpoint (Phase 6.1).
 * Proxies requests to Google Places API (New) or Legacy for cost control and security.
 *
 * When USE_LEGACY_GOOGLE_PLACES=true, calls legacy autocomplete and returns New-like shape.
 * Otherwise uses Places API (New).
 *
 * Cost optimization:
 * - Session tokens ensure autocomplete + details = 1 SKU charge
 * - Client-side filtering reduces unnecessary detail fetches
 *
 * Server-side content filtering (Layer 2 – defense in depth):
 * - Blocked place IDs are removed before the response reaches the client.
 * - Country-code filtering is handled downstream (place details & results layers)
 *   because autocomplete predictions don't include addressComponents.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, sessionToken, languageCode } = body;

    if (!input || input.trim().length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    const trimmedInput = input.trim();
    const language = languageCode === "ar" ? "ar" : (languageCode || "en");

    if (USE_LEGACY_GOOGLE_PLACES) {
      // Legacy: GET place/autocomplete/json
      const params = new URLSearchParams({
        input: trimmedInput,
        key: apiKey,
        language,
      });
      if (sessionToken) params.set("sessiontoken", sessionToken);
      // MENA bias: center Egypt, radius 2000km
      params.set("location", "26.8206,30.8025");
      params.set("radius", "2000000");

      const legacyUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
      const response = await fetch(legacyUrl, { method: "GET" });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Google Places Autocomplete (legacy) error:", errorText);
        let errorDetail: unknown = null;
        try {
          errorDetail = errorText ? JSON.parse(errorText) : null;
        } catch {
          errorDetail = errorText || null;
        }
        return NextResponse.json(
          {
            error: "Failed to fetch autocomplete suggestions",
            detail: errorDetail,
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      const mapped = mapLegacyAutocompleteToNewShape(data);

      // Same server-side content filter as New API path (place ID + Israel text)
      if (mapped.suggestions && mapped.suggestions.length > 0) {
        mapped.suggestions = mapped.suggestions.filter((suggestion) => {
          const prediction = suggestion?.placePrediction;
          if (!prediction) return true;
          const displayText =
            prediction.text?.text ??
            [prediction.structuredFormat?.mainText?.text, prediction.structuredFormat?.secondaryText?.text]
              .filter(Boolean)
              .join(", ");
          const isRestricted =
            shouldFilterPlace({ placeId: prediction.placeId }) ||
            isSuggestionTextIndicatingRestrictedCountry(displayText);
          if (isRestricted) {
            console.log(
              `[Content Filter] Blocked autocomplete prediction: ${displayText || prediction.placeId}`
            );
          }
          return !isRestricted;
        });
      }

      return NextResponse.json(mapped);
    }

    // New API: POST places:autocomplete (circle radius max 50,000 m per API)
    const requestBody = {
      input: trimmedInput,
      locationBias: {
        circle: {
          center: { latitude: 26.8206, longitude: 30.8025 },
          radius: 50000,
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
      const errorText = await response.text();
      console.error("Google Places Autocomplete error:", errorText);
      let errorDetail: unknown = null;
      try {
        errorDetail = errorText ? JSON.parse(errorText) : null;
      } catch {
        errorDetail = errorText || null;
      }
      return NextResponse.json(
        {
          error: "Failed to fetch autocomplete suggestions",
          detail: errorDetail,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // SERVER-SIDE FILTER: Remove restricted content (place ID + Israel text).
    // Autocomplete predictions don't include addressComponents, so we also
    // filter by suggestion text indicating Israel.
    if (data.suggestions && Array.isArray(data.suggestions)) {
      data.suggestions = data.suggestions.filter((suggestion: any) => {
        const prediction = suggestion?.placePrediction;
        if (!prediction) return true; // keep non-place suggestions

        const displayText =
          prediction.text?.text ??
          [prediction.structuredFormat?.mainText?.text, prediction.structuredFormat?.secondaryText?.text]
            .filter(Boolean)
            .join(", ");
        const isRestricted =
          shouldFilterPlace({ placeId: prediction.placeId }) ||
          isSuggestionTextIndicatingRestrictedCountry(displayText);

        if (isRestricted) {
          console.log(
            `[Content Filter] Blocked autocomplete prediction: ${displayText || prediction.placeId}`
          );
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
