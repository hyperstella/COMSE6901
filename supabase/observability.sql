-- Observability for the admin panel: the prompt chains (and the
-- mix that decides which one an upload runs through), the LLM providers and
-- models those chains use, a glossary of campus terms and example profiles
-- the writer step can draw on, a log of every generation request and every
-- model response, and who is allowed to sign up.
--
-- Run this in the Supabase SQL editor after captions.sql and matchmaking.sql.
-- Safe to re-run. Until it runs, the app behaves as before (prompts come from
-- the code, nothing is logged) and the admin pages say what is missing.
--
-- None of these tables has a row level security policy: only the server
-- (service role) reads or writes them, after checking the user is an admin.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
-- Who is an admin is profiles.is_superadmin, added by the admin panel's own
-- supabase/admin.sql (COMSE6901-admin-panel). Promote the first admin there:
--   update public.profiles set is_superadmin = true where email = 'you@example.com';

-- ---------------------------------------------------------------------------
-- LLM providers and models
-- ---------------------------------------------------------------------------

create table if not exists public.llm_providers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null check (char_length(name) between 1 and 80),
  base_url    text not null,                 -- OpenAI-compatible endpoint
  auth_kind   text not null default 'api_key' check (auth_kind in ('api_key', 'oidc', 'none')),
  api_key_env text,                          -- name of the env var holding the key
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.llm_models (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.llm_providers (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120), -- the id sent to the API
  label            text,
  supports_vision  boolean not null default false,
  reasoning_effort text check (reasoning_effort in ('none', 'low', 'medium', 'high')),
  is_active        boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider_id, name)
);

