import Link from "next/link";
import Logo from "@/components/Logo";
import TreePhoto from "@/components/TreePhoto";
import { getUserAndProfile } from "@/lib/supabase/server";
import { byEligibility, type RankedTree } from "@/lib/types";

export const metadata = { title: "The Grove" };

const PODIUM = [
  { place: 1, height: "h-28", order: "order-2" },
  { place: 2, height: "h-20", order: "order-1" },
  { place: 3, height: "h-14", order: "order-3" },
];

export default async function GrovePage() {
  const { supabase } = await getUserAndProfile();
  const { data, error } = await supabase.from("tree_rankings").select("*").returns<RankedTree[]>();
  const trees = [...(data ?? [])].sort(byEligibility);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-ink-3">The leaderboard</p>
      <h1 className="display mt-2 text-center text-7xl italic">The Grove</h1>
      <p className="mt-2 text-center text-ink-2">
        Campus&apos;s most eligible trees, ranked by how their lines are landing.
      </p>

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
    </main>
  );
}
