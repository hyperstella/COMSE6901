import { createClient } from "@supabase/supabase-js";

export type Restaurant = {
  id: number;
  name: string;
  cuisine: string;
  neighborhood: string;
  price_range: string;
  rating: number;
};

/**
 * Reads credentials from the environment rather than hardcoding them.
 * Returns null when they are absent so the page can render a helpful
 * message instead of throwing during a build without env vars.
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey);
}
