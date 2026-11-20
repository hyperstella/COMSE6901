"use client";

/**
 * How tree photos are shown: as photos or as pixel art, and how fine the pixel
 * art is. Both are remembered per browser and shared by every photo on the site.
 */

/** A setting kept in localStorage, with listeners so every photo updates at once. */
function stored<T>(key: string, parse: (raw: string | null) => T | null, initial: T) {
  let fallback = initial;
  const listeners = new Set<() => void>();
  return {
    get(): T {
      try {
        return parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(value: T) {
      fallback = value;
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // Storage blocked; the setting still works for this page view.
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => e.key === key && listener();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export type ViewMode = "photo" | "pixel";

const viewMode = stored<ViewMode>("treendr-view", (raw) => (raw === "pixel" ? "pixel" : raw === "photo" ? "photo" : null), "photo");

export const getViewMode = viewMode.get;
export const setViewMode = viewMode.set;
export const subscribeViewMode = viewMode.subscribe;

/** Pixel detail: a multiplier on each photo's own grid (1 = the default look). */
export const PIXEL_SCALE = { min: 0.4, max: 2.5, step: 0.05, initial: 1 } as const;

const clampScale = (v: number) => Math.min(PIXEL_SCALE.max, Math.max(PIXEL_SCALE.min, v));

const pixelScale = stored<number>(
  "treendr-pixel-scale",
  (raw) => {
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? clampScale(v) : null;
  },
  PIXEL_SCALE.initial,
);

export const getPixelScale = pixelScale.get;
export const setPixelScale = (v: number) => pixelScale.set(clampScale(v));
export const subscribePixelScale = pixelScale.subscribe;
