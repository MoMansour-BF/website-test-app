"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthProvider } from "@/context/AuthContext";
import { LocaleCurrencyProvider } from "@/context/LocaleCurrencyContext";

export function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LocaleCurrencyProvider>
        <AppHeader />
        {children}
      </LocaleCurrencyProvider>
    </AuthProvider>
  );
}
