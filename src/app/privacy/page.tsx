export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="card p-6 leading-7 text-ink-2 sm:p-8">
      <h1 className="display italic text-6xl text-ink">
        Privacy Policy
      </h1>
      <p className="mt-2 text-ink-3">Last updated September 30, 2026</p>

      <p className="mt-8">
        This is a student project built for COMSE6901 at Columbia University.
        It is not a commercial service.
      </p>

      <h2 className="display italic mt-8 text-3xl text-ink">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>From Google Sign-In: your email address and Google account ID.</li>
        <li>What you enter yourself: your first name, last name and an optional profile photo.</li>
        <li>
          Tree photos you upload, where you pinned them, the profiles written for them, and your
          likes and passes.
        </li>
      </ul>

      <h2 className="display italic mt-8 text-3xl text-ink">How it is used</h2>
      <p className="mt-2">
        This information is used only to sign you in and run this app. It is not sold or used
        for advertising.
      </p>
      <p className="mt-2">
        Photos you upload are sent to Google&apos;s Gemini API to be described and captioned. On
        Gemini&apos;s free tier, Google may use what it receives to improve its products, so please
        don&apos;t upload anything private.
        Uploaded photos, their captions and your first name are shown publicly on the site. Your
        votes are private to you; other visitors only see vote totals.
      </p>

      <h2 className="display italic mt-8 text-3xl text-ink">Where it is stored</h2>
      <p className="mt-2">
        Account data, photos, captions and votes are stored with Supabase. The app is hosted on
        Vercel.
      </p>

      <h2 className="display italic mt-8 text-3xl text-ink">Deleting your data</h2>
      <p className="mt-2">
        You can change your name and photo on the Profile page at any time. To
        have your account deleted, contact the course project owner.
      </p>
      </div>
    </main>
  );
}
