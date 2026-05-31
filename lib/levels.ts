import type { Level } from "./types";

export interface LevelSpec {
  id: Level;
  label: string;
  blurb: string;
  // Instruction fragment appended to the (cached) base system prompt.
  goal: string;
  exemplarCount: number; // how many target-voice samples to inject
  candidates: number; // best-of-N: how many rewrites to generate and judge
  allowTypos: boolean;
  judgeFloor: {
    humanness: number;
    styleMatch: number;
    meaning: number;
    voiceAuthenticity: number;
  };
  qualityFloor: number; // composite score a candidate must clear to "pass"
}

export const LEVELS: Record<Level, LevelSpec> = {
  subtle: {
    id: "subtle",
    label: "Subtle",
    blurb: "Lightest touch. Strips the AI tells, keeps it polished and professional.",
    goal: [
      "LEVEL = Subtle (lightest touch): Keep the original structure, length, and",
      "professional register, but strip every AI and corporate tell. No em-dashes,",
      "no en-dashes, no smart quotes, no markdown, no bullet lists, and none of the",
      "banned slop phrases. Tighten wordy phrasing and cut filler, but keep full,",
      "grammatical sentences. The result reads like a sharp human professional",
      "proofread it: not robotic, but not a casual text either. Preserve every fact,",
      "name, number, date, ask, and link from the original.",
    ].join(" "),
    exemplarCount: 3,
    candidates: 2,
    allowTypos: false,
    judgeFloor: { humanness: 65, styleMatch: 65, meaning: 85, voiceAuthenticity: 60 },
    qualityFloor: 75,
  },
  human: {
    id: "human",
    label: "Human",
    blurb: "How a real person actually writes. Short, warm, to the point. Cuts the fat.",
    goal: [
      "LEVEL = Human (medium): Rewrite it the way a real, busy person actually types a",
      "message to a colleague: short, warm, and straight to the point. This is NOT a",
      "synonym swap. CUT hard. The rewrite should almost always be SHORTER than the",
      "original, usually a lot shorter; if it comes out about the same length as the",
      "input, you did it wrong. Keep only what a person would actually say out loud.",
      "Use contractions and plain everyday words. Vary sentence length hard: lean on",
      "short, punchy lines and let one or two be just two or three words. A light",
      "'Hey' and a casual sign-off are optional, not required. Kill every hedge,",
      "filler word, and corporate phrase. It should read like someone typed it fast on",
      "their phone, not like a press release. Keep every fact, name, number, date,",
      "ask, and link. Never invent details.",
    ].join(" "),
    exemplarCount: 5,
    candidates: 3,
    allowTypos: false,
    judgeFloor: { humanness: 78, styleMatch: 72, meaning: 82, voiceAuthenticity: 72 },
    qualityFloor: 70,
  },
  ceo: {
    id: "ceo",
    label: "CEO",
    blurb: "Brutally terse. One line, blunt, lowercase. The 'replied in 9 words' voice.",
    goal: [
      "LEVEL = CEO (heavy): Rewrite as a time-poor founder firing back a reply in",
      "seconds. Brutally terse. Usually one line, rarely two, and almost always under",
      "12 words per sentence. No greeting, no recipient name, no pleasantries, no",
      "sign-off. Lowercase is natural and fine. Use blunt imperatives and sharp",
      "questions. Keep only the single core ask or decision plus the one number or",
      "fact that actually matters. It is fine to drop secondary details a busy exec",
      "would skip, but never change the meaning of what remains and never invent",
      "anything.",
    ].join(" "),
    exemplarCount: 7,
    candidates: 3,
    allowTypos: true,
    judgeFloor: { humanness: 72, styleMatch: 78, meaning: 75, voiceAuthenticity: 78 },
    qualityFloor: 68,
  },
};

export function levelInstruction(level: Level, injectTypos: boolean): string {
  const spec = LEVELS[level];
  let s = spec.goal;
  if (spec.allowTypos && injectTypos) {
    s +=
      " Optionally introduce at most ONE subtle, realistic typo (a missing letter" +
      " or 'tmrw'/'lmk' shorthand). Never more than one, never in a number, name, or link.";
  }
  return s;
}
