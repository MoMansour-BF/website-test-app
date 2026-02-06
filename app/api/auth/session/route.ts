import { getChannelFromRequest } from "@/auth";
import { getIdentityFromRequest } from "@/auth/server";
import { getMarginForRequest } from "@/lib/margin-resolver";
import { NextRequest, NextResponse } from "next/server";

/**
 * Returns current session, user profile, and promo config (Phase 4).
 * Client uses this to hydrate auth state and know whether to show promo (CUG + displayDiscountPercent).
 */
export async function GET(req: NextRequest) {
  const identity = getIdentityFromRequest(req);
  const channel = getChannelFromRequest(req);
  const marginResult = getMarginForRequest(req, channel);

  const promoConfig = {
    isCug: channel === "cug",
    displayDiscountPercent: marginResult.displayDiscountPercent ?? undefined
  };

  if (!identity) {
    return NextResponse.json({ identity: null, promoConfig: { isCug: false, displayDiscountPercent: undefined } });
  }
  return NextResponse.json({
    identity: {
      session: identity.session,
      profile: identity.profile
    },
    promoConfig
  });
}
