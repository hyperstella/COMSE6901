import Link from "next/link";
import { getUserAndProfile } from "@/lib/supabase/server";
import Avatar from "./Avatar";

export default async function Header() {
  const { user, profile } = await getUserAndProfile();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Restaurants
        </Link>

        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <Link href="/profile" className="flex items-center gap-2 hover:underline">
              <Avatar profile={profile} size={28} />
              <span className="hidden sm:inline">
                {profile?.first_name || user.email}
              </span>
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
