/** Treendr's mark: a leaf that burns like a dating-app flame. */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M16 31C7 28 4 20 7 13c1.5 3 4 4 5 3-2-6 1-12 6-15-1 5 3 7 5 11 3 6 1 16-7 19Z"
        fill="var(--accent)"
      />
      <path
        d="M16 30V17M16 23l-3-3M16 20l3-3"
        stroke="var(--mint)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
