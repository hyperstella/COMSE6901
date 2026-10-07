-- Treendr: photos of campus trees, the AI-written dating profiles for them
-- (each profile line is a caption), votes on those lines, and the row level
-- security (RLS) rules for every table in the app.
-- Run this in the Supabase SQL editor after profiles.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per uploaded tree photo. Only the Storage URL is kept here; the
-- bytes live in the `captioned-images` bucket. map_x/map_y place the tree on
-- the site's pixel map of campus (0..1 from the top-left corner).
create table if not exists public.images (
  id            uuid primary key default gen_random_uuid(),
  uploader_id   uuid references auth.users (id) on delete set null,
  uploader_name text,                       -- first name at upload time
  storage_path  text not null unique,
  image_url     text not null,
  width         integer not null check (width > 0),
  height        integer not null check (height > 0),
  description   text not null,              -- step 1 of the prompt chain
  created_at    timestamptz not null default now()
);

-- Tree profile fields (added after the first version of this table).
alter table public.images
  add column if not exists tree_name text,
  add column if not exists tree_age  integer,
  add column if not exists species   text,
  add column if not exists bio       text,
  add column if not exists spot      text,
  add column if not exists map_x     real,
  add column if not exists map_y     real;

alter table public.images
  alter column tree_name set not null,
  alter column tree_age  set not null,
  alter column map_x     set not null,
  alter column map_y     set not null;

alter table public.images drop constraint if exists images_tree_check;
alter table public.images add constraint images_tree_check check (
  char_length(tree_name) between 1 and 40
  and tree_age between 1 and 5000
  and char_length(species) <= 80
  and char_length(bio) <= 200
  and char_length(spot) <= 60
  and map_x between 0 and 1
  and map_y between 0 and 1
);

create index if not exists images_created_idx on public.images (created_at desc);
create index if not exists images_uploader_idx on public.images (uploader_id, created_at desc);

-- Each profile line ("My most irrational fear" + the tree's answer) is a
-- caption written by the LLM from the description (step 2).
-- upvotes/downvotes are maintained by a trigger on caption_votes.
create table if not exists public.captions (
  id         uuid primary key default gen_random_uuid(),
  image_id   uuid not null references public.images (id) on delete cascade,
  prompt     text check (char_length(prompt) <= 80),
  content    text not null check (char_length(content) between 1 and 300),
  upvotes    integer not null default 0 check (upvotes >= 0),
  downvotes  integer not null default 0 check (downvotes >= 0),
  score      integer generated always as (upvotes - downvotes) stored,
  created_at timestamptz not null default now()
);

-- The first version called the prompt column "style".
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'captions' and column_name = 'style') then
    alter table public.captions rename column style to prompt;
    alter table public.captions drop constraint if exists captions_style_check;
    alter table public.captions add constraint captions_prompt_check check (char_length(prompt) <= 80);
  end if;
end;
$$;

create index if not exists captions_image_idx on public.captions (image_id);
create index if not exists captions_score_idx on public.captions (score desc, upvotes desc);

