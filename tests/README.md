# Tests

```bash
npm test
```

60 tests, no test framework installed. Node 22's built-in runner (`node:test`)
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

## What is not covered, and why

These are unit tests over pure functions. There are no component or navigation
tests: those need a renderer and a much larger dependency set, and the value
here is in the logic that decides people's numbers, not in whether a `View`
renders.

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
