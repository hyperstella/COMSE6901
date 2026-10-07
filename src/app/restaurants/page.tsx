import { getSupabaseClient, type Restaurant } from "@/lib/supabase/public";

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

function Card({ restaurant }: { restaurant: Restaurant }) {
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
      <p className="mt-3 text-sm text-ink-3">
        {restaurant.price_range}
      </p>
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="display italic text-6xl">Where to eat</h1>
      <p className="mt-2 text-ink-2">
        Dinner spots near campus for after your date with a tree &middot; from Supabase
      </p>

      <div className="mt-8">
        {error ? (
          <Notice title="Could not load restaurants" detail={error.message} />
        ) : !data || data.length === 0 ? (
          <Notice
            title="No rows returned"
            detail="The table is empty, or row level security is blocking anonymous reads."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.map((restaurant) => (
              <Card key={restaurant.id} restaurant={restaurant} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
