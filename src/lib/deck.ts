import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "./types";

type Line = { id: string; prompt: string | null; content: string; upvotes: number; downvotes: number };
type TreeRow = Omit<Card, "caption_id" | "prompt" | "content" | "upvotes" | "downvotes" | "image_id"> & {
  id: string;
  captions: Line[];
};

/** A tree's punch line: its best-received line, ties broken at random. */
export function punchLine(lines: Line[]) {
  let best: Line | undefined;
  let bestScore = -Infinity;
  let ties = 0;
  for (const l of lines) {
    const score = l.upvotes - l.downvotes;
    if (score > bestScore) {
      best = l;
      bestScore = score;
      ties = 1;
    } else if (score === bestScore && Math.random() < 1 / ++ties) {
      best = l;
    }
  }
  return best;
}

/**
 * The swipe deck: one card per tree, showing only its punch line. Trees this
 * user has already liked or passed (on any line) never come back; `exclude`
 * drops trees the client already has or skipped. `first` goes on top.
 */
export async function buildDeck(
  supabase: SupabaseClient,
  userId: string | null,
  { exclude = [], first = null, limit = 30 }: { exclude?: string[]; first?: string | null; limit?: number } = {},
): Promise<Card[]> {
  const [{ data: trees }, { data: voted }] = await Promise.all([
    supabase
      .from("images")
      .select("id, image_url, width, height, tree_name, tree_age, species, spot, map_x, map_y, captions(id, prompt, content, upvotes, downvotes)")
      .limit(500)
      .returns<TreeRow[]>(),
    // RLS returns only this user's own votes.
    userId
      ? supabase.from("caption_votes").select("captions!inner(image_id)").returns<{ captions: { image_id: string } }[]>()
      : Promise.resolve({ data: [] as { captions: { image_id: string } }[] }),
  ]);

  const skip = new Set([...exclude, ...(voted ?? []).map((v) => v.captions.image_id)]);
  const deck = (trees ?? []).filter((t) => !skip.has(t.id) && t.captions.length > 0);

  // Shuffle, then put the requested tree on top.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const top = deck.findIndex((t) => t.id === first);
  if (top > 0) deck.unshift(...deck.splice(top, 1));

  return deck.slice(0, limit).map(({ captions, id, ...tree }) => {
    const line = punchLine(captions)!;
    return {
      ...tree,
      image_id: id,
      caption_id: line.id,
      prompt: line.prompt,
      content: line.content,
      upvotes: line.upvotes,
      downvotes: line.downvotes,
    };
  });
}
