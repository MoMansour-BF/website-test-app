import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode/reverse?lat=...&lng=...
 * Returns the country code (ISO 3166-1 alpha-2) for the given coordinates.
 * Used when the user does "Search this area" so we can set countryCode from the map center.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const latNum = lat != null && lat !== "" ? Number(lat) : NaN;
  const lngNum = lng != null && lng !== "" ? Number(lng) : NaN;
  if (Number.isNaN(latNum) || Number.isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return NextResponse.json(
      { error: "Valid lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geocoding not configured" },
      { status: 500 }
    );
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}&result_type=country`;
  const response = await fetch(url);
  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to reverse geocode" },
      { status: response.status }
    );
  }

  const data = (await response.json()) as {
    status?: string;
    results?: Array<{
      address_components?: Array<{
        short_name?: string;
        types?: string[];
      }>;
    }>;
  };

  if (data.status !== "OK" || !data.results?.length) {
    return NextResponse.json({ countryCode: null });
  }

  for (const result of data.results) {
    const country = result.address_components?.find((c) =>
      c.types?.includes("country")
    );
    if (country?.short_name) {
      return NextResponse.json({ countryCode: country.short_name });
    }
  }

  return NextResponse.json({ countryCode: null });
}
