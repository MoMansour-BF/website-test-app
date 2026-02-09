"use client";

import {
  CURRENCIES,
  useLocaleCurrency,
  type Currency,
  type Locale,
} from "@/context/LocaleCurrencyContext";
import { useAuth } from "@/context/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeftIcon } from "@/components/Icons";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const { isReady, isLoggedIn, userProfile, logout } = useAuth();
  const { locale, currency, setLocale, setCurrency } = useLocaleCurrency();

  return (
    <main className="min-h-screen bg-[var(--light-bg)] text-[var(--dark-text)] pb-24">
      {/* Top bar: back to Home + title (back goes to Home to avoid Profile ↔ Login loop) */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-white/95 backdrop-blur border-b border-[var(--sky-blue)] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="h-9 w-9 shrink-0 rounded-full border border-[var(--sky-blue)] bg-[var(--light-bg)] flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-[var(--expand-duration)]"
          aria-label="Back to home"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-[var(--dark-text)] truncate">Profile</h1>
      </header>

      <div
        className="max-w-md mx-auto px-4 py-6 space-y-6 animate-profile-enter"
        style={{ animationDuration: "var(--view-transition-duration)" }}
      >

        {/* Account section */}
        <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--dark-text)] mb-3">
            Account
          </h2>
          {isReady && !isLoggedIn && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted-foreground)]">
                You&apos;re browsing as a guest.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-semibold py-3 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
              >
                Log in
              </Link>
            </div>
          )}
          {isReady && isLoggedIn && userProfile && (
            <div className="space-y-3">
              {userProfile.displayName && (
                <p className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Name</span>{" "}
                  <span className="font-medium">{userProfile.displayName}</span>
                </p>
              )}
              {userProfile.email && (
                <p className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Email</span>{" "}
                  <span className="font-medium truncate block">
                    {userProfile.email}
                  </span>
                </p>
              )}
              <p className="text-sm">
                <span className="text-[var(--muted-foreground)]">Type</span>{" "}
                <span className="font-medium capitalize">
                  {userProfile.userType}
                </span>
              </p>
              {userProfile.loyaltyLevel && (
                <p className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Tier</span>{" "}
                  <span className="font-medium capitalize">
                    {userProfile.loyaltyLevel}
                  </span>
                </p>
              )}
              {userProfile.phone && (
                <p className="text-sm">
                  <span className="text-[var(--muted-foreground)]">Phone</span>{" "}
                  <span className="font-medium">{userProfile.phone}</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => logout()}
                className="mt-2 w-full rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] py-2.5 text-sm font-medium text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors"
              >
                Log out
              </button>
            </div>
          )}
        </section>

        {/* Language */}
        <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--dark-text)] mb-3">
            Language
          </h2>
          <div className="flex gap-2">
            {(["en", "ar"] as Locale[]).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                  locale === loc
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--sky-blue)] bg-[var(--light-bg)] text-[var(--dark-text)] hover:bg-[var(--muted)]"
                }`}
              >
                {loc === "en" ? "English" : "Arabic"}
              </button>
            ))}
          </div>
        </section>

        {/* Currency */}
        <section className="rounded-2xl border border-[var(--sky-blue)] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--dark-text)] mb-3">
            Currency
          </h2>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c as Currency)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                  currency === c
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--sky-blue)] bg-[var(--light-bg)] text-[var(--dark-text)] hover:bg-[var(--muted)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      </div>

      <BottomNav onSearchClick={() => router.push("/")} />
    </main>
  );
}
