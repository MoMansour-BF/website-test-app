"use client";

import { HomeIcon, SearchIcon, UserIcon } from "@/components/Icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  onSearchClick?: () => void;
  /** When false, nav collapses off-screen (translateY 100%). Default true. */
  visible?: boolean;
}

export function BottomNav({ onSearchClick, visible = true }: BottomNavProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isProfileSection = pathname === "/profile" || pathname === "/login";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around bg-white border-t border-[var(--sky-blue)] py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-[var(--expand-duration)] ease-out"
      style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
      aria-label="Bottom navigation"
      aria-hidden={!visible}
    >
      <Link
        href="/"
        className={`flex flex-col items-center gap-0.5 min-w-[64px] py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
          isHome
            ? "text-[var(--primary)] font-semibold"
            : "text-[var(--dark-text)] hover:text-[var(--primary)]"
        }`}
        aria-label="Home"
        aria-current={isHome ? "page" : undefined}
      >
        <HomeIcon className="w-6 h-6" />
        <span className="text-xs font-medium">Home</span>
      </Link>

      <button
        type="button"
        onClick={onSearchClick}
        className="flex flex-col items-center gap-0.5 min-w-[64px] py-1 text-[var(--dark-text)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded-lg"
        aria-label="Search"
      >
        <SearchIcon className="w-6 h-6" />
        <span className="text-xs font-medium">Search</span>
      </button>

      <Link
        href="/profile"
        className={`flex flex-col items-center gap-0.5 min-w-[64px] py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
          isProfileSection
            ? "text-[var(--primary)] font-semibold"
            : "text-[var(--dark-text)] hover:text-[var(--primary)]"
        }`}
        aria-label="Profile"
        aria-current={isProfileSection ? "page" : undefined}
      >
        <UserIcon className="w-6 h-6" />
        <span className="text-xs font-medium">Profile</span>
      </Link>
    </nav>
  );
}
