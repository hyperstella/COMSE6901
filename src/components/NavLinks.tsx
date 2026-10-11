"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = {
  className: "h-[22px] w-[22px]",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const LINKS = [
  {
    href: "/",
    label: "Campus",
    short: "Campus",
    match: (p: string) => p === "/",
    icon: (
      <svg {...icon}>
        <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
        <path d="M9 4v13.5M15 6.5V20" />
      </svg>
    ),
  },
  {
    href: "/swipe",
    label: "Swipe",
    short: "Swipe",
    match: (p: string) => p.startsWith("/swipe"),
    icon: (
      <svg {...icon}>
        <rect x="7" y="3.5" width="12" height="16" rx="2.5" transform="rotate(8 13 11.5)" />
        <path d="M5.6 6.8 4.3 17.4a2.4 2.4 0 0 0 2.1 2.7l5 .6" />
      </svg>
    ),
  },
  {
    href: "/trees",
    label: "Grove",
    short: "Grove",
    match: (p: string) => p.startsWith("/trees"),
    icon: (
      <svg {...icon}>
        <path d="M9 20v-7H4v7M15 20V8.5h-6V20M20 20v-5h-5v5M2.5 20h19" />
        <path d="m12 2.8.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" />
      </svg>
    ),
  },
  {
    href: "/upload",
    label: "Add a tree",
    short: "Add",
    match: (p: string) => p.startsWith("/upload"),
    icon: (
      <svg {...icon}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
];

/** The header's section links. Phones get the TabBar instead. */
export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="hidden min-w-0 items-center gap-1 sm:flex">
      {LINKS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-full px-3 py-1.5 text-sm transition-colors ${
                active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-ink/5 hover:text-ink"
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

/** Bottom tab bar on phones, where the header has no room for every section. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 sm:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {LINKS.map(({ href, short, match, icon }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                  active ? "text-accent" : "text-ink-3 active:text-ink"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-accent/12" : ""}`}>
                  {icon}
                </span>
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
