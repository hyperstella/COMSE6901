import Link from "next/link";
import { after } from "next/server";
import SwipeDeck from "@/components/SwipeDeck";
import { computeCompat, getMyDatingProfile, hasDatingProfile, loadCompat, rankByCompat } from "@/lib/matchmaking";
import { getUserAndProfile } from "@/lib/supabase/server";
import { buildDeck } from "@/lib/deck";
import type { Compat } from "@/lib/types";

export const metadata = { title: "Swipe" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?tree=<id>` puts that tree first (used right after adding a tree). */
export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { tree } = await searchParams;
  const { supabase, user, profile } = await getUserAndProfile();

  const pinned = typeof tree === "string" && UUID.test(tree) ? tree : null;
  let cards = await buildDeck(supabase, user?.id ?? null, { first: pinned });

  // Your best fits first, with some shuffle so it isn't the same order every time.
  const dating = user ? await getMyDatingProfile() : null;
  const about = dating && hasDatingProfile(dating.profile) ? dating.profile : null;
  const compat = about ? await loadCompat(supabase) : new Map<string, Compat>();
  if (compat.size) cards = rankByCompat(cards, compat, pinned);
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
        hasAbout={Boolean(about)}
      />
    </main>
  );
}
