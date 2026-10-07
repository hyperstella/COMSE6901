"use server";

import { createClient } from "@/lib/supabase/server";

export type RestaurantVoteResult =
  | { ok: true; voted: boolean; votes: number }
  | { ok: false; error: string; needsSignIn?: boolean };

/**
 * Casts (or takes back) the signed-in user's "I'd go" vote on a restaurant.
 * Runs as the user, so RLS guarantees they can only write their own vote row.
 */
export async function voteRestaurant(restaurantId: number, voted: boolean): Promise<RestaurantVoteResult> {
  if (!Number.isSafeInteger(restaurantId) || restaurantId <= 0) {
    return { ok: false, error: "Invalid vote." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsSignIn: true, error: "Sign in to vote." };

  if (voted) {
    const { error } = await supabase
      .from("restaurant_votes")
      .insert({ restaurant_id: restaurantId, user_id: user.id });
    // 23505: already voted, which is the state we wanted anyway.
    if (error?.code === "23503") return { ok: false, error: "That restaurant no longer exists." };
    if (error && error.code !== "23505") return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("restaurant_votes")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("votes")
    .eq("id", restaurantId)
    .single<{ votes: number }>();
  if (error) return { ok: false, error: error.message };

  return { ok: true, voted, votes: data.votes };
}
