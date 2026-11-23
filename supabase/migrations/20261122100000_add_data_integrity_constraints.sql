-- Data-integrity constraints.
--
-- Until now the only things stopping a nonsensical row were the app's forms and
-- the Edge Functions' validators. Anyone calling the REST API directly with
-- their own token bypasses both, so the same rules are enforced here as well.
--
-- Additive only: nothing is dropped, no column changes type, existing rows are
-- never rewritten.
--
-- Every constraint is added as NOT VALID first. That makes it apply to every
-- new or changed row immediately, without scanning (or failing on) existing
-- data. The final block then tries to VALIDATE each one. If some historical row
-- breaks a rule, the constraint is left NOT VALID with a WARNING naming it —
-- the migration still succeeds, new writes are still protected, and the old
-- rows can be fixed and validated later. VALIDATE CONSTRAINT does not block
-- reads or writes.
--
-- Already enforced elsewhere, and unchanged here:
--   transactions.amount > 0                    (init migration)
--   transactions.type in ('expense','income')  (init migration)
--   NOT NULL on user_id, amount, type, category, date
--   user_id -> auth.users ON DELETE CASCADE, and RLS on both tables
--
-- Categories stay free text on purpose: the category list lives in the app
-- (src/constants/categories.ts) by design, so an enum here would force a
-- migration every time a category is added. The check below is on shape only.

-- ── Helper: is this a plausible budgets object? ──────────────
-- {"food": 300, "transport": 150}: an object of category id -> non-negative
-- number, with a bounded size. Written as CASE at each step because SQL does not
-- guarantee AND/OR short-circuit, and casting a non-number to numeric would raise.
create or replace function public.budgets_are_valid(b jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when b is null or jsonb_typeof(b) <> 'object' then false
    when octet_length(b::text) > 4096 then false
    else not exists (
      select 1
      from jsonb_each(b) as e(key, value)
      where char_length(e.key) > 40
         or case
              when jsonb_typeof(e.value) = 'number'
                then (e.value)::numeric not between 0 and 10000000
              else true
            end
    )
  end
$$;

-- ── transactions ─────────────────────────────────────────────
alter table public.transactions
  drop constraint if exists transactions_amount_max_chk,
  drop constraint if exists transactions_category_format_chk,
  drop constraint if exists transactions_note_length_chk,
  drop constraint if exists transactions_date_range_chk;

alter table public.transactions
  -- RM 10,000,000. Keep in step with MAX_AMOUNT in
  -- supabase/functions/_shared/amount.ts.
  add constraint transactions_amount_max_chk
    check (amount <= 10000000) not valid,
  -- Same shape as the ids in src/constants/categories.ts (food, income_other...).
  add constraint transactions_category_format_chk
    check (category ~ '^[a-z0-9_]{1,40}$') not valid,
  add constraint transactions_note_length_chk
    check (note is null or char_length(note) <= 500) not valid,
  -- Catches year-0001 / year-9999 garbage. Deliberately not relative to now():
  -- a time-dependent CHECK changes meaning over time and can fail a restore.
  add constraint transactions_date_range_chk
    check (date >= timestamptz '2000-01-01 00:00:00+00'
       and date <  timestamptz '2100-01-01 00:00:00+00') not valid;

-- ── profiles ─────────────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_income_nonneg_chk,
  drop constraint if exists profiles_savings_goal_nonneg_chk,
  drop constraint if exists profiles_username_length_chk,
  drop constraint if exists profiles_budgets_valid_chk;

alter table public.profiles
  add constraint profiles_income_nonneg_chk
    check (income >= 0) not valid,
  add constraint profiles_savings_goal_nonneg_chk
    check (savings_goal >= 0) not valid,
  -- The signup form allows 20; this is a looser ceiling because Google and
  -- Facebook display names do not pass through that form.
  add constraint profiles_username_length_chk
    check (username is null or char_length(username) between 1 and 100) not valid,
  add constraint profiles_budgets_valid_chk
    check (public.budgets_are_valid(budgets)) not valid;

-- ── Keep sign-up working for long display names ──────────────
-- handle_new_user() copies the provider's display name into profiles.username.
-- Without this, a Google or Facebook name over 100 characters would now violate
-- profiles_username_length_chk, make the trigger fail, and with it the whole
-- sign-up. Truncating is the safe behaviour for a display name.
-- Otherwise identical to 20260815191504_handle_new_user_oauth_names.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'given_name'), '')
  );
  chosen_name := nullif(trim(left(chosen_name, 100)), '');

  insert into public.profiles (id, username, income, savings_goal, budgets, updated_at)
  values (new.id, chosen_name, 0, 0, '{}'::jsonb, now())
  on conflict (id) do nothing;

  return new;
end;
$$;

-- CREATE OR REPLACE keeps existing grants; stated again so this file is
-- self-evidently safe (see 20260816053429_restrict_handle_new_user_execute.sql).
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ── Validate against existing rows, without ever failing the migration ──
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('transactions', 'transactions_amount_max_chk'),
      ('transactions', 'transactions_category_format_chk'),
      ('transactions', 'transactions_note_length_chk'),
      ('transactions', 'transactions_date_range_chk'),
      ('profiles',     'profiles_income_nonneg_chk'),
      ('profiles',     'profiles_savings_goal_nonneg_chk'),
      ('profiles',     'profiles_username_length_chk'),
      ('profiles',     'profiles_budgets_valid_chk')
    ) as v(tbl, name)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation then
      raise warning
        'constraint %.% is still NOT VALID: existing rows violate it. New writes are checked. Fix those rows, then run: alter table public.% validate constraint %;',
        c.tbl, c.name, c.tbl, c.name;
    end;
  end loop;
end
$$;
