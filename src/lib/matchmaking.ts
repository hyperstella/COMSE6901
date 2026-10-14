import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { rateCompatibility, type TreeForMatching } from "./llm";
import { createAdminClient, getUserAndProfile } from "./supabase/server";
import type { Card, Compat } from "./types";

/** What users can pick to describe their vibe (up to three). */
export const VIBES = [
  "Shade seeker",
  "Golden hour",
  "Late-night Butler",
  "Brunch on the Steps",
  "Leaf peeper",
  "Squirrel whisperer",
  "Old soul",
  "Flower child",
  "Evergreen loyalty",
  "Rainy-day reader",
  "Gym rat",
  "Main character",
] as const;

export type DatingProfile = { about: string; vibes: string[]; hangout: string };

/**
 * The signed-in user's "About you" profile. `ready` is false until
 * supabase/matchmaking.sql has been run, so the feature can stay hidden.
 */
export const getMyDatingProfile = cache(async (): Promise<{ ready: boolean; profile: DatingProfile | null }> => {
  const { supabase, user } = await getUserAndProfile();
  if (!user) return { ready: true, profile: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("about, vibes, hangout")
    .eq("id", user.id)
    .maybeSingle<{ about: string | null; vibes: string[] | null; hangout: string | null }>();
  if (error) return { ready: false, profile: null };
  return {
    ready: true,
    profile: data ? { about: data.about ?? "", vibes: data.vibes ?? [], hangout: data.hangout ?? "" } : null,
  };
});

export function hasDatingProfile(p: DatingProfile | null): p is DatingProfile {
  return Boolean(p && (p.about.trim() || p.vibes.length));
}

/** This user's compatibility with each tree, by tree id. RLS returns only their rows. */
export async function loadCompat(supabase: SupabaseClient): Promise<Map<string, Compat>> {
  const { data } = await supabase.from("tree_compat").select("image_id, score, reason");
  return new Map((data ?? []).map((r) => [r.image_id as string, { score: r.score as number, reason: r.reason as string }]));
}

/**
 * Asks the AI matchmaker how well this user fits each tree and saves the
 * scores (server only: users can't write their own). With `missingOnly`, only
 * trees that don't have a score yet, e.g. ones added since the last visit.
 */
export async function computeCompat(
  userId: string,
  firstName: string,
  profile: DatingProfile,
  { missingOnly = false }: { missingOnly?: boolean } = {},
): Promise<Map<string, Compat>> {
  const admin = createAdminClient();
  const [{ data: trees, error }, { data: existing }] = await Promise.all([
    admin
      .from("images")
      .select("id, tree_name, tree_age, species, spot, bio, captions(prompt, content)")
      .order("created_at")
      .limit(200),
    missingOnly ? admin.from("tree_compat").select("image_id").eq("user_id", userId) : Promise.resolve({ data: [] }),
  ]);
  if (error) throw new Error(error.message);

  const skip = new Set((existing ?? []).map((r: { image_id: string }) => r.image_id));
  const todo: TreeForMatching[] = (trees ?? [])
    .filter((t) => !skip.has(t.id))
    .map((t) => ({
      id: t.id,
      name: t.tree_name,
      age: t.tree_age,
      species: t.species,
      spot: t.spot,
      bio: t.bio,
      lines: t.captions ?? [],
    }));
  if (todo.length === 0) return new Map();

  const scores = await rateCompatibility({ firstName, ...profile }, todo);
  if (scores.size) {
    const { error: saveError } = await admin
      .from("tree_compat")
      .upsert([...scores].map(([imageId, c]) => ({ user_id: userId, image_id: imageId, score: c.score, reason: c.reason })));
    if (saveError) throw new Error(saveError.message);
  }
  return scores;
}

/**
 * Best fits first, with some shuffle so the order isn't the same every visit.
 * Cards from `pinnedTree` (just added) stay on top.
 */
export function rankByCompat(cards: Card[], compat: Map<string, Compat>, pinnedTree: string | null) {
  const rank = (c: Card) =>
    c.image_id === pinnedTree ? 1000 : (compat.get(c.image_id)?.score ?? 50) + Math.random() * 25;
  return cards
    .map((c) => [rank(c), c] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, c]) => c);
}
