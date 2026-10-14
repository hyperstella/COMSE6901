import Link from "next/link";
import { getMyDatingProfile, hasDatingProfile } from "@/lib/matchmaking";
import { getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";
import Avatar from "./Avatar";
import HeaderShell from "./HeaderShell";
import Logo from "./Logo";
import NavLinks, { TabBar } from "./NavLinks";
import ProfileNudge from "./ProfileNudge";
import SoundControls from "./SoundControls";

export default async function Header() {
  const { user, profile } = await getUserAndProfile();
  // Signed in and named, but hasn't told the trees anything yet.
  const dating = user && isProfileComplete(profile) ? await getMyDatingProfile() : null;
  const nudge = Boolean(dating?.ready && !hasDatingProfile(dating.profile));

  return (
    <>
      <HeaderShell>
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-5 sm:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-1" aria-label="Treendr home">
            <Logo className="h-8 w-8 origin-bottom transition-transform group-hover:-rotate-6" />
            <span className="wordmark text-2xl text-accent">Treendr</span>
          </Link>

          <NavLinks />

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <SoundControls />
            {user ? (
              <Link
                href="/dashboard"
                title={nudge ? "Your garden · finish your profile" : "Your garden"}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-ink/5 lg:pr-3"
              >
                <span className="relative">
                  <Avatar profile={profile} size={30} />
                  {nudge && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-like ring-2 ring-bg" aria-hidden />}
                </span>
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
      </HeaderShell>
      {/* Outside the header: its backdrop blur would trap a fixed child. */}
      <TabBar />
      {nudge && <ProfileNudge />}
    </>
  );
}
