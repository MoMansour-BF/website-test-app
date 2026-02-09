// Validated inside request function
const API_BASE = "https://api.liteapi.travel/v3.0";
const BOOK_BASE = "https://book.liteapi.travel/v3.0";

type HttpMethod = "GET" | "POST";

interface LiteApiError extends Error {
  status?: number;
  code?: number;
}

async function request<T>(
  base: "api" | "book",
  path: string,
  method: HttpMethod,
  options?: {
    searchParams?: URLSearchParams;
    body?: unknown;
    /** Phase 2: override API key (B2C vs CUG). If not set, uses LITEAPI_API_KEY. */
    apiKey?: string;
  }
): Promise<T> {
  const url = new URL(
    (base === "api" ? API_BASE : BOOK_BASE) + path
  );
  if (options?.searchParams) {
    options.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const apiKey =
    options?.apiKey ?? process.env.LITEAPI_API_KEY ?? null;
  if (!apiKey) {
    throw new Error(
      "LITEAPI_API_KEY (or apiKey override) is not set in environment variables"
    );
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "X-API-Key": apiKey,
      accept: "application/json",
      ...(method === "POST"
        ? { "content-type": "application/json" }
        : {})
    },
    body:
      method === "POST" && options?.body
        ? JSON.stringify(options.body)
        : undefined,
    cache: "no-store"
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // ignore parse errors; we'll rely on status code
  }

  if (!res.ok || json?.error) {
    const message =
      json?.error?.message ||
      json?.error?.description ||
      `LiteAPI ${method} ${path} failed with status ${res.status}`;
    const code = json?.error?.code;
    const error: LiteApiError = new Error(
      code ? `[${code}] ${message}` : message
    );
    error.status = res.status;
    error.code = code;
    throw error;
  }

  return json as T;
}

export async function getPlaces(
  textQuery: string,
  language?: string,
  apiKey?: string
) {
  const params = new URLSearchParams({ textQuery });
  if (language) params.set("language", language);
  return request<{ data: any[] }>("api", "/data/places", "GET", {
    searchParams: params,
    apiKey
  });
}

export type RatesSearchMode = "place" | "vibe";

/** Default guest nationality for rates (Phase 0: EG for Egyptian market). All rates calls must use the same guestNationality for a given search. */
export const DEFAULT_GUEST_NATIONALITY = "EG";

/** ISO 3166-1 alpha-2: exactly 2 uppercase A–Z letters. */
const ALPHA2_REGEX = /^[A-Z]{2}$/;

/**
 * Resolves guestNationality for LiteAPI: valid alpha-2 or default EG.
 * Use this in all rates endpoints (search, hotel, stream, non-stream) so the same search uses one nationality.
 */
export function resolveGuestNationality(value: string | undefined): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ALPHA2_REGEX.test(normalized) ? normalized : DEFAULT_GUEST_NATIONALITY;
}

/** One room: adults + child ages (integers) for API */
export type OccupancyInput = { adults: number; children?: number[] };

export interface RatesSearchParams {
  mode: RatesSearchMode;
  placeId?: string;
  aiSearch?: string;
  checkin: string;
  checkout: string;
  occupancies: OccupancyInput[];
  currency?: string;
  guestNationality?: string;
  language?: string;
  limit?: number;
  timeout?: number;
  /** Phase 3: CUG margin % (e.g. 10). Sent to LiteAPI when provided. */
  margin?: number;
  /** Phase 3: Optional additional markup for LiteAPI. */
  additionalMarkup?: number;
  /** If true, only refundable rates (RFN) are included. LiteAPI docs: refundableRatesOnly. */
  refundableRatesOnly?: boolean;
  /** Number of room rates per hotel, sorted by price (cheapest first). 1 = cheapest only. */
  maxRatesPerHotel?: number;
  /** Phase 5: when true, LiteAPI returns SSE stream. Used by streaming search path. */
  stream?: boolean;
  /** Phase 5 Type 1: target a specific hotel by name (from place displayName). */
  hotelName?: string;
  /** Phase 5: quality filters for Type 2 / Type 1 area call. e.g. [3,4,5]. Omit for vibe (Type 3). */
  starRating?: number[];
  /** Phase 5: minimum guest rating (e.g. 6.5). Omit for Type 3. */
  minRating?: number;
  /** Phase 7: minimum number of reviews (LiteAPI minReviewsCount). */
  minReviewsCount?: number;
  /** Phase 7: facility IDs to filter by (LiteAPI facilities). */
  facilities?: number[];
  /** Phase 7: when true, hotel must have all specified facilities. */
  strictFacilityFiltering?: boolean;
}

