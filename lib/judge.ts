import type Anthropic from "@anthropic-ai/sdk";
import type { JudgeReport, Level } from "./types";
import { LEVELS } from "./levels";
import { MODELS } from "./models";

// Layer 3 (LLM-as-judge). After deterministic enforcement and the meaning gate, a
// small model scores the rewrite on four axes the heuristic can't see: does it
// read human, does it match the chosen register, did the original meaning
// survive, and does it convincingly *embody* the target persona. The judge is
// deliberately separate from the rewriter (different prompt, fresh context) so it
// has no stake in defending the output. Floors per level live in LEVELS[*].judgeFloor.

const JUDGE_SYSTEM = [
  "You are a strict editorial judge for an email-rewriting tool.",
  "You score how well a REWRITE transforms an ORIGINAL message into a target voice.",
  "You are skeptical and precise. You never rewrite; you only score.",
  "Return ONLY a JSON object, no prose, no code fences.",
].join(" ");

interface JudgeInput {
  original: string;
  rewrite: string;
  level: Level;
  client: Anthropic;
}

// Anchored, per-level definition of what "really sounds like this persona" means.
// This is the axis that makes CEO feel like a CEO and Human feel like a person.
function voiceAuthenticityRubric(level: Level): string {
  if (level === "ceo") {
    return [
      "voiceAuthenticity (CEO): 100 = reads exactly like a time-poor founder firing",
      "back a reply in seconds: one short line (rarely two), blunt, lowercase is fine,",
      "no greeting, no name, no sign-off, no pleasantries, almost always under 12",
      "words. Score 85+ only if there is NO greeting and NO sign-off and it is at most",
      "two short lines. A polite, complete-sentence, multi-line reply scores under 40",
      "here no matter how clean it is. Any 'Hi', 'Hello', 'Best', or 'Thanks,' caps",
      "this axis at 50.",
    ].join(" ");
  }
  if (level === "human") {
    return [
      "voiceAuthenticity (Human): 100 = sounds like a real, busy person who typed it",
      "fast on their phone: short and to the point, contractions, plain words, warmth,",
      "clearly varied sentence length with at least one very short line. CRUCIAL: a",
      "human rewrite should be SHORTER and tighter than the original, not a same-length",
      "reword. If the rewrite is about as long as the ORIGINAL, or just swaps in casual",
      "synonyms while keeping every clause and roughly the same length, score under 55.",
      "Penalize stiffness, uniform sentence rhythm, formality, hedging, filler, and",
      "anything that reads like a press release or a polished template.",
    ].join(" ");
  }
  return [
    "voiceAuthenticity (Subtle): 100 = a sharp human professional clearly proofread it:",
    "full grammatical sentences, professional register, but ZERO AI tells (no em-dashes,",
    "no smart quotes, no markdown, no corporate slop, no robotic uniformity). Penalize",
    "any surviving slop phrase or mechanical rhythm. It should NOT read like a casual",
    "text message either; that is the Human level, not this one.",
  ].join(" ");
}

function buildUserPrompt(original: string, rewrite: string, level: Level): string {
  const spec = LEVELS[level];
  return [
    `TARGET VOICE = ${spec.label}: ${spec.blurb}`,
    `Voice goal: ${spec.goal}`,
    "",
    "Score the REWRITE on four axes, each 0-100:",
    "- humanness: 100 = indistinguishable from a real person; 0 = obvious AI/corporate slop (em-dashes, 'I wanted to reach out', uniform robotic rhythm).",
    `- styleMatch: 100 = nails the ${spec.label} register exactly; 0 = wrong register entirely.`,
    "- meaning: 100 = every fact, name, number, ask, and link from the ORIGINAL is preserved and nothing is invented; 0 = meaning changed or details fabricated.",
    `- ${voiceAuthenticityRubric(level)}`,
    "",
    "Be harsh on meaning: inventing a detail or dropping the core ask is an automatic meaning < 50.",
    "Be harsh on voiceAuthenticity: 'clean and correct' is NOT the same as 'sounds like this persona'. Reserve 85+ for rewrites that genuinely feel like the persona wrote them.",
    "",
    `ORIGINAL:\n"""${original}"""`,
    "",
    `REWRITE:\n"""${rewrite}"""`,
    "",
    'Respond with JSON exactly like: {"humanness":0,"styleMatch":0,"meaning":0,"voiceAuthenticity":0,"notes":"one short sentence"}',
  ].join("\n");
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function parseJudge(raw: string): Omit<JudgeReport, "verdict"> {
  // Tolerate code fences or stray text around the JSON.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      humanness: 0,
      styleMatch: 0,
      meaning: 0,
      voiceAuthenticity: 0,
      notes: "judge returned no JSON",
    };
  }
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      humanness: clampScore(obj.humanness),
      styleMatch: clampScore(obj.styleMatch),
      meaning: clampScore(obj.meaning),
      voiceAuthenticity: clampScore(obj.voiceAuthenticity),
      notes: typeof obj.notes === "string" ? obj.notes.slice(0, 240) : "",
    };
  } catch {
    return {
      humanness: 0,
      styleMatch: 0,
      meaning: 0,
      voiceAuthenticity: 0,
      notes: "judge JSON parse failed",
    };
  }
}

export function applyFloor(level: Level, scores: Omit<JudgeReport, "verdict">): JudgeReport {
  const floor = LEVELS[level].judgeFloor;
  const verdict =
    scores.humanness >= floor.humanness &&
    scores.styleMatch >= floor.styleMatch &&
    scores.meaning >= floor.meaning &&
    scores.voiceAuthenticity >= floor.voiceAuthenticity
      ? "pass"
      : "fail";
  return { ...scores, verdict };
}

export async function judge({ original, rewrite, level, client }: JudgeInput): Promise<JudgeReport> {
  const msg = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 220,
    temperature: 0,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: buildUserPrompt(original, rewrite, level) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return applyFloor(level, parseJudge(text));
}
