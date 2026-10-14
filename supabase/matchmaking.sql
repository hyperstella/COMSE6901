-- Matchmaking: what users say about themselves, and how compatible the AI
-- thinks they are with each tree. Run in the Supabase SQL editor after
-- profiles.sql and captions.sql. Safe to re-run. Until it runs, the app
-- simply hides the "About you" profile and compatibility.

-- What users tell the trees. Users edit their own row (RLS in captions.sql).
alter table public.profiles
  add column if not exists about   text,
  add column if not exists vibes   text[] not null default '{}',
  add column if not exists hangout text;

alter table public.profiles drop constraint if exists profiles_about_length;
alter table public.profiles add constraint profiles_about_length
  check (char_length(about) <= 280 and cardinality(vibes) <= 3 and char_length(hangout) <= 60);

grant update (about, vibes, hangout) on public.profiles to authenticated;

-- One row per (user, tree): a 0-100 score and a one-line reason, written by
-- the server (service role) from an LLM call. Users can only read their own.
create table if not exists public.tree_compat (
  user_id    uuid not null references auth.users (id) on delete cascade,
  image_id   uuid not null references public.images (id) on delete cascade,
  score      smallint not null check (score between 0 and 100),
  reason     text not null check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, image_id)
);

alter table public.tree_compat enable row level security;
drop policy if exists "Users read their own compatibility" on public.tree_compat;
create policy "Users read their own compatibility"
  on public.tree_compat for select
  to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.tree_compat from anon, authenticated;
grant select on public.tree_compat to authenticated;
