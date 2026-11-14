-- ============================================================
-- Lectura — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================

-- Runs table: one row per video processing job
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  url             text not null,
  title           text,
  status          text not null default 'queued'
                    check (status in ('queued', 'processing', 'done', 'failed')),
  duration_seconds integer,
  thumbnail_url   text,
  error_message   text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days')
);

-- Notes table: one row per completed run
create table if not exists public.notes (
  id                          uuid primary key default gen_random_uuid(),
  run_id                      uuid not null references public.runs(id) on delete cascade,
  user_id                     uuid not null references auth.users(id) on delete cascade,
  chunk_notes_md              text,
  reduced_notes_md            text,
  transcript_txt              text,
  transcript_timestamped_txt  text,
  rag_index_json              jsonb,
  created_at                  timestamptz not null default now()
);

-- Indexes
create index if not exists runs_user_id_idx on public.runs(user_id);
create index if not exists runs_status_idx on public.runs(status);
create index if not exists runs_expires_at_idx on public.runs(expires_at);
create index if not exists notes_run_id_idx on public.notes(run_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.runs  enable row level security;
alter table public.notes enable row level security;

-- Runs policies
create policy "Users can view own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users can insert own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own runs"
  on public.runs for update
  using (auth.uid() = user_id);

create policy "Users can delete own runs"
  on public.runs for delete
  using (auth.uid() = user_id);

-- Notes policies
create policy "Users can view own notes"
  on public.notes for select
  using (auth.uid() = user_id);

create policy "Users can insert own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own notes"
  on public.notes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Run usage — one row per started run, for free-tier limits.
-- Kept apart from `runs` because users can delete their own runs
-- (and the cleanup cron deletes expired ones); counting `runs` would
-- hand quota back. RLS on with no policies: only the backend's
-- service role can read or write it.
-- Safe to re-run on an existing database (also backfills).
-- ============================================================
create table if not exists public.run_usage (
  run_id      uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists run_usage_user_created_idx on public.run_usage(user_id, created_at);

alter table public.run_usage enable row level security;

insert into public.run_usage (run_id, user_id, created_at)
select id, user_id, created_at from public.runs
on conflict (run_id) do nothing;

-- ============================================================
-- Study pack, personal notes, search, share links.
-- Safe to re-run on an existing database.
-- ============================================================

-- LLM-generated TL;DR, chapter titles, key terms, flashcards and quiz
-- (backend/pipeline/study_pack.py), cached per run.
alter table public.notes add column if not exists study_json jsonb;

-- Full-text search over a run's notes.
alter table public.notes add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english', coalesce(reduced_notes_md, '') || ' ' || coalesce(chunk_notes_md, ''))
  ) stored;
create index if not exists notes_search_idx on public.notes using gin (search_tsv);

-- Takes the user id as a parameter, so it must only be callable by the
-- backend's service role (see the revoke below).
create or replace function public.search_notes(uid uuid, q text)
returns table (run_id uuid, title text, snippet text, rank real)
language sql stable
set search_path = public
as $$
  with query as (select websearch_to_tsquery('english', q) as tsq)
  select r.id,
         r.title,
         ts_headline('english',
                     coalesce(n.reduced_notes_md, '') || ' ' || coalesce(n.chunk_notes_md, ''),
                     query.tsq,
                     'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=<<, StopSel=>>'),
         ts_rank(n.search_tsv, query.tsq)
           + case when to_tsvector('english', coalesce(r.title, '')) @@ query.tsq then 1 else 0 end
  from public.notes n
  join public.runs r on r.id = n.run_id
  cross join query
  where n.user_id = uid
    and (n.search_tsv @@ query.tsq or to_tsvector('english', coalesce(r.title, '')) @@ query.tsq)
  order by 4 desc
  limit 20;
$$;
revoke execute on function public.search_notes(uuid, text) from public, anon, authenticated;

-- Personal notes and starred bullets, one row per (run, user).
-- RLS on with no policies: backend (service role) only.
create table if not exists public.user_notes (
  run_id      uuid not null references public.runs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null default '',
  starred     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (run_id, user_id)
);
alter table public.user_notes enable row level security;

-- Public read-only share links: /share/{share_token}
alter table public.runs add column if not exists share_token uuid unique;

-- ============================================================
-- Storage bucket for run outputs
-- ============================================================
insert into storage.buckets (id, name, public)
values ('run-outputs', 'run-outputs', false)
on conflict do nothing;

-- Users can only read/write their own folder: run-outputs/{user_id}/...
create policy "Users can upload own outputs"
  on storage.objects for insert
  with check (
    bucket_id = 'run-outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own outputs"
  on storage.objects for select
  using (
    bucket_id = 'run-outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own outputs"
  on storage.objects for delete
  using (
    bucket_id = 'run-outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Retention: notes are kept until the user deletes the run.
-- runs.expires_at is still populated but not enforced; there is
-- no cleanup job. (The backend deletes each run's downloaded
-- audio/video once its notes are saved.)
-- ============================================================
