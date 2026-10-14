import Link from "next/link";
import { redirect } from "next/navigation";
import AboutForm from "@/components/AboutForm";
import { AREAS, BUILDINGS, LAWNS } from "@/lib/campus";
import { getMyDatingProfile, VIBES } from "@/lib/matchmaking";
import { getUserAndProfile } from "@/lib/supabase/server";

export const metadata = { title: "About you" };

const PLACES = [...new Set([...BUILDINGS, ...LAWNS, ...AREAS].map((p) => p.name))].sort();

export default async function AboutPage({ searchParams }: PageProps<"/profile/about">) {
  const { user } = await getUserAndProfile();
  if (!user) redirect("/login?next=/profile/about");
  const { ready, profile } = await getMyDatingProfile();
  if (!ready) redirect("/dashboard");
  const welcome = (await searchParams).welcome === "1";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-3">{welcome ? "One more thing" : "Your dating profile"}</p>
        <h1 className="display mt-2 text-5xl italic sm:text-6xl">Tell the trees about you</h1>
        <p className="mt-3 text-ink-2">
          Trees read profiles too. Our AI matchmaker compares yours with every tree&apos;s and scores how well you&apos;d get
          along. Your best fits come first when you swipe, and a tree only matches you back if it&apos;s into you.
        </p>
        <div className="mt-8">
          <AboutForm initial={profile} vibes={VIBES} places={PLACES} />
        </div>
        {welcome && (
          <p className="mt-6 text-sm text-ink-3">
            Not now?{" "}
            <Link href="/dashboard" className="underline decoration-line underline-offset-4 hover:text-ink">
              Skip for now
            </Link>
            . You can do this any time from your profile.
          </p>
        )}
      </div>
    </main>
  );
}
