"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import Heart from "@/components/Heart";
import SignInPrompt from "@/components/SignInPrompt";
import { likeSound } from "@/lib/sfx";
import { voteRestaurant } from "@/lib/restaurant-votes";

/** "I'd go" toggle for one restaurant. Clicking again takes the vote back. */
export default function RestaurantVoter({
  restaurantId,
  initialVoted,
  initialVotes,
  signedIn,
}: {
  restaurantId: number;
  initialVoted: boolean;
  initialVotes: number;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const [voted, setVoted] = useState(initialVoted);
  const [votes, setVotes] = useState(initialVotes);
  const [error, setError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (!signedIn) return setSignInOpen(true);
    const next = !voted;
    const prev = { voted, votes };
    if (next) likeSound();
    setVoted(next);
    setVotes(votes + (next ? 1 : -1));
    setError(null);

    startTransition(async () => {
      const res = await voteRestaurant(restaurantId, next);
      if (res.ok) {
        setVotes(res.votes);
      } else {
        setVoted(prev.voted);
        setVotes(prev.votes);
        if (res.needsSignIn) setSignInOpen(true);
        else setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={voted}
        aria-label={`I'd go, ${votes} ${votes === 1 ? "vote" : "votes"}`}
        className={`btn px-3 py-1.5 text-sm tabular-nums ${voted ? "btn-like" : "btn-paper"}`}
      >
        <Heart className={`h-3.5 w-3.5 ${voted ? "" : "text-like"}`} /> I&apos;d go &middot; {votes}
      </button>
      {error && <p className="text-xs text-like">{error}</p>}
      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} next={pathname} />
    </div>
  );
}
