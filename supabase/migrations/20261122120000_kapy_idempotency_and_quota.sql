-- Kapy: duplicate-write protection and per-user request quotas.
--
-- Additive only. One nullable column, one partial unique index, one new table
-- and one function. Nothing existing is changed, so it is safe on a live
-- database and old app builds are unaffected.
--
-- Apply this BEFORE deploying the new `kapy` function: confirming a transaction
-- writes client_request_id. (If the function is deployed first, saving reports
-- "unavailable" until this is applied, and chat falls back to unmetered because
-- ai_consume does not exist yet — both fail safe, neither loses data.)

-- ── 1. Idempotent transaction writes ────────────────────────
-- Kapy proposes a transaction, the person confirms, and the confirmation carries
-- a request id. Storing it under a unique index means a double tap, a retry
-- after a lost response, or a replayed request cannot insert the same row twice:
-- the second attempt hits the index and is answered with the existing row.
--
-- Per user, so two people can never collide, and partial, so the many existing
-- rows (and anything inserted without an id, like the Add screen) are unaffected.
alter table public.transactions
  add column if not exists client_request_id uuid;

create unique index if not exists transactions_user_request_uidx
  on public.transactions (user_id, client_request_id)
  where client_request_id is not null;

-- ── 2. Usage counters for AI endpoints ──────────────────────
-- One row per user, kind and time window, holding how many requests were made.
-- `kind` and the window length are constrained so a caller cannot create an
-- unbounded number of distinct rows.
create table if not exists public.ai_usage (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  kind           text        not null check (kind in ('kapy', 'kapy_confirm', 'scan')),
  window_seconds integer     not null check (window_seconds in (60, 86400)),
  window_start   timestamptz not null,
  uses           integer     not null default 0 check (uses >= 0),
  primary key (user_id, kind, window_seconds, window_start)
);

-- Nobody reads or writes this table directly. With RLS on and no policy, the
-- API denies every row to every role; the only way in is the function below.
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated, public;

-- Counts one request for the CALLING user and says whether it is allowed.
--
--   * The user is auth.uid() from the verified JWT. There is no user argument,
--     so a caller cannot spend, read or reset anyone else's allowance.
--   * The increment is a single upsert whose UPDATE has `where uses < p_max`:
--     atomic under concurrency, and a refused request does not increment.
--   * `p_offset_seconds` shifts the window boundary, so the daily window can
--     reset at midnight in Malaysia (offset 28800) rather than at 08:00 local.
--   * SECURITY DEFINER lets it write the table the caller cannot touch;
--     `search_path = ''` and schema-qualified names keep it from being hijacked.
--   * It also deletes this user's counters older than two days, so the table
--     stays small without a scheduled job.
create or replace function public.ai_consume(
  p_kind           text,
  p_window_seconds integer,
  p_max            integer,
  p_offset_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  bucket     timestamptz;
  new_uses   integer;
  retry_in   integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('kapy', 'kapy_confirm', 'scan')
     or p_window_seconds is null or p_window_seconds not in (60, 86400)
     or p_max is null or p_max < 1 or p_max > 100000
     or p_offset_seconds is null or p_offset_seconds < 0 or p_offset_seconds > 86400 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  bucket := to_timestamp(
    floor((extract(epoch from now()) + p_offset_seconds) / p_window_seconds) * p_window_seconds
    - p_offset_seconds
  );

  insert into public.ai_usage as u (user_id, kind, window_seconds, window_start, uses)
  values (uid, p_kind, p_window_seconds, bucket, 1)
  on conflict (user_id, kind, window_seconds, window_start)
  do update set uses = u.uses + 1 where u.uses < p_max
  returning u.uses into new_uses;

  retry_in := greatest(
    1,
    ceil(extract(epoch from (bucket + make_interval(secs => p_window_seconds) - now())))::integer
  );

  if new_uses is null then
    return jsonb_build_object('allowed', false, 'uses', p_max, 'retry_after_seconds', retry_in);
  end if;

  delete from public.ai_usage where user_id = uid and window_start < now() - interval '2 days';

  return jsonb_build_object('allowed', true, 'uses', new_uses, 'retry_after_seconds', 0);
end;
$$;

-- Signed-in users only. `anon` (anyone holding the public key) cannot call it.
revoke all on function public.ai_consume(text, integer, integer, integer) from public, anon;
grant execute on function public.ai_consume(text, integer, integer, integer) to authenticated;
