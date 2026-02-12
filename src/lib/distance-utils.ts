/**
 * Phase 8: Distance calculation and formatting for results sorting and radius filter.
 * Haversine formula for great-circle distance between two lat/lng points.
 */

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
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
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
  hotels: { id: string }[],
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
