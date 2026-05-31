import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unslop — make AI writing sound human",
  description:
    "Paste a message, get it back at three intensities: AI (de-slopped), Human, and CEO. Grounded in a real-voice corpus, with guardrails and an LLM judge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
