# Kapy evaluation

How Kapy's language understanding is measured, what the numbers mean, and — as
important — what they do not.

## What is measured, and what is not

Kapy has two layers that "understand" a message:

| Layer | What it does | Measured by |
|---|---|---|
| **Message analyser** (`supabase/functions/_shared/kapy/intent.ts`, `language.ts`, `context.ts`) | Reads the sentence for language style, intent, period, category and amount, and resolves "that" / "last month" from the conversation. Its output is a *hint* to the model. | Offline, deterministic, here (`npm run eval:kapy`) |
| **Gemini** | Decides which tool to call and writes the reply. | **Not measured yet.** Needs a real key: `npm run eval:kapy:live` |

Everything *around* the model (tool validation, bounds, grounding, no false
"saved", confirmation, quotas, authorisation) is covered by the unit tests, using
a scripted model that misbehaves on purpose. That tests the guarantees; it does
not tell you how clever Gemini is with Manglish. Only the live evaluation can.

## The datasets (`tests/fixtures/kapy-eval-*.ts`)

Labelled sentences in Bahasa Melayu, English and Manglish, with the intent,
period, category, amount and whether the message leans on the previous turn.
Labelling rules are at the top of `kapy-eval-heldout.ts`.

| Set | Sentences | How it was made | Independent of tuning? |
|---|---|---|---|
| `dev` | 96 | Every example sentence in the brief, plus variants. The analyser was built against it. | No |
| `heldout` | 50 | Written before the analyser, not tuned on empirically. | Partly: its sentences were considered while the rules were written, and failures were later fixed. |
| `fresh` | 59 | Written after the analyser was frozen, deliberately harder: slang, texting spelling, vocabulary it does not have, traps. | **First run only** |
| `fresh2` | 40 | Same procedure, after `fresh` had been used to fix the analyser. | **First run only** |
| scenarios | 10 conversations, 22 turns | Multi-turn follow-ups: "what about food?", "why is November higher?", "bulan lepas pulak?", topic changes, references with nothing to refer to. | No |

Language style (`ms` / `en` / `manglish`) is labelled by a stated rule: Manglish is
a genuine mix (the minority language at least about a quarter of the content
words) or English carrying Malaysian particles. The boundary is fuzzy for a single
borrowed word ("aku dah **spend** berapa semalam"), and some labels there are
judgement calls; language accuracy is reported but should be read with that in
mind.

## Results

First-run results are the honest estimate of accuracy on sentences the analyser was
not shaped around. Later results on the same set are not independent, because the
misses were looked at and fixed.

| | dev | heldout | **fresh** | **fresh2** |
|---|---|---|---|---|
| **First run** — intent | 99.0% | 98.0% | **67.8%** | **72.5%** |
| First run — language style | 88.5% | 96.0% | 93.2% | 90.0% |
| First run — period | 100% | 100% | 92.9% | 100% |
| First run — comparison periods | 100% | 100% | 33.3% | 100% |
| First run — category / amount | 85.7% / 100% | 80.0% / 100% | 100% / 100% | 100% / 100% |
| First run — confident wrong answers | 0 | 0 | 8 | 3 |
| *Now (not independent)* — intent | 100% | 100% | 98.3% | 100% |

On `fresh` and `fresh2`, first-run intent accuracy by style: Malay 75% / 77%,
English 59% / 71%, Manglish 75% / 64%.

**Read this as:** on language it has not seen, the analyser gets roughly **two
sentences in three** right. That is why it is only a hint. Where it is unsure it
says `unknown` (about half of its first-run misses) and Gemini decides; the
dangerous failure, a confident wrong answer, was 8 of 59 and 3 of 40 on first
contact. After the fixes made from those misses, the same sets read 98-100%, but
that number measures memory, not understanding. To get a new honest figure, write
a new set, run it once, and record the first result before touching the analyser.

Corrections made to the datasets after the first run, because the *label* was
wrong rather than the analyser: `d-rec-07`, `d-his-03` and `h-mg-10` (pure Malay
mislabelled Manglish), `h-mg-12` (informal English mislabelled Manglish), `d-unk-01`
("hmm" has no language). They are in git history.

## Running

```bash
npm run eval:kapy              # tables for every set
npm run eval:kapy -- --fail    # also list every miss
npm test                       # the same sets as regression thresholds
```

`tests/kapy-eval.test.ts` fails if accuracy drops below the thresholds. Those
thresholds prevent regression; they are **not** a claim about generalisation.

### Measuring the real model

```bash
GEMINI_API_KEY=... npm run eval:kapy:live            # every set
GEMINI_API_KEY=... npm run eval:kapy:live -- fresh   # one set
npm run eval:kapy:live -- --selftest                 # check the script, no key
```

It sends each sentence through the full server pipeline against the hand-computed
ledger (an in-memory fake database; nothing touches Supabase) and reports how
often Gemini's first tool is a reasonable one for the sentence's intent, how often
a reply needed correction or the server had to answer itself, token use and
latency. It makes real, billed calls (about two per sentence), and results vary
between runs. **Nobody has run it yet**, so Gemini's own accuracy on Malay and
Manglish is unmeasured. Record the date, model and numbers here when someone does:

| Date | Model | Set | First tool reasonable | Needed correction | Server fallback | p50 / p95 |
|---|---|---|---|---|---|---|
| *not yet run* | | | | | | |

If a model other than Gemini is ever considered, this is the measurement that
should justify it. An intent classifier such as XLM-RoBERTa would be an
experiment compared against these same sets, not a dependency.
