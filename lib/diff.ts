// Word-level diff used by the UI to highlight what the rewrite changed, the way
// Sinceerly highlights edits in yellow. Pure (no Node deps) so it can run in the
// client bundle. We tokenize on whitespace boundaries (keeping the spaces), run a
// classic LCS, and mark output tokens that aren't part of the common subsequence
// as "added" -> these get the highlight.

export interface DiffSegment {
  text: string;
  added: boolean;
}

function tokenize(s: string): string[] {
  // Keep separators so reassembly is loss-less.
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function normalize(tok: string): string {
  return tok.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function diffWords(original: string, rewrite: string): DiffSegment[] {
  const a = tokenize(original);
  const b = tokenize(rewrite);
  const na = a.map(normalize);
  const nb = b.map(normalize);

  const n = a.length;
  const m = b.length;

  // LCS DP over normalized tokens (ignore pure-whitespace tokens for matching).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const match =
        na[i].length > 0 && na[i] === nb[j] ? 1 + dp[i + 1][j + 1] : 0;
      dp[i][j] = match || Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Walk to mark which b-tokens are part of the LCS (unchanged) vs added.
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  const pushTok = (text: string, added: boolean) => {
    const last = segments[segments.length - 1];
    if (last && last.added === added) last.text += text;
    else segments.push({ text, added });
  };

  while (j < m) {
    if (i < n && na[i].length > 0 && na[i] === nb[j] && dp[i][j] === 1 + dp[i + 1][j + 1]) {
      pushTok(b[j], false);
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
      // original token consumed (a deletion) — not shown in output
      i++;
    } else {
      // whitespace is never "added" highlight noise; treat it as neutral
      const isSpace = nb[j].length === 0;
      pushTok(b[j], !isSpace);
      j++;
    }
  }

  return segments;
}
