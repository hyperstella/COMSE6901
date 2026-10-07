"use client";

/** Whether tree photos show as photos or as pixel art. Remembered per browser. */
export type ViewMode = "photo" | "pixel";

const KEY = "treendr-view";
let fallback: ViewMode = "photo";
const listeners = new Set<() => void>();

export function getViewMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === "pixel" ? "pixel" : "photo";
  } catch {
    return fallback;
  }
}

export function setViewMode(mode: ViewMode) {
  fallback = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked; the switch still works for this page view.
  }
  listeners.forEach((l) => l());
}

export function subscribeViewMode(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
