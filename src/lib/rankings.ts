import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankedTree } from "./types";

/**
 * The "most eligible" leaderboard: score, then likes, then oldest first.
 * Sorted and cut off by the database, and only the columns the page shows.
 */
export function rankedTrees<K extends keyof RankedTree>(supabase: SupabaseClient, columns: readonly K[], limit = 200) {
  return supabase
    .from("tree_rankings")
    .select(columns.join(", "))
    .order("score", { ascending: false })
    .order("likes", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<Pick<RankedTree, K>[]>();
}

/**
 * A tree's place on the leaderboard (1 = most eligible), counted by the
 * database instead of loading every tree: how many rank above it, plus one.
 */
export async function rankOf(supabase: SupabaseClient, tree: Pick<RankedTree, "score" | "likes" | "created_at">) {
  const { score, likes } = tree;
  // Quoted: timestamps contain characters PostgREST filters treat as syntax.
  const createdAt = `"${tree.created_at}"`;
  const { count, error } = await supabase
    .from("tree_rankings")
    .select("id", { count: "exact", head: true })
    .or(
      `score.gt.${score},and(score.eq.${score},likes.gt.${likes}),and(score.eq.${score},likes.eq.${likes},created_at.lt.${createdAt})`,
    );
  if (error || count === null) return 0;
  return count + 1;
}
