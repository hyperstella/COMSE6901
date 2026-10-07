/** A plain heart in the current text color. */
export default function Heart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 22" className={className} fill="currentColor" aria-hidden>
      <path d="M12 21.2C3.2 15.6 1.2 10.4 1.6 7 2 3.6 4.7 1.4 7.6 1.6c2 .1 3.5 1.3 4.4 2.9.9-1.6 2.4-2.8 4.4-2.9 2.9-.2 5.6 2 6 5.4.4 3.4-1.6 8.6-10.4 14.2Z" />
    </svg>
  );
}
