import { useRef, useCallback, useMemo } from "react";
import { generateSessionToken } from "@/lib/google-places-autocomplete";

/**
 * Manages Google Places API session token for cost optimization.
 *
 * Lifecycle:
 * 1. New token when modal opens
 * 2. Same token for all autocomplete calls + final details call
 * 3. Token expires after successful details fetch or after selection
 * 4. New token if user changes selection (start new search)
 */
export function useGooglePlacesSession() {
  const tokenRef = useRef<string>(generateSessionToken());
  const hasUsedTokenRef = useRef(false);

  const getToken = useCallback(() => {
    return tokenRef.current;
  }, []);

  const refreshToken = useCallback(() => {
    tokenRef.current = generateSessionToken();
    hasUsedTokenRef.current = false;
  }, []);

  const markTokenUsed = useCallback(() => {
    hasUsedTokenRef.current = true;
  }, []);

  const resetSession = useCallback(() => {
    refreshToken();
  }, [refreshToken]);

  return useMemo(
    () => ({
      getToken,
      refreshToken,
      markTokenUsed,
      resetSession,
    }),
    [getToken, refreshToken, markTokenUsed, resetSession]
  );
}
