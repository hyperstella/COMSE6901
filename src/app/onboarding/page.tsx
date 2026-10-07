import { redirect } from "next/navigation";
import NameForm from "@/components/NameForm";
import { getUserAndProfile, isProfileComplete } from "@/lib/supabase/server";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (isProfileComplete(profile)) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <div className="card p-6 sm:p-8">
      <h1 className="display italic text-5xl">Welcome! What should we call you?</h1>
      <p className="mt-2 text-ink-2">
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
      </div>
    </main>
  );
}
