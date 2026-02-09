"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_THRESHOLD = 60;

/**
 * Tracks window scroll direction and returns whether chrome (header/bottom nav)
 * should be visible: collapse on scroll down, reappear on scroll up.
 * Respects prefers-reduced-motion (chrome stays visible when reduced motion is preferred).
 */
export function useScrollDirection(threshold: number = DEFAULT_THRESHOLD): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = media.matches;
    const listener = () => {
      reducedMotion.current = media.matches;
    };
    media.addEventListener("change", listener);

    const handleScroll = () => {
      if (reducedMotion.current) {
        setVisible(true);
        return;
      }
      const y = window.scrollY;
      if (y <= threshold) {
        setVisible(true);
      } else if (y > lastScrollY.current) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScrollY.current = y;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // initial state

    return () => {
      window.removeEventListener("scroll", handleScroll);
      media.removeEventListener("change", listener);
    };
  }, [threshold]);

  return visible;
}
