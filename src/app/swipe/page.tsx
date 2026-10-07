import SwipeDeck from "@/components/SwipeDeck";
import { getUserAndProfile } from "@/lib/supabase/server";
import type { Card } from "@/lib/types";

export const metadata = { title: "Swipe" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?tree=<id>` puts that tree's lines first (used right after adding a tree). */
export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { tree } = await searchParams;
  const { supabase, user } = await getUserAndProfile();

  const { data } = await supabase.rpc("swipe_queue", { max_count: 30 });
  let cards = (data ?? []) as Card[];

  if (typeof tree === "string" && UUID.test(tree)) {
    const { data: rows } = await supabase
      .from("captions")
      .select(
        "id, prompt, content, upvotes, downvotes, images!inner(id, image_url, width, height, tree_name, tree_age, species, spot, map_x, map_y)",
      )
      .eq("image_id", tree)
      .returns<
        {
          id: string;
          prompt: string | null;
          content: string;
          upvotes: number;
          downvotes: number;
          images: Omit<Card, "caption_id" | "prompt" | "content" | "upvotes" | "downvotes" | "image_id" | "image_url"> & {
            id: string;
            image_url: string;
          };
        }[]
      >();

    // Skip lines this user already voted on (RLS returns only their own votes).
    const ids = (rows ?? []).map((r) => r.id);
    const { data: voted } =
      user && ids.length
        ? await supabase.from("caption_votes").select("caption_id").in("caption_id", ids)
        : { data: [] as { caption_id: string }[] };
    const done = new Set((voted ?? []).map((v) => v.caption_id));

    const first: Card[] = (rows ?? [])
      .filter((r) => !done.has(r.id))
      .map(({ images: i, ...r }) => ({
        caption_id: r.id,
        prompt: r.prompt,
        content: r.content,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        image_id: i.id,
        image_url: i.image_url,
        width: i.width,
        height: i.height,
        tree_name: i.tree_name,
        tree_age: i.tree_age,
        species: i.species,
        spot: i.spot,
        map_x: i.map_x,
        map_y: i.map_y,
      }));
    const firstIds = new Set(first.map((c) => c.caption_id));
    cards = [...first, ...cards.filter((c) => !firstIds.has(c.caption_id))];
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="display italic text-6xl">Swipe</h1>
        <p className="mt-1 text-ink-2">Right if the line makes you laugh. Left if it doesn&apos;t.</p>
      </div>
      <SwipeDeck key={typeof tree === "string" ? tree : "all"} initialCards={cards} signedIn={Boolean(user)} />
    </main>
  );
}
