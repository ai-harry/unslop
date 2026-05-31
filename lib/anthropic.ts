import Anthropic from "@anthropic-ai/sdk";

// Accepts an optional BYOK key (mirrors Sinceerly's model). Falls back to the
// server key. The BYOK key is never persisted server-side.
export function getClient(apiKey?: string): Anthropic {
  const key = apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No Anthropic API key. Set ANTHROPIC_API_KEY in .env or supply a BYOK key in the UI.",
    );
  }
  return new Anthropic({ apiKey: key });
}
