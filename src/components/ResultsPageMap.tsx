"use client";

import { loadGoogleMapsScript, DEFAULT_MAP_OPTIONS } from "@/lib/google-maps";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { HeartIcon, HeartIconFilled, FilterIcon } from "@/components/Icons";
import Link from "next/link";
import type { HotelCardHotel, HotelCardPrice } from "@/components/HotelCard";
import type { ResultsQueryParams } from "@/lib/results-query";

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
          setCenter: (c: { lat: () => number; lng: () => number }) => void;
          getCenter: () => { lat: () => number; lng: () => number };
          panTo: (c: { lat: () => number; lng: () => number }) => void;
          setZoom: (z: number) => void;
          fitBounds: (b: { getNorthEast: () => { lat: () => number; lng: () => number }; getSouthWest: () => { lat: () => number; lng: () => number } }, padding?: number) => void;
          getZoom: () => number;
          getBounds: () => { getNorthEast: () => { lat: () => number; lng: () => number }; getSouthWest: () => { lat: () => number; lng: () => number } } | null;
        };
        LatLng: new (lat: number, lng: number) => { lat: () => number; lng: () => number };
        LatLngBounds: new (sw?: { lat: () => number; lng: () => number }, ne?: { lat: () => number; lng: () => number }) => {
          extend: (p: { lat: () => number; lng: () => number }) => void;
          getNorthEast: () => { lat: () => number; lng: () => number };
          getSouthWest: () => { lat: () => number; lng: () => number };
          isEmpty: () => boolean;
        };
        OverlayView: new () => {
          setMap: (map: unknown) => void;
          getMap: () => unknown;
          getPanes: () => { overlayMouseTarget: HTMLElement };
          getProjection: () => MapProjection | null;
          draw: () => void;
          onRemove: () => void;
        };
        event: {
          addListener: (target: unknown, event: string, handler: (...args: unknown[]) => void) => { remove: () => void };
          removeListener: (listener: { remove: () => void }) => void;
          clearInstanceListeners: (target: unknown) => void;
        };
      };
    };
  }
}

interface MapProjection {
  fromLatLngToDivPixel: (latLng: { lat: () => number; lng: () => number }) => { x: number; y: number };
  fromDivPixelToLatLng: (pixel: { x: number; y: number }) => { lat: () => number; lng: () => number };
}

const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 };
const DEFAULT_ZOOM = 12;
/** Phase 4: max radius for "search this area" (meters). LiteAPI may cap at 50000. */
const MAX_SEARCH_RADIUS_METERS = 50000;
/** Zoom-dependent cluster radius (degrees). Same zoom + same lat/lng => same cluster (consistent when zooming back). */
function getClusterRadiusDeg(zoom: number): number {
  return 0.02 * Math.pow(2, 10 - Math.max(8, Math.min(20, zoom)));
}
/** Duration of smooth zoom/pan animation when clicking a cluster (ms). Decluster only after this ends. */
const CLUSTER_ZOOM_ANIMATION_MS = 450;
/** Ease-out: fast start, slow end. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export interface ResultsPageMapProps {
  onClose: () => void;
  onOpenFilters: () => void;
  /** Filtered + sorted hotel list (same as list view). */
  hotels: HotelCardHotel[];
  hotelDetailsByHotelId: Record<string, { location?: { latitude: number; longitude: number }; rating?: number; reviewCount?: number; starRating?: number }>;
  pricesByHotelId: Record<string, HotelCardPrice>;
  hasRefundableByHotelId: Record<string, boolean>;
  currency: string;
  nights: number;
  occupanciesLength: number;
  queryParams: ResultsQueryParams;
  serializeResultsQuery: (params: ResultsQueryParams) => URLSearchParams;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  /** Vibe search: no single place; center on markers. */
  isVibeSearch?: boolean;
  /** Phase 4: when user triggers "Search this area", call with map center and radius in meters. Parent updates URL and refetches. */
  onSearchThisArea?: (center: { lat: number; lng: number }, radiusMeters: number) => void;
}

