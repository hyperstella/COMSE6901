import { getSupabaseClient, type Restaurant } from "@/lib/supabase";

// Fetch on each request so the page reflects the live table rather than
// a snapshot baked in at build time.
export const dynamic = "force-dynamic";

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
      <p className="font-medium text-amber-900 dark:text-amber-200">{title}</p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{detail}</p>
    </div>
  );
}

function Card({ restaurant }: { restaurant: Restaurant }) {
  return (
    <li className="rounded-lg border border-gray-200 p-5 transition-shadow hover:shadow-md dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{restaurant.name}</h2>
        <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
          {restaurant.rating.toFixed(1)} &#9733;
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {restaurant.cuisine} &middot; {restaurant.neighborhood}
      </p>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-500">
        {restaurant.price_range}
      </p>
    </li>
  );
}

export default async function Home() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
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
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Restaurants</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Rows fetched from Supabase &middot; COMSE6901
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
