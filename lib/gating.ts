import type { AiTellReport, JudgeReport, Level, MeaningCheck } from "./types";
import { LEVELS } from "./levels";

// Layer 3 (scoring + gate). Best-of-N picks the candidate with the highest
// composite quality; the gate then decides whether that candidate is good enough
// to surface confidently or must be flagged as best-effort. Meaning is weighted
// hardest, and a dropped hard anchor (see meaning-check) caps the score so a
// fluent-but-wrong rewrite can never out-rank a faithful one.

export function qualityScore(
  ai: AiTellReport,
  judge: JudgeReport | null,
  meaning: MeaningCheck,
): number {
  // A dropped hard fact is disqualifying. Keep it rank-able (so we still pick the
  // least-broken of several broken candidates) but force it below any floor.
  if (!meaning.ok) {
    const base = judge ? judge.meaning : 0;
    return Math.max(0, Math.min(40, Math.round(base * 0.4 - ai.score * 0.2)));
  }
  if (!judge) {
    // No judge available: lean on the deterministic AI-tell score alone.
    return Math.max(0, Math.min(100, Math.round(100 - ai.score)));
  }
  const composite =
    judge.meaning * 0.5 +
    judge.humanness * 0.25 +
    judge.styleMatch * 0.15 +
    judge.voiceAuthenticity * 0.1 -
    ai.score * 0.2;
  return Math.max(0, Math.min(100, Math.round(composite)));
}

export interface GateInput {
  level: Level;
  ai: AiTellReport;
  judge: JudgeReport | null;
  meaning: MeaningCheck;
  quality: number;
  maxAiScore: number;
}

// A candidate passes only when ALL hold: hard facts survived, AI-tell score is
// under the ceiling, the composite clears the per-level quality floor, and (when
// a judge ran) every judge axis clears its per-level floor.
export function passesGate(input: GateInput): boolean {
  const spec = LEVELS[input.level];
  if (!input.meaning.ok) return false;
  if (input.ai.score > input.maxAiScore) return false;
  if (input.quality < spec.qualityFloor) return false;
  if (input.judge) {
    const f = spec.judgeFloor;
    if (input.judge.meaning < f.meaning) return false;
    if (input.judge.humanness < f.humanness) return false;
    if (input.judge.styleMatch < f.styleMatch) return false;
    if (input.judge.voiceAuthenticity < f.voiceAuthenticity) return false;
  }
  return true;
}
