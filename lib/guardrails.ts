import type { AiTellReport, AiTellSignals, Level } from "./types";
import { BANNED_PHRASES } from "./exemplars";
import { cleanupText, type CleanupResult } from "./cleanup";

// Layer 3 (detection). A cheap, deterministic "does this read like AI slop?"
// heuristic. It is NOT a classifier of truth — it scores the surface tells that
// make text feel machine-written: typographic giveaways, corporate banned
// phrases, and unnaturally uniform sentence rhythm (low burstiness). The score
// drives the retry/escalation decision in the orchestrator.

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance =
    nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length;
  return Math.sqrt(variance);
}

export function detectAiTells(text: string): AiTellReport {
  const lower = text.toLowerCase();

  const emDashes = (text.match(/—/g) || []).length;
  const enDashes = (text.match(/–/g) || []).length;
  const smartQuotes = (text.match(/[“”‘’„‟]/g) || []).length;

  const bannedPhrases = BANNED_PHRASES.filter((p) => lower.includes(p));

  const bulletRuns = (text.match(/^\s*([*\-•‣◦]|\d+[.)])\s+/gm) || []).length;

  const sentences = splitSentences(text);
  const sentenceLens = sentences.map(countWords);
  const words = countWords(text);
  const avgSentenceLen =
    sentenceLens.length > 0
      ? sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length
      : words;
  const burstiness = stdev(sentenceLens);
  const longSentenceRatio =
    sentenceLens.length > 0
      ? sentenceLens.filter((n) => n >= 25).length / sentenceLens.length
      : 0;

  const signals: AiTellSignals = {
    emDashes,
    enDashes,
    smartQuotes,
    bannedPhrases,
    bulletRuns,
    words,
    avgSentenceLen,
    burstiness,
    longSentenceRatio,
  };

  const score = scoreSignals(signals);
  return { score, signals };
}

// Weighted 0..100. Tuned so a clean human note scores < 20 and a paragraph of
// corporate slop scores > 60. Each term is individually capped so no single
// signal can dominate, then the sum is clamped.
function scoreSignals(s: AiTellSignals): number {
  let score = 0;

  // Typography: strong, almost-certain tells.
  score += Math.min(20, s.emDashes * 10);
  score += Math.min(8, s.enDashes * 6);
  score += Math.min(12, s.smartQuotes * 3);

  // Corporate phrases: each one is a loud tell. A message stuffed with several
  // should clear the rewrite ceiling on phrases alone.
  score += Math.min(38, s.bannedPhrases.length * 13);

  // Markdown bullets in an email body read as machine-generated.
  score += Math.min(10, s.bulletRuns * 4);

  // Rhythm. Humans vary sentence length (high burstiness). Robots don't.
  // Only penalize when there's enough text to judge (>~25 words).
  if (s.words >= 25) {
    if (s.burstiness < 3) score += 14;
    else if (s.burstiness < 5) score += 8;
    else if (s.burstiness < 7) score += 3;

    if (s.avgSentenceLen > 24) score += 8;
    else if (s.avgSentenceLen > 20) score += 4;

    score += Math.round(s.longSentenceRatio * 10);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Deterministic enforcement applied to model output before judging. Every level
// strips markdown, normalizes punctuation, and flattens stray bullet runs (an
// email body should never contain a markdown list, regardless of intensity).
export function enforce(_level: Level, text: string): CleanupResult {
  return cleanupText(text, { stripMarkdown: true, collapseBullets: true });
}
