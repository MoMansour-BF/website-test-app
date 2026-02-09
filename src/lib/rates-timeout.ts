/** localStorage key for rates search timeout (seconds). */
export const RATES_SEARCH_TIMEOUT_KEY = "ratesSearchTimeoutSeconds";

/** Default timeout for rates search in seconds. */
export const DEFAULT_RATES_SEARCH_TIMEOUT = 5;

export const MIN_RATES_SEARCH_TIMEOUT = 1;
export const MAX_RATES_SEARCH_TIMEOUT = 30;

/**
 * Returns the stored rates search timeout in seconds (1–30), or default if unset/invalid.
 * Safe to call in browser only (uses localStorage).
 */
export function getRatesSearchTimeout(): number {
  if (typeof window === "undefined") return DEFAULT_RATES_SEARCH_TIMEOUT;
  try {
    const raw = localStorage.getItem(RATES_SEARCH_TIMEOUT_KEY);
    if (raw == null) return DEFAULT_RATES_SEARCH_TIMEOUT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_RATES_SEARCH_TIMEOUT;
    return Math.min(MAX_RATES_SEARCH_TIMEOUT, Math.max(MIN_RATES_SEARCH_TIMEOUT, Math.round(n)));
  } catch {
    return DEFAULT_RATES_SEARCH_TIMEOUT;
  }
}

/**
 * Saves the rates search timeout (seconds). Clamps to MIN–MAX before saving.
 * Safe to call in browser only.
 */
export function setRatesSearchTimeout(seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    const clamped = Math.min(MAX_RATES_SEARCH_TIMEOUT, Math.max(MIN_RATES_SEARCH_TIMEOUT, Math.round(seconds)));
    localStorage.setItem(RATES_SEARCH_TIMEOUT_KEY, String(clamped));
  } catch {
    // ignore
  }
}
