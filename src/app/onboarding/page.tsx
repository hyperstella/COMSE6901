import { redirect } from "next/navigation";
import NameForm from "@/components/NameForm";
import { getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (isProfileComplete(profile)) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Welcome! What should we call you?</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Add your first and last name to finish setting up your account. You can
        change them any time from your profile.
      </p>
      <div className="mt-8">
        <NameForm
          firstName={profile?.first_name ?? ""}
          lastName={profile?.last_name ?? ""}
          redirectTo="/dashboard"
          submitLabel="Continue"
        />
      </div>
    </main>
  );
}
