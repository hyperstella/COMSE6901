import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import { getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";
import type { Restaurant } from "@/lib/supabase/public";

export const metadata = { title: "Dashboard" };

// Members-only page. The proxy redirects signed-out visitors to /login;
// the check below is a second line of defense.
export default async function DashboardPage() {
  const { supabase, user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?next=/dashboard");
  if (!isProfileComplete(profile)) redirect("/onboarding");

  const { data: picks } = await supabase
    .from("restaurants")
    .select("id, name, cuisine, neighborhood, price_range, rating")
    .order("rating", { ascending: false })
    .limit(3)
    .returns<Restaurant[]>();

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-4">
        <Avatar profile={profile} size={64} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hi, {profile!.first_name}!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Member since {memberSince} &middot;{" "}
            <Link href="/profile" className="underline">
              Edit profile
            </Link>
          </p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Members-only top picks</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Only signed-in users can see this page.
        </p>
        <ol className="mt-6 space-y-3">
          {(picks ?? []).map((r, i) => (
            <li
              key={r.id}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <span className="text-2xl font-bold text-gray-300 dark:text-gray-700">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {r.cuisine} &middot; {r.neighborhood} &middot; {r.price_range}
                </p>
              </div>
              <span className="text-sm text-gray-500">{r.rating.toFixed(1)} &#9733;</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