/** Custom overlay that shows a price label (rounded rect) on the map. */
function createPriceOverlay(
  google: NonNullable<Window["google"]>,
  position: { lat: () => number; lng: () => number },
  label: string,
  onClick: () => void
) {
  const OverlayView = google.maps.OverlayView;
  const LatLng = google.maps.LatLng;
  class PriceOverlay extends OverlayView {
    private div: HTMLDivElement | null = null;
    private position: { lat: () => number; lng: () => number };
    private label: string;
    private onClick: () => void;

    constructor(
      pos: { lat: () => number; lng: () => number },
      lbl: string,
      fn: () => void
    ) {
      super();
      this.position = pos;
      this.label = lbl;
      this.onClick = fn;
    }

    onAdd() {
      this.div = document.createElement("div");
      this.div.style.position = "absolute";
      this.div.style.cursor = "pointer";
      this.div.style.whiteSpace = "nowrap";
      this.div.style.fontSize = "12px";
      this.div.style.fontWeight = "600";
      this.div.style.color = "var(--dark-text, #1a1a1a)";
      this.div.style.background = "var(--light-bg, #f5f5f5)";
      this.div.style.border = "1px solid var(--sky-blue, #b8d4e3)";
      this.div.style.borderRadius = "999px";
      this.div.style.padding = "4px 10px";
      this.div.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
      this.div.textContent = this.label;
      this.div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onClick();
      });
      const panes = this.getPanes();
      if (panes?.overlayMouseTarget) panes.overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) return;
      const projection = (this as unknown as { getProjection: () => { fromLatLngToDivPixel: (latLng: unknown) => { x: number; y: number } } | null }).getProjection?.();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new LatLng(this.position.lat(), this.position.lng())
      );
      if (point) {
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
        this.div.style.transform = "translate(-50%, -50%)";
      }
    }

    onRemove() {
      if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }

    getPosition() {
      return this.position;
    }
  }
  return new PriceOverlay(position, label, onClick);
}

/** Cluster overlay: shows "N properties"; click = zoom in to decluster (with animation). */
function createClusterOverlay(
  google: NonNullable<Window["google"]>,
  position: { lat: () => number; lng: () => number },
  count: number,
  onClick: () => void
) {
  const OverlayView = google.maps.OverlayView;
  const LatLng = google.maps.LatLng;
  class ClusterOverlay extends OverlayView {
    private div: HTMLDivElement | null = null;
    private position: { lat: () => number; lng: () => number };
    private count: number;
    private onClick: () => void;

    constructor(
      pos: { lat: () => number; lng: () => number },
      cnt: number,
      fn: () => void
    ) {
      super();
      this.position = pos;
      this.count = cnt;
      this.onClick = fn;
    }

    onAdd() {
      this.div = document.createElement("div");
      this.div.style.position = "absolute";
      this.div.style.cursor = "pointer";
      this.div.style.whiteSpace = "nowrap";
      this.div.style.fontSize = "11px";
      this.div.style.fontWeight = "600";
      this.div.style.color = "var(--primary, #0d9488)";
      this.div.style.background = "white";
      this.div.style.border = "2px solid var(--primary, #0d9488)";
      this.div.style.borderRadius = "999px";
      this.div.style.padding = "6px 12px";
      this.div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
      this.div.style.transition = "transform 0.15s ease";
      this.div.textContent = `${this.count} propert${this.count === 1 ? "y" : "ies"}`;
      this.div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.div && (this.div.style.transform = "translate(-50%, -50%) scale(0.92)");
        setTimeout(() => { this.div && (this.div.style.transform = "translate(-50%, -50%) scale(1)"); }, 150);
        this.onClick();
      });
      const panes = this.getPanes();
      if (panes?.overlayMouseTarget) panes.overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) return;
      const projection = (this as unknown as { getProjection: () => { fromLatLngToDivPixel: (latLng: unknown) => { x: number; y: number } } | null }).getProjection?.();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new LatLng(this.position.lat(), this.position.lng())
      );
      if (point) {
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
        this.div.style.transform = "translate(-50%, -50%)";
      }
    }

    onRemove() {
      if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  }
  return new ClusterOverlay(position, count, onClick);
}

/**
 * Phase 3: Full-screen results map with price markers, clustering, and bottom-sheet hotel card.
 * Filters remain available via onOpenFilters; closing returns to list (same URL/state).
 */
