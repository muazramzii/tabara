drop table if exists public._upsert_probe;

-- Supabase's linter flagged both policies: bare auth.uid() is re-evaluated
-- once per row. Wrapping it in a scalar subquery makes Postgres evaluate it
-- once per query instead. Same access rules, just planned better.
drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service"
  on public.profiles
  for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "transactions are self-service" on public.transactions;
create policy "transactions are self-service"
  on public.transactions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
