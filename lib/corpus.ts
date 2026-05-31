import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Level } from "./types";
import { FALLBACK_STYLE } from "./exemplars";

// Loads the scraped/curated target-voice corpus from data/corpus/*.json. Each
// file is bucketed by level: { samples: { subtle: [], human: [], ceo: [] } }. The
// corpus teaches the *voice* (cadence, register); the transform pairs in
// exemplars.ts teach the *task*. If the corpus is missing or thin, we fall back
// to the hardcoded FALLBACK_STYLE so the app always works offline.

interface CorpusFile {
  source?: string;
  samples?: Partial<Record<Level, string[]>>;
}

export interface Corpus {
  subtle: string[];
  human: string[];
  ceo: string[];
  sources: string[];
}

// Resolved lazily (not at module load) so a host process can point the engine at
// a different corpus location at runtime. The packaged desktop app ships the
// corpus as an electron-builder extraResource and sets UNSLOP_CORPUS_DIR to that
// path; the web app and CLI leave it unset and fall back to ./data/corpus.
function corpusDir(): string {
  const override = process.env.UNSLOP_CORPUS_DIR?.trim();
  return override && override.length > 0 ? override : join(process.cwd(), "data", "corpus");
}

let cached: Corpus | null = null;

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const s = raw.trim();
    const key = s.toLowerCase();
    if (s.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function loadCorpus(): Corpus {
  if (cached) return cached;

  const merged: Corpus = { subtle: [], human: [], ceo: [], sources: [] };

  const dir = corpusDir();
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const parsed = JSON.parse(
          readFileSync(join(dir, file), "utf8"),
        ) as CorpusFile;
        const s = parsed.samples;
        if (!s) continue;
        if (s.subtle) merged.subtle.push(...s.subtle);
        if (s.human) merged.human.push(...s.human);
        if (s.ceo) merged.ceo.push(...s.ceo);
        merged.sources.push(parsed.source ? `${file} (${parsed.source})` : file);
      } catch {
        // Skip malformed corpus files rather than crashing the request path.
      }
    }
  }

  merged.subtle = dedupe(merged.subtle);
  merged.human = dedupe(merged.human);
  merged.ceo = dedupe(merged.ceo);

  // Fall back per-level only where the corpus is empty.
  if (merged.subtle.length === 0) merged.subtle = [...FALLBACK_STYLE.subtle];
  if (merged.human.length === 0) merged.human = [...FALLBACK_STYLE.human];
  if (merged.ceo.length === 0) merged.ceo = [...FALLBACK_STYLE.ceo];

  cached = merged;
  return merged;
}

// Deterministic pseudo-random rotation so a given input doesn't always get the
// same exemplars across retries (more varied few-shot grounding), but results
// stay reproducible within a single request via the provided seed.
function rotate<T>(arr: T[], seed: number): T[] {
  if (arr.length <= 1) return arr;
  const offset = ((seed % arr.length) + arr.length) % arr.length;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}

export function selectStyleExemplars(level: Level, n: number, seed = 0): string[] {
  const corpus = loadCorpus();
  const pool = corpus[level];
  if (pool.length === 0) return [];
  // Prefer the most voice-defining samples per level: CEO wants the shortest
  // (tersest) lines; subtle wants fuller sentences; human is the natural middle.
  const ranked = [...pool].sort((a, b) => {
    if (level === "ceo") return a.length - b.length;
    if (level === "subtle") return b.length - a.length;
    return 0;
  });
  return rotate(ranked, seed).slice(0, Math.max(0, n));
}

export function corpusStats(): { subtle: number; human: number; ceo: number; sources: string[] } {
  const c = loadCorpus();
  return { subtle: c.subtle.length, human: c.human.length, ceo: c.ceo.length, sources: c.sources };
}
