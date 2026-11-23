# TABARA 2.0 — Phase 1: Security Hardening — Implementation Report

| | |
|---|---|
| **Branch** | `develop` (based on `origin/develop` = `dab0f83`, the `v1.0.0-baseline` commit) |
| **Date** | 2026-11-22 |
| **State** | Implemented and verified locally. **Not committed, not pushed, nothing deployed.** See "Git state". |
| **Tests** | 178 passing (baseline 61, all unchanged and still passing) |
| **Type checks** | `tsc --noEmit` 0 errors (baseline 0); `deno check` 0 errors on all four Edge Function entry points |

Nothing in this report has touched production. Every item under "Manual and production steps" is still to be done by the project owner.

**Confidence labels.** *Verified* = reproduced by a command run for this report. *Inferred* = follows from documented platform behaviour but was not exercised against the live Supabase project (no credentials were used). *Unverified* = could not be checked from the repository.

---

## 1. Summary

| # | Task | Result |
|---|---|---|
| 1 | Receipt scanner authentication | **Fixed in code, verified by tests.** The function now authenticates the caller itself instead of trusting `verify_jwt`. Not yet deployed. |
| 2 | API keys and secrets | **Audited.** No secret files were ever committed; no secret *values* are in `HEAD`. Two credentials need **manual rotation/restriction** (section 3). |
| 3 | Git tracking cleanup | **Done.** `supabase/.temp/` untracked (files kept on disk); `.gitignore` hardened; `.env.example` added. |
| 4 | OAuth PKCE | **Implemented** (`flowType: "pkce"`, strict redirect check, tokens in URLs refused). Uses the `plain` challenge on React Native — see limits. Needs a device test. |
| 5 | Supabase configuration | **Added `supabase/config.toml`** (functions only, deliberately). Dashboard settings to confirm are listed. |
| 6 | Database constraints | **New migration, verified on real Postgres 16** against legacy data that breaks the rules, and via the official Supabase CLI. Not applied to the hosted project. |
| 7 | Error handling | **Done** for the data layer, AI client, OAuth and the Edge Functions I touched. Some raw messages remain on the sign-in screens (section 8). |

---

## 2. Task 1 — Receipt scanner authentication

### The problem (audit S-01)
`scan-receipt` never checked who was calling; it relied on the platform's `verify_jwt`. That setting only verifies that a token is a validly signed JWT. The project's **anon key is such a token**, and it ships in every copy of the app (`EXPO_PUBLIC_SUPABASE_ANON_KEY`). So anyone who extracted it could post images to Gemini on the project's bill without an account. *(Inferred: not probed against the live project.)*

### What changed
- **`supabase/functions/_shared/auth.ts`** (new): `authenticate(req, getUser)`. It extracts a bearer token, checks it has the shape of a JWT (≤4096 chars), then asks the **Auth server** via `auth.getUser(token)`. The anon key, expired and revoked tokens, and tokens of deleted accounts are all rejected there. It fails closed.
- **`supabase/functions/scan-receipt/handler.ts`** (new): the request handler, written against injected dependencies so it is fully testable. **`index.ts`** is now a thin Deno wiring layer.
- **`_shared/http.ts`, `_shared/validate.ts`, `_shared/amount.ts`, `_shared/supabase-auth.ts`** (new): bounded body reader, input validators, money validator, and the real `getUser`.

### Order of checks (cheapest and most decisive first)
`method → authentication → server config → content-type → body size → JSON shape → image → category list → model call`.
An unauthenticated request never has its body read and never reaches the model (tested).

