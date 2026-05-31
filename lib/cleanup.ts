// Layer 3 (deterministic). Pure string transforms that remove the mechanical
// AI/typography tells the model sometimes leaves behind. This is the "Layer 1"
// cleanup the user asked to fold into the guardrail pass: it runs AFTER the LLM
// rewrite, never instead of it, so grammar is preserved while typography is
// normalized. Returns the cleaned text plus a human-readable list of what changed.

export interface CleanupResult {
  text: string;
  changes: string[];
}

const SMART_DOUBLE = /[“”„‟″]/g;
const SMART_SINGLE = /[‘’‚‛′]/g;
const EM_DASH = /—/g; // —
const EN_DASH = /–/g; // –
const ELLIPSIS = /…/g; // …
const NBSP = / /g;
const BULLET_LINE = /^\s*([*\-•‣◦⁃∙]|\d+[.)])\s+/;
const MD_BOLD_ITALIC = /(\*\*\*|\*\*|\*|__|_)(?=\S)(.+?)(?<=\S)\1/g;
const MD_HEADING = /^#{1,6}\s+/;
const MD_INLINE_CODE = /`([^`]+)`/g;

// Em-dashes carry meaning (parenthetical or pause). Replace with a comma or a
// spaced hyphen depending on surrounding whitespace so the sentence still reads.
function replaceEmDash(s: string): string {
  // " word — word " -> " word, word " ; "word—word" -> "word - word"
  return s
    .replace(/\s*—\s*/g, (m) => (m.includes(" ") ? ", " : " - "))
    .replace(/,\s*,/g, ", ");
}

export interface CleanupOptions {
  // AI level keeps full prose; CEO level tolerates lowercase + fragments, so we
  // do not "fix" those there. stripMarkdown is on for every level.
  stripMarkdown: boolean;
  collapseBullets: boolean;
}

export function cleanupText(
  input: string,
  opts: CleanupOptions = { stripMarkdown: true, collapseBullets: true },
): CleanupResult {
  const changes: string[] = [];
  let text = input;

  const before = text;

  if (SMART_DOUBLE.test(text)) {
    text = text.replace(SMART_DOUBLE, '"');
    changes.push("curly double-quotes -> straight");
  }
  if (SMART_SINGLE.test(text)) {
    text = text.replace(SMART_SINGLE, "'");
    changes.push("curly single-quotes/apostrophes -> straight");
  }
  if (EM_DASH.test(text)) {
    text = replaceEmDash(text);
    changes.push("em-dash -> comma/hyphen");
  }
  if (EN_DASH.test(text)) {
    text = text.replace(/\s*–\s*/g, (m) => (m.includes(" ") ? " - " : "-"));
    changes.push("en-dash -> hyphen");
  }
  if (ELLIPSIS.test(text)) {
    text = text.replace(ELLIPSIS, "...");
    changes.push("ellipsis char -> ...");
  }
  if (NBSP.test(text)) {
    text = text.replace(NBSP, " ");
    changes.push("non-breaking space -> space");
  }

  if (opts.stripMarkdown) {
    let mdChanged = false;
    const lines = text.split("\n").map((line) => {
      let l = line;
      if (MD_HEADING.test(l)) {
        l = l.replace(MD_HEADING, "");
        mdChanged = true;
      }
      return l;
    });
    text = lines.join("\n");

    if (MD_BOLD_ITALIC.test(text)) {
      text = text.replace(MD_BOLD_ITALIC, "$2");
      mdChanged = true;
    }
    if (MD_INLINE_CODE.test(text)) {
      text = text.replace(MD_INLINE_CODE, "$1");
      mdChanged = true;
    }
    if (mdChanged) changes.push("stripped markdown formatting");
  }

  if (opts.collapseBullets) {
    const lines = text.split("\n");
    let bulletHits = 0;
    const flattened = lines.map((line) => {
      if (BULLET_LINE.test(line)) {
        bulletHits++;
        return line.replace(BULLET_LINE, "");
      }
      return line;
    });
    if (bulletHits >= 2) {
      // Join consecutive bullet lines into sentence flow.
      text = flattened
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(" ");
      changes.push(`flattened ${bulletHits} bullet lines into prose`);
    } else {
      text = flattened.join("\n");
    }
  }

  // Whitespace hygiene (always).
  const tidied = text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();
  if (tidied !== text) {
    if (!changes.includes("whitespace tidied")) changes.push("whitespace tidied");
    text = tidied;
  }

  if (text === before && changes.length === 0) {
    return { text: before, changes: [] };
  }
  return { text, changes };
}
