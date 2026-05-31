export type Level = "subtle" | "human" | "ceo";

export const LEVEL_ORDER: Level[] = ["subtle", "human", "ceo"];

export interface AiTellSignals {
  emDashes: number;
  enDashes: number;
  smartQuotes: number;
  bannedPhrases: string[];
  bulletRuns: number;
  words: number;
  avgSentenceLen: number;
  burstiness: number; // stdev of sentence word-counts; low == robotic
  longSentenceRatio: number;
}

export interface AiTellReport {
  score: number; // 0 = reads human, 100 = reads like AI slop
  signals: AiTellSignals;
}

export interface JudgeReport {
  humanness: number; // 0..100, higher better
  styleMatch: number; // 0..100, match to the level's target voice
  meaning: number; // 0..100, how well the original intent/facts survived
  voiceAuthenticity: number; // 0..100, how convincingly it IS the target persona
  verdict: "pass" | "fail";
  notes: string;
}

// Deterministic, pre-judge meaning gate. Hard anchors (numbers, money, emails,
// URLs) must survive verbatim in the rewrite at every level. Soft anchors (proper
// names, secondary details) are tracked for transparency but only enforced at the
// lighter levels; CEO is allowed to drop them.
export interface MeaningCheck {
  ok: boolean; // every hard anchor survived
  hard: string[]; // hard anchors found in the original
  dropped: string[]; // hard anchors missing from the rewrite
  softDropped: string[]; // soft anchors (names/secondary) missing, informational
}

export interface LevelResult {
  level: Level;
  output: string;
  attempts: number; // total candidates generated for this level
  model: ModelNameLike; // model that produced the chosen output
  before: AiTellReport;
  after: AiTellReport;
  judge: JudgeReport | null;
  meaning: MeaningCheck; // deterministic Layer-3 meaning gate
  quality: number; // composite 0..100 used to pick the best candidate
  passed: boolean; // cleared the full per-level quality bar
  enforced: string[]; // deterministic Layer-3 fixes applied to model output
  cached: boolean; // whether the cached prompt prefix was hit
}

export type ModelNameLike = string;

export interface HumanizeOptions {
  injectTypos: boolean; // CEO level only; opt-in, conservative
  runJudge: boolean;
  maxAttempts: number; // escalation cap per level (>=1); 1 disables strong-model rescue
  maxAiScore: number; // a candidate must beat this AI-tell score to pass cleanly
}

export interface HumanizeResponse {
  input: string;
  results: Partial<Record<Level, LevelResult>>;
  ms: number;
}

export const DEFAULT_OPTIONS: HumanizeOptions = {
  injectTypos: false,
  runJudge: true,
  maxAttempts: 2,
  maxAiScore: 28,
};
