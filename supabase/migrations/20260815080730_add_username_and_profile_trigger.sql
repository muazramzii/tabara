-- Display name shown in the app ("Hello, Muaz!"). Deliberately NOT unique:
-- it identifies the user to themselves, not to other people, and there is no
-- social surface in Tabara where two identical names could collide.
alter table public.profiles
  add column if not exists username text;

-- Create the profile row when the account is created, rather than after the
-- first login. This matters because with email confirmation enabled there is
-- no session at signup, so the client cannot insert the row itself — RLS
-- would reject it. The trigger runs as definer, so it can.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, income, savings_goal, budgets, updated_at)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    0,
    0,
    '{}'::jsonb,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
