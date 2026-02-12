/**
 * Phase 10: Routing logic based on selected place type.
 * Determines destination (results-list vs future hotel-page/country-landing)
 * and context (distance sorting, center point, top cities).
 */

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
    /** For results-list: center point for sorting */
    centerLng?: number;
    /** For country-landing: top cities to suggest */
    topCities?: ReturnType<typeof getTopCitiesForCountry>;
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
      const topCities = countryCode ? getTopCitiesForCountry(countryCode) : [];

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
      // Fallback: standard results (e.g. type undefined from legacy flows)
      return {
        destination: "results-list",
        context: {},
      };
  }
}
