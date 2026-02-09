"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "journeys_favorite_hotel_ids";

function readFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeFavoriteIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

interface FavoriteHotelsContextValue {
  favoriteIds: string[];
  isFavorite: (hotelId: string) => boolean;
  toggleFavorite: (hotelId: string) => void;
}

const FavoriteHotelsContext = createContext<FavoriteHotelsContextValue | null>(
  null
);

export function FavoriteHotelsProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(readFavoriteIds());
  }, []);

  const isFavorite = useCallback(
    (hotelId: string) => favoriteIds.includes(hotelId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback((hotelId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(hotelId)
        ? prev.filter((id) => id !== hotelId)
        : [...prev, hotelId];
      writeFavoriteIds(next);
      return next;
    });
  }, []);

  const value = useMemo<FavoriteHotelsContextValue>(
    () => ({ favoriteIds, isFavorite, toggleFavorite }),
    [favoriteIds, isFavorite, toggleFavorite]
  );

  return (
    <FavoriteHotelsContext.Provider value={value}>
      {children}
    </FavoriteHotelsContext.Provider>
  );
}

export function useFavoriteHotels(): FavoriteHotelsContextValue {
  const ctx = useContext(FavoriteHotelsContext);
  if (!ctx) {
    throw new Error("useFavoriteHotels must be used within FavoriteHotelsProvider");
  }
  return ctx;
}