import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDeploymentOrigin, RELAY_COOKIE, unpackState } from "@/lib/auth-relay";
import { NEXT_COOKIE, safeNextPath } from "@/lib/next-path";
import { signupAllowed, tokenEmail } from "@/lib/signup-rules";

/**
 * Where Google sends the signed-in user's ID token. Three ways in:
 *
 * - `credential`: Google Identity Services (redirect mode) on this origin.
 * - `id_token` + `state`: Google's answer to a sign-in that started on a
 *   deployment URL. This runs on production and relays the token on.
 * - `relay_credential` + `relay_state`: that relay arriving back on the
 *   deployment URL. See lib/auth-relay.ts.
 *
 * We exchange the token for a Supabase session with signInWithIdToken, which
 * only needs the Google Client ID (no secret).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const fail = (reason: string, origin = request.nextUrl.origin) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, origin), 303);

  // Production: hand a deployment's token back to it.
  const packed = unpackState(field("state"));
  if (packed) {
    if (!isDeploymentOrigin(packed.origin)) return fail("Sign-in came back for an unknown site.");
    if (field("error")) return fail("Google sign-in was cancelled.", packed.origin);
    if (!field("id_token")) return fail("Google did not return a credential.", packed.origin);
    return relay(`${packed.origin}/auth/callback`, {
      relay_credential: field("id_token"),
      relay_state: packed.state,
    });
  }

  // Deployment: the relay arriving. Only accept the sign-in this browser started.
  if (field("relay_credential")) {
    const [state, nonce] = (request.cookies.get(RELAY_COOKIE)?.value ?? "").split(".");
    if (!state || !nonce || state !== field("relay_state")) {
      return fail("That sign-in link expired. Please try again.");
    }
    return signIn(request, field("relay_credential"), nonce, fail);
  }

  const credential = field("credential");
  if (!credential) return fail("Google did not return a credential.");
  // Double-submit CSRF check recommended by Google.
  const cookieCsrf = request.cookies.get("g_csrf_token")?.value;
  if (cookieCsrf && cookieCsrf !== field("g_csrf_token")) {
    return fail("Failed CSRF check. Please try again.");
  }
  return signIn(request, credential, undefined, fail);
}

async function signIn(
  request: NextRequest,
  token: string,
  nonce: string | undefined,
  fail: (reason: string) => NextResponse,
) {
  // Build the redirect first so the session cookies land on it. The login
  // page stores where the user was headed in a short-lived cookie.
  const next = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value) ?? "/dashboard";
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.delete(NEXT_COOKIE);
  response.cookies.delete(RELAY_COOKIE);

  // New accounts only for allowed domains or whitelisted addresses (set in
  // the admin panel); existing accounts always get in.
  const allowed = await signupAllowed(tokenEmail(token));
  if (!allowed.ok) return fail(allowed.reason);

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

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
  if (error || !data.user) {
    return fail(error?.message ?? "Sign-in failed.");
  }

  // First-time users (no name yet) are sent to fill in their profile. The
  // client now carries the new session, so RLS lets it read this one row.
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

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A page that POSTs `fields` to `action` as soon as it loads. */
function relay(action: string, fields: Record<string, string>) {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Signing you in…</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#2f3b3a;background:#e9eef1">
<form method="post" action="${escape(action)}">${inputs}<noscript><button>Continue</button></noscript></form>
<p>Signing you in…</p>
<script>document.forms[0].submit()</script>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

// Visiting the callback directly (GET) just bounces to the login page.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
