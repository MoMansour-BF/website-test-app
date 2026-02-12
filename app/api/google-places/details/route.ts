import { NextRequest, NextResponse } from "next/server";
import {
  isPlaceIdRestricted,
  isCountryRestricted,
} from "@/config/content-restrictions";
import { mapLegacyDetailsToNewShape } from "@/lib/legacy-places-adapter";
import { USE_LEGACY_GOOGLE_PLACES } from "@/lib/places-api-config";

/**
 * Google Places Details API endpoint (Phase 6.2).
 * Fetches full place details when user selects an autocomplete suggestion.
 * Uses session token for cost optimization (same session as autocomplete = 1 SKU).
 *
 * When USE_LEGACY_GOOGLE_PLACES=true, calls legacy place details and returns New-like shape.
 * Otherwise uses Places API (New).
 *
 * Server-side content filtering (Layer 3 – defense in depth):
 * - Blocked place IDs are rejected before making the upstream request.
 * - After fetching, the response country code is verified against restrictions.
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

    // BLOCK RESTRICTED PLACE IDS (pre-fetch gate)
    if (isPlaceIdRestricted(placeId)) {
      console.log(
        `[Content Filter] Blocked place details request: ${placeId}`
      );
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

    if (USE_LEGACY_GOOGLE_PLACES) {
      // Legacy: GET place/details/json
      const params = new URLSearchParams({
        place_id: placeId,
        key: apiKey,
        fields:
          "name,formatted_address,geometry,address_components,types",
      });
      if (sessionToken) params.set("session_token", sessionToken);

      const legacyUrl = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
      const response = await fetch(legacyUrl, { method: "GET" });

      if (!response.ok) {
        const error = await response.text();
        console.error("Google Places Details (legacy) error:", error);
        return NextResponse.json(
          { error: "Failed to fetch place details" },
          { status: response.status }
        );
      }

      const data = await response.json();
      if (data.status !== "OK" || !data.result) {
        return NextResponse.json(
          { error: "Place not available" },
          { status: 404 }
        );
      }

      const mapped = mapLegacyDetailsToNewShape(data.result);
      // Ensure id/placeId are always set (legacy result can omit place_id in some cases)
      if (!mapped.placeId) mapped.placeId = placeId;
      if (!mapped.id) mapped.id = placeId;

      // Same country restriction as New API path (post-fetch gate)
      const countryComponent = mapped.addressComponents?.find((c) =>
        c.types?.includes("country")
      );
      const countryCode = countryComponent?.shortText;

      if (isCountryRestricted(countryCode)) {
        console.log(
          `[Content Filter] Blocked place details by country: ${mapped.displayName ?? placeId} (${countryCode})`
        );
        return NextResponse.json(
          { error: "Place not available" },
          { status: 404 }
        );
      }

      return NextResponse.json(mapped);
    }

    // New API: GET places/{placeId}
    const fieldMask =
      fields?.join(",") ||
      "id,displayName,formattedAddress,location,addressComponents,types,primaryType";

    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
    );
    if (languageCode) {
      url.searchParams.set("languageCode", languageCode);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
        ...(sessionToken
          ? { "X-Goog-Session-Token": sessionToken }
          : {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Places Details error:", error);
      return NextResponse.json(
        { error: "Failed to fetch place details" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // DOUBLE-CHECK: Filter by country code in response (post-fetch gate)
    const countryComponent = data.addressComponents?.find((c: any) =>
      c.types?.includes("country")
    );
    const countryCode = countryComponent?.shortText ?? countryComponent?.short_name;

    if (isCountryRestricted(countryCode)) {
      console.log(
        `[Content Filter] Blocked place details by country: ${data.displayName?.text ?? placeId} (${countryCode})`
      );
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
