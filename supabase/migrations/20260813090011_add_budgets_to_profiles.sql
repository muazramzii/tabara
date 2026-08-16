-- Per-category monthly spending limits, set on the Budgets screen.
-- Shape: {"food": 300, "transport": 150, ...} keyed by category id.
-- Stored as jsonb rather than its own table because it's a small, whole-object
-- edit every time — the screen saves all categories at once.
alter table public.profiles
  add column if not exists budgets jsonb not null default '{}'::jsonb;
