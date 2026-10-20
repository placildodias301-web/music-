-- Song sheet (lyrics + chords) storage. Mirrors the client model in
-- frontend/src/lib/song/model.ts. Rows are owned by a user; RLS limits every
-- table to its owner. Lyrics/chords must come from Wilsify's own analysis,
-- user uploads, licensed APIs or permitted content — never scraped sources.

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text,
  file_name text,
  duration_seconds real,
  content_source text not null default 'user' check (content_source in ('user','analysis','licensed','public_domain')),
  created_at timestamptz not null default now()
);

create table if not exists public.song_analysis (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text, key_confidence real,
  bpm real, bpm_status text,
  time_signature text, time_signature_status text,
  capo_estimate int, difficulty text, difficulty_reasons jsonb,
  analysis jsonb not null,            -- the full /api/analyze result, unmodified
  created_at timestamptz not null default now()
);

create table if not exists public.song_sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  name text not null,
  kind text not null,
  name_source text not null default 'inferred' check (name_source in ('user','inferred')),
  start_time real, end_time real
);

create table if not exists public.lyric_lines (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  section_id uuid references public.song_sections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  text text not null,
  start_time real, end_time real,    -- null = untimed line
  instrumental boolean not null default false
);

create table if not exists public.lyric_words (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lyric_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  word text not null,
  char_start int not null,
  start_time real, end_time real
);

create table if not exists public.chord_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  section_id uuid references public.song_sections(id) on delete cascade,
  line_id uuid references public.lyric_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chord text not null,               -- as analysed (original, never rewritten)
  normalized_chord text not null,    -- transposition-safe form
  start_time real not null,
  end_time real,
  char_index int not null default 0,
  confidence real                    -- 0..1, kept so low-confidence chords stay visible
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  seconds_practiced int not null default 0,
  speed real not null default 1,
  looped_section text,
  transpose int not null default 0,
  capo int not null default 0
);

create index if not exists songs_user_idx on public.songs(user_id);
create index if not exists song_sections_song_idx on public.song_sections(song_id, position);
create index if not exists lyric_lines_song_idx on public.lyric_lines(song_id, position);
create index if not exists lyric_words_line_idx on public.lyric_words(line_id, position);
create index if not exists chord_events_song_time_idx on public.chord_events(song_id, start_time);
create index if not exists practice_sessions_song_idx on public.practice_sessions(song_id, started_at desc);

do $$
declare t text;
begin
  foreach t in array array['songs','song_analysis','song_sections','lyric_lines','lyric_words','chord_events','practice_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_owner" on public.%1$I', t);
    execute format('create policy "%1$s_owner" on public.%1$I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
