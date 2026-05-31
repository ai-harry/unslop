import type { Level } from "./types";
import { DEFAULT_OPTIONS } from "./types";
import { LEVELS } from "./levels";
import { getClient } from "./anthropic";
import { MODELS } from "./models";
import { detectAiTells } from "./guardrails";
import {
  generateCandidate,
  runLevel,
  type Candidate,
  type RunCtx,
} from "./humanize";

// Single-message transform used by the desktop app's global hotkeys. It wraps the
// existing Layer 2/3 engine in two speed profiles so a keystroke can return in
// ~1-2s, while a deliberate "polish" keystroke can spend ~4-7s for the full
// best-of-N + LLM-judge + strong-model rescue path.
//
//   fast: one fast-model candidate + deterministic cleanup + meaning gate. Skips
//         the LLM judge and best-of-N entirely. If a hard anchor (money, percent,
//         email, URL) is dropped, it auto-escalates ONCE to the full pipeline so
//         we never silently mangle a number or a link.
//   full: the existing per-level pipeline (best-of-N parallel candidates, LLM
//         judge, strong-model rescue) — identical to what the web app runs.

export type TransformMode = "fast" | "full";

export interface TransformInput {
  text: string;
  level: Level;
  mode?: TransformMode;
  apiKey?: string;
  injectTypos?: boolean;
}

export interface TransformResult {
  level: Level;
  mode: TransformMode;
  input: string;
  output: string;
  model: string;
  aiBefore: number; // AI-tell score of the original (0 human .. 100 slop)
  aiAfter: number; // AI-tell score of the rewrite
  quality: number; // composite 0..100
  passed: boolean; // cleared the per-level quality bar
  meaningOk: boolean; // every hard anchor survived
  dropped: string[]; // hard anchors lost (empty when meaningOk)
  enforced: string[]; // deterministic cleanup fixes applied
  escalated: boolean; // fast mode fell back to the full pipeline
  ms: number;
}

function candidateToResult(
  level: Level,
  mode: TransformMode,
  input: string,
  before: number,
  c: Candidate,
  escalated: boolean,
  ms: number,
): TransformResult {
  return {
    level,
    mode,
    input,
    output: c.output,
    model: c.model,
    aiBefore: before,
    aiAfter: c.after.score,
    quality: c.quality,
    passed: c.passed,
    meaningOk: c.meaning.ok,
    dropped: c.meaning.dropped,
    enforced: c.enforced,
    escalated,
    ms,
  };
}

export async function transform({
  text,
  level,
  mode = "fast",
  apiKey,
  injectTypos = false,
}: TransformInput): Promise<TransformResult> {
  const trimmed = text.trim();
  const started = Date.now();

  if (trimmed.length === 0) {
    return {
      level,
      mode,
      input: trimmed,
      output: "",
      model: MODELS.fast,
      aiBefore: 0,
      aiAfter: 0,
      quality: 0,
      passed: false,
      meaningOk: true,
      dropped: [],
      enforced: [],
      escalated: false,
      ms: 0,
    };
  }

  const client = getClient(apiKey);
  const allowTypos = LEVELS[level].allowTypos && injectTypos;
  const before = detectAiTells(trimmed).score;

  if (mode === "full") {
    const ctx: RunCtx = {
      client,
      input: trimmed,
      opts: { ...DEFAULT_OPTIONS, injectTypos: allowTypos },
    };
    const result = await runLevel(level, ctx);
    return {
      level,
      mode,
      input: trimmed,
      output: result.output,
      model: result.model,
      aiBefore: result.before.score,
      aiAfter: result.after.score,
      quality: result.quality,
      passed: result.passed,
      meaningOk: result.meaning.ok,
      dropped: result.meaning.dropped,
      enforced: result.enforced,
      escalated: false,
      ms: Date.now() - started,
    };
  }

  // Fast path: a single fast-model candidate, no judge, no best-of-N, no rescue.
  const fastCtx: RunCtx = {
    client,
    input: trimmed,
    opts: { ...DEFAULT_OPTIONS, injectTypos: allowTypos, runJudge: false, maxAttempts: 1 },
  };
  const candidate = await generateCandidate(level, fastCtx, MODELS.fast, 0);

  // Guardrail: if the fast pass dropped a hard anchor (a number, money, email, or
  // link), don't ship it. Escalate once to the full pipeline, which judges and can
  // rescue with the strong model.
  if (!candidate.meaning.ok) {
    const fullCtx: RunCtx = {
      client,
      input: trimmed,
      opts: { ...DEFAULT_OPTIONS, injectTypos: allowTypos },
    };
    const rescued = await runLevel(level, fullCtx);
    return {
      level,
      mode: "fast",
      input: trimmed,
      output: rescued.output,
      model: rescued.model,
      aiBefore: before,
      aiAfter: rescued.after.score,
      quality: rescued.quality,
      passed: rescued.passed,
      meaningOk: rescued.meaning.ok,
      dropped: rescued.meaning.dropped,
      enforced: rescued.enforced,
      escalated: true,
      ms: Date.now() - started,
    };
  }

  return candidateToResult(level, "fast", trimmed, before, candidate, false, Date.now() - started);
}
