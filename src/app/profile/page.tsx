import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import AvatarForm from "@/components/AvatarForm";
import NameForm from "@/components/NameForm";
import { getUserAndProfile } from "@/lib/supabase/server";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <div className="card p-6 sm:p-8">
      <h1 className="display italic text-6xl">Your profile</h1>
      <p className="mt-1 text-ink-2">{user.email}</p>

      <section className="mt-10">
        <h2 className="display italic text-3xl">Photo</h2>
        <div className="mt-4 flex items-center gap-6">
          <Avatar profile={profile} size={80} />
          <div className="flex-1">
            <AvatarForm />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="rule mb-8" />
        <h2 className="display italic text-3xl">Name</h2>
        <div className="mt-4">
          <NameForm
            firstName={profile?.first_name ?? ""}
            lastName={profile?.last_name ?? ""}
          />
        </div>
      </section>
      </div>
    </main>
  );
}
