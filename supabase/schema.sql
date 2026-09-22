-- Table backing the list page.
create table if not exists public.restaurants (
  id           bigint generated always as identity primary key,
  name         text    not null,
  cuisine      text    not null,
  neighborhood text    not null,
  price_range  text    not null,
  rating       numeric(2,1) not null,
  created_at   timestamptz not null default now()
);

-- Row Level Security is on by default for new tables; without a policy
-- the anon key reads zero rows. This grants public read-only access.
alter table public.restaurants enable row level security;

drop policy if exists "Public read access" on public.restaurants;
create policy "Public read access"
  on public.restaurants
  for select
  to anon, authenticated
  using (true);

insert into public.restaurants (name, cuisine, neighborhood, price_range, rating) values
  ('Xi''an Famous Foods',  'Chinese',     'Morningside',      '$',    4.5),
  ('Community Food & Juice','American',   'Morningside',      '$$',   4.1),
  ('Le Monde',             'French',      'Morningside',      '$$',   4.0),
  ('Thai Market',          'Thai',        'Upper West Side',  '$$',   4.2),
  ('Absolute Bagels',      'Bakery',      'Upper West Side',  '$',    4.6);
