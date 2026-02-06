"use client";

import { useAuth } from "@/context/AuthContext";
import {
  CURRENCIES,
  useLocaleCurrency,
  type Currency,
  type Locale
} from "@/context/LocaleCurrencyContext";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function AppHeader() {
  const { locale, currency, setLocale, setCurrency } = useLocaleCurrency();
  const { isReady, isLoggedIn, userProfile, logout } = useAuth();
  const [langOpen, setLangOpen] = useState(false);
  const [currOpen, setCurrOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const currRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setLangOpen(false);
    setCurrOpen(false);
    setUserOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        langRef.current?.contains(t) ||
        currRef.current?.contains(t) ||
        userRef.current?.contains(t)
      )
        return;
      closeAll();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeAll]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
      <span className="text-lg font-semibold text-emerald-500">
        JOURNEYS By Breadfast
      </span>

      <div className="flex items-center gap-2">
        {/* Auth: Log in or user menu */}
        {isReady && (
          isLoggedIn ? (
            <div className="relative" ref={userRef}>
              <button
                type="button"
                onClick={() => {
                  setLangOpen(false);
                  setCurrOpen(false);
                  setUserOpen((o) => !o);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label="Account menu"
                aria-expanded={userOpen}
              >
                <UserIcon className="text-slate-300" />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {userProfile?.displayName || userProfile?.email || "Account"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {userProfile?.userType}
                      {userProfile?.loyaltyLevel
                        ? ` · ${userProfile.loyaltyLevel.charAt(0).toUpperCase() + userProfile.loyaltyLevel.slice(1)}`
                        : ""}
                    </p>
                    {userProfile?.phone && (
                      <p className="text-[11px] text-slate-500 truncate">{userProfile.phone}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
                className="flex h-9 items-center rounded-full bg-emerald-500/20 px-3 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Log in
              </Link>
          )
        )}

        {/* Language */}
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => {
              setCurrOpen(false);
              setLangOpen((o) => !o);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Select language"
            aria-expanded={langOpen}
          >
            <GlobeIcon className="text-slate-300" />
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
              {(["en", "ar"] as Locale[]).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    setLocale(loc);
                    setLangOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                    locale === loc ? "font-medium text-emerald-400" : "text-slate-200"
                  }`}
                >
                  {loc === "en" ? "English" : "Arabic"}
                  {locale === loc && (
                    <span className="text-emerald-400" aria-hidden>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Currency */}
        <div className="relative" ref={currRef}>
          <button
            type="button"
            onClick={() => {
              setLangOpen(false);
              setCurrOpen((o) => !o);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Select currency"
            aria-expanded={currOpen}
          >
            <CurrencyIcon className="text-slate-300" />
          </button>
          {currOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[100px] rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl max-h-[60vh] overflow-y-auto">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCurrency(c as Currency);
                    setCurrOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                    currency === c ? "font-medium text-emerald-400" : "text-slate-200"
                  }`}
                >
                  {c}
                  {currency === c && (
                    <span className="text-emerald-400" aria-hidden>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
