# Unslop

Make AI-sounding writing sound like a real person wrote it. Paste a message, get
it back at **three intensities** at once — each de-slopped, voice-matched, and
graded by an LLM judge.

| Level | Voice |
|-------|-------|
| **AI** | Cleaned, not robotic. Strips the tells (em-dashes, smart quotes, markdown, corporate slop), keeps the professional register. The lightest touch. |
| **Human** | How a real, busy person actually emails. Contractions, warmth, varied rhythm, shorter. |
| **CEO** | Terse, blunt, high-status. Usually one or two lines, often under 15 words. The "replied in 9 words" voice. |

This is a from-scratch take on [sinceerly.com](https://sinceerly.com) — same core
idea (humanize text, BYOK), but built around a layered rewrite-and-verify engine
instead of a single prompt.

---

## How it works — the three layers

The user asked for **Layer 2 + Layer 3** to be the product, with the old
"Layer 1" regex pass folded into the guardrails. That's exactly how it's wired:

```
input
  │
  ├─ detect AI-tells (before)                         ┐
  │                                                   │ Layer 3
  ▼                                                   │ (deterministic +
Layer 2  LLM rewrite  ── cached system prefix ───┐    │  LLM judge)
  (fast model, 3 levels in parallel)             │    │
  │                                              ▼    │
  ▼                                         enforce() │  ← typography/markdown cleanup
raw rewrite ──────────────────────────────►  detect  │     (the folded-in "Layer 1")
                                              (after) │
                                                 │    │
                                                 ▼    │
                                            LLM judge │  ← humanness / styleMatch / meaning
                                                 │    │
                              pass? ─────────────┤    │
                               │ no              │    ┘
                               ▼                 ▼
                     retry on STRONG model     pass → return
```

- **Layer 2 — rewrite engine** (`lib/humanize.ts`). One **cached** system prefix
  (role + task few-shots + a broad target-voice corpus) is shared by all three
  levels and every retry via Anthropic [prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching),
  so the heavy prompt is paid for once. The small per-level instruction + focused
  voice exemplars + your message ride in the uncached user turn. All three levels
  run in parallel.
- **Layer 3 — guardrails + judge**:
  - `lib/cleanup.ts` — deterministic typography/markdown normalizer (em/en-dash →
    hyphen, curly → straight quotes, strips markdown, flattens stray bullet lists,
    tidies whitespace). Runs **after** the LLM so grammar survives.
  - `lib/guardrails.ts` — `detectAiTells()` scores text 0–100 on the surface tells
    of machine writing (typography, ~40 banned corporate phrases, and sentence-
    rhythm *burstiness* — robots write uniform sentences, humans don't).
  - `lib/judge.ts` — a separate small-model **LLM judge** grades the rewrite on
    `humanness`, `styleMatch`, and `meaning` (did the facts/ask/links survive?).
- **Retry + escalation**: if a level's after-score exceeds the AI-tell ceiling
  *or* the judge fails its per-level floor, the orchestrator retries on the
  **strong** model. Models are routed in `lib/models.ts`
  (Haiku 4.5 → Sonnet 4.6).

### Why no GraphRAG / RAG?

Humanizing text is a **style-transfer** problem, not a knowledge-retrieval one.
There are no facts to look up; the only "knowledge" is *voice*, and a handful of
well-chosen few-shot exemplars carry voice far better (and faster/cheaper) than a
vector store. So: curated transform pairs teach the **task**, a small voice corpus
teaches the **register**, and guardrails + a judge keep it honest. A RAG index here
would be latency and complexity with no payoff.

---

## Quick start

```bash
npm install

# Provide a key one of two ways:
#   1. cp .env.example .env  and set ANTHROPIC_API_KEY   (server key), or
#   2. paste a key into the BYOK field in the UI         (browser-only, never stored server-side)

npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run eval         # eval harness (offline always; full pipeline if a key is set)
npm run build-corpus # refresh the voice corpus from X via Apify (needs APIFY_TOKEN)
```

---

## The corpus

The target-voice corpus lives in `data/corpus/*.json`, bucketed by level:

```json
{ "source": "...", "samples": { "ai": [...], "human": [...], "ceo": [...] } }
```

Two **curated, style-only** files ship by default (`ceo-tweets.json`,
`exec-style.json`) — short, paraphrased, unattributed anchors that teach cadence
and register, not facts about any person. `lib/corpus.ts` loads and merges every
file in the directory and falls back to `FALLBACK_STYLE` per level if a bucket is
empty, so the app always works offline.

**Refreshing from live data:** `npm run build-corpus` runs an Apify X/Twitter
scraper over a set of founder handles, strips @mentions / links / hashtags (voice
only), buckets each line by length, and rewrites `ceo-tweets.json`. Guest scraping
of X is frequently blocked, so the script is best-effort: if it can't harvest
enough usable lines it leaves the curated file in place and warns. The committed
curated corpus is the reliable default; this only upgrades it.

> Note: the initial Apify guest scrapes for this build returned empty (X blocked
> the founder handles; the Reddit run yielded 0 items), which is why the shipped
> corpus is curated rather than scraped. Set `APIFY_TOKEN` and re-run
> `build-corpus` with a subscribed actor to populate it from live data.

---

## API

`POST /api/humanize`

```jsonc
// request
{
  "input": "Hi Jordan, I wanted to reach out to circle back...",
  "apiKey": "sk-ant-...",          // optional BYOK; falls back to server key
  "options": { "injectTypos": false, "runJudge": true, "maxAttempts": 2 }
}

// response (HumanizeResponse)
{
  "input": "...",
  "ms": 4200,
  "results": {
    "ai":    { "level": "ai",    "output": "...", "before": {...}, "after": {...}, "judge": {...}, "attempts": 1, "model": "claude-haiku-4-5-20251001", "enforced": [...], "cached": true },
    "human": { ... },
    "ceo":   { ... }
  }
}
```

The UI (`app/page.tsx`) renders all three side by side with **yellow word-diff
highlights** (what changed from your original), a scorecard per level (AI-tell
before→after, judge humanness/style/meaning, model, retries, cache hit), and the
list of deterministic cleanups applied.

---

## Project layout

```
app/
  layout.tsx            root layout + metadata
  page.tsx              the UI (client): composer, 3-level cards, diffs, scorecards, BYOK
  globals.css           styling
  api/humanize/route.ts POST endpoint (node runtime; validates + calls the engine)
lib/
  humanize.ts           Layer 2 orchestrator: cached prompt, parallel levels, retry/escalation
  cleanup.ts            Layer 3 deterministic typography/markdown enforcement
  guardrails.ts         Layer 3 AI-tell detector (detectAiTells) + enforce()
  judge.ts              Layer 3 LLM-as-judge + per-level floors
  corpus.ts             load/merge voice corpus, select per-level exemplars (with fallback)
  exemplars.ts          curated transform pairs + banned phrases + fallback voice
  levels.ts             the three LevelSpecs (goal, exemplar count, judge floors, typos)
  diff.ts               pure word-level diff for the yellow highlight (client-safe)
  models.ts             fast/strong model routing
  anthropic.ts          SDK client (BYOK-aware)
  types.ts              shared types + DEFAULT_OPTIONS
data/corpus/*.json      bucketed target-voice corpus
eval/                   cases.json + run.ts (offline guardrail checks + online pipeline)
scripts/build-corpus.ts Apify corpus refresher
```

---

## Notes & limitations

- **Live LLM path is unverified end-to-end here** — no Anthropic key was available
  in the build environment. Typecheck, production build, the offline guardrail
  evals, and the HTTP wiring (page render, 401-on-missing-key, 400-on-empty) all
  pass. Set a key and run `npm run dev` (or `npm run eval` with a key) to exercise
  the full rewrite + judge loop.
- BYOK keys are sent per-request and **never persisted server-side**; the browser
  stores yours in `localStorage` only.
- Dependency audit: pinned to the patched **Next 14.2.35**. Two residual
  *transitive* advisories (postcss inside Next) are only resolved by a major Next 16
  bump (breaking) and are left as a documented tradeoff.
