"use client";

import { DateRangeCalendar } from "@/components/DateRangePicker";
import { RoomSelector } from "@/components/RoomSelector";
import {
  addDays,
  compareDay,
  formatDateForInput,
  formatRangeShort,
  getDaysBetween,
  parseYYYYMMDD,
} from "@/lib/date-utils";
import { type Occupancy, hasUnsetChildAges, totalGuests } from "@/lib/occupancy";
import {
  ArrowLeftIcon,
  CalendarIcon,
  EstablishmentIcon,
  HotelPlaceIcon,
  LocalityIcon,
  MapPinIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/Icons";
import { getPlaceDetails } from "@/lib/google-place-details";
import { normalizePlace } from "@/lib/normalize-location";
import { isSpecificHotelPlace, type PlaceSuggestion } from "@/lib/place-utils";
import { processPredictions } from "@/lib/process-predictions";
import { useGooglePlacesSession } from "@/hooks/useGooglePlacesSession";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RANGE_DAYS = 30;

/** Collapsed summary card: optional icon, label left, value right. Optional valueSecondary (e.g. sub-address). */
function CollapsedSummaryCard({
  label,
  value,
  valueSecondary,
  onClick,
  icon,
}: {
  label: string;
  value: string;
  valueSecondary?: string | null;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] text-left hover:border-[var(--ocean-blue)] hover:bg-white transition-colors duration-150 shadow-sm"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon != null && <span className="shrink-0">{icon}</span>}
        <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-right min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--dark-text)] truncate">
          {value}
        </span>
        {valueSecondary && (
          <span className="block text-xs text-[var(--muted-foreground)] truncate">
            {valueSecondary}
          </span>
        )}
      </div>
    </button>
  );
}

function WhenStepContent({
  checkin,
  checkout,
  onDatesChange,
  onClose,
  onNext,
  locale,
}: {
  checkin: string;
  checkout: string;
  onDatesChange: (range: { checkin: string; checkout: string }) => void;
  onClose: () => void;
  /** Called after saving dates; use to e.g. advance to Who view. */
  onNext: () => void;
  locale?: string;
}) {
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [startDate, setStartDate] = useState<Date | null>(() =>
    parseYYYYMMDD(checkin)
  );
  const [endDate, setEndDate] = useState<Date | null>(() =>
    parseYYYYMMDD(checkout)
  );

  // Same logic as DateRangePicker.handleDaySelect: no past; first tap = check-in;
  // second = check-out (range fill); when both set, next tap = new check-in.
  const handleDaySelect = useCallback((date: Date) => {
    if (!startDate) {
      setStartDate(date);
      setEndDate(null);
      return;
    }
    if (endDate != null) {
      setStartDate(date);
      setEndDate(null);
      return;
    }
    const cmp = compareDay(date, startDate);
    if (cmp <= 0) {
      setStartDate(date);
      setEndDate(null);
    } else {
      const cappedEnd =
        getDaysBetween(startDate, date) > MAX_RANGE_DAYS
          ? addDays(startDate, MAX_RANGE_DAYS - 1)
          : date;
      setEndDate(cappedEnd);
    }
  }, [startDate, endDate]);

  const handleNext = useCallback(() => {
    const start = startDate ?? todayNorm;
    let end = endDate ?? addDays(start, 1);
    if (compareDay(end, start) <= 0) end = addDays(start, 1);
    if (getDaysBetween(start, end) > MAX_RANGE_DAYS) {
      end = addDays(start, MAX_RANGE_DAYS - 1);
    }
    onDatesChange({
      checkin: formatDateForInput(start),
      checkout: formatDateForInput(end),
    });
    onNext();
  }, [startDate, endDate, todayNorm, onDatesChange, onNext]);

  return (
    <>
      <div className="rounded-xl border border-[var(--sky-blue)] bg-white shadow-sm p-4 mb-4">
        <DateRangeCalendar
          minDate={todayNorm}
          startDate={startDate}
          endDate={endDate}
          onSelect={handleDaySelect}
          locale={locale}
        />
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--muted)]">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--dark-text)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-full bg-[var(--primary)] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[var(--primary-hover)]"
        >
          Next
        </button>
      </div>
    </>
  );
}

export type SearchModalStep = "where" | "when" | "who";

