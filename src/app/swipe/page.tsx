import Link from "next/link";
import { after } from "next/server";
import SwipeDeck from "@/components/SwipeDeck";
import { computeCompat, getMyDatingProfile, hasDatingProfile, loadCompat, rankByCompat } from "@/lib/matchmaking";
import { getUserAndProfile } from "@/lib/supabase/server";
import type { Card, Compat } from "@/lib/types";

export const metadata = { title: "Swipe" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?tree=<id>` puts that tree's lines first (used right after adding a tree). */
export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { tree } = await searchParams;
  const { supabase, user, profile } = await getUserAndProfile();

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

  // Your best fits first, with some shuffle so it isn't the same order every time.
  const dating = user ? await getMyDatingProfile() : null;
  const about = dating && hasDatingProfile(dating.profile) ? dating.profile : null;
  const compat = about ? await loadCompat(supabase) : new Map<string, Compat>();
  if (compat.size) cards = rankByCompat(cards, compat, typeof tree === "string" ? tree : null);
  // Trees added since this user's scores were made get scored after the response.
  if (user && about && cards.some((c) => !compat.has(c.image_id))) {
    after(() => computeCompat(user.id, profile?.first_name ?? "", about, { missingOnly: true }).catch(() => {}));
  }

  // One screen tall, so the card shrinks to fit and the buttons are never below the fold.
  return (
    <main className="mx-auto flex h-[calc(100svh-3.5rem-var(--tabbar))] min-h-[540px] w-full max-w-6xl flex-col px-4 pb-4 pt-2 sm:px-6 sm:pt-4">
      <div className="mb-5 shrink-0 text-center">
        <h1 className="display sr-only text-5xl italic sm:not-sr-only">Swipe</h1>
        <p className="text-sm text-ink-2 sm:mt-1 sm:text-base">
          Right if the line makes you laugh. Left if it doesn&apos;t.
          {user && dating?.ready && !about && (
            <>
              {" "}
              <Link href="/profile/about" className="font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                Tell the trees about you
              </Link>{" "}
              for better matches.
            </>
          )}
          {!user && (
            <>
              {" "}
              <Link href="/login?next=/swipe" className="font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                Sign in
              </Link>{" "}
              to save your votes.
            </>
          )}
        </p>
      </div>
      <SwipeDeck
        key={typeof tree === "string" ? tree : "all"}
        initialCards={cards}
        signedIn={Boolean(user)}
        compat={Object.fromEntries(compat)}
      />
    </main>
  );
}
