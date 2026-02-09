"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { UserIcon } from "@/components/Icons";

interface HomeHeaderProps {
  /** When false, header collapses off-screen (translateY -100%). Default true. */
  visible?: boolean;
}

export function HomeHeader({ visible = true }: HomeHeaderProps) {
  const { isReady, isLoggedIn } = useAuth();

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-white/95 backdrop-blur border-b border-[var(--sky-blue)] transition-transform duration-[var(--expand-duration)] ease-out"
      style={{ transform: visible ? "translateY(0)" : "translateY(-100%)" }}
      aria-hidden={!visible}
    >
      <Link href="/" className="flex items-center shrink-0" aria-label="Journeys by Breadfast home">
        <BrandLogo variant="full" size="md" className="h-9 w-auto max-w-[160px]" />
      </Link>

      <div className="flex items-center gap-2">
        {isReady && (
          <Link
            href="/profile"
            className="flex h-9 items-center gap-2 rounded-full bg-[var(--light-bg)] pl-2 pr-3 text-sm font-medium text-[var(--dark-text)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            aria-label="Profile"
          >
            <UserIcon className="text-[var(--muted-foreground)] w-5 h-5 shrink-0" />
            <span>{isLoggedIn ? "Profile" : "Log in"}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
