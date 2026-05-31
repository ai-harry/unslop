import { globalShortcut, clipboard } from "electron";
import type { Level, TransformMode } from "../shared/types";
import { getConfig, setConfig } from "./config";
import { hasApiKey } from "./secrets";
import { isAccessibilityTrusted, promptAccessibility } from "./accessibility";
import { captureSelection, pasteReplacement } from "./selection";
import { runTransform } from "./engine";
import { notify } from "./notify";

// Registers the global hotkeys and runs the full pipeline for each:
//   capture selection -> transform -> paste replacement -> restore clipboard.
// A single in-flight guard prevents overlapping transforms (which would race on
// the clipboard and the synthetic keystrokes).

let busy = false;
let onShowSettings: (() => void) | null = null;

export function setSettingsOpener(fn: () => void): void {
  onShowSettings = fn;
}

function levelLabel(level: Level): string {
  return level === "ceo" ? "CEO" : level === "human" ? "Human" : "Subtle";
}

async function runForLevel(level: Level, mode: TransformMode): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (!isAccessibilityTrusted()) {
      promptAccessibility();
      notify(
        "Accessibility needed",
        "Grant Unslop Accessibility access, then try the shortcut again.",
        true,
      );
      onShowSettings?.();
      return;
    }

    if (!hasApiKey()) {
      notify("API key needed", "Add your Anthropic API key in Unslop settings.", true);
      onShowSettings?.();
      return;
    }

    const { result, previousClipboard } = await captureSelection();
    if (result.status === "no-selection") {
      notify("Nothing selected", "Select some text first, then press the shortcut.");
      return;
    }
    if (result.status === "error") {
      notify("Couldn't read selection", result.error ?? "Unknown error", true);
      return;
    }

    // Remember the level so the polish key's "last" option knows what to redo.
    setConfig({ lastLevel: level });

    const out = await runTransform(result.text, level, mode);
    if (!out.output || out.output.trim().length === 0) {
      clipboardRestore(previousClipboard);
      notify("No rewrite produced", "The model returned nothing. Try again.", true);
      return;
    }

    const paste = await pasteReplacement(out.output, previousClipboard);
    if (!paste.ok) {
      notify("Couldn't paste", paste.error ?? "Unknown error", true);
      return;
    }

    const tag = mode === "full" ? "polished" : levelLabel(level);
    const extra = out.escalated ? " (escalated)" : "";
    notify(`${tag} ✓`, `${out.ms} ms · ai ${out.aiBefore}→${out.aiAfter}${extra}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transform failed";
    notify("Transform failed", message, true);
  } finally {
    busy = false;
  }
}

function clipboardRestore(previous: string): void {
  // Best-effort restore if we bail after seeding the clipboard.
  try {
    clipboard.writeText(previous);
  } catch {
    // ignore
  }
}

async function runPolish(): Promise<void> {
  const cfg = getConfig();
  const level: Level = cfg.polishLevel === "last" ? cfg.lastLevel : cfg.polishLevel;
  await runForLevel(level, "full");
}

// Register all configured shortcuts, reporting any that the OS rejects (usually a
// conflict with another app's global shortcut).
export function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  const cfg = getConfig();
  const mode = cfg.defaultMode;

  const bindings: Array<{ accel: string; run: () => void; name: string }> = [
    { accel: cfg.hotkeys.subtle, run: () => void runForLevel("subtle", mode), name: "Subtle" },
    { accel: cfg.hotkeys.human, run: () => void runForLevel("human", mode), name: "Human" },
    { accel: cfg.hotkeys.ceo, run: () => void runForLevel("ceo", mode), name: "CEO" },
    { accel: cfg.hotkeys.polish, run: () => void runPolish(), name: "Polish" },
  ];

  const failed: string[] = [];
  for (const b of bindings) {
    if (!b.accel) continue;
    try {
      const ok = globalShortcut.register(b.accel, b.run);
      if (!ok) failed.push(`${b.name} (${b.accel})`);
    } catch {
      failed.push(`${b.name} (${b.accel})`);
    }
  }

  if (failed.length > 0) {
    notify(
      "Some shortcuts are taken",
      `Couldn't register: ${failed.join(", ")}. Pick different keys in settings.`,
      true,
    );
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
