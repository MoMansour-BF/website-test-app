/**
 * Phase 5.5: Full debounced background search while user is in the search modal.
 * When they click "Show Results", the search may already be done so results feel instant.
 *
 * - Debounce: 0.5s after location selected, 1.5s after date/occupancy change.
 * - Cancel in-flight when params change or modal closes.
 * - Request identity: only accept/use result when signature matches current params.
 */

import { useCallback, useMemo, useRef } from "react";
import type { ResultsQueryParams } from "@/lib/results-query";
import { backgroundSearchParamsSignature } from "@/lib/results-query";
import { parseOccupanciesParam, toApiOccupancies } from "@/lib/occupancy";
import { getRatesSearchTimeout } from "@/lib/rates-timeout";

const DEBOUNCE_MS_LOCATION = 500;
const DEBOUNCE_MS_DATE_OR_OCCUPANCY = 1500;

export interface UseBackgroundSearchOptions {
  currency: string;
  locale?: string;
  nationality?: string;
}

export interface UseBackgroundSearchReturn {
  /** Start (or reschedule) a background search. Call when location/dates/occupancy change in the modal. */
  startBackgroundSearch: (
    params: ResultsQueryParams,
    options: { trigger: "location" | "dateOrOccupancy" }
  ) => void;
  /** Get cached result if it matches the given params. Call when user clicks "Show Results". */
  getResultForParams: (params: ResultsQueryParams) => unknown | null;
  /** Cancel debounce and in-flight request. Call when modal closes. */
  cancel: () => void;
}

export function useBackgroundSearch(
  options: UseBackgroundSearchOptions
): UseBackgroundSearchReturn {
  const { currency, locale, nationality = "EG" } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchedSignatureRef = useRef<string | null>(null);
  const cachedResultRef = useRef<{ signature: string; data: unknown } | null>(null);
  const currentParamsRef = useRef<ResultsQueryParams | null>(null);
  /** Params for the currently scheduled run only; read when the debounce fires so we always use the latest scheduled params. */
  const pendingParamsRef = useRef<ResultsQueryParams | null>(null);

  const cancel = useCallback(() => {
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current != null) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startBackgroundSearch = useCallback(
    (params: ResultsQueryParams, opts: { trigger: "location" | "dateOrOccupancy" }) => {
      if (typeof window === "undefined") return;
      const trigger = opts.trigger;
      const delay =
        trigger === "location" ? DEBOUNCE_MS_LOCATION : DEBOUNCE_MS_DATE_OR_OCCUPANCY;

      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      pendingParamsRef.current = params;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const scheduledParams = pendingParamsRef.current;
        pendingParamsRef.current = null;
        if (!scheduledParams) return;
        const sig = backgroundSearchParamsSignature(scheduledParams);
        if (sig === lastSearchedSignatureRef.current) return;

        if (abortControllerRef.current != null) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        lastSearchedSignatureRef.current = sig;
        currentParamsRef.current = scheduledParams;

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const occupancies = parseOccupanciesParam(scheduledParams.occupancies);
        const usePlaceIdForSearch =
          scheduledParams.mode === "place" &&
          (scheduledParams.placeType === "city" || scheduledParams.placeType === "country");
        const effectiveLat =
          scheduledParams.latitude ?? scheduledParams.centerLat;
        const effectiveLng =
          scheduledParams.longitude ?? scheduledParams.centerLng;
        const effectiveRadius =
          scheduledParams.radius ??
          scheduledParams.searchRadius ??
          (effectiveLat != null ? 50000 : undefined);
        const hasAreaParams =
          !usePlaceIdForSearch &&
          effectiveLat != null &&
          effectiveLng != null &&
          effectiveRadius != null &&
          effectiveRadius > 0;

        const body = {
          mode: scheduledParams.mode,
          ...(scheduledParams.mode === "place" && hasAreaParams
            ? {
                latitude: effectiveLat,
                longitude: effectiveLng,
                radius: effectiveRadius,
                countryCode: scheduledParams.countryCode ?? undefined
              }
            : scheduledParams.mode === "place"
              ? {
                  placeId: scheduledParams.placeId ?? undefined,
                  placeName: scheduledParams.placeName ?? undefined,
                  placeTypes: scheduledParams.placeTypes?.length
                    ? scheduledParams.placeTypes
                    : undefined,
                  countryCode: scheduledParams.countryCode ?? undefined
                }
              : { aiSearch: scheduledParams.aiSearch ?? undefined }),
          checkin: scheduledParams.checkin,
          checkout: scheduledParams.checkout,
          occupancies: toApiOccupancies(occupancies),
          currency,
          guestNationality: nationality,
          language: locale,
          timeout: getRatesSearchTimeout()
        };

        fetch("/api/rates/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
          signal: controller.signal
        })
          .then((res) => res.json())
          .then((json) => {
            if (abortControllerRef.current !== controller) return;
            abortControllerRef.current = null;
            if (json?.error) return;
            const current = currentParamsRef.current;
            if (!current) return;
            const currentSig = backgroundSearchParamsSignature(current);
            if (currentSig === sig) {
              cachedResultRef.current = { signature: sig, data: json };
            }
          })
          .catch((err: unknown) => {
            if (abortControllerRef.current === controller) {
              abortControllerRef.current = null;
            }
            if (err instanceof Error && err.name === "AbortError") return;
            // Ignore other errors; results page will run its own search
          });
      }, delay);
    },
    [currency, locale, nationality]
  );

  const getResultForParams = useCallback((params: ResultsQueryParams): unknown | null => {
    const sig = backgroundSearchParamsSignature(params);
    const cached = cachedResultRef.current;
    if (!cached || cached.signature !== sig) return null;
    return cached.data;
  }, []);

  // Phase 9: stable return so consumers' useEffect deps don't change every render (debounce not reset on re-render).
  return useMemo(
    () => ({ startBackgroundSearch, getResultForParams, cancel }),
    [startBackgroundSearch, getResultForParams, cancel]
  );
}
