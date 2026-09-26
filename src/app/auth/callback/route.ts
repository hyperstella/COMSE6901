import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Google Identity Services (redirect mode) POSTs the signed-in user's ID
 * token here as `credential`. We exchange it for a Supabase session with
 * signInWithIdToken, which only needs the Google Client ID (no secret).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const credential = form.get("credential");
  const bodyCsrf = form.get("g_csrf_token");
  const cookieCsrf = request.cookies.get("g_csrf_token")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(reason)}`, request.url),
      303,
    );

  if (typeof credential !== "string" || !credential) {
    return fail("Google did not return a credential.");
  }
  // Double-submit CSRF check recommended by Google.
  if (cookieCsrf && cookieCsrf !== bodyCsrf) {
    return fail("Failed CSRF check. Please try again.");
  }

  // Build the redirect first so the session cookies land on it.
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
  });

  if (error || !data.user) {
    return fail(error?.message ?? "Sign-in failed.");
  }

  // First-time users (no name yet) are sent to fill in their profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.first_name?.trim() || !profile?.last_name?.trim()) {
    response.headers.set("location", new URL("/onboarding", request.url).toString());
  }

  return response;
}

// Visiting the callback directly (GET) just bounces to the login page.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
