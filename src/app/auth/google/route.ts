import { NextResponse, type NextRequest } from "next/server";
import { needsRelay, packState, productionOrigin, randomToken, RELAY_COOKIE, sha256Hex } from "@/lib/auth-relay";
import { NEXT_COOKIE, safeNextPath } from "@/lib/next-path";

/**
 * Starts Google sign-in on a deployment URL (see lib/auth-relay.ts). Google
 * sends its answer to production, which relays it back here.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const prod = productionOrigin();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!prod || !clientId || !needsRelay(origin)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomToken();
  const nonce = randomToken();
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${prod}/auth/callback`,
    response_type: "id_token",
    response_mode: "form_post",
    scope: "openid email profile",
    prompt: "select_account",
    nonce: await sha256Hex(nonce),
    state: packState(state, origin),
  }).toString();

  const response = NextResponse.redirect(google);
  // The relayed callback is a cross-site POST, so these must be SameSite=None.
  const cookie = { path: "/", maxAge: 600, sameSite: "none", secure: true, httpOnly: true } as const;
  response.cookies.set(RELAY_COOKIE, `${state}.${nonce}`, cookie);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next) response.cookies.set(NEXT_COOKIE, next, cookie);
  return response;
}
