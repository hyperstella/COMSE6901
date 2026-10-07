import Link from "next/link";
import CampusBook, { type BookTree } from "@/components/campus/CampusBook";
import TreePhoto from "@/components/TreePhoto";
import { getUserAndProfile } from "@/lib/supabase/server";
import { byEligibility, type RankedTree } from "@/lib/types";
import { instrumentSerif } from "./fonts";

export default async function HomePage() {
  const { supabase } = await getUserAndProfile();
  const { data, error } = await supabase.from("tree_rankings").select("*").returns<RankedTree[]>();
  if (error) console.error("tree_rankings:", error.message);
  const ranked = [...(data ?? [])].sort(byEligibility);
  const trees: BookTree[] = ranked.map((t) => ({
    id: t.id,
    name: t.tree_name,
    age: t.tree_age,
    species: t.species,
    spot: t.spot,
    imageUrl: t.image_url,
    likes: t.likes,
    passes: t.passes,
    mapX: t.map_x,
    mapY: t.map_y,
  }));

  return (
    <main className="flex-1">
      <CampusBook serif={instrumentSerif.style.fontFamily} trees={trees} error={error?.message} />

      {/* On small screens the leaderboard sits under the book. */}
      {trees.length > 0 && (
        <section className="mx-auto mt-10 max-w-6xl px-4 md:hidden">
          <h2 className="display text-4xl italic">Most eligible</h2>
          <ol className="mt-4 space-y-2">
            {trees.slice(0, 5).map((t, i) => (
              <li key={t.id}>
                <Link href={`/trees/${t.id}`} className="card flex items-center gap-3 p-2 pr-4">
                  <span className={`display w-7 text-center text-3xl ${i === 0 ? "text-like" : "text-ink-3"}`}>{i + 1}</span>
                  <TreePhoto src={t.imageUrl} alt="" sizes="48px" cols={12} className="h-12 w-12 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {t.name}, {t.age}
                    </span>
                    <span className="block truncate text-xs text-ink-2">{t.species}</span>
                  </span>
                  <span className="text-sm tabular-nums text-like">♥ {t.likes}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-3">How it works</p>
        <h2 className="display mt-2 text-5xl italic">Every tree deserves a profile</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Snap a tree", "Take a photo of any tree on campus and drop a pin where it lives on the map."],
            [
              "AI writes its profile",
              "A vision model takes field notes on the tree. A second model reads only those notes and writes its dating profile.",
            ],
            ["Swipe on its lines", "Every like and pass is saved. Like two lines from one tree and it's a match. The most liked trees rise to the top."],
          ].map(([title, body], i) => (
            <li key={title} className="card page-in p-6" style={{ "--delay": `${i * 0.08}s` } as React.CSSProperties}>
              <span className="display text-6xl italic text-brick">{i + 1}</span>
              <h3 className="display mt-2 text-3xl">{title}</h3>
              <p className="mt-2 text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
