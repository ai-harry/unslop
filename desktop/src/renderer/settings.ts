import type {
  AppConfig,
  Hotkeys,
  Level,
  TransformMode,
  TransformResultView,
  UnslopApi,
} from "../shared/types";

declare global {
  interface Window {
    api: UnslopApi;
  }
}

const api = window.api;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

let config: AppConfig;

// ── Status badges ────────────────────────────────────────────────────────────
function setBadge(id: string, ok: boolean, okText: string, badText: string): void {
  const b = el(id);
  b.textContent = ok ? okText : badText;
  b.className = `badge ${ok ? "ok" : "bad"}`;
}

async function refreshKeyBadge(): Promise<void> {
  setBadge("keyBadge", await api.hasApiKey(), "set", "missing");
}

async function refreshAccessBadge(): Promise<void> {
  setBadge("accessBadge", await api.checkAccessibility(), "granted", "not granted");
}

function flash(message: string): void {
  const f = el("saveState");
  f.textContent = message;
  window.setTimeout(() => {
    if (f.textContent === message) f.textContent = "";
  }, 1600);
}

// ── Hotkey recorder ──────────────────────────────────────────────────────────
const MOD_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);
const SPECIAL: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Enter: "Return",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
};

function normalizeKey(e: KeyboardEvent): string | null {
  const k = e.key;
  if (MOD_KEYS.has(k)) return null;
  if (k.length === 1) return k.toUpperCase();
  if (SPECIAL[k]) return SPECIAL[k];
  if (/^F([1-9]|1[0-2])$/.test(k)) return k;
  return null;
}

function toAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Command");
  const key = normalizeKey(e);
  if (!key || mods.length === 0) return null;
  return [...mods, key].join("+");
}

function bindRecorder(slot: keyof Hotkeys): void {
  const input = el<HTMLInputElement>(`hk-${slot}`);
  input.value = config.hotkeys[slot];

  input.addEventListener("focus", () => input.classList.add("recording"));
  input.addEventListener("blur", () => input.classList.remove("recording"));

  input.addEventListener("keydown", async (e) => {
    e.preventDefault();
    if (e.key === "Escape") {
      input.blur();
      return;
    }
    const accel = toAccelerator(e);
    if (!accel) {
      flash("Use at least one modifier (⌘ ⌥ ⌃ ⇧) plus a key.");
      return;
    }
    input.value = accel;
    config = await api.setConfig({ hotkeys: { ...config.hotkeys, [slot]: accel } });
    input.blur();
    flash(`${slot} shortcut saved.`);
  });
}

// ── Behaviour controls ───────────────────────────────────────────────────────
function bindBehaviour(): void {
  const defaultMode = el<HTMLSelectElement>("defaultMode");
  defaultMode.value = config.defaultMode;
  defaultMode.addEventListener("change", async () => {
    config = await api.setConfig({ defaultMode: defaultMode.value as TransformMode });
    flash("Default mode saved.");
  });

  const polishLevel = el<HTMLSelectElement>("polishLevel");
  polishLevel.value = config.polishLevel;
  polishLevel.addEventListener("change", async () => {
    config = await api.setConfig({
      polishLevel: polishLevel.value as AppConfig["polishLevel"],
    });
    flash("Polish level saved.");
  });

  bindCheck("injectTypos", config.injectTypos, (v) => ({ injectTypos: v }));
  bindCheck("launchAtLogin", config.launchAtLogin, (v) => ({ launchAtLogin: v }));
  bindCheck("notifications", config.notifications, (v) => ({ notifications: v }));
}

function bindCheck(
  id: string,
  initial: boolean,
  patch: (v: boolean) => Partial<AppConfig>,
): void {
  const box = el<HTMLInputElement>(id);
  box.checked = initial;
  box.addEventListener("change", async () => {
    config = await api.setConfig(patch(box.checked));
    flash("Saved.");
  });
}

// ── API key + accessibility actions ──────────────────────────────────────────
function bindKeyAndAccess(): void {
  const keyInput = el<HTMLInputElement>("apiKey");

  el("saveKey").addEventListener("click", async () => {
    const ok = await api.setApiKey(keyInput.value);
    keyInput.value = "";
    await refreshKeyBadge();
    flash(ok ? "Key saved." : "Couldn't save key.");
  });

  el("clearKey").addEventListener("click", async () => {
    await api.clearApiKey();
    keyInput.value = "";
    await refreshKeyBadge();
    flash("Key cleared.");
  });

  el("openAccess").addEventListener("click", () => void api.openAccessibility());
  el("recheckAccess").addEventListener("click", () => void refreshAccessBadge());
}

// ── Live test ────────────────────────────────────────────────────────────────
function chip(label: string, value: string, tone = ""): string {
  return `<span class="chip ${tone}">${label} <b>${value}</b></span>`;
}

function bindTest(): void {
  const input = el<HTMLTextAreaElement>("testInput");
  const level = el<HTMLSelectElement>("testLevel");
  const mode = el<HTMLSelectElement>("testMode");
  const runBtn = el<HTMLButtonElement>("runTest");
  const result = el("testResult");
  const output = el("testOutput");
  const chips = el("testChips");

  runBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    runBtn.disabled = true;
    runBtn.textContent = "Running…";
    output.textContent = "";
    chips.innerHTML = "";
    try {
      const res = await api.testTransform({
        text,
        level: level.value as Level,
        mode: mode.value as TransformMode,
      });
      result.classList.remove("hidden");
      if ("error" in res) {
        output.textContent = `Error: ${res.error}`;
        return;
      }
      renderResult(res, output, chips);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Run";
    }
  });
}

function renderResult(
  res: TransformResultView,
  output: HTMLElement,
  chips: HTMLElement,
): void {
  output.textContent = res.output;
  const aiTone = res.aiAfter <= 28 ? "good" : res.aiAfter <= 50 ? "warn" : "bad";
  const qTone = res.quality >= 75 ? "good" : res.quality >= 60 ? "warn" : "bad";
  const parts = [
    chip("ai-tell", `${res.aiBefore}→${res.aiAfter}`, aiTone),
    chip("quality", `${res.quality}`, qTone),
    chip("model", res.model.includes("haiku") ? "haiku" : "sonnet"),
    chip("mode", res.mode),
    chip("time", `${res.ms}ms`),
  ];
  if (res.escalated) parts.push(chip("escalated", "yes", "warn"));
  if (!res.meaningOk) parts.push(chip("dropped", res.dropped.join(", ") || "?", "bad"));
  chips.innerHTML = parts.join("");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  config = await api.getConfig();
  (["subtle", "human", "ceo", "polish"] as Array<keyof Hotkeys>).forEach(bindRecorder);
  bindBehaviour();
  bindKeyAndAccess();
  bindTest();
  await refreshKeyBadge();
  await refreshAccessBadge();
}

void boot();
