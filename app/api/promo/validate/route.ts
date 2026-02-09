import { NextRequest, NextResponse } from "next/server";

/**
 * Stub promo code validation (Phase 7).
 * Replace with real validation when backend/CRM supports it.
 * Valid demo codes: SAVE10 (10% off), FLAT20 (flat 20 in currency units).
 */
export async function POST(req: NextRequest) {
  let body: { code?: string; offerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({
      valid: false,
      message: "Please enter a promo code.",
    });
  }

  // Stub: accept SAVE10 (10% discount) and FLAT20 (flat 20 off)
  if (code === "SAVE10") {
    return NextResponse.json({
      valid: true,
      type: "percent",
      value: 10,
      message: "Promo code applied!",
    });
  }
  if (code === "FLAT20") {
    return NextResponse.json({
      valid: true,
      type: "fixed",
      value: 20,
      currency: "EGP",
      message: "Promo code applied!",
    });
  }

  return NextResponse.json({
    valid: false,
    message: "Invalid or expired code",
  });
}
