import type { Level } from "./types";

// Hand-authored transformation anchors. Few-shot pairs teach the *task* (the
// same message rendered at each level). The scraped corpus (lib/corpus.ts)
// teaches the *target voice*. Pairs matter more than raw samples for style
// transfer, so these are curated rather than scraped. Each row keeps identical
// facts across columns so the model learns voice, not content drift.
export interface TransformPair {
  slop: string;
  subtle: string;
  human: string;
  ceo: string;
}

export const TRANSFORM_PAIRS: TransformPair[] = [
  {
    slop: "I wanted to reach out to express my interest in connecting regarding potential synergies between our organizations. I believe there is significant value in exploring how we might collaborate moving forward. Please let me know if you would be available for a brief call at your earliest convenience.",
    subtle:
      "I think there's a strong fit between what our two companies are building, and it's worth exploring how we might work together. Would you be open to a short call sometime this week?",
    human:
      "Hey, I think there's a real fit here. Worth a quick call? I'll work around your week.",
    ceo: "think there's a fit here. 15 min this week?",
  },
  {
    slop: "Thank you so much for taking the time to meet with me yesterday. I thoroughly enjoyed our conversation and found your insights incredibly valuable. I am very much looking forward to working together and will follow up with the additional materials we discussed at your earliest convenience.",
    subtle:
      "Thanks for meeting yesterday. I got a lot out of the conversation and I'm looking forward to working together. I'll send over the materials we discussed by tomorrow.",
    human:
      "Thanks again for yesterday, got a ton out of it. I'll get those docs over tomorrow.",
    ceo: "good talk yesterday. docs tomorrow.",
  },
  {
    slop: "I hope this email finds you well. I am writing to follow up on my previous message regarding the proposal I sent over last week. I would greatly appreciate it if you could provide any feedback at your earliest convenience. Please do not hesitate to reach out should you have any questions.",
    subtle:
      "Following up on the proposal I sent last week. Any feedback would be helpful, and I'm happy to answer questions.",
    human:
      "Hey, bumping this in case it got buried. Did you get a look at the proposal? Lmk.",
    ceo: "did the proposal land? lmk.",
  },
  {
    slop: "It is with great enthusiasm that I am reaching out to inform you that we have successfully completed the integration. Moving forward, I would like to underscore the importance of aligning on next steps so that we can leverage this momentum and continue to drive value for all stakeholders involved.",
    subtle:
      "The integration is complete. I'd like to agree on next steps soon so we can keep the momentum going. What works for you this week?",
    human:
      "Integration's live. Let's lock next steps while we've got momentum. What works for you?",
    ceo: "integration's live. next steps, call tomorrow?",
  },
  {
    slop: "Thank you for putting together this detailed proposal. After careful consideration, I regret to inform you that the proposed budget of $80,000 exceeds what we are able to allocate at this time. I would be more than happy to revisit this conversation should circumstances change in the future.",
    subtle:
      "Thanks for the detailed proposal. The $80,000 budget is more than we can allocate right now, so we'll have to pass for the moment. Happy to revisit if things change.",
    human:
      "Appreciate the proposal, but $80,000's more than we can do right now. Revisit down the line?",
    ceo: "$80,000's too high. revisit next quarter.",
  },
  {
    slop: "I hope you are doing well. Moving forward, I would like to underscore the importance of aligning on next steps. Could we please find time for a brief sync on Thursday at 2pm PST to discuss the launch timeline and the three open risks? Thank you for your time and consideration.",
    subtle:
      "Could we grab a short sync on Thursday at 2pm PST? I'd like to lock the launch timeline and walk through the three open risks.",
    human:
      "Can we grab 20 min Thursday at 2pm PST? Want to nail the launch date and the three open risks.",
    ceo: "thursday 2pm pst? need launch date and the 3 risks.",
  },
  {
    slop: "Thank you for sending this over for my review. Having carefully examined the materials, I am pleased to confirm that everything appears to be in order. You have my full approval to proceed, and please do not hesitate to reach out should anything else arise.",
    subtle:
      "Thanks for sending this over. I've reviewed it and everything looks in order. You're good to proceed, and let me know if anything else comes up.",
    human:
      "Looked it over, all checks out. Run with it. Ping me if anything comes up.",
    ceo: "looks good. approved. go.",
  },
  {
    slop: "I am reaching out to follow up on the outstanding deliverable that was originally due last Friday. I understand that priorities shift, however I would greatly appreciate an updated timeline at your earliest convenience so that we can plan accordingly on our end.",
    subtle:
      "Following up on the deliverable that was due last Friday. Could you send me an updated timeline so we can plan on our end?",
    human:
      "Hey, the Friday deliverable's still open. Can you send a new date so I can plan?",
    ceo: "friday deliverable's still open. new date?",
  },
];

export function pairTarget(pair: TransformPair, level: Level): string {
  return pair[level];
}

// Phrases that read as AI/corporate slop. The detector counts these (raising the
// AI score, which can trigger a rewrite). We do NOT delete them mechanically,
// because excising mid-sentence breaks grammar — the LLM rephrases instead.
export const BANNED_PHRASES: string[] = [
  "i wanted to reach out",
  "i hope this email finds you well",
  "i hope this message finds you well",
  "at your earliest convenience",
  "please don't hesitate to",
  "please do not hesitate to",
  "feel free to reach out",
  "i am writing to",
  "i'm writing to",
  "circle back",
  "touch base",
  "moving forward",
  "synergy",
  "synergies",
  "leverage",
  "it's worth noting",
  "it is important to note",
  "delve into",
  "tapestry",
  "testament to",
  "navigate the complexities",
  "underscore",
  "that being said",
  "as previously mentioned",
  "in conclusion",
  "furthermore",
  "moreover",
  "first and foremost",
  "when it comes to",
  "a game changer",
  "seamless",
  "robust",
  "myriad",
  "plethora",
  "i'd be more than happy to",
  "i look forward to hearing from you",
  "thank you for your time and consideration",
  "drive value",
  "stakeholders",
  "align on",
  "on the same page",
  "move the needle",
  "outside the box",
  "low-hanging fruit",
  "deep dive",
  "paradigm shift",
  "take this offline",
  "bandwidth",
  "boil the ocean",
  "unpack this",
  "drill down",
  "raise the bar",
];

// Fallback target-voice samples, used only if the scraped corpus is unavailable.
// Kept short and generic on purpose.
export const FALLBACK_STYLE: Record<Level, string[]> = {
  subtle: [
    "Thanks for the update. I'll review this and get back to you by Friday.",
    "Got it, this makes sense. Let's go with option B.",
    "Appreciate the detail here. I'm on board with the direction you've laid out.",
  ],
  human: [
    "Hey, sorry for the slow reply, this week's been nuts. Still in for Thursday?",
    "Honestly this looks great. One small thing on slide 3, otherwise ship it.",
    "Yeah let's do it. I'll set up the doc and tag you.",
  ],
  ceo: [
    "yes. ship it.",
    "no. too expensive.",
    "call me",
    "who owns this?",
    "lets do tues. 20 min.",
    "not now. q3.",
  ],
};
