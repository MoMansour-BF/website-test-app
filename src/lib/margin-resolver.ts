/**
 * Phase 3: Margin resolver.
 * Returns effective_margin (and optional additionalMarkup, display_discount_percent)
 * from a single "segment" record. Placeholder implementation until DB is ready;
 * when DB is available, replace resolveSegmentPlaceholder with DB lookup.
 */

import type { NextRequest } from "next/server";
import type { Channel } from "@/lib/channel-keys";
import { getIdentityFromRequest } from "@/auth";
import type { LoyaltyLevel, UserType } from "@/auth/types";

export interface MarginResult {
  /** Margin % sent to LiteAPI (e.g. 10). B2C does not use this. */
  margin?: number;
  /** Optional additional markup for LiteAPI. */
  additionalMarkup?: number;
  /** Optional "fake" promo: display was = retail × (1 + p/100). Used in Phase 5. */
  displayDiscountPercent?: number;
}

/**
 * Segment row shape (matches DB segments table).
 * Placeholder uses in-memory map; DB will have effective_margin as single final column.
 */
interface SegmentRow {
  id: string;
  name: string;
  effective_margin: number | null;
  additional_markup: number | null;
  display_discount_percent: number | null;
  is_cug: boolean;
}

/**
 * Placeholder segments. When DB is ready, load from segments table.
 * Loyalty-based member margins (testing): explorer 7%, adventurer 5%, voyager 3%.
 */
const PLACEHOLDER_SEGMENTS: Record<string, SegmentRow> = {
  employee: {
    id: "employee",
    name: "Employee",
    effective_margin: 5,
    additional_markup: null,
    display_discount_percent: 10,
    is_cug: true
  },
  /** Member + Explorer loyalty → 7% margin (testing; will come from DB). */
  member_explorer: {
    id: "member_explorer",
    name: "Member (Explorer)",
    effective_margin: 7,
    additional_markup: null,
    display_discount_percent: 0,
    is_cug: true
  },
  /** Member + Adventurer loyalty → 5% margin (testing; will come from DB). */
  member_adventurer: {
    id: "member_adventurer",
    name: "Member (Adventurer)",
    effective_margin: 5,
    additional_markup: null,
    display_discount_percent: 0,
    is_cug: true
  },
  /** Member + Voyager loyalty → 3% margin (testing; will come from DB). */
  member_voyager: {
    id: "member_voyager",
    name: "Member (Voyager)",
    effective_margin: 3,
    additional_markup: null,
    display_discount_percent: 0,
    is_cug: true
  },
  b2b: {
    id: "b2b",
    name: "B2B",
    effective_margin: 0,
    additional_markup: null,
    display_discount_percent: null,
    is_cug: true
  }
};

/** Default segment when no rule matches (logged-in CUG). */
const DEFAULT_SEGMENT = PLACEHOLDER_SEGMENTS.member_explorer;

/**
 * Placeholder resolution: userType + loyaltyLevel → segment.
 * Mimics segment_rules (user_type_loyalty + default). No DB yet.
 * When DB exists: run rules in priority order (b2b_account → email_domain → user_type_loyalty → default).
 */
function resolveSegmentPlaceholder(profile: {
  userType: UserType;
  loyaltyLevel: LoyaltyLevel;
  email?: string;
  accountId?: string;
}): SegmentRow {
  // 1. B2B account override (placeholder: accountId present → b2b)
  if (profile.accountId) {
    const seg = PLACEHOLDER_SEGMENTS.b2b;
    if (seg) return seg;
  }

  // 2. Email domain (placeholder: @breadfast.com → employee)
  if (profile.email) {
    const domain = profile.email.toLowerCase().split("@")[1] ?? "";
    if (domain === "breadfast.com") return PLACEHOLDER_SEGMENTS.employee;
  }

  // 3. user_type + loyalty_level (explorer 7%, adventurer 5%, voyager 3% — testing; DB later)
  if (profile.userType === "employee") return PLACEHOLDER_SEGMENTS.employee;
  if (profile.userType === "b2b") return PLACEHOLDER_SEGMENTS.b2b;
  if (profile.userType === "member") {
    switch (profile.loyaltyLevel) {
      case "voyager":
        return PLACEHOLDER_SEGMENTS.member_voyager;
      case "adventurer":
        return PLACEHOLDER_SEGMENTS.member_adventurer;
      case "explorer":
      default:
        return PLACEHOLDER_SEGMENTS.member_explorer;
    }
  }

  // 4. Default
  return DEFAULT_SEGMENT;
}

function segmentToMarginResult(segment: SegmentRow): MarginResult {
  const result: MarginResult = {};
  if (segment.effective_margin != null) result.margin = segment.effective_margin;
  if (segment.additional_markup != null) result.additionalMarkup = segment.additional_markup;
  if (segment.display_discount_percent != null && segment.display_discount_percent > 0) {
    result.displayDiscountPercent = segment.display_discount_percent;
  }
  return result;
}

/**
 * Get margin (and optional additionalMarkup, displayDiscountPercent) for the current request.
 * Use in rates routes: after resolving channel, if CUG call this and pass margin into LiteAPI.
 *
 * - channel b2c: returns {} (use LiteAPI account default).
 * - channel cug: resolves segment from identity (userType, loyaltyLevel, email, accountId), returns segment's effective_margin etc.
 */
export function getMarginForRequest(req: NextRequest, channel: Channel): MarginResult {
  if (channel === "b2c") return {};

  const identity = getIdentityFromRequest(req);
  if (!identity?.profile) return {};

  const segment = resolveSegmentPlaceholder({
    userType: identity.profile.userType,
    loyaltyLevel: identity.profile.loyaltyLevel,
    email: identity.profile.email,
    accountId: identity.profile.accountId
  });

  return segmentToMarginResult(segment);
}