### Status codes
| Situation | Status | `code` |
|---|---|---|
| Missing `Authorization` | 401 (+ `WWW-Authenticate`) | `missing_token` |
| Malformed header / not a JWT | 401 | `malformed_token` |
| Rejected by Auth (anon key, expired, revoked, deleted user) | 401 | `invalid_token` |
| Auth server unreachable / 5xx | **503** (fails closed) | `auth_unavailable` |
| Anonymous session | 403 | `anonymous_not_allowed` |
| Not POST | 405 (+ `Allow`) | `method_not_allowed` |
| Model API key not configured | 503, generic text | `not_configured` |
| Not `application/json` | 415 | `unsupported_media_type` |
| Body or image too large | 413 | `payload_too_large` |
| Invalid JSON / UTF-8 / not an object | 400 | `invalid_body` |
| No image / not base64 / too small | 400 | `missing_image` / `invalid_image` |
| Not a JPEG, PNG, WebP or HEIC (checked by file signature, not the caller's claim) | 415 | `unsupported_image` |
| Unsafe category list | 400 | `invalid_categories` |
| Model call fails / unreadable output | 502 | `provider_failed` / `unreadable_result` |
| Model call exceeds 30 s | 504 | `timeout` |
| Anything unexpected | 500, generic text | `internal_error` |

### Limits applied
Image ≤ 6,000,000 base64 characters (unchanged); request body ≤ 6.1 MB, **counted on bytes actually received** (a missing or false `Content-Length` does not bypass it); base64 alphabet enforced (data-URLs, paths, text rejected); image format identified from its first bytes; category list ≤ 60 ids of `[a-z0-9_]{1,40}`; 30 s model timeout; model-returned amount must be 0 < x ≤ RM 10,000,000 and is rounded to sen.

### Responses never expose
The API key, the missing-secret name (previously the text said `GEMINI_API_KEY is missing`), provider error text, stack traces or exception messages — each asserted by a test.

### Deployment configuration — additional authentication risks found
1. **`verify_jwt` is not recorded anywhere in the repo** and can be switched off per function in the dashboard. If it was ever off, `scan-receipt` was fully public. *(Unverified — check the dashboard.)* Authentication in code makes this irrelevant for `scan-receipt`.
2. **A token outlives its user until it expires.** After `delete-account`, an unexpired access token still passes `verify_jwt`. `getUser` consults the Auth server, so it does not pass the new check. *(Inferred.)*
3. **Anonymous sign-ins**, if enabled in the dashboard, would let anyone mint accounts. The handler refuses anonymous sessions (403); the dashboard setting should also be off. *(Unverified.)*
4. **Open sign-up + no quota:** any registered account can still call the AI endpoints repeatedly. Not fixed here (audit K-01, Phase 2).
5. Cost: every call now makes one extra Auth round trip (`getUser`).
6. `kapy` and `delete-account` already authenticated in code and were **not** refactored onto the shared helper (kept the change small). A hygiene test now fails if any function lacks an authentication call.

### Changes to `kapy` (minimal)
- A missing model key now returns a generic 503 instead of naming the secret.
- The client-supplied `categories` list is validated (absent still means `["other"]`; present-but-unsafe is 400). Every category id the app really sends is covered by a test.

---

## 3. Task 2 — API keys and secrets

All output below was redacted; no secret value was printed or is recorded in this report.

### Findings
| Check | Result |
|---|---|
| Secret/credential **files** ever committed (any branch or tag): `.env*`, `*.pem`, `*.key`, keystores, `google-services`, service accounts | **None** |
| Key-shaped strings in `HEAD` (Google API keys, JWTs, `sb_secret_`, Supabase tokens, private keys, `sk-…`) | **None** |
| Key-shaped strings anywhere in history | **One credential, two commits:** a Google-style key in `src/lib/firebase.ts` (added `2d71e8b`, removed `c594751`, both 2026-08-13). It is the `apiKey` field of the old Firebase config. |
| Was a Gemini key exposed through a public Expo variable? | **Yes, in the code, but the value was never committed.** `src/lib/ai.ts` read `process.env.EXPO_PUBLIC_GEMINI_API_KEY` from `2d71e8b` until `c594751` (same day). Any build or web export produced from the app in that window **contains that key**. |
| Active Gemini key location | Server-side only: read via `Deno.env.get("GEMINI_API_KEY")` in `kapy` and `scan-receipt`. No `src/` code references it. |
| `.env` excluded from Git | Yes (and now `.env.*`, with `!.env.example`) |
| Only public variables in use | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (both safe to publish) |

### Credentials that require **manual** action (not performed — no rotation or revocation was done)
| Credential | Why | Action for the owner |
|---|---|---|
| **Gemini API key that was in `.env` as `EXPO_PUBLIC_GEMINI_API_KEY`** | Embedded in any build/export made between `2d71e8b` and `c594751`, and recoverable from it. | Create a new key in Google AI Studio, `npx supabase secrets set GEMINI_API_KEY=<new>`, then delete the old key. **Mandatory if the old key is still the one in use, or if any such build was shared.** *(Whether it was already rotated is Unverified.)* |
| **Old Firebase web API key** (`firebase.ts`, history) | Permanently in Git history. Firebase web keys are designed to be public, but an unrestricted one on an abandoned project can still be abused. | In Google Cloud Console, restrict the key or delete it; if the Firebase project is no longer needed, delete the project. |

History was **not** rewritten (rule). The key therefore remains retrievable from old commits, which is why rotation — not removal — is the fix.

### Guards added
`tests/repo-hygiene.test.ts` fails if: an env/credential file is tracked; any key-shaped string appears in a tracked file; any `EXPO_PUBLIC_*` variable other than the two Supabase ones appears; `src/` references `GEMINI_API_KEY` or `service_role` in code; CLI state is tracked.

---

## 4. Task 3 — Git tracking cleanup

- **`supabase/.temp/`** had 8 tracked files: `project-ref`, `linked-project.json` (project reference, name, organisation id), `pooler-url`, and component versions. Committed in `2d71e8b`, before the ignore rule existed. All are `supabase link` output, regenerated per developer, and **nothing in the repo uses them**.
- Removed from the index with `git rm --cached` — **files remain on disk**.
- `.gitignore`: kept `supabase/.temp/`; added `supabase/.branches/`, `supabase/.env*`, `supabase/functions/.env*`; broadened `.env` to `.env.*` with `!.env.example`; added `*.keystore` and service-account JSON patterns. (`google-services.json` was deliberately **not** ignored: it can be legitimately required for builds.)
- **`.env.example`** added: placeholders only, with a note that `EXPO_PUBLIC_*` values are public.
- These identifiers (project ref/name/org id) are **not credentials**, but they remain in Git history. Not rewritten.

---

## 5. Task 4 — OAuth PKCE

### Review of the existing flow
Google/Facebook sign-in opened the system browser and read the result from `tabara://auth-callback`. With supabase-js's default **implicit** flow, that URL carried live `access_token` and `refresh_token`, which `oauth.ts` passed straight to `setSession`. Any other Android app that registers the same custom scheme could receive them. Also, on Android `expo-web-browser` accepts **any** URL that merely *starts with* the redirect URL (`url.startsWith(redirectUrl)`, read from the installed v56.0.5 source), and the old code displayed the provider's raw `error_description`.

### What changed
- `src/lib/supabase.ts`: `flowType: "pkce"`. The browser now returns a one-time `code`; it cannot be exchanged without a verifier stored in this app's AsyncStorage beforehand.
- `src/lib/oauth-url.ts` (new, tested): `matchesRedirect` (exact scheme+host+path match, ignoring only query/fragment/trailing slash/scheme case), `parseAuthCallback` (never returns token values; code must match a strict shape), `isUserCancellation`.
- `src/lib/oauth.ts`: refuses callbacks to other URLs; **never accepts tokens from a URL** (`setSession` path removed); exchanges only a validated code; shows generic messages (provider text and exchange errors are logged in development only); `access_denied` is treated as a cancellation, not a failure.
- **Preserved:** the account chooser (`prompt: "select_account"`), `skipBrowserRedirect`, cancellation handling, the return type. **Existing sessions** use the same storage key and format — the key comes from the client's `storageKey` option, not from `flowType` — so signed-in users should stay signed in *(Inferred from reading the `auth-js` source; not exercised on a device, so confirm in the smoke test)*.

### Limits — read this
- **Challenge method is `plain`, not S256.** React Native has no `crypto.subtle`; `auth-js` 2.112.3 then logs *"WebCrypto API is not supported. Code challenge method will default to use plain"* and sends the verifier as the challenge (verified in `node_modules/@supabase/auth-js/dist/main/lib/helpers.js`). That is still strictly stronger than implicit — an intercepted code is useless without the verifier — but S256 is the goal. It needs a WebCrypto polyfill (e.g. an Expo crypto package), i.e. **a new dependency**, so it was left for review. You will see that warning in the dev console.
- `flowType` is client-wide, so it also changes email sign-up and password-reset requests (they now include a code challenge). The app's reset flow uses the 6-digit OTP (`verifyOtp`), which should be unaffected — **Unverified; test it** (section 9).
- **Docs:** `AGENTS.md` asks for the Expo SDK 56 docs. `docs.expo.dev` is not reachable from this environment (DNS denied), so they were not read. Nothing here uses a new Expo API; behaviour was checked against the installed `expo-web-browser` 56.0.5 and `auth-js` 2.112.3 source instead.

---

## 6. Task 5 — Supabase configuration

`supabase/config.toml` did not exist. It was added with **only what the repository can state with certainty**:

```toml
project_id = "tabara"          # local-dev container name only; not the hosted project ref
[functions.kapy]            verify_jwt = true
[functions.scan-receipt]    verify_jwt = true
[functions.delete-account]  verify_jwt = true
```

- **No identifiers or credentials were invented.** The hosted project is linked per machine with `supabase link` (writes the now-ignored `.temp/`).
- `true` is what `supabase functions deploy` already defaults to, so **deployed behaviour is unchanged**; it is now explicit and reviewable.
- **No `[auth]` or `[api]` sections, on purpose.** `supabase config push` applies every section to the hosted project; a partial `[auth]` block could overwrite live dashboard settings. A test enforces that only `[functions.*]` sections exist. The README warns not to run `config push`.
- **Verified with the official CLI (v3.2.0):** it parses the file without error and `db push --dry-run` lists all 8 migrations in order.
- A related fact from the generated default config: Supabase's API `max_rows` defaults to **1000** (audit TD-07: `fetchTransactions` has no pagination). Not changed here.
- *Local-dev note:* `supabase start` was not run (needs Docker).

**Dashboard settings that cannot be set from the repo** — see section 9.

---

## 7. Task 6 — Database constraints

New migration: `supabase/migrations/20261122100000_add_data_integrity_constraints.sql`. No existing migration was edited.

### Already enforced (unchanged)
`amount > 0`; `type in ('expense','income')`; `NOT NULL` on `user_id, amount, type, category, date`; `user_id → auth.users ON DELETE CASCADE`; RLS `using` + `with check` on both tables (so a user cannot insert for, re-assign to, read or update another user).

### Added
| Table | Constraint | Rule |
|---|---|---|
| transactions | `transactions_amount_max_chk` | `amount <= 10,000,000` (matches `MAX_AMOUNT` in the functions) |
| transactions | `transactions_category_format_chk` | `category ~ '^[a-z0-9_]{1,40}$'` — **shape only, not an enum**: categories live in the app by design |
| transactions | `transactions_note_length_chk` | `note` null or ≤ 500 chars |
| transactions | `transactions_date_range_chk` | `2000-01-01 ≤ date < 2100-01-01` (not relative to `now()`: a time-dependent CHECK can fail a restore) |
| profiles | `profiles_income_nonneg_chk`, `profiles_savings_goal_nonneg_chk` | `≥ 0` |
| profiles | `profiles_username_length_chk` | null or 1–100 chars |
| profiles | `profiles_budgets_valid_chk` | `budgets` is an object ≤ 4 KB, values numeric in 0…10,000,000, keys ≤ 40 chars (helper `public.budgets_are_valid`) |

### A problem found and fixed along the way
`handle_new_user()` copies the Google/Facebook display name into `profiles.username`. A username limit alone would make that trigger fail for a long provider name and **break sign-up for those users** — reproduced (below). The migration redefines the function to truncate to 100 characters; otherwise it is identical to the previous version and keeps `SECURITY DEFINER`, the fixed `search_path`, and the revoked `EXECUTE` grants.

### Migration safety — evidence (real PostgreSQL 16.15, Supabase's `auth` schema stubbed)
| Test | Result |
|---|---|
| Apply the 7 existing migrations | clean |
| Seed legacy data including rows that break 6 of the 8 new rules (amount RM 20M; category `Food & Drink`; 1000-char note; year-1999 date; negative income; negative budget) | seeded |
| **Apply the new migration on top** | **succeeds (exit 0)**; 6 constraints stay `NOT VALID` with a `WARNING` naming each; 2 clean ones validate |
| Checksum of all rows before vs after | **identical** — no row modified or removed |
| 28 write scenarios as the `authenticated` role under RLS (valid values, boundary values, each rule broken, injected category text, nulls, overflow) | **28/28 as expected** |
| Ownership: insert as another user; re-assign own row; read/update another user's rows | all blocked; unchanged |
| Long (500-char) Google name; whitespace-only name; normal name | sign-up succeeds; stored as 100 chars / `null` / unchanged |
| **Control:** the username constraint *without* the trigger fix | **sign-up fails** (proves the fix is needed) |
| Apply the migration twice | idempotent (exit 0) |
| Empty database, all 8 migrations | **8 of 8 validated, 0 warnings** |
| RLS enabled, 2 policies, Realtime publication, `EXECUTE` revoked from `anon`/`authenticated` | intact |
| Official CLI: `db push --dry-run`, then a real `db push` to a throwaway database | lists and applies all 8 in order; 8 migrations recorded |

The scratch Postgres and scripts were outside the repo and have been removed. These checks are **not** part of `npm test` (they need a real database); the steps are reproducible from the table.

### Decisions that need your approval
- The **RM 10,000,000** per-transaction cap, the **500-char** note limit, the **100-char** username limit and the **2000–2100** date window are my choices, set generously. Change them before applying if you disagree.
- Because of `NOT VALID`, **legacy rows that break a rule are tolerated, not fixed.** Run the read-only check in section 9 to see whether you have any.

---

## 8. Task 7 — Error handling

### Problems found
1. **Edge Function messages were lost.** Functions answer failures with a non-2xx status and `{ error }`, but supabase-js throws `FunctionsHttpError` for any non-2xx (message: "Edge Function returned a non-2xx status code") and keeps the real response in `error.context`. `ai.ts` expected the message in `data`, so "Your session expired" / "That image is too large" never reached users. *(Verified in the installed `@supabase/functions-js` 2.112.3 source — `FunctionsClient.js` throws it when `!response.ok`, and its own docs say to read `error.context.json()`. Not observed on a device.)*
2. **Database errors reached the screen raw** (`e.message` shown in alerts across the app). Postgres errors include constraint names and, in `details`, the failing row's values — reproduced in the migration test (the failing row of a rejected sign-up is printed in full).
3. OAuth showed the provider's raw `error_description` and Supabase configuration hints.
4. Two functions told any caller which secret was missing.

### What changed
- **`src/lib/errors.ts`** (new): `toSafeError` (database/network errors), `toSafeFunctionError` (reads the function's real message from `error.context`, clones the response, accepts only a short single-line `error` string), `messageForStatus`, `safeServerMessage`. **A message is only ever chosen by this file or by our own functions; an unrecognised error becomes a generic one and its text is never passed through.** The original error is kept as `cause` for debugging.
- **`src/lib/db.ts`**: every `throw error` now goes through `toSafeError`; `deleteAccount` and the realtime `onError` too.
- **`src/lib/ai.ts`**: `callFunction` uses `toSafeFunctionError`.
- **`src/lib/oauth.ts`**: see section 5.
- **Edge Functions**: `scan-receipt` returns `{ error, code }` with generic text (section 2); `kapy` no longer names a secret.
- **UI behaviour is preserved:** screens still show `e.message` in the same alerts; the messages are now safe and, for known cases, more helpful. No screen file was modified.

### Remaining raw-message sites (not changed)
Sign-in, sign-up, forgot-password and reset-password screens, and the `profile.tsx` name update, still show Supabase **Auth** messages (e.g. "Invalid login credentials"). Those are written for end users, so they were left to avoid changing sign-in behaviour I could not test live. A network failure there would show the library's own text. *(Low risk; candidate for Phase 2.)*

---

## 9. Manual and production steps (all still to do)

**Needs production approval** — each of these changes the live system:
1. Apply the migration to the hosted database.
2. Deploy `scan-receipt` and `kapy`.
3. Rotate the Gemini key / restrict the old Firebase key.
4. Ship an app build containing PKCE.

### Suggested order
1. **Review and merge** this work (it is on the local `develop` branch, uncommitted).
2. **Dashboard checks** (read-only, none can be verified from the repo):
   - *Authentication → Sign In / Providers:* **Allow anonymous sign-ins** is **off**.
   - *Authentication → URL Configuration → Redirect URLs:* contains exactly `tabara://auth-callback`; **no wildcards**; development `exp://…/--/auth-callback` entries only while developing, removed afterwards.
   - *Authentication → Email Templates:* the password-reset template contains `{{ .Token }}` (the app uses the 6-digit code).
   - *Edge Functions:* **Verify JWT** is on for all three (now also in `config.toml`).
   - *Project Settings → API:* note `max_rows` (default 1000).
   - Google and Facebook provider credentials still configured; confirm which Gemini plan tier the key is on (the privacy policy relies on Gemini API data terms).
3. **Rotate credentials** (section 3). Set the new secret before deleting the old key: `npx supabase secrets set GEMINI_API_KEY=<new key>`.
4. **Read-only pre-check for legacy rows** (run in the SQL editor; every count should be 0):
   ```sql
   select 'transactions: amount > 10M'      as rule, count(*) from public.transactions where amount > 10000000
   union all select 'transactions: category shape',  count(*) from public.transactions where category !~ '^[a-z0-9_]{1,40}$'
   union all select 'transactions: note > 500',      count(*) from public.transactions where char_length(note) > 500
   union all select 'transactions: date out of range', count(*) from public.transactions
                where date < timestamptz '2000-01-01 00:00:00+00' or date >= timestamptz '2100-01-01 00:00:00+00'
   union all select 'profiles: negative income/goal', count(*) from public.profiles where income < 0 or savings_goal < 0
   union all select 'profiles: username length',     count(*) from public.profiles where username is not null and char_length(username) not between 1 and 100;
   ```
   A non-zero count is not a blocker — the migration tolerates it — but those constraints will stay `NOT VALID` until the rows are fixed.
5. **Apply the migration:** `npx supabase db push`. Afterwards confirm:
   `select conname, convalidated from pg_constraint where conname like '%\_chk' escape '\';`
6. **Deploy the functions:** `npx supabase functions deploy scan-receipt` and `... kapy`. Old app builds keep working: the request shape is unchanged.
7. **Ship the app build**, then run the smoke test below on a **development build** (not Expo Go) for Google/Facebook.

### Smoke test
Email sign-up → log in → forgot password (6-digit code) → reset → Google sign-in (account chooser appears) → Facebook sign-in → cancel out of the browser (no error alert) → add a transaction → scan a receipt → Kapy chat and "record RM15 makan" → set budgets → delete a transaction → force-quit and reopen (still signed in) → delete account.
If email sign-up/reset misbehave under PKCE, revert only `flowType` in `src/lib/supabase.ts`; the redirect/URL checks and everything else are independent of it — **but** with `implicit` restored, `oauth.ts` (which now accepts only a `code`) would reject sign-in, so revert `oauth.ts` with it.

---

## 10. Files changed

**Added (18):** `.env.example`; `docs/TABARA_2.0_PHASE1_SECURITY_REPORT.md`; `src/lib/errors.ts`; `src/lib/oauth-url.ts`; `supabase/config.toml`; `supabase/functions/_shared/{amount,auth,http,supabase-auth,validate}.ts`; `supabase/functions/scan-receipt/handler.ts`; `supabase/migrations/20261122100000_add_data_integrity_constraints.sql`; `tests/{auth,errors,oauth-url,repo-hygiene,scan-receipt,validate}.test.ts`.

**Modified (10):** `.gitignore`; `README.md`; `package.json` (adds the `typecheck` script only — **no dependency changes**); `src/lib/{ai,db,oauth,supabase}.ts`; `supabase/functions/kapy/index.ts`; `supabase/functions/scan-receipt/index.ts`; `tests/README.md`.

**Untracked from Git, kept on disk (8):** `supabase/.temp/*`.

**Not touched:** every screen and component, all existing migrations, all existing tests, `delete-account`, `package-lock.json`, `app.json`, `main`, the `v1.0.0-baseline` tag.

---

## 11. Tests

| File | Tests | Covers |
|---|---|---|
| `auth.test.ts` | 11 | Bearer parsing; missing, malformed, rejected, anonymous tokens; Auth outage fails closed |
| `scan-receipt.test.ts` | 38 | Full handler: success; missing/invalid/expired/anon-key tokens; body never read when unauthenticated; methods; config; content type; malformed JSON/UTF-8; size limits (declared, streamed, over-ceiling); bad base64; non-image bytes; spoofed MIME; unsafe categories; timeout; **no leakage** (API key, provider text, exception text); invalid amounts/dates/confidence from the model; injected merchant names |
| `validate.test.ts` | 19 | Category lists (incl. every id the app really ships), base64, image signatures, amounts, bounded body reading |
| `errors.test.ts` | 21 | Constraint → sentence mapping; row `details` never shown; network/JWT cases; real `FunctionsHttpError`/`FetchError`/`RelayError`; unknown errors never echoed |
| `oauth-url.test.ts` | 16 | Exact redirect matching (incl. the Android prefix-match gap); token-bearing URLs; hostile codes; provider text dropped |
| `repo-hygiene.test.ts` | 12 | Secrets, public-variable allow-list, tracked CLI state, every function authenticates and sets `verify_jwt`, `config.toml` scope, service-role isolation, migration ordering |
| **New** | **117** | |
| Existing (unchanged) | 61 | `date`, `derive`, `insights`, `password`, `sanitize` |
| **Total** | **178 — 178 pass, 0 fail, 0 skipped** | |

### Do the tests actually catch regressions? (mutation checks, then restored)
| Deliberate breakage | Result |
|---|---|
| Remove the authentication check from the scanner | **6 tests fail** |
| Redirect match → `startsWith` (what Android's module does) | **2 fail** |
| Pass unknown error text through to the user | **2 fail** |
| Add a Gemini `EXPO_PUBLIC_` variable, a key-shaped string, and an unauthenticated function with no `verify_jwt` entry | **5 fail**; a file placed under ignored `supabase/.temp/` is correctly **not** flagged |

### Commands run
```
npm test                       178 pass / 0 fail
npm run typecheck              0 errors (baseline before changes: 0)
deno check <each entry point>  0 errors (scan-receipt index+handler, kapy, delete-account)
npm audit --package-lock-only  not re-run (no dependency changes)
```
`expo lint` was **not run**: with no ESLint config present, the installed CLI (`ESlintPrerequisite.js`) installs `eslint@^9` and `eslint-config-expo` as devDependencies and writes `eslint.config.js` automatically, even non-interactively — a dependency change that needs your decision. A `typecheck` script was added instead.

---

## 12. Remaining risks and unresolved items

**Needs action (security)**
- **Gemini key rotation and old Firebase key** (section 3) — the one item that cannot be fixed in code.
- **The fixes are not live** until the functions are deployed and the migration applied. Until then audit S-01 remains exploitable on the deployed system *(Inferred)*.
- **Anonymous sign-ins / `verify_jwt` / redirect allow-list** are dashboard settings I could not inspect.

**Accepted limitations**
- PKCE uses `plain`, not S256 (section 5).
- Firebase key and the `supabase/.temp` identifiers remain in Git history (history was not rewritten).
- `delete-account` was not changed; it still has no recent-login requirement (a stolen session token could delete the account).
- CORS is `*` on all functions (requires a bearer token; acceptable for a native app).
- Sign-in screens still show Supabase Auth messages (section 8).

**Out of scope here — Phase 2 and later** (audit IDs): no per-user rate limit or quota, so any registered account can still spend model budget (K-01); Kapy can write duplicate or unreported transactions and has no confirmation step (K-02, K-03, K-05); no Gemini timeout/retry/finish-reason handling in `kapy` (K-04); Kapy's context is client-supplied and thin (K-06); prompt-injection defences are still unproven against the model itself (K-07); no token/latency telemetry (K-09); `fetchTransactions` unpaginated against the 1000-row API cap (TD-07); 30 `npm audit` advisories, mostly Expo build tooling (S-08); no CI and no ESLint.

**Not verifiable here**
- Live behaviour of anything against the hosted project.
- The Android/iOS OAuth round trip (needs a device).
- Whether `docs.expo.dev` content would change any conclusion above (unreachable from this environment).

---

## 13. Git state

Work is on the local `develop` branch, **uncommitted**. The plan was to commit under the repository owner's configured Git identity with no AI attribution. The identity configured in this environment is not the owner's, so no commit was made rather than attribute the work incorrectly. Once an identity is configured, the work splits cleanly into reviewable commits, for example: (1) scanner authentication + shared helpers + tests, (2) repository hygiene (`.gitignore`, `.env.example`, untrack `.temp`, `config.toml`, hygiene tests), (3) OAuth PKCE, (4) safe error handling, (5) database migration, (6) docs.

`main` and the `v1.0.0-baseline` tag were not modified.
