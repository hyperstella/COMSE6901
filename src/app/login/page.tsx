import GoogleSignInButton from "@/components/GoogleSignInButton";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {next
          ? "You need to be signed in to view that page."
          : "Sign in to see members-only picks and manage your profile."}
      </p>

      <div className="mt-8">
        {clientId ? (
          <GoogleSignInButton clientId={clientId} />
        ) : (
          <p className="text-sm text-amber-700">
            NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.
          </p>
        )}
      </div>

      {typeof error === "string" && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
