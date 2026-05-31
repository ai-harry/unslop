import type Anthropic from "@anthropic-ai/sdk";
import type {
  AiTellReport,
  HumanizeOptions,
  HumanizeResponse,
  JudgeReport,
  Level,
  LevelResult,
  MeaningCheck,
} from "./types";
import { LEVEL_ORDER, DEFAULT_OPTIONS } from "./types";
import { LEVELS, levelInstruction } from "./levels";
import { TRANSFORM_PAIRS } from "./exemplars";
import { selectStyleExemplars, loadCorpus } from "./corpus";
import { detectAiTells, enforce } from "./guardrails";
import { judge } from "./judge";
import { checkMeaning } from "./meaning-check";
import { qualityScore, passesGate } from "./gating";
import { getClient } from "./anthropic";
import { MODELS } from "./models";

// ── Layer 2: the rewrite engine ──────────────────────────────────────────────
// One cached system prefix (role + task few-shots + broad voice corpus) is shared
// by all three levels and every candidate, so we pay full prompt cost once and
// read from cache thereafter. The small, per-level instruction + focused voice
// exemplars + the user's message ride in the (uncached) user turn.
//
// Each level runs best-of-N: we generate N fast-model candidates in parallel,
// gate each (deterministic cleanup -> AI-tell detector -> meaning gate -> LLM
// judge -> composite score), and surface the best PASSING one. If none pass, we
// escalate to the strong model once, then surface the best-effort candidate
// flagged as not-passing so the UI can warn instead of silently shipping slop.

const BASE_RULES = [
  "You rewrite messages so they sound like a real person wrote them, not an AI.",
  "Absolute rules:",
  "1. Preserve every fact, name, number, date, ask, and link from the ORIGINAL. Never invent anything.",
  "2. Output ONLY the rewritten message. No preamble, no quotes around it, no notes, no markdown, no subject line unless the original had one.",
  "3. Never use em-dashes, en-dashes, smart/curly quotes, or markdown bullet lists.",
  "4. Avoid corporate slop ('I wanted to reach out', 'at your earliest convenience', 'circle back', 'leverage', 'synergy', etc.).",
  "5. Match the target voice you are told to use. Vary sentence length so the rhythm reads human.",
].join("\n");

function pairsBlock(): string {
  const lines = ["TASK EXAMPLES (same message rewritten at each intensity):"];
  for (const p of TRANSFORM_PAIRS) {
    lines.push("");
    lines.push(`SLOP: ${p.slop}`);
    lines.push(`SUBTLE: ${p.subtle}`);
    lines.push(`HUMAN: ${p.human}`);
    lines.push(`CEO: ${p.ceo}`);
  }
  return lines.join("\n");
}

function broadVoiceBlock(): string {
  const c = loadCorpus();
  const lines = ["TARGET-VOICE SAMPLES (style only, do not copy content):"];
  const take = (arr: string[], n: number) => arr.slice(0, n);
  lines.push("");
  lines.push("Subtle (clean professional):");
  for (const s of take(c.subtle, 4)) lines.push(`- ${s}`);
  lines.push("");
  lines.push("Human (real, warm, varied):");
  for (const s of take(c.human, 6)) lines.push(`- ${s}`);
  lines.push("");
  lines.push("CEO (terse, blunt, lowercase ok):");
  for (const s of take(c.ceo, 8)) lines.push(`- ${s}`);
  return lines.join("\n");
}

// Stable across all levels/candidates -> the cache prefix. Built once per process.
let cachedSystem: Anthropic.TextBlockParam[] | null = null;
function buildBaseSystem(): Anthropic.TextBlockParam[] {
  if (cachedSystem) return cachedSystem;
  const text = [BASE_RULES, "", pairsBlock(), "", broadVoiceBlock()].join("\n");
  cachedSystem = [
    {
      type: "text",
      text,
      cache_control: { type: "ephemeral" },
    },
  ];
  return cachedSystem;
}

function buildUserTurn(
  level: Level,
  input: string,
  injectTypos: boolean,
  seed: number,
): string {
  const spec = LEVELS[level];
  const exemplars = selectStyleExemplars(level, spec.exemplarCount, seed);
  const lines: string[] = [];
  lines.push(`REWRITE THE MESSAGE BELOW AT THIS INTENSITY -> ${spec.label}.`);
  lines.push(levelInstruction(level, injectTypos));
  if (exemplars.length > 0) {
    lines.push("");
    lines.push(`Reference ${spec.label} voice (style only, never copy facts):`);
    for (const e of exemplars) lines.push(`- ${e}`);
  }
  lines.push("");
  lines.push("ORIGINAL:");
  lines.push(`"""${input}"""`);
  lines.push("");
  lines.push("Return ONLY the rewritten message.");
  return lines.join("\n");
}

