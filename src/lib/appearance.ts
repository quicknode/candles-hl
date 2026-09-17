"use client";

import { useCallback, useEffect, useState } from "react";

export type Appearance = "dark" | "light";
const STORAGE_KEY = "hl-candles:appearance";

export function useAppearance(initial: Appearance = "dark") {
  const [appearance, setAppearance] = useState<Appearance>(initial);

  useEffect(() => {
    let stored: Appearance | null = null;
    try { stored = window.localStorage.getItem(STORAGE_KEY) as Appearance | null; } catch { /* private mode */ }
    const frame = requestAnimationFrame(() => { if (stored === "dark" || stored === "light") setAppearance(stored); });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-appearance", appearance);
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  const toggle = useCallback(() => {
    setAppearance((current) => {
      const next: Appearance = current === "dark" ? "light" : "dark";
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      return next;
    });
  }, []);

  return { appearance, toggle };
}
