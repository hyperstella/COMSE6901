export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-sm leading-6 text-gray-700 dark:text-gray-300">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-gray-500">Last updated September 26, 2026</p>

      <p className="mt-8">
        This is a student project built for COMSE6901 at Columbia University.
        It is not a commercial service.
      </p>

      <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-100">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>From Google Sign-In: your email address and Google account ID.</li>
        <li>What you enter yourself: your first name, last name and an optional profile photo.</li>
      </ul>

      <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-100">How it is used</h2>
      <p className="mt-2">
        This information is used only to sign you in and show your profile inside
        this app. It is not sold, shared with third parties or used for advertising.
      </p>

      <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-100">Where it is stored</h2>
      <p className="mt-2">
        Account data and photos are stored with Supabase. The app is hosted on Vercel.
      </p>

      <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-100">Deleting your data</h2>
      <p className="mt-2">
        You can change your name and photo on the Profile page at any time. To
        have your account deleted, contact the course project owner.
      </p>
    </main>
  );
}