export function ResultsPageMap({
  onClose,
  onOpenFilters,
  hotels,
  hotelDetailsByHotelId,
  pricesByHotelId,
  hasRefundableByHotelId,
  currency,
  nights,
  occupanciesLength,
  queryParams,
  serializeResultsQuery,
  isFavorite,
  onToggleFavorite,
  isVibeSearch = false,
  onSearchThisArea,
}: ResultsPageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<NonNullable<Window["google"]>["maps"]["Map"]> | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const projectionRef = useRef<MapProjection | null>(null);
  const projectionReadySetRef = useRef(false);
  /** When true, zoom_changed is ignored so markers don't redraw mid-animation; decluster when animation ends. */
  const clusterZoomAnimationInProgressRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelCardHotel | null>(null);
  const [projectionReady, setProjectionReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_ZOOM);
  const [searchAreaLoading, setSearchAreaLoading] = useState(false);

  // Phase 4: get map center and radius from current bounds; call onSearchThisArea (await if async for loading state)
  const handleSearchThisArea = useCallback(async () => {
    if (!onSearchThisArea || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = { lat: (ne.lat() + sw.lat()) / 2, lng: (ne.lng() + sw.lng()) / 2 };
    let radiusMeters: number;
    const geo = (window.google.maps as unknown as { geometry?: { spherical?: { computeDistanceBetween: (a: { lat: () => number; lng: () => number }, b: { lat: () => number; lng: () => number }) => number } } }).geometry;
    if (geo?.spherical?.computeDistanceBetween) {
      const LatLng = window.google.maps.LatLng;
      const diameter = geo.spherical.computeDistanceBetween(new LatLng(sw.lat(), sw.lng()), new LatLng(ne.lat(), ne.lng()));
      radiusMeters = Math.min(diameter / 2, MAX_SEARCH_RADIUS_METERS);
    } else {
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((center.lat * Math.PI) / 180);
      const w = (ne.lng() - sw.lng()) * mPerDegLng;
      const h = (ne.lat() - sw.lat()) * mPerDegLat;
      radiusMeters = Math.min(Math.sqrt(w * w + h * h) / 2, MAX_SEARCH_RADIUS_METERS);
    }
    if (radiusMeters < 100) return; // avoid tiny radius
    setSearchAreaLoading(true);
    try {
      const result = onSearchThisArea(center, Math.round(radiusMeters));
      if (result != null && typeof (result as Promise<unknown>).then === "function") {
        await (result as Promise<unknown>);
      }
    } finally {
      setSearchAreaLoading(false);
    }
  }, [onSearchThisArea]);

  // Hotels with known location (same filtered list as list view)
  const hotelsWithLocation = useMemo(() => {
    return hotels
      .map((h) => {
        const loc = hotelDetailsByHotelId[h.id]?.location;
        if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;
        return { hotel: h, lat: loc.latitude, lng: loc.longitude };
      })
      .filter((x): x is { hotel: HotelCardHotel; lat: number; lng: number } => x !== null);
  }, [hotels, hotelDetailsByHotelId]);

  const hasAnyLocation = hotelsWithLocation.length > 0;

  // Format price for marker label (e.g. "EGP 6,581")
  const formatPrice = useCallback(
    (amount: number) => {
      return `${currency}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
    [currency]
  );

  // Initialize map once
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setError("Google Maps API key is not configured.");
      return;
    }
    if (!containerRef.current) return;

    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const google = window.google;
        const center = hasAnyLocation
          ? (() => {
              const first = hotelsWithLocation[0];
              return new google.maps.LatLng(first.lat, first.lng);
            })()
          : new google.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
        const map = new google.maps.Map(containerRef.current, {
          ...DEFAULT_MAP_OPTIONS,
          center,
          zoom: hasAnyLocation ? 13 : DEFAULT_ZOOM,
        });
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load map.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fit bounds when we have locations and map is ready; then draw markers
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps || !hasAnyLocation) return;
    const google = window.google;
    const map = mapRef.current;

    const bounds = new google.maps.LatLngBounds();
    hotelsWithLocation.forEach(({ lat, lng }) => bounds.extend(new google.maps.LatLng(lat, lng)));
    if (!bounds.isEmpty()) {
      try {
        map.fitBounds(bounds);
      } catch {
        // ignore
      }
    }
  }, [mapReady, hasAnyLocation, hotelsWithLocation]);

  // Projection overlay: exposes map projection for pixel-based clustering (draw runs after map ready)
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    const google = window.google;
    const map = mapRef.current;
    const OverlayView = google.maps.OverlayView;
    const LatLng = google.maps.LatLng;
    class ProjectionOverlay extends OverlayView {
      draw() {
        const proj = (this as unknown as { getProjection: () => MapProjection | null }).getProjection?.();
        if (proj) {
          projectionRef.current = proj;
          if (!projectionReadySetRef.current) {
            projectionReadySetRef.current = true;
            setProjectionReady(true);
          }
        }
      }
      onAdd() {}
      onRemove() {}
    }
    const projOverlay = new ProjectionOverlay();
    projOverlay.setMap(map);
    return () => {
      projOverlay.setMap(null);
    };
  }, [mapReady]);

  // Keep zoom level in state so re-clustering runs when user zooms. Skip updates during cluster-click animation so decluster happens only after animation ends.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    const z = map.getZoom();
    if (typeof z === "number") setZoomLevel(z);
    const handler = () => {
      if (clusterZoomAnimationInProgressRef.current) return;
      const newZoom = map.getZoom();
      if (typeof newZoom === "number") setZoomLevel(newZoom);
    };
    const listener = window.google.maps.event.addListener(map, "zoom_changed", handler);
    return () => window.google.maps.event.removeListener(listener);
  }, [mapReady]);

  // Draw markers and clusters: zoom-dependent lat/lng clustering; cluster click = zoom in, decluster when animation ends
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps || !projectionReady) return;
    const google = window.google;
    const map = mapRef.current;
    const projection = projectionRef.current;
    if (!projection || hotelsWithLocation.length === 0) return;

    overlaysRef.current.forEach((o) => {
      if (o && typeof (o as { setMap: (m: unknown) => void }).setMap === "function")
        (o as { setMap: (m: unknown) => void }).setMap(null);
    });
    overlaysRef.current = [];

    const LatLng = google.maps.LatLng;

    // Zoom-dependent lat/lng clustering: same zoom + same grid cell => same cluster (consistent when zooming back).
    const radius = getClusterRadiusDeg(zoomLevel);
    const cellKey = (lat: number, lng: number) =>
      `${Math.floor(lat / radius)}_${Math.floor(lng / radius)}`;
    const grid = new Map<string, { hotel: HotelCardHotel; lat: number; lng: number }[]>();
    hotelsWithLocation.forEach((item) => {
      const key = cellKey(item.lat, item.lng);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(item);
    });

    grid.forEach((items) => {
      const centerLat = items.reduce((a, i) => a + i.lat, 0) / items.length;
      const centerLng = items.reduce((a, i) => a + i.lng, 0) / items.length;
      const centerPos = new LatLng(centerLat, centerLng);

      if (items.length === 1) {
        const hotel = items[0].hotel;
        const price = pricesByHotelId[hotel.id];
        const label = price ? formatPrice(price.amount) : hotel.name.slice(0, 12);
        const overlay = createPriceOverlay(google, centerPos, label, () => setSelectedHotel(hotel));
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
        return;
      }

      // Cluster: click = smooth zoom/pan to cluster so markers decluster gradually (no teleport)
      const bounds = new google.maps.LatLngBounds();
      items.forEach((i) => bounds.extend(new LatLng(i.lat, i.lng)));
      const handleClusterClick = () => {
        const startCenter = map.getCenter();
        const startZoom = map.getZoom();
        if (startCenter == null || typeof startZoom !== "number") return;
        clusterZoomAnimationInProgressRef.current = true;
        const endLat = centerLat;
        const endLng = centerLng;
        const endZoom = Math.min(18, startZoom + 2);
        const startTime = performance.now();

        const tick = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(1, elapsed / CLUSTER_ZOOM_ANIMATION_MS);
          const eased = easeOutCubic(t);
          const lat = startCenter.lat() + (endLat - startCenter.lat()) * eased;
          const lng = startCenter.lng() + (endLng - startCenter.lng()) * eased;
          const z = startZoom + (endZoom - startZoom) * eased;
          map.setCenter(new LatLng(lat, lng));
          map.setZoom(z);
          if (t >= 1) {
            clusterZoomAnimationInProgressRef.current = false;
            const finalZoom = map.getZoom();
            if (typeof finalZoom === "number") setZoomLevel(finalZoom);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      };
      const overlay = createClusterOverlay(google, centerPos, items.length, handleClusterClick);
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    return () => {
      overlaysRef.current.forEach((o) => {
        if (o && typeof (o as { setMap: (m: unknown) => void }).setMap === "function")
          (o as { setMap: (m: unknown) => void }).setMap(null);
      });
      overlaysRef.current = [];
    };
  }, [mapReady, projectionReady, zoomLevel, hotelsWithLocation, pricesByHotelId, formatPrice]);

  const hrefParamsStr = useMemo(
    () => serializeResultsQuery(queryParams).toString(),
    [queryParams, serializeResultsQuery]
  );

  if (error) {
    return (
      <div className="fixed inset-0 z-[50] flex flex-col bg-[var(--light-bg)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sky-blue)] bg-white">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--dark-text)] hover:bg-[var(--muted)]"
            aria-label="Close map"
          >
            ←
          </button>
          <h2 className="text-sm font-semibold text-[var(--dark-text)]">Map</h2>
          <div className="w-10" />
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[var(--muted-foreground)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[50] flex flex-col bg-[var(--light-bg)]">
      {/* Top bar: Close, title, Filters — filters remain available (3.2, 3.2b) */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sky-blue)] bg-white shrink-0 safe-area-top">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          aria-label="Close map and return to list"
        >
          ←
        </button>
        <h2 className="text-sm font-semibold text-[var(--dark-text)]">Map</h2>
        <div className="flex items-center gap-2">
          {onSearchThisArea && (
            <button
              type="button"
              onClick={handleSearchThisArea}
              disabled={searchAreaLoading}
              className="rounded-full px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              aria-label="Search this area"
            >
              {searchAreaLoading ? "Searching…" : "Search this area"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFilters}
            className="rounded-full p-2 text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] flex items-center gap-1"
            aria-label="Filters"
          >
            <FilterIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Filters</span>
          </button>
        </div>
      </div>

      {/* Map container fills viewport */}
      <div className="relative flex-1 min-h-0">
        {!hasAnyLocation && mapReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--muted)]/80 p-4 text-center">
            <p className="text-sm text-[var(--dark-text)]">
              {isVibeSearch
                ? "Map available when you search by place."
                : "No location data for these hotels yet."}
            </p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" aria-hidden={!mapReady} />
      </div>

      {/* Bottom sheet: hotel card (3.4) */}
      {selectedHotel && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t border-[var(--sky-blue)] rounded-t-2xl shadow-lg max-h-[40vh] overflow-hidden flex flex-col"
          role="dialog"
          aria-label="Hotel details"
        >
          <div className="flex items-center justify-end p-2 border-b border-[var(--sky-blue)]">
            <button
              type="button"
              onClick={() => setSelectedHotel(null)}
              className="p-2 rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--dark-text)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-4 pb-6">
            <MapHotelCard
              hotel={selectedHotel}
              price={pricesByHotelId[selectedHotel.id]}
              hasRefundable={hasRefundableByHotelId[selectedHotel.id]}
              nights={nights}
              occupanciesLength={occupanciesLength}
              href={`/hotel/${selectedHotel.id}?${hrefParamsStr}`}
              isFavorite={isFavorite(selectedHotel.id)}
              onToggleFavorite={() => onToggleFavorite(selectedHotel.id)}
              onClose={() => setSelectedHotel(null)}
            />
          </div>
        </div>
      )}

    </div>
  );
}

/** Compact hotel card for map bottom sheet: image, name, stars, area, amenities (tags), rating, price, favorite, CTA. */
function MapHotelCard({
  hotel,
  price,
  hasRefundable,
  nights,
  occupanciesLength,
  href,
  isFavorite,
  onToggleFavorite,
  onClose,
}: {
  hotel: HotelCardHotel;
  price?: HotelCardPrice;
  hasRefundable?: boolean;
  nights: number;
  occupanciesLength: number;
  href: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-[var(--muted)]">
          {hotel.main_photo ? (
            <img src={hotel.main_photo} alt={hotel.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">No photo</div>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggleFavorite(); }}
            className="absolute top-1 right-1 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? <HeartIconFilled className="w-4 h-4 text-[var(--primary)]" /> : <HeartIcon className="w-4 h-4" />}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold text-[var(--dark-text)] leading-tight">{hotel.name}</h3>
            {hotel.starRating != null && hotel.starRating >= 1 && hotel.starRating <= 5 && (
              <span className="text-[var(--star)] text-xs font-medium">
                {"★".repeat(Math.round(hotel.starRating))}{"☆".repeat(5 - Math.round(hotel.starRating))}
              </span>
            )}
          </div>
          {hotel.address && <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{hotel.address}</p>}
          {hotel.tags && hotel.tags.length > 0 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{hotel.tags.slice(0, 3).join(" · ")}</p>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {hotel.rating != null && (
              <span className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-xs font-medium text-[var(--primary)]">
                {hotel.rating.toFixed(1)} {hotel.reviewCount != null ? `(${hotel.reviewCount.toLocaleString()} reviews)` : "Wonderful"}
              </span>
            )}
            {price && (
              <span className="text-sm font-semibold text-[var(--primary)]">
                {price.currency}{price.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                {price.taxIncluded ? " incl. taxes & fees" : " + taxes & fees"}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 pt-0">
        <Link
          href={href}
          onClick={onClose}
          className="block w-full rounded-full border border-[var(--primary)] bg-[var(--primary)] text-white text-center text-sm font-medium py-2.5 hover:opacity-90"
        >
          View hotel
        </Link>
      </div>
    </div>
  );
}