/** Suggested destinations (overview "partially open" Where). Use real Google Place IDs for LiteAPI /hotels/rates. */
const SUGGESTED_DESTINATIONS: PlaceSuggestion[] = [
  { placeId: "ChIJizKuijrlXhURq4X1S9OGLpY", displayName: "Cairo", formattedAddress: "Cairo, Egypt" },
  { placeId: "ChIJdYeB7UwbwhURzslwz2kkq5g", displayName: "Makkah", formattedAddress: "Makkah, Saudi Arabia" },
  { placeId: "ChIJs7s9zbKHUhQRYMPTi_kHuC0", displayName: "Hurghada", formattedAddress: "Hurghada, Egypt" },
];

/** Icon for autocomplete by place type (Phase 1). */
function PlaceTypeIcon({ types }: { types?: string[] }) {
  if (isSpecificHotelPlace(types)) return <HotelPlaceIcon className="w-6 h-6 text-[var(--primary)]" />;
  const first = types?.[0];
  if (first === "locality" || first === "administrative_area_level_1" || first === "country") return <LocalityIcon className="w-6 h-6 text-[var(--primary)]" />;
  return <EstablishmentIcon className="w-6 h-6 text-[var(--primary)]" />;
}

export type SearchModalView = "overview" | "where" | "when" | "who";

/** View order for transition direction (forward = slide from right, back = slide from left). */
const VIEW_ORDER: Record<SearchModalView, number> = {
  overview: 0,
  where: 1,
  when: 2,
  who: 3,
};

interface SearchModalProps {
  /** Optional: initial step when opening (legacy; prefer initialView). */
  step?: SearchModalStep;
  /** Optional: open directly to this view (where / when / who). Omit for overview. */
  initialView?: SearchModalView;
  /** When true, hide the "Where" / destination section (dates + guests only). Use on hotel detail page. */
  hideDestination?: boolean;
  onClose: () => void;
  /** Called when user confirms search (e.g. Done on Who step or Search on overview). Parent should run search and can then close. */
  onSearch?: () => void;
  /** Destination (place mode) */
  placeId: string | null;
  placeLabel: string | null;
  /** Sub-address for destination (e.g. "Cairo, Egypt"). Shown with placeLabel everywhere. */
  placeSubAddress?: string | null;
  query: string;
  onPlaceSelect: (place: PlaceSuggestion) => void;
  onQueryChange: (q: string) => void;
  /** Dates */
  checkin: string;
  checkout: string;
  onDatesChange: (range: { checkin: string; checkout: string }) => void;
  /** Guests */
  occupancies: Occupancy[];
  onOccupanciesChange: (occupancies: Occupancy[]) => void;
  locale?: string;
}

function stepToView(step: SearchModalStep | undefined): SearchModalView {
  if (step === "where") return "where";
  if (step === "when") return "when";
  if (step === "who") return "who";
  return "overview";
}

