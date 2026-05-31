/* eslint-disable no-console */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApifyClient } from "apify-client";
import type { Level } from "../lib/types";

// Refreshes data/corpus/ceo-tweets.json from live X/Twitter data via Apify.
// The corpus teaches VOICE only: we strip @handles, links, and hashtags and keep
// just the cadence/register, then bucket each line into subtle/human/ceo by length.
// Run with: APIFY_TOKEN=... npm run build-corpus
//
// Guest scraping of X is flaky (some accounts block it), so this is best-effort:
// if it can't harvest enough lines it leaves the curated file in place and warns.
// The committed curated corpus is the reliable default; this just upgrades it.

const HANDLES = [
  "paulg",
  "naval",
  "sama",
  "elonmusk",
  "garyvee",
  "jasonfried",
  "dhh",
  "shl",
  "patrickc",
  "balajis",
];

// thirdwatch/twitter-scraper was the most reliable in testing; override via env.
const TWITTER_ACTOR = process.env.TWITTER_ACTOR || "thirdwatch/twitter-scraper";
const TWEETS_PER_HANDLE = 40;

interface Buckets {
  subtle: string[];
  human: string[];
  ceo: string[];
}

function clean(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "") // links
    .replace(/@\w+/g, "") // mentions
    .replace(/#[\w]+/g, "") // hashtags
    .replace(/^RT\s+/i, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(s: string): number {
  return (s.match(/\S+/g) || []).length;
}

function bucketFor(s: string): Level | null {
  const w = wordCount(s);
  if (w < 2 || w > 45) return null;
  // Terse one-liners -> ceo; mid casual -> human; longer full-sentence -> subtle.
  if (w <= 6) return "ceo";
  if (w <= 22) return "human";
  return "subtle";
}

function looksLikeStyle(s: string): boolean {
  if (!s) return false;
  if (/^\W+$/.test(s)) return false; // emoji/punct only
  const letters = (s.match(/[a-z]/gi) || []).length;
  return letters / s.length > 0.5; // mostly real words
}

function dedupeCap(arr: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= cap) break;
  }
  return out;
}

async function scrapeTwitter(client: ApifyClient): Promise<Buckets> {
  const buckets: Buckets = { subtle: [], human: [], ceo: [] };

  // Input shape varies by actor; this matches the common handles/maxItems form.
  const input = {
    handles: HANDLES,
    handle: HANDLES,
    maxItems: HANDLES.length * TWEETS_PER_HANDLE,
    tweetsDesired: TWEETS_PER_HANDLE,
    addUserInfo: false,
  };

  console.log(`Running ${TWITTER_ACTOR} for ${HANDLES.length} handles...`);
  const run = await client.actor(TWITTER_ACTOR).call(input, { waitSecs: 240 });
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ clean: true });
  console.log(`  got ${items.length} raw items`);

  for (const item of items as Record<string, unknown>[]) {
    const text =
      (item.text as string) ||
      (item.full_text as string) ||
      (item.content as string) ||
      "";
    const c = clean(text);
    if (!looksLikeStyle(c)) continue;
    const b = bucketFor(c);
    if (b) buckets[b].push(c);
  }
  return buckets;
}

function merge(into: Buckets, from: Buckets): void {
  into.subtle.push(...from.subtle);
  into.human.push(...from.human);
  into.ceo.push(...from.ceo);
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("APIFY_TOKEN not set. See .env.example.");
    process.exit(1);
  }

  const client = new ApifyClient({ token });
  const buckets: Buckets = { subtle: [], human: [], ceo: [] };

  try {
    merge(buckets, await scrapeTwitter(client));
  } catch (e: unknown) {
    console.error(`  twitter scrape failed: ${e instanceof Error ? e.message : e}`);
  }

  const out: Buckets = {
    subtle: dedupeCap(buckets.subtle, 30),
    human: dedupeCap(buckets.human, 40),
    ceo: dedupeCap(buckets.ceo, 40),
  };

  const total = out.subtle.length + out.human.length + out.ceo.length;
  if (total < 12) {
    console.warn(
      `\nHarvested only ${total} usable lines — too thin to trust. ` +
        "Leaving the curated corpus in place. (X guest scraping is often blocked.)",
    );
    process.exit(0);
  }

  const payload = {
    source: `apify:${TWITTER_ACTOR}`,
    note: "Auto-harvested voice anchors (style only: handles/links/hashtags stripped). Refresh with npm run build-corpus.",
    harvestedAt: new Date().toISOString().slice(0, 10),
    samples: out,
  };

  const dest = join(process.cwd(), "data", "corpus", "ceo-tweets.json");
  writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${total} lines (subtle=${out.subtle.length} human=${out.human.length} ceo=${out.ceo.length}) -> ${dest}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
