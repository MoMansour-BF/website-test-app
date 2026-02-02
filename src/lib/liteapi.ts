const LITEAPI_API_KEY = process.env.LITEAPI_API_KEY;

if (!LITEAPI_API_KEY) {
  throw new Error("LITEAPI_API_KEY is not set in environment");
}

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
  options?: { searchParams?: URLSearchParams; body?: unknown }
): Promise<T> {
  const url = new URL(
    (base === "api" ? API_BASE : BOOK_BASE) + path
  );
  if (options?.searchParams) {
    options.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "X-API-Key": LITEAPI_API_KEY,
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

export async function getPlaces(textQuery: string) {
  const params = new URLSearchParams({ textQuery });
  return request<{ data: any[] }>("api", "/data/places", "GET", {
    searchParams: params
  });
}

export type RatesSearchMode = "place" | "vibe";

export interface RatesSearchParams {
  mode: RatesSearchMode;
  placeId?: string;
  aiSearch?: string;
  checkin: string;
  checkout: string;
  adults: number;
  currency?: string;
  guestNationality?: string;
}

export async function searchHotelRates(params: RatesSearchParams) {
  const {
    mode,
    placeId,
    aiSearch,
    checkin,
    checkout,
    adults,
    currency = "USD",
    guestNationality = "US"
  } = params;

  const body: any = {
    occupancies: [{ adults }],
    currency,
    guestNationality,
    checkin,
    checkout,
    roomMapping: true,
    includeHotelData: true,
    maxRatesPerHotel: 1
  };

  if (mode === "place" && placeId) {
    body.placeId = placeId;
  } else if (mode === "vibe" && aiSearch) {
    body.aiSearch = aiSearch;
  }

  return request<any>("api", "/hotels/rates", "POST", { body });
}

export async function getHotelRatesForHotel(params: {
  hotelId: string;
  checkin: string;
  checkout: string;
  adults: number;
  currency?: string;
  guestNationality?: string;
}) {
  const {
    hotelId,
    checkin,
    checkout,
    adults,
    currency = "USD",
    guestNationality = "US"
  } = params;

  const body = {
    hotelIds: [hotelId],
    occupancies: [{ adults }],
    currency,
    guestNationality,
    checkin,
    checkout,
    roomMapping: true,
    includeHotelData: true
  };

  return request<any>("api", "/hotels/rates", "POST", { body });
}

export async function getHotelDetails(hotelId: string) {
  const params = new URLSearchParams({
    hotelId,
    timeout: "4"
  });
  return request<{ data: any }>("api", "/data/hotel", "GET", {
    searchParams: params
  });
}

export async function prebookRate(body: {
  usePaymentSdk: boolean;
  offerId: string;
}) {
  return request<any>("book", "/rates/prebook", "POST", { body });
}

export async function bookRate(body: {
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
}) {
  return request<any>("book", "/rates/book", "POST", { body });
}

