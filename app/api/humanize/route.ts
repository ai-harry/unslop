import { NextResponse } from "next/server";
import { humanize } from "@/lib/humanize";
import type { HumanizeOptions } from "@/lib/types";

// Node runtime: the corpus loader reads from the filesystem (fs), which the edge
// runtime can't do. maxDuration covers the worst case (a level that escalates to
// the strong model plus a judge pass) for all three levels in parallel.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INPUT_CHARS = 6000;

interface HumanizeBody {
  input?: unknown;
  apiKey?: unknown;
  options?: unknown;
}

function coerceOptions(raw: unknown): Partial<HumanizeOptions> {
  if (typeof raw !== "object" || raw === null) return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<HumanizeOptions> = {};
  if (typeof o.injectTypos === "boolean") out.injectTypos = o.injectTypos;
  if (typeof o.runJudge === "boolean") out.runJudge = o.runJudge;
  if (typeof o.maxAttempts === "number" && Number.isFinite(o.maxAttempts)) {
    out.maxAttempts = Math.max(1, Math.min(3, Math.round(o.maxAttempts)));
  }
  if (typeof o.maxAiScore === "number" && Number.isFinite(o.maxAiScore)) {
    out.maxAiScore = Math.max(0, Math.min(100, Math.round(o.maxAiScore)));
  }
  return out;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: HumanizeBody;
  try {
    body = (await req.json()) as HumanizeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input : "";
  if (input.trim().length === 0) {
    return NextResponse.json({ error: "Provide a message to rewrite." }, { status: 400 });
  }
  if (input.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_INPUT_CHARS} characters).` },
      { status: 413 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
  const options = coerceOptions(body.options);

  try {
    const result = await humanize(input, options, apiKey);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Rewrite failed.";
    // Surface the BYOK/missing-key message to the client; it's actionable.
    const status = message.toLowerCase().includes("api key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
