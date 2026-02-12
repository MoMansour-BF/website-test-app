/**
 * Shared Google Maps script loader and map options for all map components.
 * Loads the Maps JavaScript API once per page; reuse across components.
 */

/** Brand hex colors from globals.css – used so map styling matches the site. */
const BRAND = {
  primary: "#057A5A",
  primaryHover: "#046349",
  darkText: "#20373A",
  lightBg: "#F6F6F6",
  oceanBlue: "#4EABBB",
  skyBlue: "#ABC5D1",
  muted: "#E5E7EB",
} as const;

/**
 * JSON map styles: hide POI business, hide park labels, keep transit lines;
 * optional brand-aligned colors for water, roads, and labels.
 */
export const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi.park",
    elementType: "labels.text",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit.line",
    stylers: [{ visibility: "on" }],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: BRAND.oceanBlue }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: BRAND.skyBlue }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: BRAND.muted }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: BRAND.darkText }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: BRAND.lightBg }] },
];

/**
 * Default options applied to every map: no Street View (Pegman), no Map/Satellite toggle,
 * zoom control only. Aligns with common OTA behavior (clean, minimal controls).
 */
export const DEFAULT_MAP_OPTIONS: google.maps.MapOptions = {
  styles: MAP_STYLES,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  zoomControl: true,
  scaleControl: false,
  rotateControl: false,
  clickableIcons: false,
};

let scriptLoadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Window undefined"));
  const win = window as unknown as { google?: { maps?: { Map?: unknown } } };
  if (win.google?.maps?.Map) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      if (win.google?.maps?.Map) {
        resolve();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onErr);
        reject(new Error("Failed to load Google Maps script."));
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onErr);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          "Failed to load the map. Check your API key and referrer restrictions."
        )
      );
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}
