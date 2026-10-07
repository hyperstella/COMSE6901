"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Logo from "@/components/Logo";

/** Shown when a signed-out visitor tries to swipe, vote or add a tree. */
export default function SignInPrompt({ open, onClose, next }: { open: boolean; onClose: () => void; next: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,400px)] overflow-visible bg-transparent p-0 text-ink backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <div className="card p-6 text-center">
        <Logo className="mx-auto h-14 w-14" />
        <h2 className="display mt-3 text-4xl italic">Make an account first</h2>
        <p className="mt-3 text-ink-2">
          Anyone can browse. To like lines, get matches and add trees, sign in with your Google
          account. The trees are shy, but they&apos;re not that shy.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button onClick={onClose} className="btn btn-paper">
            Keep browsing
          </button>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn">
            Sign in
          </Link>
        </div>
      </div>
    </dialog>
  );
}