-- ---------------------------------------------------------------------------
-- Prompt chains
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_chains (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null check (char_length(name) between 1 and 80),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The steps run in order. Step 1 sees the photo; step 2 sees only step 1's notes.
create table if not exists public.prompt_chain_steps (
  id                uuid primary key default gen_random_uuid(),
  chain_id          uuid not null references public.prompt_chains (id) on delete cascade,
  position          integer not null check (position >= 1),
  kind              text not null check (kind in ('describe', 'write')),
  name              text not null check (char_length(name) between 1 and 80),
  system_prompt     text not null,
  user_prompt       text,                    -- template: {{notes}}, {{spot}}
  temperature       real not null default 0.7 check (temperature between 0 and 2),
  max_tokens        integer not null default 2000 check (max_tokens between 1 and 32000),
  model_id          uuid references public.llm_models (id) on delete set null,
  fallback_model_id uuid references public.llm_models (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (chain_id, position)
);

-- How uploads are split between chains: a chain is picked with probability
-- weight / sum of weights. Weight 0 switches a chain off.
create table if not exists public.prompt_chain_mix (
  chain_id   uuid primary key references public.prompt_chains (id) on delete cascade,
  weight     integer not null default 0 check (weight between 0 and 1000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- What the writer step can draw on
-- ---------------------------------------------------------------------------

-- Campus and tree lingo, handed to the writer as a glossary.
create table if not exists public.terms (
  id         uuid primary key default gen_random_uuid(),
  term       text not null check (char_length(term) between 1 and 60),
  definition text not null check (char_length(definition) between 1 and 300),
  category   text not null default 'campus' check (category in ('campus', 'tree')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only two categories (the first version also had 'dating' and 'other').
alter table public.terms drop constraint if exists terms_category_check;
alter table public.terms add constraint terms_category_check check (category in ('campus', 'tree'));

-- Field notes paired with the profile we'd want written from them (few-shot
-- examples for the writer step).
create table if not exists public.ai_generation_examples (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  notes      text not null,                  -- step 1 output
  profile    jsonb not null,                 -- step 2 output: {name, age, species, bio, prompts: [{prompt, answer}]}
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Observability: every generation request and every model response
-- ---------------------------------------------------------------------------

create table if not exists public.generation_requests (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('tree', 'compat')),
  user_id     uuid references auth.users (id) on delete set null,
  user_email  text,
  chain_id    uuid references public.prompt_chains (id) on delete set null,
  status      text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error       text,
  image_id    uuid references public.images (id) on delete set null,
  spot        text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  metadata    jsonb not null default '{}'::jsonb
);
create index if not exists generation_requests_started_idx on public.generation_requests (started_at desc);

create table if not exists public.llm_responses (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid references public.generation_requests (id) on delete cascade,
  step_id           uuid references public.prompt_chain_steps (id) on delete set null,
  step_kind         text not null,
  provider          text not null,
  model             text not null,
  messages          jsonb not null,          -- what was sent (images replaced by a marker)
  response          text,
  finish_reason     text,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer,
  status            text not null check (status in ('ok', 'error')),
  error             text,
  created_at        timestamptz not null default now()
);
create index if not exists llm_responses_request_idx on public.llm_responses (request_id);
create index if not exists llm_responses_created_idx on public.llm_responses (created_at desc);

-- ---------------------------------------------------------------------------
-- Who may sign up
-- ---------------------------------------------------------------------------
-- With no rows in either table, anyone can sign in. Otherwise every sign-in
-- needs an email on an allowed domain or on the whitelist, whether or not the
-- account already exists.

create table if not exists public.allowed_signup_domains (
  id         uuid primary key default gen_random_uuid(),
  domain     text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.whitelisted_emails (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security: server only
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'llm_providers', 'llm_models', 'prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix',
    'terms', 'ai_generation_examples', 'generation_requests', 'llm_responses',
    'allowed_signup_domains', 'whitelisted_emails'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed data (skipped where it already exists)
-- ---------------------------------------------------------------------------

insert into public.llm_providers (slug, name, base_url, auth_kind, api_key_env, notes) values
  ('gateway', 'Vercel AI Gateway', 'https://ai-gateway.vercel.sh/v1', 'oidc', 'AI_GATEWAY_API_KEY',
   'Production. Authenticates with the deployment''s OIDC token unless AI_GATEWAY_API_KEY is set.'),
  ('gemini', 'Google Gemini API', 'https://generativelanguage.googleapis.com/v1beta/openai/', 'api_key', 'GEMINI_API_KEY',
   'Direct Gemini access with a free AI Studio key.'),
  ('ollama', 'Ollama (local)', 'http://localhost:11434/v1', 'none', null,
   'Local development. Run `ollama serve`.')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, label, supports_vision, reasoning_effort)
select p.id, m.name, m.label, m.vision, m.effort
  from (values
    ('gateway', 'google/gemini-3.8-flash',      'Gemini 3.8 Flash (gateway)',      true, 'low'),
    ('gateway', 'google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite (gateway)', true, 'low'),
    ('gemini',  'gemini-3.8-flash',             'Gemini 3.8 Flash',                true, 'low'),
    ('gemini',  'gemini-3.5-flash-lite',        'Gemini 3.5 Flash Lite',           true, 'low'),
    ('ollama',  'qwen2.5vl:7b',                 'Qwen 2.5 VL 7B',                  true, null),
    ('ollama',  'qwen2.5:7b',                   'Qwen 2.5 7B',                     false, null)
  ) as m (provider, name, label, vision, effort)
  join public.llm_providers p on p.slug = m.provider
on conflict (provider_id, name) do nothing;

insert into public.prompt_chains (slug, name, description) values
  ('classic', 'Treendr classic', 'The two-step chain the app launched with: a botanist''s field notes, then a Hinge-style profile written from the notes alone.'),
  ('deadpan', 'Deadpan botanist', 'Same notes, drier profile: understated, matter-of-fact, no exclamation marks. Off by default (weight 0 in the mix).')
on conflict (slug) do nothing;

insert into public.prompt_chain_steps (chain_id, position, kind, name, system_prompt, user_prompt, temperature, max_tokens, model_id, fallback_model_id)
select c.id, s.position, s.kind, s.name, s.system_prompt, s.user_prompt, s.temperature, s.max_tokens,
       (select m.id from public.llm_models m join public.llm_providers p on p.id = m.provider_id where p.slug = 'gateway' and m.name = 'google/gemini-3.8-flash'),
       (select m.id from public.llm_models m join public.llm_providers p on p.id = m.provider_id where p.slug = 'gateway' and m.name = 'google/gemini-3.5-flash-lite')
  from (values
    ('classic', 1, 'describe', 'Field notes',
$prompt$You are a field botanist taking notes on one tree on Columbia University's campus. A comedy writer will turn your notes into the tree's dating profile without ever seeing the photo, so they depend on you for every detail that could be funny.

Write one paragraph of 80 to 140 words in plain prose, with no lists or headings. Cover the likely species and how sure you are; its size and a rough sense of its age; its shape and posture (leaning, lopsided, majestic, scraggly); bark, leaves, flowers or fruit, and what season it looks like; its condition; what is around it (buildings, benches, paths, people, squirrels, signs); the light and weather; and anything odd, charming or ironic. Describe what you can see rather than guessing, and do not identify real people by name. Do not make jokes yourself.

If there is no tree or large plant in the photo, reply with exactly NO_TREE and nothing else. If the photo is sexually explicit or shows graphic violence or gore, reply with exactly NOT_SUITABLE and nothing else.$prompt$,
     'Take your field notes on this tree.', 0.4, 2000),
    ('classic', 2, 'write', 'Dating profile',
$prompt$You write dating-app profiles for trees on Columbia University's Morningside Heights campus, for an app called Treendr. You receive a botanist's field notes on one tree and where it stands on campus. You never see the photo.

Write the profile in the tree's own voice:
- name: a first name that fits its vibe.
- age: its age in years, estimated from the notes. Playful but plausible.
- species: from the notes. If they're unsure, say "probably" (for example "Probably a London plane").
- bio: one line, under 15 words.
- prompts: exactly 5 answers, each to a different prompt from this list: {{prompts}}.

Each answer is a caption people will vote on, so make every one funny:
- Under 20 words. Short beats long.
- Anchor it in a specific detail from the notes or the tree's spot. An answer that could fit any tree is a miss.
- Tree-life humor is welcome (squirrels, leaf blowers, photosynthesis, roots, shade, students napping underneath), and so are campus references (finals in Butler, the Steps, the Core), but don't force one into every line.
- Keep it good-natured: tease the tree and the situation, never people's bodies, race, gender, age or other identity traits.
- No hashtags, no emoji, and no surrounding quotation marks.
- "Two truths and a lie" is three short claims separated by commas or periods, like "I've survived 80 winters, I love squirrels, I've never dropped a leaf on a student." Don't number them or say which one is the lie.

Reply with JSON only, shaped like {"name": "...", "age": 80, "species": "...", "bio": "...", "prompts": [{"prompt": "My most irrational fear", "answer": "..."}]}.$prompt$,
     E'<field_notes>\n{{notes}}\n</field_notes>\n<location>{{spot}}, Columbia University</location>\n\nWrite this tree''s profile.', 0.9, 4000),
    ('deadpan', 1, 'describe', 'Field notes',
$prompt$You are a field botanist taking notes on one tree on Columbia University's campus. A comedy writer will turn your notes into the tree's dating profile without ever seeing the photo, so they depend on you for every detail that could be funny.

Write one paragraph of 80 to 140 words in plain prose, with no lists or headings. Cover the likely species and how sure you are; its size and a rough sense of its age; its shape and posture (leaning, lopsided, majestic, scraggly); bark, leaves, flowers or fruit, and what season it looks like; its condition; what is around it (buildings, benches, paths, people, squirrels, signs); the light and weather; and anything odd, charming or ironic. Describe what you can see rather than guessing, and do not identify real people by name. Do not make jokes yourself.

If there is no tree or large plant in the photo, reply with exactly NO_TREE and nothing else. If the photo is sexually explicit or shows graphic violence or gore, reply with exactly NOT_SUITABLE and nothing else.$prompt$,
     'Take your field notes on this tree.', 0.4, 2000),
    ('deadpan', 2, 'write', 'Dating profile (deadpan)',
$prompt$You write dating-app profiles for trees on Columbia University's Morningside Heights campus, for an app called Treendr. You receive a botanist's field notes on one tree and where it stands on campus. You never see the photo.

Write the profile in the tree's own voice, and keep that voice deadpan: understated, matter-of-fact, mildly weary, never excited. No exclamation marks. The joke is that the tree reports absurd things as if they were ordinary.
- name: a first name that fits its vibe.
- age: its age in years, estimated from the notes. Plausible.
- species: from the notes. If they're unsure, say "probably".
- bio: one line, under 15 words.
- prompts: exactly 5 answers, each to a different prompt from this list: {{prompts}}.

Each answer is a caption people will vote on:
- Under 20 words. Short beats long.
- Anchor it in a specific detail from the notes or the tree's spot. An answer that could fit any tree is a miss.
- Keep it good-natured: tease the tree and the situation, never people's bodies, race, gender, age or other identity traits.
- No hashtags, no emoji, and no surrounding quotation marks.
- "Two truths and a lie" is three short claims separated by commas or periods. Don't number them or say which one is the lie.

Reply with JSON only, shaped like {"name": "...", "age": 80, "species": "...", "bio": "...", "prompts": [{"prompt": "My most irrational fear", "answer": "..."}]}.$prompt$,
     E'<field_notes>\n{{notes}}\n</field_notes>\n<location>{{spot}}, Columbia University</location>\n\nWrite this tree''s profile.', 0.8, 4000)
  ) as s (chain, position, kind, name, system_prompt, user_prompt, temperature, max_tokens)
  join public.prompt_chains c on c.slug = s.chain
on conflict (chain_id, position) do nothing;

insert into public.prompt_chain_mix (chain_id, weight)
select id, case slug when 'classic' then 100 else 0 end from public.prompt_chains
on conflict (chain_id) do nothing;

insert into public.terms (term, definition, category)
select * from (values
  ('Butler', 'Butler Library, where students study all night during finals; the south lawn in front of it is South Field.', 'campus'),
  ('the Steps', 'The Low Steps, the wide granite stairs in front of Low Library where everyone sits in the sun.', 'campus'),
  ('the Core', 'The Core Curriculum, the required great-books and science classes every Columbia College student takes.', 'campus'),
  ('College Walk', 'The brick path along 116th Street that cuts across campus; lit with holiday lights every December.', 'campus'),
  ('Alma Mater', 'The bronze statue on the Low Steps with an owl hidden in her robes; finding it is supposed to be good luck.', 'campus'),
  ('JJ''s Place', 'The late-night diner in the basement of John Jay Hall, open until 4 a.m.', 'campus'),
  ('leaf blower', 'A tree''s natural enemy: campus groundskeepers use them every autumn morning.', 'tree'),
  ('London plane', 'The most common street tree in New York, with camouflage-patterned peeling bark.', 'tree')
) as t (term, definition, category)
where not exists (select 1 from public.terms);

insert into public.ai_generation_examples (title, notes, profile)
select 'A leaning elm by Butler',
$notes$Probably an American elm, fairly confident from the vase-shaped crown and the serrated, lopsided leaves, though the trunk shows the dark fissured bark of a mature tree, likely sixty to eighty years old. It is tall, perhaps twenty meters, and leans noticeably toward the library as if trying to read over someone's shoulder. The canopy is thinning on the street side and still full over the lawn, where a hammock has been tied between it and a smaller tree. Leaves are mostly green with a few turning yellow, so early autumn. A bench underneath is covered in fallen samaras and one abandoned iced coffee. Two squirrels are chasing each other up the trunk. The light is low and golden, late afternoon, with Butler's columns behind.$notes$,
'{"name": "Walter", "age": 72, "species": "Probably an American elm", "bio": "Leaning toward Butler since before your parents met.", "prompts": [{"prompt": "My toxic trait is", "answer": "Leaning over the library like I have a reading to finish."}, {"prompt": "Typical Sunday", "answer": "Holding up a hammock and one iced coffee somebody swore they would come back for."}, {"prompt": "My most irrational fear", "answer": "Leaf blowers at seven in the morning. Not irrational, actually."}, {"prompt": "Two truths and a lie", "answer": "I have two squirrels in a custody dispute, I shed samaras on purpose, I have never seen a finals week."}, {"prompt": "I''ll fall for you if", "answer": "You sit on my bench and read something other than your phone."}]}'::jsonb
where not exists (select 1 from public.ai_generation_examples);

-- No sign-in rules are seeded: with both tables empty, anyone can sign in.
-- Add domains or addresses in the admin panel to restrict who can.
