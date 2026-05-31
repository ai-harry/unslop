import type { Level, MeaningCheck } from "./types";

// Layer 3 (deterministic meaning gate). Runs BEFORE the LLM judge and is the
// hard backstop the judge can't be trusted to enforce: the catastrophic facts
// (money, percentages, emails, links) must survive verbatim in the rewrite at
// every level. These are high-signal and almost never legitimately reworded, so
// losing one is always a meaning failure that fails the gate outright.
//
// Softer details (proper names, times, day-of-week, plain counts) are tracked for
// transparency but never fail the gate. The set we track is level-aware: a terse
// CEO reply is expected to shed names and secondary specifics, so we don't even
// flag those drops at the CEO level.

const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?[kmb]?/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s?%/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE =
  /\b(?:https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(?:com|io|ai|co|org|net|dev|app|xyz|gov|edu)(?:\/[^\s]*)?)/gi;
const TIME_RE = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi;
const DAY_RE = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/gi;
const NAME_RE = /\b[A-Z][a-z]+\b/g;

const NAME_STOP = new Set([
  "Hi", "Hey", "Hello", "Dear", "Thanks", "Thank", "Best", "Regards", "Cheers",
  "Please", "Could", "Would", "Should", "Yes", "No", "Ok", "Okay", "The", "This",
  "That", "We", "You", "Our", "Your", "Let", "Looking", "Following", "Moving",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
]);

interface Anchor {
  display: string;
  forms: string[]; // squashed surface forms, any of which counts as preserved
}

function squash(s: string): string {
  return s.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
}

function trimEdges(s: string): string {
  return s.replace(/^[^\w$]+/, "").replace(/[^\w%/]+$/, "");
}

function moneyForms(token: string): string[] {
  const t = token.toLowerCase().replace(/\s/g, "");
  const forms = new Set<string>([t.replace(/,/g, "")]);
  const mag = t.match(/([kmb])$/)?.[1];
  const digits = t.replace(/[^\d]/g, "");
  if (digits) {
    let full = Number.parseInt(digits, 10);
    if (mag === "k") full *= 1_000;
    else if (mag === "m") full *= 1_000_000;
    else if (mag === "b") full *= 1_000_000_000;
    if (Number.isFinite(full)) {
      forms.add(`$${full}`);
      if (full % 1_000 === 0) forms.add(`$${full / 1_000}k`);
      if (full % 1_000_000 === 0) forms.add(`$${full / 1_000_000}m`);
    }
  }
  return [...forms];
}

function percentForms(token: string): string[] {
  const num = token.replace(/[^\d.]/g, "");
  return [`${num}%`, `${num}percent`];
}

function pushUnique(map: Map<string, Anchor>, display: string, forms: string[]): void {
  const key = squash(display);
  if (key && !map.has(key)) map.set(key, { display, forms });
}

function extractHardAnchors(text: string): Anchor[] {
  const map = new Map<string, Anchor>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const tok = trimEdges(m[0]);
    pushUnique(map, tok, [squash(tok)]);
  }
  for (const m of text.matchAll(URL_RE)) {
    const tok = trimEdges(m[0]);
    if (tok.includes("@")) continue; // already captured as an email
    pushUnique(map, tok, [squash(tok)]);
  }
  for (const m of text.matchAll(MONEY_RE)) {
    const tok = trimEdges(m[0]);
    pushUnique(map, tok, moneyForms(tok));
  }
  for (const m of text.matchAll(PERCENT_RE)) {
    const tok = trimEdges(m[0]);
    pushUnique(map, tok, percentForms(tok));
  }
  return [...map.values()];
}

function isSentenceInitial(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return true;
  return /[.!?"']/.test(text[i]);
}

function extractSoftAnchors(text: string, level: Level): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(NAME_RE)) {
    const tok = m[0];
    if (NAME_STOP.has(tok)) continue;
    if (m.index !== undefined && isSentenceInitial(text, m.index)) continue;
    out.add(tok);
  }
  // CEO is expected to drop names and secondary specifics, so we don't track
  // (and therefore never surface) those drops at that level.
  if (level !== "ceo") {
    for (const m of text.matchAll(TIME_RE)) out.add(m[0].trim());
    for (const m of text.matchAll(DAY_RE)) out.add(m[0]);
  }
  return [...out];
}

export function checkMeaning(original: string, rewrite: string, level: Level): MeaningCheck {
  const squashedRewrite = squash(rewrite);
  const lowerRewrite = rewrite.toLowerCase();

  const hardAnchors = extractHardAnchors(original);
  const hard: string[] = [];
  const dropped: string[] = [];
  for (const anchor of hardAnchors) {
    hard.push(anchor.display);
    const preserved = anchor.forms.some((f) => squashedRewrite.includes(f));
    if (!preserved) dropped.push(anchor.display);
  }

  const softAnchors = extractSoftAnchors(original, level);
  const softDropped = softAnchors.filter((s) => !lowerRewrite.includes(s.toLowerCase()));

  return { ok: dropped.length === 0, hard, dropped, softDropped };
}
