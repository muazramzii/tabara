-- Temporary probe table to verify how PostgREST handles an upsert whose
-- payload omits some columns. Dropped again immediately after the test.
--
-- Kept in the history rather than squashed away because the migration is
-- recorded on the remote database; removing it here would put local and
-- remote out of step.
create table if not exists public._upsert_probe (
  id   text primary key,
  a    integer not null default 0,
  b    integer not null default 0
);
-- No RLS: this holds no real data and exists for one test.
