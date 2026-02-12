"use client";

import { loadGoogleMapsScript, DEFAULT_MAP_OPTIONS } from "@/lib/google-maps";
import { useEffect, useRef, useState } from "react";

const MAP_ZOOM = 15;
const MAP_HEIGHT_PX = 280;

interface GoogleMapsWindow {
  google: {
    maps: {
      Map: new (el: HTMLElement, opts: Record<string, unknown>) => { setCenter: (c: unknown) => void };
      Marker: new (opts: { map: unknown; position: unknown; title?: string }) => void;
      LatLng: new (lat: number, lng: number) => unknown;
    };
  };
}

function getGoogle(): GoogleMapsWindow["google"] {
  return (window as unknown as GoogleMapsWindow).google;
}

export interface HotelPageMapProps {
  /** Phase 2: from details.location — only render when present. */
  location: { latitude: number; longitude: number };
  /** Optional hotel name for marker title / accessibility. */
  hotelName?: string;
}

/**
 * Phase 2: Small embedded map for the hotel detail page with one marker.
 * Uses same script loader as MinimalMap; only render when details.location is present.
 * Reduces POI clutter (clickableIcons: false) to match Phase 3.7.
 */
export function HotelPageMap({ location, hotelName }: HotelPageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setError(
        "Google Maps API key is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment."
      );
      setLoading(false);
      return;
    }

    const lat = location.latitude;
    const lng = location.longitude;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      setError("Invalid location coordinates.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const google = getGoogle();
        const center = new google.maps.LatLng(lat, lng);
        try {
          const map = new google.maps.Map(containerRef.current, {
            ...DEFAULT_MAP_OPTIONS,
            center,
            zoom: MAP_ZOOM,
          });
          new google.maps.Marker({
            map,
            position: center,
            title: hotelName ?? "Hotel location",
          });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Failed to initialize the map."
          );
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load the map. Check your API key and referrer restrictions."
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.latitude, location.longitude, hotelName]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] text-center text-sm text-[var(--muted-foreground)] px-4 py-6"
        style={{ minHeight: MAP_HEIGHT_PX }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-[var(--sky-blue)] bg-[var(--muted)]"
      style={{ height: MAP_HEIGHT_PX }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
          Loading map…
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full min-h-[200px]"
        style={{ height: MAP_HEIGHT_PX }}
        aria-hidden={loading}
        aria-label={hotelName ? `Map: ${hotelName} location` : "Hotel location map"}
      />
    </div>
  );
}