// Per-level base temperature, with a small per-candidate jitter so best-of-N
// explores genuinely different rewrites instead of N near-identical ones.
function temperatureFor(level: Level, seed = 0): number {
  const base = level === "subtle" ? 0.4 : level === "human" ? 0.75 : 0.85;
  const jitter = (seed % 3) * 0.08;
  return Math.min(1, base + jitter);
}

function stripWrapper(s: string): string {
  let out = s.trim();
  // Models occasionally wrap the answer in matching quotes or fences.
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function textFrom(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export interface RunCtx {
  client: Anthropic;
  input: string;
  opts: HumanizeOptions;
}

export interface Candidate {
  output: string;
  model: string;
  after: AiTellReport;
  judge: JudgeReport | null;
  meaning: MeaningCheck;
  enforced: string[];
  quality: number;
  passed: boolean;
  cachedHit: boolean;
}

export async function generateCandidate(
  level: Level,
  ctx: RunCtx,
  model: string,
  seed: number,
): Promise<Candidate> {
  const { client, input, opts } = ctx;
  const system = buildBaseSystem();
  const user = buildUserTurn(level, input, opts.injectTypos, seed);

  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: temperatureFor(level, seed),
    system,
    messages: [{ role: "user", content: user }],
  });

  const usage = msg.usage as { cache_read_input_tokens?: number } | undefined;
  const cachedHit = (usage?.cache_read_input_tokens ?? 0) > 0;

  const raw = stripWrapper(textFrom(msg));
  const cleaned = enforce(level, raw);
  const after = detectAiTells(cleaned.text);
  const meaning = checkMeaning(input, cleaned.text, level);

  let judgeReport: JudgeReport | null = null;
  if (opts.runJudge) {
    try {
      judgeReport = await judge({ original: input, rewrite: cleaned.text, level, client });
    } catch {
      judgeReport = null; // judge is best-effort; never block a result on it
    }
  }

  const quality = qualityScore(after, judgeReport, meaning);
  const passed = passesGate({
    level,
    ai: after,
    judge: judgeReport,
    meaning,
    quality,
    maxAiScore: opts.maxAiScore,
  });

  return {
    output: cleaned.text,
    model,
    after,
    judge: judgeReport,
    meaning,
    enforced: cleaned.changes,
    quality,
    passed,
    cachedHit,
  };
}

function pickBest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!best || c.quality > best.quality) best = c;
  }
  return best;
}

function toResult(
  level: Level,
  c: Candidate,
  attempts: number,
  before: AiTellReport,
  cached: boolean,
): LevelResult {
  return {
    level,
    output: c.output,
    attempts,
    model: c.model,
    before,
    after: c.after,
    judge: c.judge,
    meaning: c.meaning,
    quality: c.quality,
    passed: c.passed,
    enforced: c.enforced,
    cached,
  };
}

export async function runLevel(level: Level, ctx: RunCtx): Promise<LevelResult> {
  const before = detectAiTells(ctx.input);
  const spec = LEVELS[level];
  const n = Math.max(1, spec.candidates);

  // Phase 1: N fast-model candidates, generated and judged in parallel.
  const pool: Candidate[] = await Promise.all(
    Array.from({ length: n }, (_, i) => generateCandidate(level, ctx, MODELS.fast, i)),
  );

  const cachedAny = () => pool.some((c) => c.cachedHit);

  const passing = pool.filter((c) => c.passed);
  const bestPassing = pickBest(passing);
  if (bestPassing) return toResult(level, bestPassing, pool.length, before, cachedAny());

  // Phase 2: nothing cleared the bar. Escalate to the strong model once (unless
  // escalation is disabled), then take the best of everything we generated.
  if (ctx.opts.maxAttempts > 1) {
    const rescue = await generateCandidate(level, ctx, MODELS.strong, n);
    pool.push(rescue);
    const rescuePassing = pickBest(pool.filter((c) => c.passed));
    if (rescuePassing) return toResult(level, rescuePassing, pool.length, before, cachedAny());
  }

  // Best-effort: surface the highest-quality candidate, flagged as not passing.
  const best = pickBest(pool) ?? pool[0];
  return toResult(level, best, pool.length, before, cachedAny());
}

export async function humanize(
  input: string,
  options: Partial<HumanizeOptions> = {},
  apiKey?: string,
): Promise<HumanizeResponse> {
  const opts: HumanizeOptions = { ...DEFAULT_OPTIONS, ...options };
  const trimmed = input.trim();
  const started = Date.now();

  if (trimmed.length === 0) {
    return { input: trimmed, results: {}, ms: 0 };
  }

  const client = getClient(apiKey);
  const ctx: RunCtx = { client, input: trimmed, opts };

  const settled = await Promise.all(
    LEVEL_ORDER.map(async (level) => [level, await runLevel(level, ctx)] as const),
  );

  const results: HumanizeResponse["results"] = {};
  for (const [level, result] of settled) results[level] = result;

  return { input: trimmed, results, ms: Date.now() - started };
}