/**
 * Build the request body for POST /hotels/rates (shared by non-stream and stream).
 * Used by searchHotelRates and fetchHotelRatesStream.
 */
export function buildRatesRequestBody(params: RatesSearchParams): Record<string, unknown> {
  const {
    mode,
    placeId,
    aiSearch,
    hotelName,
    checkin,
    checkout,
    occupancies,
    currency = "USD",
    guestNationality = DEFAULT_GUEST_NATIONALITY,
    language,
    limit,
    timeout,
    margin,
    additionalMarkup,
    refundableRatesOnly,
    maxRatesPerHotel,
    stream,
    starRating,
    minRating,
    minReviewsCount,
    facilities,
    strictFacilityFiltering
  } = params;

  const body: Record<string, unknown> = {
    occupancies: occupancies.map((o) => ({
      adults: o.adults,
      ...(o.children && o.children.length > 0 ? { children: o.children } : {})
    })),
    currency,
    guestNationality,
    checkin,
    checkout,
    roomMapping: true,
    includeHotelData: true
  };

  if (language) body.language = language;
  if (limit) body.limit = limit;
  if (timeout) body.timeout = timeout;
  if (margin != null && typeof margin === "number") body.margin = margin;
  if (additionalMarkup != null && typeof additionalMarkup === "number") body.additionalMarkup = additionalMarkup;
  if (refundableRatesOnly === true) body.refundableRatesOnly = true;
  if (maxRatesPerHotel != null && typeof maxRatesPerHotel === "number") body.maxRatesPerHotel = maxRatesPerHotel;
  if (stream === true) body.stream = true;
  if (hotelName != null && hotelName.trim() !== "") body.hotelName = hotelName.trim();
  if (starRating != null && Array.isArray(starRating) && starRating.length > 0) body.starRating = starRating;
  if (minRating != null && typeof minRating === "number" && !Number.isNaN(minRating)) body.minRating = minRating;
  if (minReviewsCount != null && typeof minReviewsCount === "number" && !Number.isNaN(minReviewsCount) && minReviewsCount >= 0) body.minReviewsCount = minReviewsCount;
  if (facilities != null && Array.isArray(facilities) && facilities.length > 0) body.facilities = facilities;
  if (strictFacilityFiltering === true) body.strictFacilityFiltering = true;

  if (mode === "place" && placeId) {
    body.placeId = placeId;
  } else if (mode === "vibe" && aiSearch) {
    body.aiSearch = aiSearch;
  }

  return body;
}

export async function searchHotelRates(
  params: RatesSearchParams,
  apiKey?: string
) {
  const body = buildRatesRequestBody(params);
  return request<any>("api", "/hotels/rates", "POST", { body, apiKey });
}

/**
 * Phase 5: Fetch LiteAPI /hotels/rates with stream: true.
 * Returns the raw Response so the caller can pipe response.body and append extra SSE events (e.g. refundable).
 * Caller must pass AbortSignal for cancellation.
 */
export function fetchHotelRatesStream(
  params: RatesSearchParams,
  apiKey: string,
  signal?: AbortSignal
): Promise<Response> {
  const body = buildRatesRequestBody({ ...params, stream: true });
  const apiKeyResolved = apiKey ?? process.env.LITEAPI_API_KEY ?? null;
  if (!apiKeyResolved) {
    return Promise.reject(new Error("LITEAPI_API_KEY (or apiKey) is not set"));
  }
  return fetch(`${API_BASE}/hotels/rates`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKeyResolved,
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(body),
    signal,
    cache: "no-store"
  });
}

