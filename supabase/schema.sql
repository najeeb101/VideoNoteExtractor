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
