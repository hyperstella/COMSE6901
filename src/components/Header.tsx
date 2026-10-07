import Link from "next/link";
import { getUserAndProfile } from "@/lib/supabase/server";
import Avatar from "./Avatar";
import Logo from "./Logo";
import NavLinks from "./NavLinks";
import SoundControls from "./SoundControls";

export default async function Header() {
  const { user, profile } = await getUserAndProfile();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-md backdrop-saturate-150">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-5 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-1.5" aria-label="Treendr home">
          <Logo className="h-8 w-8 transition-transform group-hover:-rotate-6" />
          <span className="wordmark hidden text-[1.75rem] sm:inline">Treendr</span>
        </Link>

        <NavLinks />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <SoundControls />
          {user ? (
            <Link
              href="/dashboard"
              title="Your garden"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-ink/5 lg:pr-3"
            >
              <Avatar profile={profile} size={30} />
              <span className="hidden max-w-28 truncate text-sm text-ink-2 lg:inline">
                {profile?.first_name || user.email}
              </span>
            </Link>
          ) : (
            <Link href="/login" className="btn px-4 py-2 text-sm">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
