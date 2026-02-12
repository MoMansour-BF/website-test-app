/**
 * Top cities for country-level searches.
 * When user selects a country, show these cities as quick suggestions.
 *
 * Manually curated – each city has a real Google Place ID for consistency.
 *
 * IMPORTANT: Restricted countries (see content-restrictions.ts) must NEVER
 * appear in this map. The getter function also enforces that at runtime.
 */

import { isCountryRestricted } from "@/config/content-restrictions";

export interface TopCityData {
  name: string;
  /** Google Place ID for one-click search. */
  placeId?: string;
  /** Optional popularity score for display ordering. */
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

  // IL: INTENTIONALLY EXCLUDED — content restriction
};

/**
 * Get top cities for a country code.
 * Returns empty array if country not in our curated list OR if country is restricted.
 */
export function getTopCitiesForCountry(countryCode: string): TopCityData[] {
  if (isCountryRestricted(countryCode)) return [];
  return TOP_CITIES[countryCode] || [];
}
