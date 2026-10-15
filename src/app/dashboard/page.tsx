import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import TreePhoto from "@/components/TreePhoto";
import { getMyDatingProfile, hasDatingProfile, loadCompat } from "@/lib/matchmaking";
import { getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";
import { isMatch } from "@/lib/types";

export const metadata = { title: "Your garden" };

type MyTree = { id: string; tree_name: string; tree_age: number; image_url: string };
type MyVote = { vote: number; captions: { image_id: string; images: MyTree } };

// Members-only page. The proxy redirects signed-out visitors to /login;
// the check below is a second line of defense.
export default async function DashboardPage() {
  const { supabase, user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/dashboard");
  if (!isProfileComplete(profile)) redirect("/onboarding");

  const [{ data: votes }, { data: mine }, dating, compat] = await Promise.all([
    // RLS: only this user's own votes come back.
    supabase
      .from("caption_votes")
      .select("vote, captions!inner(image_id, images!inner(id, tree_name, tree_age, image_url))")
      .returns<MyVote[]>(),
    supabase
      .from("images")
      .select("id, tree_name, tree_age, image_url")
      .eq("uploader_id", user.id)
      .order("created_at", { ascending: false })
      .returns<MyTree[]>(),
    getMyDatingProfile(),
    loadCompat(supabase),
  ]);
  const about = hasDatingProfile(dating.profile);

  const likes = (votes ?? []).filter((v) => v.vote === 1);
  const passes = (votes ?? []).length - likes.length;

  // A match: you liked a tree and it's into you too (see isMatch).
  const liked = new Map<string, { tree: MyTree; count: number }>();
  for (const v of likes) {
    const tree = v.captions.images;
    const entry = liked.get(tree.id) ?? { tree, count: 0 };
    entry.count++;
    liked.set(tree.id, entry);
  }
  const matches = [...liked.values()].filter((m) => isMatch(m.count > 0, compat.get(m.tree.id))).map((m) => m.tree);

  // Your most compatible trees, from the AI matchmaker.
  const { data: allTrees } = compat.size
    ? await supabase.from("images").select("id, tree_name, tree_age, image_url").in("id", [...compat.keys()]).returns<MyTree[]>()
    : { data: [] as MyTree[] };
  const picks = (allTrees ?? [])
    .sort((a, b) => compat.get(b.id)!.score - compat.get(a.id)!.score)
    .slice(0, 6);
  const scoreOf = (t: MyTree) => compat.get(t.id)?.score;

  const stats = [
    { label: "Lines liked", value: likes.length, color: "text-like" },
    { label: "Lines passed", value: passes, color: "text-ink-2" },
    { label: "Matches", value: matches.length, color: "text-accent" },
    { label: "Trees added", value: mine?.length ?? 0, color: "text-ink" },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <Avatar profile={profile} size={64} />
        <div>
          <h1 className="display italic text-6xl">Hi, {profile!.first_name}!</h1>
          {/* A div, not a p: the sign-out form can't live inside a paragraph. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-ink-2">
            <span>Your garden</span>
            <span aria-hidden>·</span>
            <Link href="/profile" className="underline decoration-line underline-offset-4 hover:text-ink">
              Edit profile
            </Link>
            <span aria-hidden>·</span>
            <form action="/auth/signout" method="post">
              <button className="underline decoration-line underline-offset-4 hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </div>

      <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className={`display text-5xl tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-sm text-ink-2">{s.label}</p>
          </div>
        ))}
      </section>

      {dating.ready && !about && (
        <section className="card mt-10 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="display text-3xl italic">Your matches are random right now</p>
            <p className="mt-1 text-ink-2">
              Tell the trees a little about yourself and the AI matchmaker will score how compatible you are with each
              one.
            </p>
          </div>
          <Link href="/profile/about" className="btn btn-like shrink-0">
            Tell the trees about you
          </Link>
        </section>
      )}

      {picks.length > 0 && (
        <TreeRow
          title="Your top picks"
          empty=""
          trees={picks}
          badge={scoreOf}
          cta={{ href: "/profile/about", label: "Edit what you told them" }}
        />
      )}
      <TreeRow
        title="Your matches"
        empty={about ? "No matches yet. Like a tree that's into you (50%+) to match." : "Tell the trees about you, and the ones you like can like you back."}
        trees={matches}
        badge={scoreOf}
        cta={{ href: "/swipe", label: "Start swiping" }}
      />
      <TreeRow title="Trees you added" empty="You haven't added a tree yet." trees={mine ?? []} cta={{ href: "/upload", label: "Add a tree" }} />
    </main>
  );
}

function TreeRow({
  title,
  empty,
  trees,
  cta,
  badge,
}: {
  title: string;
  empty: string;
  trees: MyTree[];
  cta: { href: string; label: string };
  /** A compatibility score to show on each tree, if there is one. */
  badge?: (t: MyTree) => number | undefined;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <h2 className="display italic text-4xl">{title}</h2>
        <Link href={cta.href} className="text-sm underline decoration-dotted underline-offset-4">
          {cta.label}
        </Link>
      </div>
      {trees.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {trees.map((t) => (
            <li key={t.id}>
              <Link href={`/trees/${t.id}`} className="group block">
                <span className="relative block">
                  <TreePhoto
                    src={t.image_url}
                    alt=""
                    sizes="120px"
                    cols={20}
                    className="aspect-square w-full rounded-xl shadow-md transition-transform group-hover:-translate-y-1"
                  />
                  {badge?.(t) !== undefined && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-like px-2 py-0.5 text-xs font-semibold tabular-nums text-like-ink shadow">
                      {badge(t)}%
                    </span>
                  )}
                </span>
                <span className="mt-2 block truncate text-sm font-semibold">{t.tree_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-ink-2">{empty}</p>
      )}
    </section>
  );
}
