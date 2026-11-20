import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ArchiveButton from "@/components/ArchiveButton";
import Avatar from "@/components/Avatar";
import TreePhoto from "@/components/TreePhoto";
import { getMyDatingProfile, hasDatingProfile } from "@/lib/matchmaking";
import { createAdminClient, getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";
import { isMatch, type Compat } from "@/lib/types";

export const metadata = { title: "Your garden" };

type MyTree = { id: string; tree_name: string; tree_age: number; image_url: string };
type MyLike = { captions: { image_id: string; images: MyTree } };
type MyCompat = Compat & { images: MyTree };

// Members-only page. The proxy redirects signed-out visitors to /login;
// the check below is a second line of defense.
export default async function DashboardPage() {
  const { supabase, user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/dashboard");
  if (!isProfileComplete(profile)) redirect("/onboarding");

  // RLS: only this user's own votes and scores come back. Passes are only
  // counted; only liked lines need their tree, to find matches.
  const [{ data: likedLines }, { count: passCount }, { data: mine }, dating, { data: scored }, { data: archived }] = await Promise.all([
    supabase
      .from("caption_votes")
      .select("captions!inner(image_id, images!inner(id, tree_name, tree_age, image_url))")
      .eq("vote", 1)
      .returns<MyLike[]>(),
    supabase.from("caption_votes").select("caption_id", { count: "exact", head: true }).eq("vote", -1),
    supabase
      .from("images")
      .select("id, tree_name, tree_age, image_url")
      .eq("uploader_id", user.id)
      .order("created_at", { ascending: false })
      .returns<MyTree[]>(),
    getMyDatingProfile(),
    // Compatibility scores with their trees, best first, in one query.
    supabase
      .from("tree_compat")
      .select("score, reason, images!inner(id, tree_name, tree_age, image_url)")
      .order("score", { ascending: false })
      .returns<MyCompat[]>(),
    // Archived trees are hidden from everyone by RLS, so read this user's own with the service role.
    createAdminClient()
      .from("images")
      .select("id, tree_name, tree_age, image_url")
      .eq("uploader_id", user.id)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .returns<MyTree[]>(),
  ]);
  const about = hasDatingProfile(dating.profile);
  const compat = new Map((scored ?? []).map((c) => [c.images.id, { score: c.score, reason: c.reason }]));

  const likes = likedLines ?? [];
  const passes = passCount ?? 0;

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
  const picks = (scored ?? []).slice(0, 6).map((c) => c.images);
  const scoreOf = (t: MyTree) => compat.get(t.id)?.score;

  const stats = [
    { label: "Lines liked", value: likes.length, color: "text-like" },
    { label: "Lines passed", value: passes, color: "text-ink-2" },
    { label: "Matches", value: matches.length, color: "text-accent" },
    { label: "Trees added", value: (mine?.length ?? 0) + (archived?.length ?? 0), color: "text-ink" },
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
      <TreeRow
        title="Trees you added"
        empty={archived?.length ? "All your trees are archived." : "You haven't added a tree yet."}
        trees={mine ?? []}
        cta={{ href: "/upload", label: "Add a tree" }}
        action={(t) => <ArchiveButton treeId={t.id} treeName={t.tree_name} archived={false} />}
      />
      {archived && archived.length > 0 && (
        <TreeRow
          title="Archived"
          note="Off the map, Swipe and the Grove. Only you can see these; restore one to put it back with its lines and votes."
          empty=""
          trees={archived}
          dim
          action={(t) => <ArchiveButton treeId={t.id} treeName={t.tree_name} archived />}
        />
      )}
    </main>
  );
}

function TreeRow({
  title,
  empty,
  trees,
  note,
  cta,
  badge,
  action,
  dim = false,
}: {
  title: string;
  note?: string;
  empty: string;
  trees: MyTree[];
  cta?: { href: string; label: string };
  /** A compatibility score to show on each tree, if there is one. */
  badge?: (t: MyTree) => number | undefined;
  /** A control under each tree, like Archive. */
  action?: (t: MyTree) => ReactNode;
  /** Archived trees: faded, and not linked (their pages are hidden). */
  dim?: boolean;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <h2 className="display italic text-4xl">{title}</h2>
        {cta && (
          <Link href={cta.href} className="text-sm underline decoration-dotted underline-offset-4">
            {cta.label}
          </Link>
        )}
      </div>
      {note && <p className="mt-1 text-sm text-ink-2">{note}</p>}
      {trees.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {trees.map((t) => {
            const card = (
              <>
                <span className="relative block">
                  <TreePhoto
                    src={t.image_url}
                    alt=""
                    sizes="120px"
                    cols={20}
                    className={`aspect-square w-full rounded-xl shadow-md transition-transform ${dim ? "opacity-60 grayscale" : "group-hover:-translate-y-1"}`}
                  />
                  {badge?.(t) !== undefined && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-like px-2 py-0.5 text-xs font-semibold tabular-nums text-like-ink shadow">
                      {badge(t)}%
                    </span>
                  )}
                </span>
                <span className={`mt-2 block truncate text-sm font-semibold ${dim ? "text-ink-2" : ""}`}>{t.tree_name}</span>
              </>
            );
            return (
              <li key={t.id}>
                {dim ? (
                  <div>{card}</div>
                ) : (
                  <Link href={`/trees/${t.id}`} className="group block">
                    {card}
                  </Link>
                )}
                {action && <div className="mt-0.5">{action(t)}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-ink-2">{empty}</p>
      )}
    </section>
  );
}
