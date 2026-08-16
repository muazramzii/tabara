# Tabara 🦫

A personal finance app for young Malaysians, built around a capybara called
Kapy who reads your receipts, answers questions about your spending, and
notices when you stop logging.

React Native (Expo) · TypeScript · Supabase · Google Gemini

---

## What it does

**Track money without a spreadsheet.** Log income and spending, set a monthly
savings goal and per-category budgets, and see where it went — with the
50/30/20 split applied to real numbers rather than a template.

**Scan a receipt instead of typing.** Photograph it and Gemini reads the total,
the merchant, the category and *the date printed on the receipt* — Malaysian
receipts are day-first, so `03/04/2026` is 3 April. If the photo is hard to
read, the app says which fields it couldn't get instead of pretending.

**Ask Kapy.** A chat assistant that knows your actual budget, speaks Malay,
English or rojak back to you, and can record a transaction when you say
"masukkan RM 50 ke tabung".

**Keep a streak.** A Mon–Sun strip showing which days you logged, achievements
that unlock from real usage, and a flame animation when the streak hits a new
high. Kapy looks worried when today is still empty.

---

## Two design decisions worth explaining

### Nothing derived is ever stored

Streaks, achievements, XP, levels, alerts, the balance — none of it is written
to the database. All of it is computed from your transactions on every render.

The usual approach is a `streak_count` column updated on save. That works until
one write fails, or a transaction is deleted, or two devices sync — and then
the number on screen disagrees with the data behind it, permanently, with no
way to tell which is right.

Deriving costs a few milliseconds and makes that class of bug impossible.
`src/lib/insights.ts` and `src/lib/derive.ts` are pure functions over the
transaction list, which is also why they are straightforward to test.

### The AI is never an authorisation boundary

The Gemini key lives in a Supabase secret and never ships in the app bundle —
anyone can unzip an APK. Every AI call goes through an Edge Function that
verifies the caller's JWT first.

Authorisation happens in Postgres via row-level security **before** the model
sees anything, so Kapy can only ever work with data that already belongs to the
caller. The model cannot write SQL; it can only call one narrowly-typed tool,
whose every argument is re-validated server-side.

Text read off a photographed receipt is treated as hostile — a merchant name is
sanitised, length-capped and fenced inside a labelled block, because that string
reaches a model holding a tool that can write to the database.
See `supabase/functions/_shared/sanitize.ts`.

---

## Running it

Requires Node 22+, a Supabase project, and a Gemini API key.

```bash
npm install
```

Create `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

The anon key is safe to ship — RLS is what protects the data. The Gemini key is
**not** in `.env`; it belongs in a Supabase secret.

Set up the backend:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase secrets set GEMINI_API_KEY=<your-key>
npx supabase functions deploy kapy
npx supabase functions deploy scan-receipt
npx supabase functions deploy delete-account
```

Then run the app:

```bash
npx expo start
```

Google and Facebook sign-in need a development build rather than Expo Go, since
the OAuth redirect has to return to the app's own URL scheme:

```bash
npx expo run:android
```

---

## Tests

```bash
npm test
```

60 tests, no test framework installed — Node 22's built-in runner and its
TypeScript support do the work. Coverage is aimed at logic that has been wrong
before or would fail silently: the month's money maths, streak date arithmetic,
receipt date validation, and the prompt-injection defences.

See [`tests/README.md`](tests/README.md).

---

## Layout

```
src/
  app/            Screens (expo-router, file-based)
    (auth)/       Welcome, login, signup, password reset
    (tabs)/       Home, Add, History, Insights, Kapy
  components/ui/  Shared UI
  lib/            Data layer, auth, derived state, AI client
  constants/      Theme tokens and categories
supabase/
  migrations/     Full schema — tables, RLS, triggers
  functions/      Edge Functions (Deno)
tests/            Unit tests over the pure logic
docs/             Privacy policy
```

---

## Notes

Built as a UTHM mini-project. Originally on Firebase, migrated to Supabase.

Not published to the Play Store. Doing so would need a real package name
(currently the Expo placeholder), a signing key, a published privacy policy URL,
and a verified sending domain so confirmation email reaches addresses other than
the developer's own.

The honest limitation of the app itself: it still depends on you remembering to
log. Receipt scanning and streaks reduce that friction; they don't remove it.
The most valuable thing to build next would be reading Malaysian bank
transaction notifications, turning "remember to log" into "confirm what we
noticed".
