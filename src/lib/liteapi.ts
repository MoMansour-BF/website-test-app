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
}

export async function searchHotelRates(
  params: RatesSearchParams,
  apiKey?: string
) {
  const {
    mode,
    placeId,
    aiSearch,
    checkin,
    checkout,
    occupancies,
    currency = "USD",
    guestNationality = "US",
    language,
    limit,
    timeout,
    margin,
    additionalMarkup,
    refundableRatesOnly,
    maxRatesPerHotel
  } = params;

  const body: any = {
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

  if (mode === "place" && placeId) {
    body.placeId = placeId;
  } else if (mode === "vibe" && aiSearch) {
    body.aiSearch = aiSearch;
  }

  return request<any>("api", "/hotels/rates", "POST", { body, apiKey });
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
    guestNationality = "US",
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

