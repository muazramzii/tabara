# Database migrations

The full schema, in the order it was applied. A clone of this repo plus a fresh
Supabase project is enough to stand the whole backend up — nothing lives only
in the dashboard.

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

To check local and remote agree:

```bash
npx supabase migration list --linked
```

## What is here

| Migration | What it does |
|---|---|
| `..._init_profiles_and_transactions` | Both tables, RLS policies, the index, realtime |
| `..._add_budgets_to_profiles` | Per-category limits as jsonb |
| `..._temp_upsert_semantics_probe` | Throwaway table (see below) |
| `..._drop_probe_and_optimise_rls` | Drops it; rewrites policies as `(select auth.uid())` |
| `..._add_username_and_profile_trigger` | Display name, and the trigger that creates a profile at signup |
| `..._handle_new_user_oauth_names` | Falls back to `full_name` / `name` for Google and Facebook |
| `..._restrict_handle_new_user_execute` | Revokes the RPC grant PostgREST had exposed |

## The probe migration

`_upsert_probe` was a real table, created to check whether a PostgREST upsert
that omits some columns preserves them or nulls them out. The answer decided
whether `saveUserProfile` could wipe someone's budgets. It was dropped in the
very next migration.

It stays in the history because the migration is recorded on the remote
database. Deleting the file would put local and remote out of step, and
`migration list` would start reporting drift.

## Not covered here

Edge Functions live in `../functions/` and deploy separately:

```bash
npx supabase functions deploy kapy
npx supabase functions deploy scan-receipt
npx supabase functions deploy delete-account
```

Auth settings — providers, email confirmation, SMTP, redirect URLs — are
dashboard configuration and are not captured by migrations. A fresh project
needs them set up by hand.
