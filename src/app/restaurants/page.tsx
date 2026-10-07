import RestaurantVoter from "@/components/RestaurantVoter";
import { getSupabaseClient, type Restaurant } from "@/lib/supabase/public";
import { getUserAndProfile } from "@/lib/supabase/server";

// Fetch on each request so the page reflects the live table rather than
// a snapshot baked in at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Restaurants" };

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="card p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{detail}</p>
    </div>
  );
}

// Voting state for one card; null when restaurant_votes.sql hasn't been run yet.
type Voting = { votes: number; voted: boolean; signedIn: boolean } | null;

function Card({ restaurant, voting }: { restaurant: Restaurant; voting: Voting }) {
  return (
    <li className="card p-5 transition-transform hover:-translate-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{restaurant.name}</h2>
        <span className="shrink-0 text-sm text-ink-2">
          <span className="text-accent">&#9733;</span> {restaurant.rating.toFixed(1)}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {restaurant.cuisine} &middot; {restaurant.neighborhood}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-sm text-ink-3">{restaurant.price_range}</p>
        {voting && (
          <RestaurantVoter
            restaurantId={restaurant.id}
            initialVoted={voting.voted}
            initialVotes={voting.votes}
            signedIn={voting.signedIn}
          />
        )}
      </div>
    </li>
  );
}

export default async function RestaurantsPage() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <Notice
          title="Supabase is not configured"
          detail="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment."
        />
      </main>
    );
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, cuisine, neighborhood, price_range, rating")
    .order("rating", { ascending: false });

  // Votes live in their own query so the list still loads before the
  // restaurant_votes.sql migration has been run.
  const { supabase: session, user } = await getUserAndProfile();
  const [{ data: tallies, error: tallyError }, { data: mine }] = await Promise.all([
    supabase.from("restaurants").select("id, votes").returns<{ id: number; votes: number }[]>(),
    user
      ? session.from("restaurant_votes").select("restaurant_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { restaurant_id: number }[] }),
  ]);
  const votesById = tallyError ? null : new Map((tallies ?? []).map((t) => [t.id, t.votes]));
  const myVotes = new Set((mine ?? []).map((v) => v.restaurant_id));
  const restaurants = [...(data ?? [])].sort(
    (a, b) => (votesById?.get(b.id) ?? 0) - (votesById?.get(a.id) ?? 0) || b.rating - a.rating,
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="display italic text-6xl">Where to eat</h1>
      <p className="mt-2 text-ink-2">
        Dinner spots near campus for after your date with a tree &middot; vote for where you&apos;d go
      </p>

      <div className="mt-8">
        {error ? (
          <Notice title="Could not load restaurants" detail={error.message} />
        ) : restaurants.length === 0 ? (
          <Notice
            title="No rows returned"
            detail="The table is empty, or row level security is blocking anonymous reads."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {restaurants.map((restaurant) => (
              <Card
                key={restaurant.id}
                restaurant={restaurant}
                voting={
                  votesById && {
                    votes: votesById.get(restaurant.id) ?? 0,
                    voted: myVotes.has(restaurant.id),
                    signedIn: Boolean(user),
                  }
                }
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
