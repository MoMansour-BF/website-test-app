"use client";

import { useAuth } from "@/context/AuthContext";
import type { UserType, LoyaltyLevel } from "@/auth/types";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeftIcon } from "@/components/Icons";
import {
  getRatesSearchTimeout,
  setRatesSearchTimeout,
  DEFAULT_RATES_SEARCH_TIMEOUT,
  MIN_RATES_SEARCH_TIMEOUT,
  MAX_RATES_SEARCH_TIMEOUT
} from "@/lib/rates-timeout";

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
  const [ratesTimeoutSeconds, setRatesTimeoutSeconds] = useState(DEFAULT_RATES_SEARCH_TIMEOUT);

  useEffect(() => {
    setRatesTimeoutSeconds(getRatesSearchTimeout());
  }, []);

  const handleTimeoutChange = (value: number) => {
    const clamped = Math.min(MAX_RATES_SEARCH_TIMEOUT, Math.max(MIN_RATES_SEARCH_TIMEOUT, Math.round(value)));
    setRatesTimeoutSeconds(clamped);
    setRatesSearchTimeout(clamped);
  };

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
    <main className="flex-1 flex flex-col min-h-screen bg-[var(--light-bg)] text-[var(--dark-text)] pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-white/95 backdrop-blur border-b border-[var(--sky-blue)] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/profile"
          className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150"
          aria-label="Back to profile"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-[var(--dark-text)] truncate">Log in</h1>
      </header>
      <div className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
        <div>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Sign in to get member pricing and rewards.
          </p>
        </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            placeholder="you@example.com"
          />
          <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            Use @breadfast.com to be treated as Employee (placeholder).
          </p>
        </div>

        <div>
          <label htmlFor="login-display" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Display name <span className="text-[var(--muted-foreground)]">(optional)</span>
          </label>
          <input
            id="login-display"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            placeholder="Your name"
          />
        </div>

        <div>
          <label htmlFor="login-phone" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Phone <span className="text-[var(--muted-foreground)]">(optional)</span>
          </label>
          <input
            id="login-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            placeholder="+1 234 567 8900"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Password <span className="text-[var(--muted-foreground)]">(optional for demo)</span>
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-[var(--dark-text)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">User type (demo)</span>
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
                  className="rounded-full border-[var(--sky-blue)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-sm text-[var(--dark-text)]">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Loyalty tier (demo)</span>
          <p className="text-[11px] text-[var(--muted-foreground)] mb-1.5">
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
                  className="rounded-full border-[var(--sky-blue)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-sm text-[var(--dark-text)]">{label}</span>
                <span className="text-[11px] text-[var(--muted-foreground)]">({hint})</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="login-timeout" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Rates search timeout (seconds)
          </label>
          <input
            id="login-timeout"
            type="number"
            min={MIN_RATES_SEARCH_TIMEOUT}
            max={MAX_RATES_SEARCH_TIMEOUT}
            value={ratesTimeoutSeconds}
            onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2.5 text-[var(--dark-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
          <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            Min {MIN_RATES_SEARCH_TIMEOUT}s, max {MAX_RATES_SEARCH_TIMEOUT}s. How long the server waits for hotel rates.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[var(--primary)] text-white font-semibold py-2.5 hover:bg-[var(--primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--light-bg)] disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

        <p className="text-center text-sm text-[var(--muted-foreground)]">
          <Link href="/" className="text-[var(--primary)] hover:underline">
            ← Back to search
          </Link>
        </p>
      </div>

      <BottomNav onSearchClick={() => router.push("/")} />
    </main>
  );
}
