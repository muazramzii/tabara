# TABARA 2.0 — Phase 2: Kapy AI Reliability & Intelligence Engine

Branch: `develop` (baseline `v1.0.0-baseline`, commit `dab0f83`). `main` was not touched.
Status: **implemented and verified locally; not yet committed** (see section 16).

Verification at the time of writing: `npm test` 589 passed / 0 failed, `npm run typecheck`
0 errors, `deno check` clean on the five Edge Function entry points, all 9 migrations
applied by the Supabase CLI to a throwaway Postgres 16.

---

## 1. Architecture assessment (before)

| Area | Finding |
|---|---|
| Numbers | The app built a text "financial summary" on the phone and sent it with every chat message. Gemini did the arithmetic. The server never saw real data, so it could neither verify nor correct a figure. |
| Recording | The model could emit an action that the client saved directly. No confirmation, no idempotency: a retry or double tap saved twice, and the reply could say "saved" before (or without) a save. |
| History | Up to ~84k characters of history were accepted and forwarded. |
| Model client | No timeout, no retry, every non-2xx treated alike, finish reason ignored, no token accounting. |
| Limits | None per user. |
| Observability | `console.log` of whatever was convenient. |
| Language | Entirely left to the model. No measurement of Malay / Manglish handling. |
| Tests | Nothing for Kapy. |

## 2. Problems found

1. Figures in replies could not be trusted: model-computed, unverified.
2. Client-built summary could be stale, partial, or tampered with.
3. A "saved" claim was not tied to a database result.
4. Duplicate transactions were possible (double tap, retry, replay).
5. Unbounded cost and latency (history size, no timeout, no per-user quota).
6. Transient Gemini errors surfaced as hard failures; blocked/empty replies looked like normal text.
7. Free-text notes and receipt text could carry instructions into the model.
8. No evidence for any claim about Malay/Manglish understanding.
9. PostgREST silently caps responses at 1000 rows, which would make a "total" wrong for a heavy user if not paginated.

## 3. Features added

- **Real financial context, server-side.** Reads the caller's own rows through a client bound to their JWT (RLS applies), paginated, with a `truncated` flag.
- **Deterministic calculations in whole sen**: summary, category spending, period comparison, monthly trend, budget status, savings affordability/projection. Malaysia time (UTC+8), half-open intervals, Monday–Sunday weeks. Definitions mirror `src/lib/derive.ts`.
- **Nine bounded tools** the model may call (read-only plus `propose_transaction`). No tool accepts a user id.
- **Grounding check**: every RM and % figure in a reply must come from a tool result or the user's own message; one repair attempt, then a server-written fallback.
- **False-"saved" detector** with negation handling.
- **Propose → confirm** transaction flow with an idempotency key.
- **Conversation context** (`KapyContext`): follow-ups, "that", "yang tadi", "bulan tu"; strictly validated, expires after 30 min / 12 turns, holds no amounts or text.
- **Message analyser** (language style, 18 intents, period, category, amount, follow-up flag) used as a *hint*; Gemini remains the decider.
- **Curated bilingual knowledge base**: 15 entries, no rates, amounts or policy figures other than the 50/30/20 rule; official pointers are bare homepages; every entry marked `review: "unreviewed"`.
- **Personality / prompt**: Kapy's voice, Malaysia clock, language mirroring, untrusted-content rules, advice limits.
- **Per-user quotas** (chat, confirm, receipt scan) enforced in the database.
- **Telemetry**: one JSON line per request, counts and enums only.
- **Client UI**: confirmation card with pending / saving / saved / already-saved / failed / cancelled / replaced states.

## 4. Backend changes

New pure modules under `supabase/functions/_shared/kapy/` (≈4.8k lines incl. handler): `money`, `categories`, `period`, `finance`, `store`, `language`, `intent`, `context`, `knowledge`, `tools`, `executor`, `actions`, `gemini`, `grounding`, `ratelimit`, `render`, `prompt`, `orchestrator`, `telemetry`.

