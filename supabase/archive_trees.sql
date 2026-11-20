-- Archiving: an uploader can take a tree they added off Treendr, and bring it
-- back later. An archived tree disappears for everyone, its uploader included:
-- the map, Swipe, the Grove, Best lines, its page and its share card. Its
-- lines and votes are kept, so restoring it puts everything back.
--
-- Run after captions.sql. Safe to run again.

alter table public.images add column if not exists archived_at timestamptz;

-- images and captions: anyone may look, except at archived trees. The swipe
-- deck, tree_rankings and every page read through these (SECURITY INVOKER),
-- so this one rule hides archived trees everywhere. The server's service-role
-- client bypasses RLS and filters archived trees itself where it reads them.
drop policy if exists "Anyone can view images" on public.images;
create policy "Anyone can view images"
  on public.images for select
  to anon, authenticated
  using (archived_at is null);

drop policy if exists "Anyone can view captions" on public.captions;
create policy "Anyone can view captions"
  on public.captions for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.images i
       where i.id = captions.image_id
         and i.archived_at is null
    )
  );

-- No new votes on an archived tree's lines: the caption has to be one the
-- voter can see.
drop policy if exists "Users vote as themselves" on public.caption_votes;
create policy "Users vote as themselves"
  on public.caption_votes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.captions c where c.id = caption_votes.caption_id)
  );
