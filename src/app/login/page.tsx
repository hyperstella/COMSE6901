import GoogleSignInButton from "@/components/GoogleSignInButton";
import Logo from "@/components/Logo";
import { safeNextPath } from "@/lib/next-path";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const nextPath = typeof next === "string" ? safeNextPath(next) : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-sm p-8 text-center">
        <Logo className="mx-auto h-16 w-16" />
        <h1 className="display mt-4 text-6xl">
          Join <span className="wordmark not-italic">Treendr</span>
        </h1>
        <p className="mt-3 text-ink-2">
          {nextPath
            ? "You need an account for that. One click with Google and you're in."
            : "Sign in to swipe on trees, get matches and add trees of your own."}
        </p>

        <div className="mt-8">
          {clientId ? (
            <GoogleSignInButton clientId={clientId} next={nextPath} />
          ) : (
            <p className="text-sm text-like">NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.</p>
          )}
        </div>

        {typeof error === "string" && (
          <p role="alert" className="mt-6 text-sm text-like">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
