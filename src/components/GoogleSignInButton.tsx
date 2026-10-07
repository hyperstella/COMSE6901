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
