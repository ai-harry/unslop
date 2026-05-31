// Model routing. Fast model handles the common case and runs all three levels
// in parallel; the strong model is the escalation target when Layer 3 guardrails
// reject the first attempt.
export const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  strong: "claude-sonnet-4-6",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
