import { clearIdentityCookie } from "@/auth/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { name, value, options } = clearIdentityCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, options);
  return res;
}
