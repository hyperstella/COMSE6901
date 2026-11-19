-- Uploaders can edit their tree's profile (the draft before publishing, and
-- lines nobody has voted on yet). This flag records which lines a person
-- changed from the AI's text, so ratings of AI-written and human-edited lines
-- can be told apart (in the admin panel or in analysis).
--
-- Optional: the app works without it and simply doesn't record the flag.
-- Run once in the Supabase SQL editor, after captions.sql.

alter table public.captions
  add column if not exists edited_by_uploader boolean not null default false;

-- Users still can't write captions directly (see captions.sql): the server
-- sets this flag with the service role after checking who owns the tree.
