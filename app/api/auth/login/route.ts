import {
  buildUserProfile,
  setIdentityCookie,
  deriveUserTypeFromEmail
} from "@/auth/server";
import type { IdentityBlob, Session, UserType, LoyaltyLevel } from "@/auth/types";
import { NextRequest, NextResponse } from "next/server";

const USER_TYPES: UserType[] = ["member", "employee", "b2b"];
const LOYALTY_LEVELS: LoyaltyLevel[] = ["explorer", "adventurer", "voyager"];

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    password?: string;
    displayName?: string;
    phone?: string;
    userType?: string;
    loyaltyLevel?: string;
    bookingsCount?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: { message: "Valid email is required" } },
      { status: 400 }
    );
  }

  // Placeholder: no password check or DB; we accept any email and create a profile.
  const userType = USER_TYPES.includes(body.userType as UserType)
    ? (body.userType as UserType)
    : deriveUserTypeFromEmail(email);
  const loyaltyLevel = LOYALTY_LEVELS.includes(body.loyaltyLevel as LoyaltyLevel)
    ? (body.loyaltyLevel as LoyaltyLevel)
    : "explorer";
  const bookingsCount =
    typeof body.bookingsCount === "number" && body.bookingsCount >= 0
      ? body.bookingsCount
      : undefined;

  const userId = `standalone-${email.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
  const now = new Date().toISOString();
  const session: Session = {
    sessionId: `sess-${userId}-${now}`,
    createdAt: now,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  const profile = buildUserProfile({
    userId,
    email,
    displayName: typeof body.displayName === "string" ? body.displayName : undefined,
    phone: typeof body.phone === "string" ? body.phone.trim() || undefined : undefined,
    userType,
    loyaltyLevel,
    bookingsCount
  });
  const identity: IdentityBlob = { session, profile };

  const { name, value, options } = setIdentityCookie(identity);
  const res = NextResponse.json({
    ok: true,
    profile: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      phone: profile.phone,
      userType: profile.userType,
      loyaltyLevel: profile.loyaltyLevel,
      bookingsCount: profile.bookingsCount
    }
  });
  res.cookies.set(name, value, options);
  return res;
}
