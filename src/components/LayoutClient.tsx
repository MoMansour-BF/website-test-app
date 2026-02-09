"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { FavoriteHotelsProvider } from "@/context/FavoriteHotelsContext";
import { LocaleCurrencyProvider } from "@/context/LocaleCurrencyContext";

export function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LocaleCurrencyProvider>
        <FavoriteHotelsProvider>
          {children}
        </FavoriteHotelsProvider>
      </LocaleCurrencyProvider>
    </AuthProvider>
  );
}
