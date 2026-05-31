// Shared types used by the main process, the preload bridge, and the renderer.
// Keep this file dependency-free so it can be imported from any layer.

export type Level = "subtle" | "human" | "ceo";
export type TransformMode = "fast" | "full";

// "last" means: re-run the polish at whatever level was last triggered.
export type PolishLevel = Level | "last";

export interface Hotkeys {
  subtle: string;
  human: string;
  ceo: string;
  polish: string;
}

export interface AppConfig {
  hotkeys: Hotkeys;
  defaultMode: TransformMode; // mode the S/H/C keys use (fast by default)
  polishLevel: PolishLevel; // which level the polish key re-runs at full
  injectTypos: boolean; // CEO-only realistic typo
  lastLevel: Level; // remembered so polish "last" knows what to redo
  launchAtLogin: boolean;
  notifications: boolean;
}

export const DEFAULT_HOTKEYS: Hotkeys = {
  subtle: "Control+Alt+Command+S",
  human: "Control+Alt+Command+H",
  ceo: "Control+Alt+Command+C",
  polish: "Control+Alt+Command+P",
};

export const DEFAULT_CONFIG: AppConfig = {
  hotkeys: { ...DEFAULT_HOTKEYS },
  defaultMode: "fast",
  polishLevel: "last",
  injectTypos: false,
  lastLevel: "human",
  launchAtLogin: true,
  notifications: true,
};

// Flat result the renderer's live-test box renders. Mirrors lib/transform.ts's
// TransformResult, redeclared here so the renderer needs no engine import.
export interface TransformResultView {
  level: Level;
  mode: TransformMode;
  input: string;
  output: string;
  model: string;
  aiBefore: number;
  aiAfter: number;
  quality: number;
  passed: boolean;
  meaningOk: boolean;
  dropped: string[];
  enforced: string[];
  escalated: boolean;
  ms: number;
}

// The surface the preload script exposes on window.api.
export interface UnslopApi {
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<boolean>;
  clearApiKey(): Promise<boolean>;
  testTransform(input: {
    text: string;
    level: Level;
    mode: TransformMode;
  }): Promise<TransformResultView | { error: string }>;
  checkAccessibility(): Promise<boolean>;
  openAccessibility(): Promise<void>;
}
