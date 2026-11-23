# Tests

```bash
npm test
```

589 tests, no test framework installed. Node 22's built-in runner (`node:test`)
and its TypeScript support (`--experimental-strip-types`) do the work, so
there is nothing in `package.json` to install, update or have break.

`register.mjs` / `ts-resolve.mjs` exist for one reason: the app writes
`import { cat } from "./format"` without a file extension, which is what the
bundler expects but not what Node's ESM resolver accepts. The hook appends
`.ts` so tests can import app code exactly as the app does.

## What is covered

| File | Covers |
|---|---|
| `derive.test.ts` | The month's money maths — income, spending, savings, budget, mood |
| `insights.test.ts` | Streak, week strip, achievements, XP and levels |
| `date.test.ts` | Dates and confidence returned by the receipt scanner |
| `sanitize.test.ts` | Prompt-injection defences on untrusted text |
| `password.test.ts` | Password policy and display-name rules |
| `auth.test.ts` | Caller authentication for Edge Functions: missing, malformed, rejected and anonymous tokens; Auth-server outage fails closed |
| `scan-receipt.test.ts` | The receipt scanner handler end to end, with fake Auth and Gemini: authentication, malformed payloads, size limits, invalid amounts/dates from the model, and that no failure leaks internals |
| `validate.test.ts` | Category lists, base64 and image-signature checks, money amounts, bounded request-body reading |
| `errors.test.ts` | Safe user-facing error messages for database and Edge Function failures |
| `oauth-url.test.ts` | OAuth redirect matching and callback parsing |
| `repo-hygiene.test.ts` | Secrets and key patterns, `EXPO_PUBLIC_` allow-list, untracked CLI state, every Edge Function authenticates and sets `verify_jwt` |

Kapy (`kapy-*.test.ts`) — the assistant's engine. The model is replaced by a
*scripted* one that can be told to lie, so each way an LLM can go wrong is
reproduced exactly:

| File | Covers |
|---|---|
| `kapy-money`, `kapy-period` | Exact money in whole sen; Malaysian-time periods, month and week boundaries, leap years |
| `kapy-finance` | Every figure Kapy can state, against a ledger worked out by hand; agrees with the app's own `deriveTotals` |
| `kapy-store` | Data reads: pagination past the API's 1,000-row cap, minimum columns, row-level security, failures that never quote data |
| `kapy-language`, `kapy-intent`, `kapy-context` | Spelling normalisation, language style, intent/period/category/amount extraction, follow-ups and what "that" refers to |
| `kapy-eval` | The labelled Malay / English / Manglish datasets as regression thresholds (see `evals/kapy/README.md` for what those numbers do and do not mean) |
| `kapy-tools`, `kapy-executor` | Strict validation of every tool argument; tools run against the caller's own data only; proposing writes nothing |
| `kapy-actions` | Confirming a transaction: validation, ownership, duplicate and concurrent confirmations save once, answers come from the stored row |
| `kapy-gemini` | Timeouts, safe retries with backoff, blocked and empty replies, no key in URLs |
| `kapy-grounding`, `kapy-render` | Catching invented figures and false "saved" claims; the server's own fallback text |
| `kapy-orchestrator` | A whole turn with a misbehaving model: invented figures, false claims, tool floods, endless loops, prompt injection, outages, hangs |
| `kapy-handler` | The HTTP surface: tokens, cross-user access, duplicates, limits, quotas, error mapping, and that logs hold no personal content |
| `kapy-ratelimit`, `kapy-telemetry` | Quota behaviour and failure policy; metrics that cannot carry personal content |
| `kapy-knowledge`, `kapy-prompt` | The knowledge base contains no invented rate, amount or policy; the prompt carries the clock and the rules |
| `kapy-chat`, `kapy-live-eval` | The app's reading of server responses and the confirmation card's life cycle; the live-evaluation script's own scoring |

## What is not covered, and why

These are unit tests over pure functions. There are no component or navigation
tests: those need a renderer and a much larger dependency set, and the value
here is in the logic that decides people's numbers, not in whether a `View`
renders.

The SQL in `supabase/migrations/` cannot run under `npm test`. It was verified against a real
Postgres 16 — including legacy data that breaks the new rules, concurrent quota use, and
the official Supabase CLI — and the results are in the Phase 1 and Phase 2 reports.

Anything touching Supabase is also out of scope — those paths are exercised
against the real project rather than a mock, because a mock of a database
mostly tests the mock.

## Why these functions

Each one either has been wrong before, or would fail silently if it were:

- **`deriveTotals`** was wrong once. Income and savings transfers were ignored,
  so logging a salary changed nothing on screen and only spending moved the
  balance. Nothing crashed; the numbers were just wrong.
- **`streak` / `weekActivity`** are date arithmetic, which fails at boundaries
  nobody tests by hand — Sunday, month ends, leap days.
- **`validateDateString`** guards data a language model read off a photograph.
- **`sanitizeText`** is a security control. Two bugs were introduced while
  writing it by tooling collapsing escape sequences, one of which turned a
  pattern into a match for the letter "s".
- **`authenticate`** exists because `verify_jwt` alone accepts the project's
  anon key, which ships in every copy of the app. The tests include exactly that
  case: a validly signed token that belongs to no user.
- **`repo-hygiene.test.ts`** turns mistakes this project actually made (a Gemini
  key behind an `EXPO_PUBLIC_` variable, CLI state in Git) into failing tests.

Not covered here: the SQL constraints in `supabase/migrations/`. They need a real
Postgres, so they were verified against one by hand (see
`docs/TABARA_2.0_PHASE1_SECURITY_REPORT.md`), not by `npm test`.
