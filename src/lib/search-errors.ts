/**
 * Phase 9: Map API error status/code to clear, user-friendly messages.
 * Never show raw API messages (e.g. "placeId is required") to the end user.
 */

export type SearchErrorCode =
  | "TIMEOUT"
  | "NO_RATES"
  | "NO_RESULTS"
  | "INVALID_PARAMS"
  | "SEARCH_FAILED";

export interface SearchErrorInfo {
  message: string;
  code: SearchErrorCode;
}

/**
 * Returns a user-facing message and code from HTTP status and optional API error body.
 * Use this instead of displaying json?.error?.message raw.
 */
export function getSearchErrorMessage(
  status: number,
  apiError?: { message?: string; code?: string } | null
): SearchErrorInfo {
  const code = apiError?.code as SearchErrorCode | undefined;

  if (status === 408 || code === "TIMEOUT") {
    return {
      message:
        "The search is taking longer than usual. Try again in a moment, or adjust your dates or destination.",
      code: "TIMEOUT",
    };
  }

  if (status === 404 || code === "NO_RATES") {
    return {
      message:
        "We don't have availability for these dates in this area. Try changing your dates or looking at a nearby area.",
      code: "NO_RATES",
    };
  }

  if (status === 404 || code === "NO_RESULTS") {
    return {
      message:
        "No hotels found for this search. Try different dates or search a nearby area.",
      code: "NO_RESULTS",
    };
  }

  if ((status >= 400 && status < 500) || code === "INVALID_PARAMS") {
    return {
      message:
        "Something's missing in your search. Please check destination, dates, and guests and try again.",
      code: "INVALID_PARAMS",
    };
  }

  // 5xx, network failure, or generic
  return {
    message:
      "We couldn't load results right now. Please check your connection and try again.",
    code: "SEARCH_FAILED",
  };
}
