-- "I'd go" votes on the restaurant list: one per user per restaurant.
-- Run this in the Supabase SQL editor after schema.sql and captions.sql. Safe to re-run.

-- Kept in sync by the trigger below; voters can't write it directly.
alter table public.restaurants
  add column if not exists votes integer not null default 0 check (votes >= 0);

create table if not exists public.restaurant_votes (
  restaurant_id bigint not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index if not exists restaurant_votes_user_idx on public.restaurant_votes (user_id);

-- SECURITY DEFINER because voters have no UPDATE right on restaurants.
create or replace function public.tally_restaurant_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.restaurants set votes = votes - 1 where id = old.restaurant_id;
  else
    update public.restaurants set votes = votes + 1 where id = new.restaurant_id;
  end if;
  return null;
end;
$$;

drop trigger if exists restaurant_votes_tally on public.restaurant_votes;
create trigger restaurant_votes_tally
  after insert or delete on public.restaurant_votes
  for each row execute function public.tally_restaurant_vote();

revoke all on function public.tally_restaurant_vote() from public, anon, authenticated;

-- Recount in case votes existed before the column did.
update public.restaurants r
   set votes = (select count(*) from public.restaurant_votes v where v.restaurant_id = r.id);

-- RLS: a user reads, casts and retracts only their own votes. No updates:
-- a vote is either there or not.
alter table public.restaurant_votes enable row level security;
revoke all on public.restaurant_votes from anon, authenticated;

drop policy if exists "Users read their own restaurant votes" on public.restaurant_votes;
create policy "Users read their own restaurant votes"
  on public.restaurant_votes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users vote for restaurants as themselves" on public.restaurant_votes;
create policy "Users vote for restaurants as themselves"
  on public.restaurant_votes for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users retract their own restaurant votes" on public.restaurant_votes;
create policy "Users retract their own restaurant votes"
  on public.restaurant_votes for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.restaurant_votes to authenticated;
grant insert (restaurant_id, user_id) on public.restaurant_votes to authenticated;
