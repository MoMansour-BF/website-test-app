"use client";

import { RoomSelector } from "@/components/RoomSelector";
import { useLocaleCurrency } from "@/context/LocaleCurrencyContext";
import { DEFAULT_OCCUPANCIES, type Occupancy, serializeOccupancies } from "@/lib/occupancy";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type SearchMode = "place" | "vibe";

interface PlaceSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
}

export default function HomePage() {
  const router = useRouter();
  const { locale } = useLocaleCurrency();
  const [mode, setMode] = useState<SearchMode>("place");
  const [query, setQuery] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [occupancies, setOccupancies] = useState<Occupancy[]>(() => DEFAULT_OCCUPANCIES);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const dateDefaultsInitializedRef = useRef(false);

  // Set default dates only on first load (do not overwrite after user changes)
  useEffect(() => {
    if (dateDefaultsInitializedRef.current) return;
    dateDefaultsInitializedRef.current = true;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setCheckin((prev) => (prev === "" ? formatDateForInput(today) : prev));
    setCheckout((prev) => (prev === "" ? formatDateForInput(tomorrow) : prev));
  }, []);

  // Fetch places suggestions for destination search with debounce
  useEffect(() => {
    if (mode !== "place") return;
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setPlacesError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoadingPlaces(true);
        setPlacesError(null);
        const params = new URLSearchParams({ q: query.trim() });
        if (locale) params.set("language", locale);
        const res = await fetch(`/api/places?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error("Failed to load places");
        }
        const json = await res.json();
        const data = (json?.data ?? []) as any[];
        setSuggestions(
          data.map((p) => ({
            placeId: p.placeId,
            displayName: p.displayName,
            formattedAddress: p.formattedAddress
          }))
        );
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setPlacesError("Could not load destinations");
      } finally {
        setLoadingPlaces(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [mode, query, locale]);

  const canSubmit =
    !!checkin &&
    !!checkout &&
    ((mode === "place" && !!placeId) ||
      (mode === "vibe" && !!query.trim()));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const params = new URLSearchParams({
      mode,
      checkin,
      checkout,
      occupancies: serializeOccupancies(occupancies)
    });

    if (mode === "place" && placeId && placeLabel) {
      params.set("placeId", placeId);
      params.set("placeName", placeLabel);
    } else if (mode === "vibe") {
      params.set("aiSearch", query.trim());
    }

    router.push(`/results?${params.toString()}`);
  };

  const handleToggleMode = (nextMode: SearchMode) => {
    setMode(nextMode);
    setSuggestions([]);
    setPlacesError(null);
    setPlaceId(null);
    setPlaceLabel(null);
    setQuery("");
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setPlaceId(place.placeId);
    setPlaceLabel(place.displayName);
    setQuery(place.displayName);
    setSuggestions([]);
    setPlacesError(null);
  };

  return (
    <main className="flex-1 flex flex-col px-4 pb-6 pt-8 gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Find your next stay
        </h1>
        <p className="text-sm text-slate-300">
          Search by destination or vibe, pick your dates, and book in minutes.
        </p>
      </header>

      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 shadow-lg shadow-slate-950/50">
        <div className="flex rounded-full bg-slate-800 p-1 text-xs mb-4">
          <button
            type="button"
            onClick={() => handleToggleMode("place")}
            className={`flex-1 px-3 py-2 rounded-full transition text-center ${mode === "place"
              ? "bg-slate-50 text-slate-900 font-medium shadow-sm"
              : "text-slate-300"
              }`}
          >
            Destination
          </button>
          <button
            type="button"
            onClick={() => handleToggleMode("vibe")}
            className={`flex-1 px-3 py-2 rounded-full transition text-center ${mode === "vibe"
              ? "bg-slate-50 text-slate-900 font-medium shadow-sm"
              : "text-slate-300"
              }`}
          >
            Search by vibe
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              {mode === "place" ? "Destination" : "What are you looking for?"}
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "place"
                  ? "City, landmark, or area"
                  : "e.g. romantic getaway in Paris"
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {mode === "place" && (
              <div className="relative">
                {loadingPlaces && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Searching destinations…
                  </p>
                )}
                {placesError && (
                  <p className="text-[11px] text-red-400 mt-1">
                    {placesError}
                  </p>
                )}
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur shadow-xl">
                    {suggestions.map((place) => (
                      <li key={place.placeId}>
                        <button
                          type="button"
                          onClick={() => handleSelectPlace(place)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-50 hover:bg-slate-800/80"
                        >
                          <div className="font-medium">
                            {place.displayName}
                          </div>
                          {place.formattedAddress && (
                            <div className="text-[11px] text-slate-400">
                              {place.formattedAddress}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                Check-in
              </label>
              <input
                type="date"
                value={checkin}
                onChange={(e) => {
                  const newCheckin = e.target.value;
                  setCheckin(newCheckin);
                  // Auto-adjust checkout if it's not at least 1 day after new check-in
                  if (newCheckin && checkout) {
                    const checkinDate = new Date(newCheckin);
                    const checkoutDate = new Date(checkout);
                    if (checkoutDate <= checkinDate) {
                      const newCheckout = new Date(checkinDate);
                      newCheckout.setDate(newCheckout.getDate() + 1);
                      setCheckout(formatDateForInput(newCheckout));
                    }
                  } else if (newCheckin && !checkout) {
                    // If checkout is empty, set it to check-in + 1
                    const checkinDate = new Date(newCheckin);
                    const newCheckout = new Date(checkinDate);
                    newCheckout.setDate(newCheckout.getDate() + 1);
                    setCheckout(formatDateForInput(newCheckout));
                  }
                }}
                min={formatDateForInput(new Date())}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                Check-out
              </label>
              <input
                type="date"
                value={checkout}
                onChange={(e) => setCheckout(e.target.value)}
                min={
                  checkin
                    ? (() => {
                      const minDate = new Date(checkin);
                      minDate.setDate(minDate.getDate() + 1);
                      return formatDateForInput(minDate);
                    })()
                    : formatDateForInput(new Date())
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
              />
            </div>
          </div>

          <RoomSelector occupancies={occupancies} onChange={setOccupancies} />

          <button
            type="submit"
            className="w-full mt-2 rounded-full bg-emerald-500 text-slate-900 text-sm font-semibold py-3 shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSubmit}
          >
            Search stays
          </button>
        </form>
      </section>

      <p className="text-[11px] text-slate-500 text-center px-4">
        Powered by LiteAPI sandbox. This is a demo experience; prices and
        availability may not reflect real inventory.
      </p>
    </main>
  );
}

