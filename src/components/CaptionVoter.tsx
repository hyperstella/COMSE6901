"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import Heart from "@/components/Heart";
import SignInPrompt from "@/components/SignInPrompt";
import { likeSound, passSound } from "@/lib/sfx";
import type { Tally, Vote } from "@/lib/types";
import { castVote } from "@/lib/votes";

function applyVote(tally: Tally, from: Vote, to: Vote): Tally {
  return {
    upvotes: tally.upvotes - (from === 1 ? 1 : 0) + (to === 1 ? 1 : 0),
    downvotes: tally.downvotes - (from === -1 ? 1 : 0) + (to === -1 ? 1 : 0),
  };
}

/** Like / pass buttons for one profile line. Clicking your current vote takes it back. */
export default function CaptionVoter({
  captionId,
  initialVote,
  initialTally,
  signedIn,
}: {
  captionId: string;
  initialVote: Vote;
  initialTally: Tally;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const [vote, setVote] = useState<Vote>(initialVote);
  const [tally, setTally] = useState(initialTally);
  const [error, setError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const choose = (value: 1 | -1) => {
    if (!signedIn) return setSignInOpen(true);
    const next: Vote = vote === value ? 0 : value;
    const prev = { vote, tally };
    if (next === 1) likeSound();
    if (next === -1) passSound();
    setVote(next);
    setTally(applyVote(tally, vote, next));
    setError(null);

    startTransition(async () => {
      const res = await castVote(captionId, next);
      if (res.ok) {
        setTally(res.tally);
      } else {
        setVote(prev.vote);
        setTally(prev.tally);
        if (res.needsSignIn) setSignInOpen(true);
        else setError(res.error);
      }
    });
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          onClick={() => choose(-1)}
          disabled={pending}
          aria-pressed={vote === -1}
          aria-label={`Pass, ${tally.downvotes} so far`}
          className={`btn min-w-14 px-3 py-1.5 text-sm tabular-nums ${vote === -1 ? "" : "btn-paper"}`}
          style={vote === -1 ? ({ "--face": "var(--ink)", "--face-ink": "var(--paper)" } as React.CSSProperties) : undefined}
        >
          ✕ {tally.downvotes}
        </button>
        <button
          onClick={() => choose(1)}
          disabled={pending}
          aria-pressed={vote === 1}
          aria-label={`Like, ${tally.upvotes} so far`}
          className={`btn min-w-14 px-3 py-1.5 text-sm tabular-nums ${vote === 1 ? "btn-like" : "btn-paper"}`}
        >
          <Heart className={`h-3.5 w-3.5 ${vote === 1 ? "" : "text-like"}`} /> {tally.upvotes}
        </button>
      </div>
      {error && <p className="text-xs text-like">{error}</p>}
      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} next={pathname} />
    </div>
  );
}
