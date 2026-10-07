"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Campus", match: (p: string) => p === "/" },
  { href: "/swipe", label: "Swipe", match: (p: string) => p.startsWith("/swipe") },
  { href: "/trees", label: "Grove", match: (p: string) => p.startsWith("/trees") },
  { href: "/upload", label: "Add a tree", match: (p: string) => p.startsWith("/upload") },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1">
      {LINKS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-full px-3 py-1.5 text-sm transition-colors ${
                active ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
