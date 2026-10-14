/** One profile line to swipe on, joined with its tree (see swipe_queue in SQL). */
export type Card = {
  caption_id: string;
  prompt: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  image_id: string;
  image_url: string;
  width: number;
  height: number;
  tree_name: string;
  tree_age: number;
  species: string | null;
  spot: string | null;
  map_x: number;
  map_y: number;
};

/** A tree with its score, from the tree_rankings view. */
export type RankedTree = {
  id: string;
  tree_name: string;
  tree_age: number;
  species: string | null;
  spot: string | null;
  bio: string | null;
  image_url: string;
  width: number;
  height: number;
  map_x: number;
  map_y: number;
  created_at: string;
  likes: number;
  passes: number;
  score: number;
};

/** +1 like (swipe right), -1 pass (swipe left), 0 no vote. */
export type Vote = -1 | 0 | 1;

export type Tally = { upvotes: number; downvotes: number };

/** Step 2 of the prompt chain: a tree's dating profile. */
export type TreeProfile = {
  name: string;
  age: number;
  species: string;
  bio: string;
  prompts: { prompt: string; answer: string }[];
};

/** Newline-delimited JSON events streamed by POST /api/upload. */
export type UploadEvent =
  | { type: "step"; step: "describe" | "write" | "save" }
  | { type: "description"; delta: string }
  | { type: "profile"; profile: TreeProfile }
  | { type: "done"; imageId: string }
  | { type: "error"; message: string };

export const DAILY_UPLOAD_LIMIT = 10;

/** Sort order for "most eligible": score, then likes, then oldest first. */
export function byEligibility(a: RankedTree, b: RankedTree) {
  return b.score - a.score || b.likes - a.likes || a.created_at.localeCompare(b.created_at);
}

/** How well a user and a tree fit, from the AI matchmaker (see supabase/matchmaking.sql). */
export type Compat = { score: number; reason: string };

/** A tree only matches you back if you're at least this compatible. */
export const MATCH_MIN = 50;

/**
 * It's a match when you like two of a tree's lines and the tree is into you
 * too. Without a compatibility score (no "About you" yet), two likes is enough.
 */
export function isMatch(likes: number, compat: Compat | undefined) {
  return likes >= 2 && (!compat || compat.score >= MATCH_MIN);
}
