import Link from "next/link";
import CaptionVoter from "@/components/CaptionVoter";
import Logo from "@/components/Logo";
import TreePhoto from "@/components/TreePhoto";
import { getUserAndProfile } from "@/lib/supabase/server";
import { byEligibility, type RankedTree, type Vote } from "@/lib/types";

export const metadata = { title: "The Grove" };

const PODIUM = [
  { place: 1, height: "h-28", order: "order-2" },
  { place: 2, height: "h-20", order: "order-1" },
  { place: 3, height: "h-14", order: "order-3" },
];

const VIEWS = [
  { view: "trees", label: "Trees", href: "/trees", blurb: "Campus's most eligible trees, ranked by how their lines are landing." },
  { view: "lines", label: "Best lines", href: "/trees?view=lines", blurb: "The best lines the AI has written so far, ranked by your votes." },
] as const;

export default async function GrovePage({ searchParams }: PageProps<"/trees">) {
  const view = (await searchParams).view === "lines" ? "lines" : "trees";
  const { blurb } = VIEWS.find((v) => v.view === view)!;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-ink-3">The leaderboard</p>
      <h1 className="display mt-2 text-center text-6xl italic sm:text-7xl">The Grove</h1>
      <p className="mt-2 text-center text-ink-2">{blurb}</p>

      <nav aria-label="Rank by" className="mt-6 flex justify-center">
        <div className="flex rounded-full border border-line bg-paper-2 p-1 text-sm font-semibold shadow-[inset_0_1px_2px_rgb(40_35_25/0.08)]">
          {VIEWS.map((v) => (
            <Link
              key={v.view}
              href={v.href}
              scroll={false}
              aria-current={v.view === view ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 transition-colors ${
                v.view === view ? "bg-accent text-accent-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </nav>

      {view === "lines" ? <BestLines /> : <TreeBoard />}
    </main>
  );
}

async function TreeBoard() {
  const { supabase } = await getUserAndProfile();
  const { data, error } = await supabase.from("tree_rankings").select("*").returns<RankedTree[]>();
  const trees = [...(data ?? [])].sort(byEligibility);

  return (
    <>
      {error && <p className="card mt-8 p-4 text-center text-ink-2">The grove is resting right now. Try again in a moment.</p>}

      {trees.length === 0 ? (
        <div className="card mx-auto mt-10 max-w-md p-8 text-center">
          <Logo className="mx-auto h-16 w-16" />
          <p className="display mt-4 text-4xl italic">The grove is empty</p>
          <Link href="/upload" className="btn mt-5">
            Add the first tree
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-12 flex items-end justify-center gap-3 sm:gap-6">
            {PODIUM.filter((p) => trees[p.place - 1]).map(({ place, height, order }) => {
              const t = trees[place - 1];
              return (
                <Link key={t.id} href={`/trees/${t.id}`} className={`group flex w-28 flex-col items-center sm:w-40 ${order}`}>
                  <TreePhoto
                    src={t.image_url}
                    alt={t.tree_name}
                    sizes="160px"
                    cols={24}
                    className="aspect-square w-full rounded-2xl shadow-[0_18px_30px_-18px_rgba(40,50,60,0.6)] ring-4 ring-paper transition-transform group-hover:-translate-y-1"
                  />
                  <p className="display mt-3 w-full truncate text-center text-2xl">{t.tree_name}</p>
                  <p className="text-sm text-like">♥ {t.likes}</p>
                  <div className={`card mt-2 flex w-full items-start justify-center rounded-b-none pt-2 ${height}`}>
                    <span className={`display text-5xl italic ${place === 1 ? "text-like" : "text-ink-3"}`}>{place}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <ol className="mt-12 space-y-2">
            {trees.map((t, i) => {
              const votes = t.likes + t.passes;
              return (
                <li key={t.id}>
                  <Link href={`/trees/${t.id}`} className="card flex items-center gap-4 p-3 transition-transform hover:-translate-y-0.5">
                    <span className="display w-10 text-center text-4xl italic text-ink-3">{i + 1}</span>
                    <TreePhoto src={t.image_url} alt="" sizes="56px" cols={14} className="h-14 w-14 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="display block truncate text-2xl">
                        {t.tree_name}, {t.tree_age}
                      </span>
                      <span className="block truncate text-sm text-ink-2">
                        {t.species}
                        {t.spot && ` · ${t.spot}`}
                      </span>
                    </span>
                    <span className="hidden text-right text-sm tabular-nums sm:block">
                      <span className="block text-like">♥ {t.likes}</span>
                      <span className="block text-ink-3">
                        {votes ? Math.round((t.likes / votes) * 100) : 0}% liked
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}

type Line = {
  id: string;
  prompt: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  images: { id: string; tree_name: string; image_url: string };
};

/** Every profile line across campus, best first: net likes, then likes, then oldest. */
async function BestLines() {
  const { supabase, user } = await getUserAndProfile();
  const { data, error } = await supabase
    .from("captions")
    .select("id, prompt, content, upvotes, downvotes, created_at, images!inner(id, tree_name, image_url)")
    .returns<Line[]>();
  const lines = [...(data ?? [])]
    .sort(
      (a, b) =>
        b.upvotes - b.downvotes - (a.upvotes - a.downvotes) ||
        b.upvotes - a.upvotes ||
        a.created_at.localeCompare(b.created_at),
    )
    .slice(0, 30);

  // RLS returns only this user's own votes.
  const { data: myVotes } =
    user && lines.length
      ? await supabase.from("caption_votes").select("caption_id, vote").in("caption_id", lines.map((l) => l.id))
      : { data: [] as { caption_id: string; vote: number }[] };
  const voteFor = new Map((myVotes ?? []).map((v) => [v.caption_id, v.vote as Vote]));

  if (error) return <p className="card mt-8 p-4 text-center text-ink-2">The grove is resting right now. Try again in a moment.</p>;
  if (lines.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <Logo className="mx-auto h-16 w-16" />
        <p className="display mt-4 text-4xl italic">No lines yet</p>
        <Link href="/upload" className="btn mt-5">
          Add the first tree
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mt-4 text-center text-sm text-ink-3">
        {user ? "Disagree with the ranking? Vote right here." : "Sign in to vote on these lines."}
      </p>
      <ol className="mt-6 space-y-3">
        {lines.map((l, i) => (
          <li key={l.id} className="card flex items-start gap-3 p-4 sm:gap-4">
            <span className={`display w-8 shrink-0 text-center text-4xl italic sm:w-10 ${i === 0 ? "text-like" : "text-ink-3"}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              {l.prompt && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{l.prompt}</p>}
              <p className="display mt-1 text-2xl leading-tight sm:text-[1.65rem]">{l.content}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Link href={`/trees/${l.images.id}`} className="group flex min-w-0 items-center gap-2 text-sm text-ink-2 hover:text-ink">
                  <TreePhoto src={l.images.image_url} alt="" sizes="28px" cols={8} className="h-7 w-7 shrink-0 rounded-full" />
                  <span className="truncate underline decoration-line underline-offset-4 group-hover:decoration-ink">{l.images.tree_name}</span>
                </Link>
                <CaptionVoter
                  captionId={l.id}
                  initialVote={voteFor.get(l.id) ?? 0}
                  initialTally={{ upvotes: l.upvotes, downvotes: l.downvotes }}
                  signedIn={Boolean(user)}
                  next="/trees?view=lines"
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
