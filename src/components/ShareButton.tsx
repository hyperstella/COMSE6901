"use client";

import { useEffect, useState } from "react";

/**
 * Shares a page: the system share sheet where there is one (phones), or
 * copies the link. `path` is resolved against the current site, so links
 * point at whichever deployment you're on.
 */
export default function ShareButton({
  path,
  title,
  text,
  className = "btn btn-paper",
}: {
  path: string;
  title: string;
  text: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const t = setTimeout(() => setStatus("idle"), 2200);
    return () => clearTimeout(t);
  }, [status]);

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // they closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Some browsers block the clipboard API; fall back to the old way, then to a box to copy from.
      if (copyLegacy(url)) setStatus("copied");
      else window.prompt("Copy this link:", url);
    }
  };

  return (
    <button type="button" onClick={share} className={className} aria-live="polite">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
        <path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
      </svg>
      {status === "copied" ? "Link copied!" : "Share"}
    </button>
  );
}

function copyLegacy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
