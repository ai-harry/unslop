/* eslint-disable no-console */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectAiTells } from "../lib/guardrails";
import { cleanupText } from "../lib/cleanup";
import { humanize } from "../lib/humanize";
import { LEVELS } from "../lib/levels";
import { LEVEL_ORDER } from "../lib/types";
import { corpusStats } from "../lib/corpus";

// Eval harness. Two phases:
//   1. Offline (always): the deterministic guardrail layer must score slop high,
//      clean text low, and strip typography. No API key needed -> CI-friendly.
//   2. Online (only with ANTHROPIC_API_KEY): run the full pipeline on real cases
//      and assert each level clears its AI-tell ceiling and judge floors.

interface Cases {
  slop: string[];
  clean: string[];
  humanizeCases: { name: string; input: string }[];
}

const SLOP_MIN = 35; // slop must score at least this
const CLEAN_MAX = 22; // clean must score at most this

let failures = 0;
const pass = (msg: string) => console.log(`  \x1b[32mPASS\x1b[0m ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m ${msg}`);
};

function loadCases(): Cases {
  const raw = readFileSync(join(process.cwd(), "eval", "cases.json"), "utf8");
  return JSON.parse(raw) as Cases;
}

function offlinePhase(cases: Cases): void {
  console.log("\n\x1b[1mOffline — deterministic guardrails\x1b[0m");

  const stats = corpusStats();
  console.log(
    `  corpus: subtle=${stats.subtle} human=${stats.human} ceo=${stats.ceo} · sources: ${
      stats.sources.join("; ") || "fallback only"
    }`,
  );

  for (const s of cases.slop) {
    const { score } = detectAiTells(s);
    if (score >= SLOP_MIN) pass(`slop scored ${score} (>=${SLOP_MIN}): "${s.slice(0, 42)}..."`);
    else fail(`slop only scored ${score} (<${SLOP_MIN}): "${s.slice(0, 42)}..."`);
  }

  for (const c of cases.clean) {
    const { score } = detectAiTells(c);
    if (score <= CLEAN_MAX) pass(`clean scored ${score} (<=${CLEAN_MAX}): "${c.slice(0, 42)}"`);
    else fail(`clean scored ${score} (>${CLEAN_MAX}): "${c.slice(0, 42)}"`);
  }

  const dirty = "Hi — “quotes” and a bullet:\n- one\n- two\n\n**bold** text…";
  const { text, changes } = cleanupText(dirty);
  const stillDirty = /[—–“”‘’…]|\*\*/.test(text);
  if (!stillDirty && changes.length > 0) pass(`cleanup stripped typography (${changes.length} changes)`);
  else fail(`cleanup left tells: "${text}"`);
}

async function onlinePhase(cases: Cases): Promise<void> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!hasKey) {
    console.log("\n\x1b[1mOnline — full pipeline\x1b[0m");
    console.log("  \x1b[33mSKIP\x1b[0m no ANTHROPIC_API_KEY set (offline checks only)");
    return;
  }

  console.log("\n\x1b[1mOnline — full pipeline (judge on)\x1b[0m");
  for (const tc of cases.humanizeCases) {
    const res = await humanize(tc.input, { runJudge: true, maxAttempts: 2 });
    console.log(`\n  case: ${tc.name} (${(res.ms / 1000).toFixed(1)}s)`);
    for (const level of LEVEL_ORDER) {
      const r = res.results[level];
      if (!r) {
        fail(`${level}: no result`);
        continue;
      }
      const j = r.judge
        ? ` judge[h${r.judge.humanness}/s${r.judge.styleMatch}/m${r.judge.meaning}/v${r.judge.voiceAuthenticity} ${r.judge.verdict}]`
        : "";
      const meaningFlag = r.meaning.dropped.length > 0 ? ` DROPPED:${r.meaning.dropped.join(",")}` : "";
      const line = `${LEVELS[level].label}: ai-tell ${r.before.score}->${r.after.score} q${r.quality}${j}${meaningFlag} (${r.model.includes("haiku") ? "haiku" : "sonnet"}, ${r.attempts}x) "${r.output.slice(0, 50)}"`;
      if (r.passed) pass(line);
      else fail(line);
    }
  }
}

async function main(): Promise<void> {
  const cases = loadCases();
  offlinePhase(cases);
  await onlinePhase(cases);

  console.log("");
  if (failures > 0) {
    console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m`);
    process.exit(1);
  }
  console.log("\x1b[32mAll checks passed.\x1b[0m");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
