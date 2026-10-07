"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The header sits on the page background; it frosts over only once the page scrolls under it. */
export default function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled ? "bg-bg/75 shadow-[0_1px_0_var(--line)] backdrop-blur-md backdrop-saturate-150" : "bg-transparent"
      }`}
    >
      {children}
    </header>
  );
}
