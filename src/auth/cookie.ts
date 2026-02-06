import { createHmac, timingSafeEqual } from "crypto";
import type { IdentityBlob, Session, UserProfile } from "./types";

const COOKIE_NAME = "app_session";
const SEP = ".";

function getSecret(): string {
  const secret =
    process.env.AUTH_COOKIE_SECRET ??
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "development"
      ? "dev-secret-min-16-chars"
      : undefined);
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_COOKIE_SECRET or SESSION_SECRET must be set (min 16 chars) for auth"
    );
  }
  return secret;
}

function sign(payload: string): string {
  const secret = getSecret();
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  try {
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    // timingSafeEqual requires same-length buffers (and throws otherwise)
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function encodeIdentity(identity: IdentityBlob): string {
  const payload = JSON.stringify({
    session: identity.session,
    profile: identity.profile
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encoded);
  return `${encoded}${SEP}${signature}`;
}

export function decodeIdentity(cookieValue: string): IdentityBlob | null {
  const i = cookieValue.indexOf(SEP);
  if (i === -1) return null;
  const encoded = cookieValue.slice(0, i);
  const signature = cookieValue.slice(i + 1);
  if (!verify(encoded, signature)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as { session: Session; profile: UserProfile };
    if (!payload?.session?.sessionId || !payload?.profile?.userId) return null;
    return { session: payload.session, profile: payload.profile };
  } catch {
    return null;
  }
}

export function getAuthCookieName(): string {
  return COOKIE_NAME;
}

export function getIdentityFromCookie(cookieHeader: string | null): IdentityBlob | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const value = match?.[1];
  if (!value) return null;
  return decodeIdentity(decodeURIComponent(value));
}
