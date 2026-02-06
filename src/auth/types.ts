/**
 * Auth and user identity types for Phase 1.
 * All environments (Breadfast, standalone, web) implement the same adapter contract.
 */

/** User type for segment/margin resolution (Phase 3+). */
export type UserType = "member" | "employee" | "b2b";

/**
 * Loyalty level for segment/margin resolution (Phase 3+).
 * Explorer: 0–4 bookings, Adventurer: 5–9, Voyager: 10+.
 */
export type LoyaltyLevel = "explorer" | "adventurer" | "voyager";

/** Session: exists when user is logged in. */
export interface Session {
  /** Opaque session id or token from the host (Breadfast or our backend). */
  sessionId: string;
  /** When the session was created or last refreshed (ISO string). */
  createdAt: string;
  /** Optional: when the session expires (ISO string). */
  expiresAt?: string;
}

/** User profile returned by the adapter; used for margin and promo (Phase 3+). */
export interface UserProfile {
  userId: string;
  /** Email for domain-based segment rules (e.g. @breadfast.com → employee). */
  email?: string;
  /** Optional display name. */
  displayName?: string;
  /** Optional phone number. */
  phone?: string;
  userType: UserType;
  loyaltyLevel: LoyaltyLevel;
  /** Optional bookings count; used to compute loyalty tier (Explorer 0–4, Adventurer 5–9, Voyager 10+). */
  bookingsCount?: number;
  /** Optional B2B account/org id for segment overrides. */
  accountId?: string;
}

/**
 * Get loyalty level from number of bookings.
 * Explorer: 0–4, Adventurer: 5–9, Voyager: 10+.
 */
export function getLoyaltyLevelFromBookings(bookingsCount: number): LoyaltyLevel {
  if (bookingsCount >= 10) return "voyager";
  if (bookingsCount >= 5) return "adventurer";
  return "explorer";
}

/** Identity blob: session + profile. Stored locally and optionally synced. */
export interface IdentityBlob {
  session: Session;
  profile: UserProfile;
}

/**
 * Auth / User identity adapter contract.
 * Implementations: Standalone (NextAuth, Clerk, or cookie-based), Breadfast (their SDK/API).
 * API routes and app code use this interface so swapping providers only swaps the implementation.
 */
export interface AuthAdapter {
  /**
   * Returns the current session or null (guest).
   * Session may include token / userId for the host.
   */
  getSession(): Promise<Session | null>;

  /**
   * Returns the current user's profile (userId, userType, loyaltyLevel).
   * Returns null when not logged in.
   * Source depends on implementation (Breadfast API, our DB, JWT, etc.).
   */
  getUserProfile(): Promise<UserProfile | null>;

  /**
   * Returns session and profile together when logged in; null when guest.
   * Convenience for "identity blob" used in local storage and margin resolver.
   */
  getIdentity(): Promise<IdentityBlob | null>;
}
