import { type NextRequest } from "next/server";
import {
  decodeIdentity,
  encodeIdentity,
  getAuthCookieName,
  getIdentityFromCookie
} from "./cookie";
import {
  type IdentityBlob,
  type UserProfile,
  type UserType,
  type LoyaltyLevel,
  getLoyaltyLevelFromBookings
} from "./types";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7 // 7 days
};

/**
 * Channel for LiteAPI key selection (Phase 2).
 * Guest → B2C key; logged-in → CUG key.
 */
export type Channel = "b2c" | "cug";

/**
 * Read current identity from the request (cookie).
 * Use in API routes to know "who is this user?" without changing API key yet (Phase 1).
 */
export function getIdentityFromRequest(req: NextRequest): IdentityBlob | null {
  const cookieHeader = req.headers.get("cookie");
  return getIdentityFromCookie(cookieHeader);
}

/**
 * Resolve channel from request: no session → b2c, valid session → cug.
 * Use in API routes to select LITEAPI_KEY_B2C vs LITEAPI_KEY_CUG.
 */
export function getChannelFromRequest(req: NextRequest): Channel {
  const identity = getIdentityFromRequest(req);
  return identity ? "cug" : "b2c";
}

/**
 * Set identity cookie on the response.
 * Used by login API route.
 */
export function setIdentityCookie(identity: IdentityBlob): { name: string; value: string; options: typeof COOKIE_OPTIONS } {
  const name = getAuthCookieName();
  const value = encodeIdentity(identity);
  return { name, value, options: COOKIE_OPTIONS };
}

/**
 * Clear identity cookie (for logout).
 */
export function clearIdentityCookie(): { name: string; value: string; options: { path: string; maxAge: number } } {
  return {
    name: getAuthCookieName(),
    value: "",
    options: { path: "/", maxAge: 0 }
  };
}

/** Derive user type from email domain (placeholder until DB). */
export function deriveUserTypeFromEmail(email: string): UserType {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  if (domain === "breadfast.com") return "employee";
  return "member";
}

/** Build a placeholder UserProfile for standalone login (no DB yet). */
export function buildUserProfile(params: {
  userId: string;
  email: string;
  displayName?: string;
  phone?: string;
  userType?: UserType;
  loyaltyLevel?: LoyaltyLevel;
  bookingsCount?: number;
  accountId?: string;
}): UserProfile {
  const userType = params.userType ?? deriveUserTypeFromEmail(params.email);
  const loyaltyLevel =
    params.loyaltyLevel ??
    (params.bookingsCount != null
      ? getLoyaltyLevelFromBookings(params.bookingsCount)
      : "explorer");
  return {
    userId: params.userId,
    email: params.email,
    displayName: params.displayName,
    phone: params.phone,
    userType,
    loyaltyLevel,
    bookingsCount: params.bookingsCount,
    accountId: params.accountId
  };
}

export { COOKIE_OPTIONS };
