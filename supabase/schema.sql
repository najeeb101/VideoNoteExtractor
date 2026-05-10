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
-- Cleanup cron — deletes expired runs daily
-- Requires pg_cron extension (enable in Supabase dashboard)
-- ============================================================

-- Enable extension (run once):
-- create extension if not exists pg_cron;

-- Schedule: delete runs where expires_at has passed
-- select cron.schedule(
--   'delete-expired-runs',
--   '0 3 * * *',  -- every day at 3am UTC
--   $$
--     delete from public.runs where expires_at < now();
--   $$
-- );
