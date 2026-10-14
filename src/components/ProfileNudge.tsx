"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

const KEY = "treendr-about-nudge";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** Pages where the nudge would get in the way (or is already answered). */
const QUIET = ["/profile/about", "/onboarding", "/login"];

/**
 * A notification asking signed-in users who haven't said anything about
 * themselves to fill in "About you", since matches are guesswork without it.
 * Dismissing it snoozes it for a few days.
 */
export default function ProfileNudge() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let snoozedUntil = 0;
    try {
      snoozedUntil = Number(localStorage.getItem(KEY)) || 0;
    } catch {
      // Storage blocked: show it, and dismissing hides it for this page view.
    }
    if (Date.now() < snoozedUntil) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // Fine: it just comes back next visit.
    }
  };

  if (!open || QUIET.some((p) => pathname.startsWith(p))) return null;

  return (
    <aside
      role="status"
      aria-label="Finish your profile"
      className="card pop-in fixed inset-x-3 bottom-[calc(var(--tabbar)+0.75rem)] z-[55] flex gap-3 p-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[22rem]"
    >
      <Logo className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="display text-2xl italic leading-tight">The trees want to know you</p>
        <p className="mt-1 text-sm text-ink-2">
          Right now your matches are random. Tell us a little about yourself and the AI matchmaker will find the trees
          that fit you.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Link href="/profile/about" onClick={() => setOpen(false)} className="btn btn-like px-4 py-2 text-sm">
            Tell the trees
          </Link>
          <button onClick={dismiss} className="btn btn-ghost px-3 py-2 text-sm">
            Later
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-ink/5 hover:text-ink"
      >
        ✕
      </button>
    </aside>
  );
}
