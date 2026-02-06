/**
 * Auth and user identity (Phase 1).
 * Adapter interface for Breadfast, standalone, and web.
 */

export type {
  AuthAdapter,
  IdentityBlob,
  LoyaltyLevel,
  Session,
  UserProfile,
  UserType
} from "./types";
export { getLoyaltyLevelFromBookings } from "./types";
export type { Channel } from "./server";
export {
  buildUserProfile,
  clearIdentityCookie,
  deriveUserTypeFromEmail,
  getChannelFromRequest,
  getIdentityFromRequest,
  setIdentityCookie
} from "./server";
