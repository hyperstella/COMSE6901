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
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{user.email}</p>

      <section className="mt-10">
        <h2 className="font-semibold">Photo</h2>
        <div className="mt-4 flex items-center gap-6">
          <Avatar profile={profile} size={80} />
          <div className="flex-1">
            <AvatarForm />
          </div>
        </div>
      </section>

      <section className="mt-10 border-t border-gray-200 pt-10 dark:border-gray-800">
        <h2 className="font-semibold">Name</h2>
        <div className="mt-4">
          <NameForm
            firstName={profile?.first_name ?? ""}
            lastName={profile?.last_name ?? ""}
          />
        </div>
      </section>
    </main>
  );
}
