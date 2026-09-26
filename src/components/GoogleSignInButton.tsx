"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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
export default function GoogleSignInButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.google?.accounts),
  );

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
