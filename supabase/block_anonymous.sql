-- Block Supabase anonymous sign-ins from writing to Lectura.
-- Needed because Anonymous Sign-Ins is enabled project-wide for another app:
-- anonymous users carry the `authenticated` role and pass the auth.uid() checks.
-- Apply once in the SQL editor AFTER schema.sql. Idempotent.
-- Restrictive policies are ANDed with the existing permissive ones.
-- The backend (service role) bypasses RLS and rejects anonymous tokens itself (app.py).

drop policy if exists "Block anonymous writes to runs" on public.runs;
create policy "Block anonymous writes to runs"
  on public.runs as restrictive for all to authenticated
  using ((auth.jwt()->>'is_anonymous')::boolean is not true)
  with check ((auth.jwt()->>'is_anonymous')::boolean is not true);

drop policy if exists "Block anonymous writes to notes" on public.notes;
create policy "Block anonymous writes to notes"
  on public.notes as restrictive for all to authenticated
  using ((auth.jwt()->>'is_anonymous')::boolean is not true)
  with check ((auth.jwt()->>'is_anonymous')::boolean is not true);

-- Scoped to this app's bucket so other apps' buckets are unaffected.
drop policy if exists "Block anonymous run-outputs access" on storage.objects;
create policy "Block anonymous run-outputs access"
  on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'run-outputs' or (auth.jwt()->>'is_anonymous')::boolean is not true)
  with check (bucket_id <> 'run-outputs' or (auth.jwt()->>'is_anonymous')::boolean is not true);
