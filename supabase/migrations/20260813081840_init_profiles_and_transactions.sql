-- Tabara schema.
-- Replaces the old Firestore layout:
--   users/{uid}                    -> public.profiles
--   users/{uid}/transactions/{id}  -> public.transactions

-- ── Profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  income        numeric(12, 2) not null default 0,
  savings_goal  numeric(12, 2) not null default 0,
  updated_at    timestamptz    not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Transactions ─────────────────────────────────────────────
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid           not null references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  type       text           not null check (type in ('expense', 'income')),
  category   text           not null default 'other',
  note       text,
  date       timestamptz    not null default now(),
  created_at timestamptz    not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

alter table public.transactions enable row level security;

drop policy if exists "transactions are self-service" on public.transactions;
create policy "transactions are self-service"
  on public.transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Realtime ─────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception
  when duplicate_object then null;
end $$;