export function SearchModal({
  step: initialStep,
  initialView,
  hideDestination = false,
  onClose,
  onSearch,
  placeId,
  placeLabel,
  placeSubAddress,
  query,
  onPlaceSelect,
  onQueryChange,
  checkin,
  checkout,
  onDatesChange,
  occupancies,
  onOccupanciesChange,
  locale,
}: SearchModalProps) {
  const [view, setViewState] = useState<SearchModalView>(
    () => initialView ?? stepToView(initialStep) ?? "overview"
  );
  const [exitingView, setExitingView] = useState<SearchModalView | null>(null);
  // Phase 6: enter/exit transitions
  const [isExiting, setIsExiting] = useState(false);
  const prevViewRef = useRef<SearchModalView>(view);
  const hasViewChangedRef = useRef(false);
  const viewTransitionDirection =
    VIEW_ORDER[view] > VIEW_ORDER[prevViewRef.current] ? "forward" : "back";
  const viewTransitionClass = hasViewChangedRef.current
    ? viewTransitionDirection === "forward"
      ? "search-view-enter-from-bottom"
      : "search-view-enter-from-top"
    : "";
  const exitingDirection =
    exitingView !== null && VIEW_ORDER[view] > VIEW_ORDER[exitingView]
      ? "forward"
      : "back";

  const setView = useCallback((newView: SearchModalView) => {
    setViewState((prev) => {
      if (newView === prev) return prev;
      setExitingView(prev);
      return newView;
    });
  }, []);

  // Initialize from props only on mount (modal remounts when opened). Do not sync on every placeLabel/query
  // change or we overwrite the user's typing after a place is selected (placeLabel stays set).
  const [searchInput, setSearchInput] = useState(() => placeLabel ?? query ?? "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const placesSession = useGooglePlacesSession();

  // Exit: 220ms to match --modal-exit-duration; 0 when user prefers reduced motion.
  const requestClose = useCallback(() => {
    setIsExiting(true);
  }, []);

  useEffect(() => {
    if (!isExiting) return;
    const ms =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 220;
    const t = setTimeout(() => onClose(), ms);
    return () => clearTimeout(t);
  }, [isExiting, onClose]);

  useEffect(() => {
    if (prevViewRef.current !== view) hasViewChangedRef.current = true;
    prevViewRef.current = view;
  }, [view]);

  const viewTransitionDurationMs =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 220;
  useEffect(() => {
    if (exitingView === null) return;
    const t = setTimeout(() => setExitingView(null), viewTransitionDurationMs);
    return () => clearTimeout(t);
  }, [exitingView, viewTransitionDurationMs]);

  // Reset Google Places session when modal opens (one token per search session)
  useEffect(() => {
    placesSession.resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount when modal opens
  }, []);

  useEffect(() => {
    if (view !== "where") return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [view]);

  useEffect(() => {
    if (view !== "where" || !searchInput.trim() || searchInput.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoadingPlaces(true);
        const languageCode = locale === "ar" ? "ar" : "en";
        const res = await fetch("/api/google-places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            input: searchInput.trim(),
            sessionToken: placesSession.getToken(),
            languageCode,
          }),
        });
        if (!res.ok) throw new Error("Failed to load places");
        const json = await res.json();
        const processed = processPredictions(json, 10);
        setSuggestions(
          processed.map((p) => ({
            placeId: p.placeId,
            displayName: p.mainText,
            formattedAddress: p.description || `${p.mainText}${p.secondaryText ? `, ${p.secondaryText}` : ""}`,
            types: p.types,
          }))
        );
      } catch (err: any) {
        if (err.name !== "AbortError") setSuggestions([]);
      } finally {
        setLoadingPlaces(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [view, searchInput, locale, placesSession]);

  const handleSelectPlaceFullScreen = async (place: PlaceSuggestion) => {
    try {
      const languageCode = (locale === "ar" ? "ar" : "en") as "ar" | "en";
      const details = await getPlaceDetails({
        placeId: place.placeId,
        sessionToken: placesSession.getToken(),
        languageCode,
      });
      const normalized = normalizePlace(details as Parameters<typeof normalizePlace>[0]);
      placesSession.markTokenUsed();
      onPlaceSelect(normalized);
      onQueryChange(normalized.displayName);
      setSearchInput(normalized.displayName);
      setView("when");
    } catch (err) {
      // Fallback: use suggestion data without details (no session mark)
      onPlaceSelect(place);
      onQueryChange(place.displayName);
      setSearchInput(place.displayName);
      setView("when");
    }
  };

  const handleSelectPlaceFromOverview = async (place: PlaceSuggestion) => {
    try {
      const languageCode = (locale === "ar" ? "ar" : "en") as "ar" | "en";
      const details = await getPlaceDetails({
        placeId: place.placeId,
        sessionToken: placesSession.getToken(),
        languageCode,
      });
      const normalized = normalizePlace(details as Parameters<typeof normalizePlace>[0]);
      placesSession.markTokenUsed();
      onPlaceSelect(normalized);
      onQueryChange(normalized.displayName);
      setSearchInput(normalized.displayName);
      setView("when");
    } catch (err) {
      onPlaceSelect(place);
      onQueryChange(place.displayName);
      setSearchInput(place.displayName);
      setView("when");
    }
  };

  const dateRangeText =
    checkin && checkout && parseYYYYMMDD(checkin) && parseYYYYMMDD(checkout)
      ? formatRangeShort(parseYYYYMMDD(checkin)!, parseYYYYMMDD(checkout)!, locale)
      : "Add dates";

  const guestsCount = totalGuests(occupancies);
  const roomsCount = occupancies.length;
  const guestsSummary =
    guestsCount > 0 ? `${roomsCount} Rm, ${guestsCount} Gst` : "Add guests";

  const hasMinimumFields = hideDestination
    ? !!checkin && !!checkout && !hasUnsetChildAges(occupancies)
    : !!placeId && !!checkin && !!checkout && !hasUnsetChildAges(occupancies);

  const handleBack = () => {
    if (view !== "overview") setView("overview");
    else requestClose();
  };

  const headerTitle =
    view === "overview"
      ? "Search"
      : view === "where"
        ? "Where?"
        : view === "when"
          ? "When?"
          : "Who?";

  function renderViewContent(targetView: SearchModalView) {
    if (targetView === "overview") {
      return (
          <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
            {!hideDestination && (
            <>
            {/* Where bar (partially open: input + suggested destinations) */}
            <div className="rounded-xl border border-[var(--sky-blue)] bg-white shadow-sm overflow-hidden hover:border-[var(--ocean-blue)] transition-colors duration-150">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setView("where")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setView("where");
                  }
                }}
                className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-[var(--light-bg)]/50"
              >
                <MapPinIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--dark-text)] truncate">
                    {placeLabel || "Where?"}
                  </span>
                  {placeSubAddress && (
                    <span className="block text-xs text-[var(--muted-foreground)] truncate">
                      {placeSubAddress}
                    </span>
                  )}
                </div>
                <span className="text-[var(--muted-foreground)] text-xs shrink-0">Tap to search</span>
              </div>
              <div
                className="px-4 pb-4 pt-0"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--light-bg)] border border-[var(--muted)]">
                  <SearchIcon className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
                  <input
                    type="text"
                    placeholder="Search destinations"
                    className="flex-1 outline-none text-sm text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] min-w-0 bg-transparent"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      onQueryChange(e.target.value);
                    }}
                    onFocus={() => setView("where")}
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-2 mb-1">Suggested</p>
                <ul className="space-y-0.5">
                  {SUGGESTED_DESTINATIONS.map((place, i) => (
                    <li
                      key={place.placeId}
                      className="search-list-item"
                      style={{ animationDelay: `calc(var(--list-stagger-delay) * ${i})` }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPlaceFromOverview(place)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-[var(--light-bg)] rounded-lg text-left transition-colors duration-150 border border-transparent hover:border-[var(--sky-blue)]"
                      >
                        <span className="shrink-0 w-9 h-9 rounded-lg bg-[var(--light-bg)] flex items-center justify-center">
                          <PlaceTypeIcon types={place.types} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--dark-text)] truncate text-sm">
                            {place.displayName}
                          </p>
                          {place.formattedAddress && (
                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                              {place.formattedAddress}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </>
            )}
            <button
              type="button"
              onClick={() => setView("when")}
              className="flex items-center gap-3 p-4 rounded-xl border border-[var(--sky-blue)] bg-white text-left w-full hover:border-[var(--ocean-blue)] hover:bg-[var(--light-bg)] transition-colors duration-150 shadow-sm"
            >
              <CalendarIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                  When
                </span>
                <span className="block text-sm font-semibold text-[var(--dark-text)]">
                  {dateRangeText}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setView("who")}
              className="flex items-center gap-3 p-4 rounded-xl border border-[var(--sky-blue)] bg-white text-left w-full hover:border-[var(--ocean-blue)] hover:bg-[var(--light-bg)] transition-colors duration-150 shadow-sm"
            >
              <UsersIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Who
                </span>
                <span className="block text-sm font-semibold text-[var(--dark-text)]">
                  {guestsSummary}
                </span>
              </div>
            </button>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!hideDestination) {
                    onPlaceSelect({ placeId: "", displayName: "" });
                    onQueryChange("");
                    setSearchInput("");
                  }
                  onDatesChange({ checkin: "", checkout: "" });
                  onOccupanciesChange([{ adults: 2, children: [] }]);
                }}
                className="flex-1 py-3 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--dark-text)] border border-[var(--muted)] rounded-xl hover:border-[var(--sky-blue)] transition-colors duration-150"
              >
                {hideDestination ? "Clear dates & guests" : "Clear all"}
              </button>
              <button
                type="button"
                disabled={!hasMinimumFields}
                onClick={() => {
                  if (hasMinimumFields) {
                    onSearch?.();
                    requestClose();
                  }
                }}
                className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--primary)] rounded-xl hover:bg-[var(--primary-hover)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Search
              </button>
            </div>
          </div>
      );
    }
    if (targetView === "where") {
      return (
          <div className="p-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 p-4 border-2 border-[var(--dark-text)] rounded-2xl bg-white shadow-lg mb-4">
              <SearchIcon className="w-5 h-5 text-[var(--muted-foreground)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search destinations"
                className="flex-1 outline-none text-base text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] min-w-0"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  onQueryChange(e.target.value);
                }}
              />
            </div>
            {loadingPlaces && (
              <p className="text-sm text-[var(--muted-foreground)] mb-2">Searching…</p>
            )}
            {suggestions.length > 0 && (
              <ul className="space-y-1">
                {suggestions.map((place, i) => (
                  <li
                    key={place.placeId}
                    className="search-list-item"
                    style={{ animationDelay: `calc(var(--list-stagger-delay) * ${i})` }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectPlaceFullScreen(place)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-[var(--light-bg)] rounded-xl text-left transition-colors duration-150 border border-transparent hover:border-[var(--sky-blue)]"
                    >
                      <div className="w-12 h-12 rounded-lg bg-[var(--light-bg)] flex items-center justify-center shrink-0">
                        <PlaceTypeIcon types={place.types} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--dark-text)] truncate">
                          {place.displayName}
                        </p>
                        {place.formattedAddress && (
                          <p className="text-sm text-[var(--muted-foreground)] truncate">
                            {place.formattedAddress}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loadingPlaces && suggestions.length === 0 && searchInput.trim().length < 2 && (
              <p className="text-sm text-[var(--muted-foreground)]">
                Type at least 2 characters to search destinations.
              </p>
            )}
          </div>
      );
    }
    if (targetView === "when") {
      return (
          <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
            {!hideDestination && (
              <CollapsedSummaryCard
                label="Where"
                value={placeLabel || "Search destinations"}
                valueSecondary={placeSubAddress || undefined}
                onClick={() => setView("where")}
                icon={<MapPinIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />}
              />
            )}
            <WhenStepContent
              checkin={checkin}
              checkout={checkout}
              onDatesChange={onDatesChange}
              onClose={() => setView("overview")}
              onNext={() => setView("who")}
              locale={locale}
            />
          </div>
      );
    }
    return (
        <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
          {!hideDestination && (
            <CollapsedSummaryCard
              label="Where"
              value={placeLabel || "Search destinations"}
              valueSecondary={placeSubAddress || undefined}
              onClick={() => setView("where")}
              icon={<MapPinIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />}
            />
          )}
          <CollapsedSummaryCard
            label="When"
            value={dateRangeText}
            onClick={() => setView("when")}
            icon={<CalendarIcon className="w-5 h-5 text-[var(--primary)] shrink-0" />}
          />
          <RoomSelector
            variant="whoStep"
            occupancies={occupancies}
            onChange={onOccupanciesChange}
            className="rounded-xl border border-[var(--sky-blue)] bg-white shadow-sm overflow-hidden"
          />
          <button
            type="button"
            onClick={() => {
              onSearch?.();
              requestClose();
            }}
            disabled={!hasMinimumFields}
            className="mt-2 w-full rounded-full bg-[var(--primary)] text-white font-semibold py-3 hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed duration-150"
          >
            Search
          </button>
        </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 bg-white flex flex-col ${isExiting ? "search-modal-exit" : "search-modal-enter"}`}
      aria-modal="true"
      role="dialog"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--sky-blue)] px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--sky-blue)] text-[var(--dark-text)] hover:bg-[var(--light-bg)] hover:border-[var(--dark-text)] transition-colors duration-150"
          aria-label={view === "overview" ? "Close" : "Back"}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-[var(--dark-text)]">
          {headerTitle}
        </h1>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {exitingView !== null && (
          <div
            className={`absolute inset-0 z-0 overflow-auto bg-white min-h-full ${exitingDirection === "forward" ? "search-view-exit-up" : "search-view-exit-down"}`}
            aria-hidden="true"
          >
            {renderViewContent(exitingView)}
          </div>
        )}
        <div
          key={view}
          className={`flex-1 overflow-auto min-h-0 relative z-10 ${viewTransitionClass}`}
        >
        {renderViewContent(view)}
        </div>
      </div>
    </div>
  );
}
