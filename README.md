# COMSE6901 — Restaurants

Next.js (App Router) + Supabase. The restaurant list at `/` is public. Signing in with Google
creates a row in `profiles` through a database trigger. New users are asked for their first and last
name. `/dashboard` and `/profile` require a signed-in user.

## How sign-in works

1. `/login` shows Google's "Sign in with Google" button (Google Identity Services, redirect mode).
2. Google POSTs the ID token to **`/auth/callback`**. The route handler calls
   `supabase.auth.signInWithIdToken`, which only needs the Google **Client ID**, not a Client Secret.
3. The session is stored in cookies through `@supabase/ssr`. `src/proxy.ts` refreshes it on each
   request and redirects signed-out visitors away from protected routes.
4. If `first_name` or `last_name` is empty, the user is sent to `/onboarding`.

Profile photos are uploaded to the Supabase Storage bucket `avatars`. Only their public URL is saved
in `profiles.avatar_url`.

## Setup

1. **Database:** run `supabase/profiles.sql` in the Supabase SQL editor.
2. **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID →
   Web application):
   - Authorized JavaScript origins: `http://localhost`, `http://localhost:3000`, and your Vercel URL(s)
   - Authorized redirect URIs: `http://localhost:3000/auth/callback` and `https://<vercel-url>/auth/callback`
3. **Supabase:** Authentication → Sign In / Providers → Google → turn it on, paste the Client ID into
   *Client IDs*, and leave the secret empty.
4. **Environment variables** (in `.env.local` and in Vercel):

   | Variable | Where to find it |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (server-only; used for photo uploads) |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud Console |

5. Start the app:

   ```bash
   npm run dev
   ```
