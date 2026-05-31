"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  HumanizeResponse,
  Level,
  LevelResult,
  JudgeReport,
} from "@/lib/types";
import { LEVEL_ORDER } from "@/lib/types";
import { LEVELS } from "@/lib/levels";
import { diffWords } from "@/lib/diff";

const KEY_STORAGE = "unslop:byok";

const SAMPLE = `Hi Jordan,

I hope this email finds you well. I wanted to reach out to touch base regarding the proposal I sent over last week. I believe there are significant synergies between our two organizations, and I would love to leverage this opportunity to circle back and align on next steps moving forward. Please don't hesitate to reach out at your earliest convenience. I look forward to hearing from you.

Best regards,
Jess`;

type Tone = "good" | "warn" | "bad";

function scoreClass(score: number, goodMax: number, warnMax: number): Tone {
  if (score <= goodMax) return "good";
  if (score <= warnMax) return "warn";
  return "bad";
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <span className={`chip${tone ? " " + tone : ""}`}>
      {label}
      <b>{value}</b>
    </span>
  );
}

function JudgeChips({ level, judge }: { level: Level; judge: JudgeReport }) {
  const floor = LEVELS[level].judgeFloor;
  const tone = (v: number, f: number) =>
    v >= f ? "good" : v >= f - 15 ? "warn" : "bad";
  return (
    <>
      <Chip label="human" value={`${judge.humanness}`} tone={tone(judge.humanness, floor.humanness)} />
      <Chip label="style" value={`${judge.styleMatch}`} tone={tone(judge.styleMatch, floor.styleMatch)} />
      <Chip label="meaning" value={`${judge.meaning}`} tone={tone(judge.meaning, floor.meaning)} />
      <Chip
        label="voice"
        value={`${judge.voiceAuthenticity}`}
        tone={tone(judge.voiceAuthenticity, floor.voiceAuthenticity)}
      />
    </>
  );
}

