import { app } from "electron";
import { join } from "node:path";
import { transform, type TransformResult } from "../../../lib/transform";
import { getApiKey } from "./secrets";
import { getConfig } from "./config";
import type { Level, TransformMode } from "../shared/types";

// Bridge to the shared rewrite engine (lib/transform.ts). The engine reads its
// voice corpus from UNSLOP_CORPUS_DIR; we resolve that to the packaged resource
// folder in production and back to the repo's data/corpus during dev. Setting it
// at module load is safe because the corpus is read lazily on first transform.
function resolveCorpusDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, "corpus");
  // Dev: out/main -> repo root -> data/corpus.
  return join(__dirname, "..", "..", "..", "data", "corpus");
}

process.env.UNSLOP_CORPUS_DIR = resolveCorpusDir();

export type EngineResult = TransformResult;

export async function runTransform(
  text: string,
  level: Level,
  mode: TransformMode,
): Promise<EngineResult> {
  const cfg = getConfig();
  const apiKey = getApiKey();
  return transform({
    text,
    level,
    mode,
    apiKey: apiKey.length > 0 ? apiKey : undefined,
    injectTypos: cfg.injectTypos,
  });
}
