import type { SupabaseClient } from "@supabase/supabase-js";

/** How many photos this user uploaded in the last 24 hours. */
export async function uploadsInLastDay(client: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await client
    .from("images")
    .select("id", { count: "exact", head: true })
    .eq("uploader_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}