- `kapy/handler.ts` (new): authentication by `auth.getUser(token)` (the anon key is a validly signed JWT and would pass `verify_jwt`), 64 KB body limit, `chat` and `confirm_transaction` actions, quota, error→status mapping.
- `kapy/index.ts`: now thin wiring only.
- `scan-receipt`: optional `quota` hook (429 / 503) wired to the same RPC.
- Gemini client policy: per-attempt timeout plus overall deadline; retry only 429/500/502/503/504/network/timeout with exponential backoff and jitter; short `Retry-After` honoured; never retry 400/401/403; safety blocks classified; token usage recorded. Key sent in a header, never a URL.
- Orchestrator limits: 5 rounds, 3 tool calls per round, 6 total, 12 history messages, 1500 chars/message, 8000 total, 1 repair, 45 s deadline, 10 s per tool.

## 5. Database changes

`supabase/migrations/20261122120000_kapy_idempotency_and_quota.sql`:

- `transactions.client_request_id uuid` plus partial unique index `(user_id, client_request_id) where client_request_id is not null`.
- `ai_usage` counters table: RLS on, no policies, all privileges revoked from `anon`/`authenticated`/`public`.
- `ai_consume(kind, window_seconds, max, offset_seconds)` — `SECURITY DEFINER`, `search_path=''`, user taken from `auth.uid()` (never an argument), atomic upsert capped by `where uses < p_max`, arguments validated including NULLs, deletes the caller's counters older than 2 days. Execute granted to `authenticated` only.

The Phase 1 integrity-constraints migration (`20261122100000`) is still uncommitted and must be applied first. Both are idempotent on re-apply (verified).

## 6. Frontend changes

- `src/lib/kapy-chat.ts` (new, pure): card/message state machine, parsing of server payloads, history trimming.
- `src/lib/ai.ts`: `askKapy(history, context)` and `confirmKapyTransaction(proposal)`; sends `protocol: 2`; no longer sends a summary or the category list; errors mapped to safe messages.
- `src/components/ui/proposal-card.tsx` (new) and `src/app/(tabs)/kapy.tsx`: card under the assistant message, double-tap guard, "Kapy is checking your numbers…" loading text. `buildSummary` removed.
- Legacy app builds (no `protocol: 2`) still get data-backed answers; recording is withheld and they are told to update.

## 7. AI architecture changes

```
app ──JWT──▶ handler ──▶ orchestrator ──▶ Gemini
              │  auth       │  tools (validated, bounded)
              │  quota      │  executor ─▶ finance ─▶ store ─▶ Supabase (RLS, caller's token)
              │             │  grounding / false-claim check
              │             └─ propose_transaction ─▶ Proposal (no write)
              └─ confirm_transaction ─▶ actions ─▶ INSERT (RLS, idempotent)
```

Principles enforced in code and tests: the model never calculates; the model alone can never write; the server never trusts the client's numbers; retrieved text (notes, receipts) is marked untrusted and sanitised; confirmation is a safeguard against mistakes, **not** an authorisation boundary — RLS is.

No model was trained or added. An intent classifier (e.g. XLM-RoBERTa) is left as an optional experiment to be judged against the same datasets.

## 8. Language evaluation results

Datasets are labelled Malay / English / Manglish sentences (`tests/fixtures/kapy-eval-*.ts`). **What is measured is the analyser (the hint layer), not Gemini.**

| | dev (96) | heldout (50) | fresh (59) | fresh2 (40) |
|---|---|---|---|---|
| **First run** — intent | 99.0% | 98.0% | **67.8%** | **72.5%** |
| First run — confident wrong answers | 0 | 0 | 8 | 3 |
| Now — intent (*not independent*) | 100% | 100% | 98.3% | 100% |

Only the *first* run on `fresh` and `fresh2` is an honest estimate on unseen language: **roughly two sentences in three**. Later numbers reflect fixes made after looking at the misses. Multi-turn scenarios: 10/10 conversations, 22/22 turns (not independent). Full detail and caveats: [`evals/kapy/README.md`](../evals/kapy/README.md).

**Gemini's own accuracy on Malay/Manglish is unmeasured.** `npm run eval:kapy:live` exists and its harness is self-tested, but it needs a key and has not been run. No claim of "perfect Manglish" is made.

## 9. Financial calculation test results

