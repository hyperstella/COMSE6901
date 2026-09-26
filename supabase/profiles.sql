-- Profiles: one row per auth user, created automatically on first sign-in.
-- Run this in the Supabase SQL editor.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  first_name  text,          -- nullable: collected after first login
  last_name   text,          -- nullable: collected after first login
  avatar_url  text,          -- public URL of the photo in Storage (no image bytes here)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger function: insert a profile when a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users who signed up before the trigger existed.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Public bucket for profile photos. Uploads happen server-side with the
-- service role key, so no Storage policies are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 4194304,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
