-- Social providers don't send a "username" — that field only exists because
-- our own signup form puts it there. Google and Facebook supply the display
-- name as full_name / name / given_name depending on the provider, so fall
-- back through those before giving up and leaving it null (which makes the
-- app show the email prefix).
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

  insert into public.profiles (id, username, income, savings_goal, budgets, updated_at)
  values (new.id, chosen_name, 0, 0, '{}'::jsonb, now())
  on conflict (id) do nothing;

  return new;
end;
$$;