function ResultCard({
  level,
  original,
  result,
}: {
  level: Level;
  original: string;
  result: LevelResult;
}) {
  const spec = LEVELS[level];
  const [copied, setCopied] = useState(false);
  const segments = useMemo(
    () => diffWords(original, result.output),
    [original, result.output],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  const aiTone = scoreClass(result.after.score, 28, 50);
  const modelShort = result.model.includes("haiku") ? "haiku" : "sonnet";
  const qFloor = spec.qualityFloor;
  const qualityTone: Tone =
    result.quality >= qFloor ? "good" : result.quality >= qFloor - 10 ? "warn" : "bad";

  // Length comparison vs the original. Same reference (the original) across all
  // three cards, so the bars are directly comparable: you can see at a glance
  // whether a level grew or shrank the message.
  const origLen = original.length;
  const outLen = result.output.length;
  const ratio = origLen > 0 ? outLen / origLen : 1;
  const deltaPct = Math.round((ratio - 1) * 100);
  const lenLabel =
    deltaPct === 0
      ? "same length"
      : deltaPct < 0
        ? `${Math.abs(deltaPct)}% shorter`
        : `${deltaPct}% longer`;

  return (
    <div className="card">
      <div className="head">
        <div className="lvl">
          <span className={`pill ${level}`}>{spec.label}</span>
        </div>
        <div className="blurb">{spec.blurb}</div>
      </div>

      <div className="body">
        {segments.map((seg, idx) =>
          seg.added ? <mark key={idx}>{seg.text}</mark> : <span key={idx}>{seg.text}</span>,
        )}
      </div>

      <div className="foot">
        <div className="lenrow">
          <div
            className="lenbar"
            title={`${outLen} characters vs ${origLen} in your original`}
          >
            <div
              className="lenfill"
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
              data-over={outLen > origLen}
            />
          </div>
          <span className="lenlabel">
            {outLen} chars · {lenLabel}
          </span>
        </div>

        <div className="scorerow">
          <Chip label="quality" value={`${result.quality}`} tone={qualityTone} />
          <Chip
            label="ai-tell"
            value={`${result.before.score}→${result.after.score}`}
            tone={aiTone}
          />
          {result.judge ? <JudgeChips level={level} judge={result.judge} /> : null}
          <Chip label="model" value={modelShort} />
          {result.attempts > 1 ? <Chip label="tries" value={`${result.attempts}`} tone="warn" /> : null}
          {result.cached ? <Chip label="cache" value="hit" tone="good" /> : null}
        </div>

        {result.meaning.dropped.length > 0 ? (
          <div className="enforced">
            <b>dropped:</b> {result.meaning.dropped.join(", ")}
          </div>
        ) : null}

        {result.enforced.length > 0 ? (
          <div className="enforced">
            <b>cleanup:</b> {result.enforced.join(", ")}
          </div>
        ) : null}

        <div className="metaline">
          <span className={`verdict ${result.passed ? "pass" : "fail"}`}>
            {result.passed ? "pass" : "best effort"}
          </span>
          <button className="copy" onClick={copy}>
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ level }: { level: Level }) {
  const spec = LEVELS[level];
  return (
    <div className="card">
      <div className="head">
        <div className="lvl">
          <span className={`pill ${level}`}>{spec.label}</span>
        </div>
        <div className="blurb">{spec.blurb}</div>
      </div>
      <div className="body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="skel" style={{ width: "92%" }} />
        <div className="skel" style={{ width: "78%" }} />
        <div className="skel" style={{ width: "85%" }} />
        <div className="skel" style={{ width: "60%" }} />
      </div>
      <div className="foot">
        <div className="skel" style={{ width: "50%", height: 18 }} />
      </div>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [injectTypos, setInjectTypos] = useState(false);
  const [runJudge, setRunJudge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HumanizeResponse | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) setApiKey(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const onKeyChange = (v: string) => {
    setApiKey(v);
    try {
      if (v.trim()) localStorage.setItem(KEY_STORAGE, v.trim());
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* ignore */
    }
  };

  const run = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          apiKey: apiKey.trim() || undefined,
          options: { injectTypos, runJudge },
        }),
      });
      const json = (await res.json()) as HumanizeResponse & { error?: string };
      if (!res.ok || json.error) {
        setError(json.error || `Request failed (${res.status}).`);
      } else {
        setData(json);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
  };

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <h1>
            Unslop<span className="dot">.</span>
          </h1>
          <p>
            Paste anything that reads like a robot wrote it. Get it back at three
            intensities, each de-slopped, voice-matched, and checked by an LLM judge.
          </p>
        </div>
        <div className="keybox">
          <label htmlFor="key">Anthropic API key (optional, BYOK)</label>
          <input
            id="key"
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="hint">Stored only in your browser. Falls back to the server key.</div>
        </div>
      </header>

      <section className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste your AI-sounding email, DM, or message here..."
        />
        <div className="controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={runJudge}
              onChange={(e) => setRunJudge(e.target.checked)}
            />
            LLM judge
          </label>
          <label className="toggle" title="CEO level only: allows one subtle realistic typo">
            <input
              type="checkbox"
              checked={injectTypos}
              onChange={(e) => setInjectTypos(e.target.checked)}
            />
            CEO typos
          </label>
          <button className="ghost" onClick={() => setInput(SAMPLE)} type="button">
            Try a sample
          </button>
          <span className="spacer" />
          <span className="char">{input.length} chars</span>
          <button className="run" onClick={run} disabled={loading || !input.trim()}>
            {loading ? "Unslopping..." : "Humanize"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </section>

      {loading ? (
        <div className="grid">
          {LEVEL_ORDER.map((lvl) => (
            <SkeletonCard key={lvl} level={lvl} />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid">
            {LEVEL_ORDER.map((lvl) => {
              const r = data.results[lvl];
              return r ? (
                <ResultCard key={lvl} level={lvl} original={data.input} result={r} />
              ) : null;
            })}
          </div>
          <div className="foot-note">
            done in {(data.ms / 1000).toFixed(1)}s · 3 levels in parallel, stacked so you
            can compare lengths · the bar in each card shows its length vs your original
            (full bar = same length) · yellow = changed from your original
          </div>
        </>
      ) : (
        <div className="foot-note">
          Three layers under the hood: an LLM rewrite engine grounded in a real-voice
          corpus, deterministic typography cleanup, and an AI-tell detector plus LLM
          judge that retries and escalates when a rewrite doesn&apos;t pass. Press{" "}
          <code>Cmd/Ctrl + Enter</code> to run.
        </div>
      )}
    </main>
  );
}