Checked against a hand-computed ledger (not derived from the code under test): November spent RM 341.55, saved RM 300.00, earned RM 3,000.00, balance RM 4,858.45; October spent RM 300.00, saved RM 400.00, earned RM 500.00.

- 46 finance tests, 19 period tests, 9 money tests: exact sen arithmetic (0.1 + 0.2 class of errors), half-away rounding, percentage of zero is *undefined* not 0%, timezone boundaries at Malaysian midnight, Monday–Sunday weeks, leap-year February, 5,000-row ledgers, over-1000-row pagination.
- Parity tests: category list equals `src/constants/categories.ts`; server totals equal `deriveTotals` in the app under forced `Asia/Kuala_Lumpur`.
- Limitations are emitted rather than hidden (e.g. `balance` is `null` for non-calendar periods; projections need ≥ 3 elapsed days).
- Mutation testing: a numeric mutant (float money) is killed.

## 10. Security test results

Each guarantee was tested by a scripted, deliberately misbehaving model and a Supabase fake that simulates RLS, the 1000-row cap and the unique index.

| Property | Result |
|---|---|
| No unauthenticated access; anon key rejected | tested (handler) |
| No tool takes a user id; body `user_id` ignored | tested |
| Cross-user reads/writes impossible | tested in fake **and** on real Postgres (RLS blocks cross-user insert) |
| Model cannot write | tested; only `confirm_transaction` inserts |
| Duplicate confirm / replay | one row; second answered `already_recorded` (tested; real unique index verified) |
| False "saved" claim | detected and replaced; negations not flagged |
| Invented figure | caught by grounding; repaired once, else server fallback |
| Tool-call flood / loops | per-round, total and round caps enforced |
| Prompt injection in notes / user text | notes sanitised to 40 chars and marked untrusted; injected instructions do not change tool scope |
| Oversize bodies / history | 64 KB and history caps |
| Quota | cap, per-user isolation, refusals not counted, anon denied, invalid arguments rejected, direct table access denied, 25 concurrent → exactly 5 allowed (real Postgres) |
| Logs | `assertSafeMetrics` forbids personal content; test inspects emitted lines; a throwing logger cannot break a request |
| Secrets | repo scan for key patterns: none. Key is sent as a header |

**Mutation testing:** 19 of 19 non-equivalent mutants killed (grounding, false-claim detector, prose-with-card, round/tool caps, duplicate detection, handler auth, quota, user scoping, note sanitising, timezone, float money, category enum, category/type check, context expiry, log content, body `user_id`, client shape check, card double-confirm). One more ("do not retry 400") survived as an equivalent mutant — the fall-through behaves identically.

## 11. Performance / latency observations

- Server compute is negligible: `summarizePeriod` over 5,000 rows ≈ 0.5 ms; `comparePeriods` 1.1 ms; 6-month trend 1.9 ms; `normalizeRows` 5,000 rows ≈ 5 ms; analyser 56 µs/message.
- Prompt size: system prompt ≈ 4.4k chars (~1.1k tokens), tool declarations ≈ 7.9k chars (~2k tokens), history ≤ 8,000 chars; tool results ≈ 280–630 tokens each. (Estimates by character count, not a real tokenizer.)
- A typical question now takes **two** model calls (tool request, then answer) against one before, so token cost and latency per question **rise**. This was a deliberate trade for correctness. The old design accepted ~84k chars of history; the new worst case is far smaller.
- **Real model latency and token use were not measured** (no key in this environment).

## 12. Files changed

70 paths in `git status` (13 modified, 8 removed from the index, 49 untracked groups). Key groups:

- Server: `supabase/functions/_shared/kapy/*` (19 modules), `kapy/handler.ts`, `kapy/index.ts`, `scan-receipt/{handler,index}.ts`, Phase 1 shared helpers (`auth`, `http`, `validate`, `amount`, `supabase-auth`).
- Database: two migrations, `supabase/migrations/README.md`, `supabase/config.toml`.
- App: `src/lib/{ai,kapy-chat,errors,oauth-url,db,oauth,supabase}.ts`, `src/components/ui/proposal-card.tsx`, `src/app/(tabs)/kapy.tsx`.
- Tests / eval: 22 Kapy test files plus fixtures, `scripts/eval-kapy*.ts`, `evals/kapy/README.md`, `tests/README.md`.
- Config / docs: `package.json` (scripts only), `tsconfig.json` (excludes `scripts`), `.gitignore`, `.env.example`, `README.md`, Phase 1 and Phase 2 reports.
- `supabase/.temp/*` (8 files) removed from the index only; they remain on disk and are now ignored.

