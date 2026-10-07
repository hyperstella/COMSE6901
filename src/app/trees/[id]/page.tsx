import Link from "next/link";
import { notFound } from "next/navigation";
import CampusPlan from "@/components/CampusPlan";
import CaptionVoter from "@/components/CaptionVoter";
import TreePhoto from "@/components/TreePhoto";
import { getUserAndProfile } from "@/lib/supabase/server";
import { byEligibility, type RankedTree, type Vote } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TreeRow = {
  id: string;
  image_url: string;
  width: number;
  height: number;
  description: string;
  uploader_name: string | null;
  created_at: string;
  tree_name: string;
  tree_age: number;
  species: string | null;
  bio: string | null;
  spot: string | null;
  map_x: number;
  map_y: number;
  captions: { id: string; prompt: string | null; content: string; upvotes: number; downvotes: number; created_at: string }[];
};

export async function generateMetadata({ params }: PageProps<"/trees/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Not found" };
  const { supabase } = await getUserAndProfile();
  const { data } = await supabase.from("images").select("tree_name").eq("id", id).maybeSingle();
  return { title: data?.tree_name ?? "Tree" };
}

export default async function TreePage({ params }: PageProps<"/trees/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, user } = await getUserAndProfile();
  const [{ data: tree }, { data: rankings }] = await Promise.all([
    supabase
      .from("images")
      .select(
        "id, image_url, width, height, description, uploader_name, created_at, tree_name, tree_age, species, bio, spot, map_x, map_y, captions(id, prompt, content, upvotes, downvotes, created_at)",
      )
      .eq("id", id)
      .maybeSingle<TreeRow>(),
    supabase.from("tree_rankings").select("*").returns<RankedTree[]>(),
  ]);
  if (!tree) notFound();

  const ranked = [...(rankings ?? [])].sort(byEligibility);
  const rank = ranked.findIndex((t) => t.id === tree.id) + 1;
  const me = ranked.find((t) => t.id === tree.id);
  const lines = [...tree.captions].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // RLS returns only this user's own votes.
  const { data: myVotes } = user
    ? await supabase.from("caption_votes").select("caption_id, vote").in("caption_id", lines.map((c) => c.id))
    : { data: [] as { caption_id: string; vote: number }[] };
  const voteFor = new Map((myVotes ?? []).map((v) => [v.caption_id, v.vote as Vote]));

  const added = new Date(tree.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/trees" className="text-sm text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink">
        ← The Grove
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <TreePhoto
            src={tree.image_url}
            alt={`Photo of ${tree.tree_name}`}
            sizes="(min-width: 1024px) 480px, 100vw"
            priority
            toggle
            cols={52}
            className="photo aspect-[4/5] w-full"
          />
          <div className="mt-6">
            <h1 className="display text-7xl italic">
              {tree.tree_name}, {tree.tree_age}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1">
              {tree.species && <span className="chip">{tree.species}</span>}
              {tree.spot && <span className="chip">{tree.spot}</span>}
              {rank > 0 && <span className="chip text-like">#{rank} most eligible</span>}
              {me && <span className="chip">♥ {me.likes} likes</span>}
            </div>
            {tree.bio && <p className="display mt-4 text-2xl">“{tree.bio}”</p>}
          </div>

          <div className="mt-8">
            <h2 className="display text-3xl italic">Where to find them</h2>
            <div className="card mt-3 overflow-hidden p-1.5">
              <CampusPlan
                pins={[{ id: tree.id, name: tree.tree_name, x: tree.map_x, y: tree.map_y, rank: rank || undefined }]}
                highlight={tree.id}
                className="overflow-hidden rounded-xl"
              />
            </div>
            {tree.spot && <p className="mt-2 text-sm text-ink-2">Lives {tree.spot}.</p>}
          </div>
        </div>

        <div>
          <h2 className="display text-4xl italic">Their profile</h2>
          <p className="text-sm text-ink-2">
            {user ? "Like or pass on each line. Click your vote again to take it back." : "Sign in to like or pass on each line."}
          </p>
          <ol className="mt-4 space-y-4">
            {lines.map((c, i) => (
              <li key={c.id} className="card rise p-4" style={{ "--delay": `${i * 0.06}s` } as React.CSSProperties}>
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    {c.prompt && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{c.prompt}</p>}
                    <p className="display mt-1 text-[1.65rem] leading-tight">{c.content}</p>
                  </div>
                  <CaptionVoter
                    captionId={c.id}
                    initialVote={voteFor.get(c.id) ?? 0}
                    initialTally={{ upvotes: c.upvotes, downvotes: c.downvotes }}
                    signedIn={Boolean(user)}
                  />
                </div>
              </li>
            ))}
          </ol>

          <Link href={`/swipe?tree=${tree.id}`} className="btn btn-like mt-6">
            Swipe on {tree.tree_name}
          </Link>

          <section className="mt-10">
            <h2 className="display text-3xl italic">Field notes</h2>
            <p className="text-sm text-ink-2">
              Step 1: what the vision model saw. Step 2 wrote the profile from these notes alone.
            </p>
            <div className="well mt-3 p-4">
              <p className="notes">{tree.description}</p>
            </div>
            <p className="mt-3 text-sm text-ink-3">
              Added {added}
              {tree.uploader_name && ` by ${tree.uploader_name}`}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
