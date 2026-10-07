# COMSE6901 — Treendr

A dating app for the trees of Columbia's campus, built with Next.js (App Router), Supabase and
three.js.

- **The campus** (`/`): Morningside campus as a 3D pop-up book, from 114th to 120th Street.
  Every tree on Treendr is a heart on the map, numbered by rank; hover one to meet the tree and
  click to open its profile. The seasons and the sunlight follow the real date and time, and
  the sliders scrub through the year and the day. The layout comes from `src/lib/campus.ts`,
  which the 2D plan and the spot descriptions also read.
- **Swipe** (`/swipe`): each card is one line from a tree's dating profile. Swipe right (or →)
  to like it and left (←) to pass. Like two lines from the same tree and it's a match.
- **Add a tree** (`/upload`): signed-in users upload a photo, pin it on the campus plan, and
  watch a two-step prompt chain run live:
  1. a vision model writes field notes on the photo (streamed);
  2. a separate text-only call turns those notes, and only the notes, into a Hinge-style
     profile: a name, an age, a bio and prompt answers. Each answer is a caption to vote on.

  The photo goes to Supabase Storage; the notes, profile and captions go to the database.
- **The Grove** (`/trees`, `/trees/[id]`): the leaderboard, and each tree's profile, where you
  can change or take back your votes line by line.
- **Photo or pixel**: every tree photo has a Photo / Pixel switch. Pixel art is made in the
  browser from a small cached copy of the photo (downsample, then a 14-color palette), so it
  costs no storage, model calls or server time. The same colors build each tree's voxel model
  on the campus book, shaped by its species.
- **Your garden** (`/dashboard`): your matches and the trees you added. The original restaurant
  list lives at `/restaurants`.

Signing in uses Google (see below). Anyone can browse; only signed-in users can vote or upload.

## Data model and row level security

`supabase/captions.sql` creates the tables and turns RLS on for every table, using the
strictest rules the app still works under:

| Table | anon | authenticated | Written by |
| --- | --- | --- | --- |
| `images` (trees) | read | read | server only (service role, after the prompt chain succeeds) |
| `captions` (profile lines) | read | read | server only; tallies kept by a trigger |
| `caption_votes` | none | read/insert/update/delete **own rows only** (`user_id = auth.uid()`) | the voter |
| `profiles` | none | read and rename **own row only** | sign-up trigger; avatar URL by server |
| `restaurants` | read | read | nobody (seed data) |

Votes are written with the user's own session, so RLS (not app code) is what stops someone
voting as another user. Users can't write captions or tallies directly, so they can't forge
jokes or stuff the ballot. A vote row's primary key is `(caption_id, user_id)`: the first vote
inserts a row, and changing it updates that row. Column grants also stop a vote from being
moved to another caption. Storage has no policies, so only the server can upload, and the
public bucket serves the images. The `tree_rankings` view and the `swipe_queue` function run
as the caller (`security_invoker`), so they can't see anything RLS hides.

## LLM providers

Both steps use the OpenAI-compatible Chat Completions API (`src/lib/llm.ts`), so the same code
runs against:

| `LLM_PROVIDER` | Used for | Settings |
| --- | --- | --- |
| `ollama` | local development | `OLLAMA_VISION_MODEL` (default `qwen2.5vl:7b`), `OLLAMA_TEXT_MODEL` (default `qwen2.5:7b`), `OLLAMA_BASE_URL` |
| `gemini` | production on Vercel | `GEMINI_API_KEY` (free key from [Google AI Studio](https://aistudio.google.com/apikey)), `GEMINI_MODEL` (default `gemini-3.8-flash`) |

If `LLM_PROVIDER` is unset and `GEMINI_API_KEY` is set, Gemini is used. Each user can add
10 trees per 24 hours.

## How sign-in works

1. `/login` shows Google's "Sign in with Google" button (Google Identity Services, redirect mode).
2. Google POSTs the ID token to **`/auth/callback`**. The route handler calls
   `supabase.auth.signInWithIdToken`, which only needs the Google **Client ID**, not a Client Secret.
3. The session is stored in cookies through `@supabase/ssr`. `src/proxy.ts` refreshes it on each
   request and redirects signed-out visitors away from protected routes.
4. If `first_name` or `last_name` is empty, the user is sent to `/onboarding`. Otherwise they go
   back to the page they came from.

## Setup

1. **Database:** run `supabase/profiles.sql`, then `supabase/captions.sql`, in the Supabase SQL
   editor.
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
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (server-only; used for uploads) |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud Console |
   | `LLM_PROVIDER` | `ollama` locally, `gemini` on Vercel |
   | `GEMINI_API_KEY` | Google AI Studio (production) |

5. For local captions, run Ollama and pull the models:

   ```bash
   ollama pull qwen2.5vl:7b && ollama pull qwen2.5:7b
   ```

6. Optional: seed eight painted test trees. They go through the same two-step prompt chain
   as uploads, have no uploader, and are skipped if they're already there:

   ```bash
   npx tsx --env-file=.env.local scripts/seed-trees.ts
   ```

7. Start the app:

   ```bash
   npm run dev
   ```
