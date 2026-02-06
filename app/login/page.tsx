"use client";

import { useAuth } from "@/context/AuthContext";
import type { UserType, LoyaltyLevel } from "@/auth/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const USER_TYPES: { value: UserType; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "employee", label: "Employee" },
  { value: "b2b", label: "B2B" }
];

const LOYALTY_LEVELS: { value: LoyaltyLevel; label: string; hint: string }[] = [
  { value: "explorer", label: "Explorer", hint: "0–4 bookings" },
  { value: "adventurer", label: "Adventurer", hint: "5–9 bookings" },
  { value: "voyager", label: "Voyager", hint: "10+ bookings" }
];

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoggedIn, isReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [userType, setUserType] = useState<UserType>("member");
  const [loyaltyLevel, setLoyaltyLevel] = useState<LoyaltyLevel>("explorer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isReady && isLoggedIn) {
    router.replace("/");
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await login({
      email: email.trim(),
      password: password || undefined,
      displayName: displayName.trim() || undefined,
      phone: phone.trim() || undefined,
      userType,
      loyaltyLevel
    });
    setLoading(false);
    if (result.ok) {
      router.replace("/");
    } else {
      setError(result.error ?? "Login failed");
    }
  };

  return (
    <main className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Log in</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Sign in to get member pricing and rewards.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-slate-400 mb-1">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="you@example.com"
          />
          <p className="text-[11px] text-slate-500 mt-0.5">
            Use @breadfast.com to be treated as Employee (placeholder).
          </p>
        </div>

        <div>
          <label htmlFor="login-display" className="block text-xs font-medium text-slate-400 mb-1">
            Display name <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="login-display"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="Your name"
          />
        </div>

        <div>
          <label htmlFor="login-phone" className="block text-xs font-medium text-slate-400 mb-1">
            Phone <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="login-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="+1 234 567 8900"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-medium text-slate-400 mb-1">
            Password <span className="text-slate-500">(optional for demo)</span>
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-400 mb-1">User type (demo)</span>
          <div className="flex flex-wrap gap-2">
            {USER_TYPES.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="radio"
                  name="userType"
                  value={value}
                  checked={userType === value}
                  onChange={() => setUserType(value)}
                  className="rounded-full border-slate-600 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-200">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-400 mb-1">Loyalty tier (demo)</span>
          <p className="text-[11px] text-slate-500 mb-1.5">
            Explorer 0–4 · Adventurer 5–9 · Voyager 10+ bookings
          </p>
          <div className="flex flex-col gap-1.5">
            {LOYALTY_LEVELS.map(({ value, label, hint }) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer py-1"
              >
                <input
                  type="radio"
                  name="loyaltyLevel"
                  value={value}
                  checked={loyaltyLevel === value}
                  onChange={() => setLoyaltyLevel(value)}
                  className="rounded-full border-slate-600 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-200">{label}</span>
                <span className="text-[11px] text-slate-500">({hint})</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-emerald-500 text-slate-900 font-semibold py-2.5 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        <Link href="/" className="text-emerald-400 hover:underline">
          ← Back to search
        </Link>
      </p>
    </main>
  );
}
