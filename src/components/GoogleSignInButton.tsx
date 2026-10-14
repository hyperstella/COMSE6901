"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { NEXT_COOKIE } from "@/lib/next-path";

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/**
 * Renders the official "Sign in with Google" button in redirect mode.
 * After the user picks an account, Google POSTs the ID token to
 * /auth/callback on this origin.
 */
export default function GoogleSignInButton({
  clientId,
  next,
}: {
  clientId: string;
  next?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.google?.accounts),
  );

  // Google POSTs cross-site to /auth/callback, so the cookie must be
  // SameSite=None to arrive there. The callback validates and clears it.
  useEffect(() => {
    const value = next ? encodeURIComponent(next) : "";
    document.cookie = `${NEXT_COOKIE}=${value}; Path=/; Max-Age=${next ? 600 : 0}; SameSite=None; Secure`;
  }, [next]);

  useEffect(() => {
    if (!loaded || !ref.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "redirect",
      login_uri: `${window.location.origin}/auth/callback`,
    });
    window.google.accounts.id.renderButton(ref.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
    });
  }, [loaded, clientId]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div ref={ref} className="flex min-h-11 justify-center" />
    </>
  );
}

/**
 * The same button for deployment URLs, which Google doesn't know about: it
 * starts the sign-in that detours through production (see lib/auth-relay.ts).
 */
export function GoogleRelayButton({ next }: { next?: string | null }) {
  return (
    <a
      href={`/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}
      className="inline-flex h-10 items-center gap-2.5 rounded-full border border-[#dadce0] bg-white pl-3 pr-4 text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8faff]"
    >
      <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
        <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
      </svg>
      Continue with Google
    </a>
  );
}