export async function getHotelRatesForHotel(params: {
  hotelId: string;
  checkin: string;
  checkout: string;
  occupancies: OccupancyInput[];
  currency?: string;
  guestNationality?: string;
  language?: string;
  /** Phase 3: CUG margin %. */
  margin?: number;
  /** Phase 3: Optional additional markup. */
  additionalMarkup?: number;
  },
  apiKey?: string
) {
  const {
    hotelId,
    checkin,
    checkout,
    occupancies,
    currency = "USD",
    guestNationality = DEFAULT_GUEST_NATIONALITY,
    language,
    margin,
    additionalMarkup
  } = params;

  const body: Record<string, unknown> = {
    hotelIds: [hotelId],
    occupancies: occupancies.map((o) => ({
      adults: o.adults,
      ...(o.children && o.children.length > 0 ? { children: o.children } : {})
    })),
    currency,
    guestNationality,
    checkin,
    checkout,
    roomMapping: true,
    includeHotelData: true
  };

  if (language) body.language = language;
  if (margin != null && typeof margin === "number") body.margin = margin;
  if (additionalMarkup != null && typeof additionalMarkup === "number") body.additionalMarkup = additionalMarkup;

  return request<any>("api", "/hotels/rates", "POST", { body, apiKey });
}

/** Phase 4: canonical hotel details from /data/hotel (LiteAPI Displaying Essential Hotel Details). */
export interface HotelDetailsData {
  rating?: number;
  reviewCount?: number;
  starRating?: number;
}

const HOTEL_DETAILS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const hotelDetailsCache = new Map<
  string,
  { at: number; value: HotelDetailsData }
>();

function cacheKey(hotelId: string, language?: string): string {
  return `${hotelId}:${language ?? ""}`;
}

/**
 * Phase 4: Extract canonical hotel details from API response. Prefer data.rating,
 * data.reviewCount, data.starRating; keep snake_case/alternate fallbacks.
 */
export function extractHotelDetailsFromResponse(data: any): HotelDetailsData | null {
  if (!data || typeof data !== "object") return null;
  const rating = data.rating;
  const reviewCount =
    data.reviewCount ??
    data.review_count ??
    data.reviewsCount ??
    data.numberOfReviews;
  const starRating =
    data.starRating ??
    data.star_rating ??
    data.star_rating_number;
  const numRating = rating != null ? Number(rating) : undefined;
  const numReviewCount = reviewCount != null ? Number(reviewCount) : undefined;
  const numStarRating = starRating != null ? Number(starRating) : undefined;
  if (
    numRating == null &&
    numReviewCount == null &&
    numStarRating == null
  )
    return null;
  const out: HotelDetailsData = {};
  if (numRating != null && !Number.isNaN(numRating)) out.rating = numRating;
  if (numReviewCount != null && !Number.isNaN(numReviewCount))
    out.reviewCount = numReviewCount;
  if (numStarRating != null && !Number.isNaN(numStarRating))
    out.starRating = numStarRating;
  return out;
}

export async function getHotelDetails(
  hotelId: string,
  language?: string,
  apiKey?: string
) {
  const params = new URLSearchParams({
    hotelId,
    timeout: "4"
  });
  if (language) params.set("language", language);
  return request<{ data: any }>("api", "/data/hotel", "GET", {
    searchParams: params,
    apiKey
  });
}

/**
 * Phase 4: getHotelDetails with server-side cache (hotelId + language, TTL 1h).
 * Use in search route and batch details endpoint.
 */
export async function getCachedHotelDetails(
  hotelId: string,
  language: string | undefined,
  apiKey: string | undefined
): Promise<HotelDetailsData | null> {
  const key = cacheKey(hotelId, language);
  const now = Date.now();
  const hit = hotelDetailsCache.get(key);
  if (hit && now - hit.at < HOTEL_DETAILS_CACHE_TTL_MS) {
    return hit.value;
  }
  try {
    const resp = await getHotelDetails(hotelId, language, apiKey);
    const data = resp?.data ?? resp;
    const extracted = extractHotelDetailsFromResponse(data);
    if (extracted) {
      hotelDetailsCache.set(key, { at: now, value: extracted });
      return extracted;
    }
    hotelDetailsCache.set(key, { at: now, value: {} });
    return {};
  } catch {
    return null;
  }
}

export async function prebookRate(
  body: {
    usePaymentSdk: boolean;
    offerId: string;
  },
  apiKey?: string
) {
  return request<any>("book", "/rates/prebook", "POST", { body, apiKey });
}

export async function bookRate(
  body: {
  prebookId: string;
  holder: {
    firstName: string;
    lastName: string;
    email: string;
  };
  payment: {
    method: "TRANSACTION_ID";
    transactionId: string;
  };
  guests: {
    occupancyNumber: number;
    firstName: string;
    lastName: string;
    email: string;
  }[];
  },
  apiKey?: string
) {
  return request<any>("book", "/rates/book", "POST", { body, apiKey });
}

