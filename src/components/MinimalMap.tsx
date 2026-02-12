"use client";

import { loadGoogleMapsScript, DEFAULT_MAP_OPTIONS } from "@/lib/google-maps";
import { useEffect, useRef, useState } from "react";

const CAIRO_CENTER = { lat: 30.0444, lng: 31.2357 };
const MAP_ZOOM = 12;
const MAP_HEIGHT_PX = 350;

export function MinimalMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setError("Google Maps API key is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const google = (window as unknown as { google: { maps: { Map: new (el: HTMLElement, opts: object) => void; LatLng: new (lat: number, lng: number) => unknown } } }).google;
        try {
          new google.maps.Map(containerRef.current, {
            ...DEFAULT_MAP_OPTIONS,
            center: CAIRO_CENTER,
            zoom: MAP_ZOOM,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to initialize the map.");
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load the map. Check your API key and referrer restrictions.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] text-center text-sm text-[var(--muted-foreground)] px-4 py-8"
        style={{ minHeight: MAP_HEIGHT_PX }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--sky-blue)] bg-[var(--muted)]" style={{ height: MAP_HEIGHT_PX }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
          Loading map…
        </div>
      )}
      <div ref={containerRef} className="w-full h-full min-h-[200px]" style={{ height: MAP_HEIGHT_PX }} aria-hidden={loading} />
    </div>
  );
}