Test counts: baseline 61 → Phase 1 178 → Phase 2 **589** (+411).

## 13. Dependencies added / removed

**None added, none removed.** `package.json` changes are scripts only (`typecheck`, `eval:kapy`, `eval:kapy:live`). The server uses `npm:@supabase/supabase-js@2` as before. Tools used for verification (Deno 2.9.6, Supabase CLI 3.2.0, Postgres 16) were used outside the repo.

## 14. Remaining limitations

- **Gemini accuracy on Malay / Manglish is unmeasured.** The live evaluation has not been run.
- The analyser scores ≈ 68–73% intent on first contact with unseen sentences; it is a hint, and `unknown` hands the decision to Gemini. The "now" numbers are not independent. The held-out set is only partly independent.
- Language-style labels for single borrowed words are judgement calls.
- The knowledge base is **unreviewed** by a finance professional and contains no rates; do not describe it as authoritative.
- Token cost and latency per question increase (two calls typical); not measured against the real API.
- Confirmation protects against mistakes, not against a malicious client; RLS is the boundary.
- If more than 10 pages × 1000 rows exist in a queried range, results are flagged `truncated` rather than complete.
- The UI was type-checked and unit-tested at the state-machine level but **not exercised on a device or simulator** in this environment.
- `AGENTS.md` asks to read the Expo SDK 56 docs first; `docs.expo.dev` is unreachable from this sandbox. Only APIs already used in the repo were relied on, checked against installed `node_modules`.
- Quota fails open only if `ai_consume` does not exist (migration pending), with a logged event; any other error refuses.
- The `GEMINI_API_KEY` rotation recommended in Phase 1 is still pending for the owner.

## 15. Deployment / environment instructions

Order matters:

1. Apply migrations (`20261122100000` then `20261122120000`) — `npx supabase db push`, or the SQL editor. Validity check is in `supabase/migrations/README.md`.
2. Deploy functions: `npx supabase functions deploy kapy` and `npx supabase functions deploy scan-receipt`.
3. Ship the new app build. Older builds keep working but cannot record transactions.

If `kapy` is deployed before the migration: saving reports "unavailable" and quota fails open with a logged event.

Secrets: `GEMINI_API_KEY` (required, rotate per Phase 1), optional `GEMINI_MODEL` (default `gemini-3.7-flash`).
Optional quota overrides (integers 1–100000): `KAPY_RATE_PER_MINUTE`, `KAPY_RATE_PER_DAY`, `KAPY_CONFIRM_RATE_PER_MINUTE`, `KAPY_CONFIRM_RATE_PER_DAY`, `SCAN_RATE_PER_MINUTE`, `SCAN_RATE_PER_DAY`. Defaults: chat 10/min and 150/day, confirm 20/300, scan 6/60.

Measure the model (needs a key, makes billed calls):

```bash
GEMINI_API_KEY=... npm run eval:kapy:live
```

Record the date, model and numbers in `evals/kapy/README.md`.

## 16. Git commits created

**None.** All Phase 1 and Phase 2 work is uncommitted in the local `develop` working tree (HEAD is still `dab0f83`). The repository's configured Git identity resolves to an AI-assistant identity, and the stated policy is that commits must use the repository owner's identity and carry no AI attribution. Committing as configured would breach that, so no commit was made, nothing was pushed, and `main` and the tag `v1.0.0-baseline` are untouched.

Until it is committed the work exists only in this container. To proceed, the owner can set their own identity (`git config user.name` / `user.email`) and ask for the work to be committed in reviewable chunks (suggested split: Phase 1 hardening; Phase 2 server engine + migration; Phase 2 client; tests and evals; docs), or commit it themselves.

Phase 3 has not been started.
