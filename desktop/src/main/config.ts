import Store from "electron-store";
import { app } from "electron";
import type { AppConfig } from "../shared/types";
import { DEFAULT_CONFIG, DEFAULT_HOTKEYS } from "../shared/types";

// Persistent, non-secret config. The Anthropic API key is NOT stored here; it is
// encrypted separately via safeStorage (see secrets.ts). electron-store writes a
// plain JSON file under userData, so only non-sensitive preferences live here.
const store = new Store<{ config: AppConfig }>({
  name: "unslop-config",
  defaults: { config: DEFAULT_CONFIG },
});

function coerce(raw: Partial<AppConfig> | undefined): AppConfig {
  const c = raw ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...c,
    hotkeys: { ...DEFAULT_HOTKEYS, ...(c.hotkeys ?? {}) },
  };
}

export function getConfig(): AppConfig {
  return coerce(store.get("config"));
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = coerce({ ...getConfig(), ...patch });
  store.set("config", next);
  syncLoginItem(next.launchAtLogin);
  return next;
}

// Mirror the launch-at-login preference into the OS login items. Defaults to on
// so the menu-bar app is always ready after a reboot.
export function syncLoginItem(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  } catch {
    // Login-item APIs are best-effort and a no-op on unsupported platforms.
  }
}