-- One vote per user per caption: +1 (swipe right / like), -1 (swipe left / pass).
-- The first vote inserts a row; changing your mind updates it.
create table if not exists public.caption_votes (
  caption_id uuid not null references public.captions (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (caption_id, user_id)
);
create index if not exists caption_votes_user_idx on public.caption_votes (user_id);

-- ---------------------------------------------------------------------------
-- Vote tallies
-- ---------------------------------------------------------------------------

-- Keeps captions.upvotes/downvotes in sync with caption_votes. SECURITY DEFINER
-- because voters have no UPDATE right on captions.
create or replace function public.tally_caption_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.captions
       set upvotes   = upvotes   - (old.vote = 1)::int,
           downvotes = downvotes - (old.vote = -1)::int
     where id = old.caption_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.captions
       set upvotes   = upvotes   + (new.vote = 1)::int,
           downvotes = downvotes + (new.vote = -1)::int
     where id = new.caption_id;
  end if;
  return null;
end;
$$;

drop trigger if exists caption_votes_tally on public.caption_votes;
create trigger caption_votes_tally
  after insert or update or delete on public.caption_votes
  for each row execute function public.tally_caption_vote();

-- A vote can change its value, never which caption or user it belongs to.
create or replace function public.guard_caption_vote_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.caption_id := old.caption_id;
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists caption_votes_guard on public.caption_votes;
create trigger caption_votes_guard
  before update on public.caption_votes
  for each row execute function public.guard_caption_vote_update();

revoke all on function public.tally_caption_vote() from public, anon, authenticated;
revoke all on function public.guard_caption_vote_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Swipe deck and rankings
-- ---------------------------------------------------------------------------

-- Replaced by swipe_queue below.
drop function if exists public.stage_queue(integer);

-- Random profile lines to swipe on. For a signed-in user, skips lines they
-- already voted on. SECURITY INVOKER, so the caller's RLS rules still apply.
-- PL/pgSQL so anonymous callers never touch caption_votes, which they have no
-- privileges on at all (a single SQL query is permission-checked as a whole).
drop function if exists public.swipe_queue(integer);
create function public.swipe_queue(max_count integer default 30)
returns table (
  caption_id uuid,
  prompt     text,
  content    text,
  upvotes    integer,
  downvotes  integer,
  image_id   uuid,
  image_url  text,
  width      integer,
  height     integer,
  tree_name  text,
  tree_age   integer,
  species    text,
  spot       text,
  map_x      real,
  map_y      real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return query
      select c.id, c.prompt, c.content, c.upvotes, c.downvotes,
             i.id, i.image_url, i.width, i.height,
             i.tree_name, i.tree_age, i.species, i.spot, i.map_x, i.map_y
        from public.captions c
        join public.images i on i.id = c.image_id
       order by random()
       limit least(greatest(max_count, 1), 60);
  else
    return query
      select c.id, c.prompt, c.content, c.upvotes, c.downvotes,
             i.id, i.image_url, i.width, i.height,
             i.tree_name, i.tree_age, i.species, i.spot, i.map_x, i.map_y
        from public.captions c
        join public.images i on i.id = c.image_id
       where not exists (
               select 1 from public.caption_votes v
                where v.caption_id = c.id and v.user_id = auth.uid()
             )
       order by random()
       limit least(greatest(max_count, 1), 60);
  end if;
end;
$$;

revoke all on function public.swipe_queue(integer) from public;
grant execute on function public.swipe_queue(integer) to anon, authenticated;

-- Each tree's score is how its profile lines were received. SECURITY INVOKER
-- so it can never show more than the caller could read from the tables.
create or replace view public.tree_rankings
with (security_invoker = true) as
select i.id, i.tree_name, i.tree_age, i.species, i.spot, i.bio,
       i.image_url, i.width, i.height, i.map_x, i.map_y, i.created_at,
       coalesce(sum(c.upvotes), 0)::integer as likes,
       coalesce(sum(c.downvotes), 0)::integer as passes,
       (coalesce(sum(c.upvotes), 0) - coalesce(sum(c.downvotes), 0))::integer as score
  from public.images i
  left join public.captions c on c.image_id = i.id
 group by i.id;

revoke all on public.tree_rankings from public, anon, authenticated;
grant select on public.tree_rankings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: the strictest rules the app still works under
-- ---------------------------------------------------------------------------
-- The service role (server-only, after getUser()) bypasses RLS. It is used only
-- to upload to Storage and to insert AI-generated trees and profile lines, so
-- users cannot forge captions or edit tallies through the public API.

-- images: anyone may look; nobody but the server may write.
alter table public.images enable row level security;
drop policy if exists "Anyone can view images" on public.images;
create policy "Anyone can view images"
  on public.images for select
  to anon, authenticated
  using (true);
revoke all on public.images from anon, authenticated;
grant select on public.images to anon, authenticated;

-- captions: anyone may look; nobody but the server may write.
alter table public.captions enable row level security;
drop policy if exists "Anyone can view captions" on public.captions;
create policy "Anyone can view captions"
  on public.captions for select
  to anon, authenticated
  using (true);
revoke all on public.captions from anon, authenticated;
grant select on public.captions to anon, authenticated;

-- caption_votes: signed-in users see and manage only their own votes.
-- Anonymous visitors have no access at all.
alter table public.caption_votes enable row level security;
drop policy if exists "Users read their own votes" on public.caption_votes;
create policy "Users read their own votes"
  on public.caption_votes for select
  to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users vote as themselves" on public.caption_votes;
create policy "Users vote as themselves"
  on public.caption_votes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users change their own votes" on public.caption_votes;
create policy "Users change their own votes"
  on public.caption_votes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users retract their own votes" on public.caption_votes;
create policy "Users retract their own votes"
  on public.caption_votes for delete
  to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.caption_votes from anon, authenticated;
grant select, delete on public.caption_votes to authenticated;
grant insert (caption_id, user_id, vote) on public.caption_votes to authenticated;
grant update (vote) on public.caption_votes to authenticated;

-- profiles: each user reads and renames only their own row. Rows are created
-- by the on_auth_user_created trigger; avatar_url is set by the server after
-- it uploads the photo, so users cannot point it at an arbitrary URL.
alter table public.profiles enable row level security;
drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, updated_at) on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_name_length;
alter table public.profiles add constraint profiles_name_length
  check (char_length(first_name) <= 100 and char_length(last_name) <= 100);

-- restaurants: public, read-only.
alter table public.restaurants enable row level security;
revoke all on public.restaurants from anon, authenticated;
grant select on public.restaurants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Public-read bucket for uploaded photos. storage.objects already has RLS on;
-- with no policies, only the server (service role) can upload, list or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captioned-images', 'captioned-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
