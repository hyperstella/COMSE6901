"use server";

import { createClient } from "@/lib/supabase/server";
import type { Card, Tally, Vote } from "@/lib/types";

export type VoteResult =
  | { ok: true; vote: Vote; tally: Tally }
  | { ok: false; error: string; needsSignIn?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records the signed-in user's vote on a profile line (caption): +1 like,
 * -1 pass, 0 to take the vote back. Runs as the user, so RLS guarantees they can
 * only write their own vote rows.
 */
export async function castVote(captionId: string, vote: Vote): Promise<VoteResult> {
  if (!UUID.test(captionId) || ![-1, 0, 1].includes(vote)) {
    return { ok: false, error: "Invalid vote." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsSignIn: true, error: "Sign in to vote." };

  if (vote === 0) {
    const { error } = await supabase
      .from("caption_votes")
      .delete()
      .eq("caption_id", captionId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // First vote on a caption inserts a new row...
    const { error } = await supabase
      .from("caption_votes")
      .insert({ caption_id: captionId, user_id: user.id, vote });

    if (error?.code === "23505") {
      // ...a repeat vote changes the existing row instead.
      const { error: updateError } = await supabase
        .from("caption_votes")
        .update({ vote })
        .eq("caption_id", captionId)
        .eq("user_id", user.id);
      if (updateError) return { ok: false, error: updateError.message };
    } else if (error?.code === "23503") {
      return { ok: false, error: "That tree no longer exists." };
    } else if (error) {
      return { ok: false, error: error.message };
    }
  }

  const { data: tally, error } = await supabase
    .from("captions")
    .select("upvotes, downvotes")
    .eq("id", captionId)
    .single<Tally>();
  if (error) return { ok: false, error: error.message };

  return { ok: true, vote, tally };
}

/** More profile lines to swipe on, skipping ones the client already has. */
export async function fetchCards(exclude: string[] = []): Promise<Card[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("swipe_queue", { max_count: 30 });
  const seen = new Set(exclude);
  return ((data ?? []) as Card[]).filter((card) => !seen.has(card.caption_id));
}
