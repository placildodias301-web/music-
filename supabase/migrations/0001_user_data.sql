-- Per-user app data (feature 1: library, AI-tutor chats, practice log synced to the account).
-- One table, one row per item; `data` is the same JSON the app already keeps per device.
-- Run once in Supabase → SQL Editor.

create table if not exists public.user_data (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('library', 'chat', 'practice')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

-- Row-level security: a signed-in user can only see and change their own rows.
alter table public.user_data enable row level security;

drop policy if exists "own rows" on public.user_data;
create policy "own rows" on public.user_data
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_data to authenticated;
