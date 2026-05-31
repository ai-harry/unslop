import { app, ipcMain } from "electron";
import type { AppConfig, Level, TransformMode } from "../shared/types";
import { getConfig, setConfig, syncLoginItem } from "./config";
import { hasApiKey, setApiKey, clearApiKey } from "./secrets";
import { isAccessibilityTrusted, openAccessibilitySettings } from "./accessibility";
import { runTransform } from "./engine";
import { buildTray, refreshTrayMenu } from "./tray";
import { registerHotkeys, unregisterHotkeys, setSettingsOpener } from "./hotkeys";
import { showSettingsWindow } from "./windows";
import { notify } from "./notify";

// Menu-bar (agent) app: no Dock icon, no main window, lives in the tray. A single
// instance owns the global hotkeys; a second launch just surfaces settings.

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showSettingsWindow());

  app.whenReady().then(() => {
    // Hide from the Dock (belt-and-suspenders alongside LSUIElement in prod).
    app.dock?.hide();

    registerIpc();
    setSettingsOpener(showSettingsWindow);

    const cfg = getConfig();
    syncLoginItem(cfg.launchAtLogin);

    buildTray();
    registerHotkeys();

    firstRunChecks(cfg);
  });

  // Menu-bar app: closing the settings window must NOT quit the app. Simply
  // subscribing to this event (with a no-op handler) overrides Electron's
  // default "quit when the last window closes" behavior.
  app.on("window-all-closed", () => {
    // Intentionally empty: stay alive in the menu bar.
  });

  app.on("will-quit", () => unregisterHotkeys());
}

function firstRunChecks(cfg: AppConfig): void {
  if (!hasApiKey()) {
    notify(
      "Welcome to Unslop",
      "Open settings from the menu bar and add your Anthropic API key to get started.",
      true,
    );
    showSettingsWindow();
    return;
  }
  if (!isAccessibilityTrusted()) {
    notify(
      "One more step",
      "Grant Unslop Accessibility access so it can paste rewrites in place.",
      true,
    );
    showSettingsWindow();
  }
}

function registerIpc(): void {
  ipcMain.handle("config:get", () => getConfig());

  ipcMain.handle("config:set", (_e, patch: Partial<AppConfig>) => {
    const next = setConfig(patch);
    registerHotkeys();
    refreshTrayMenu();
    return next;
  });

  ipcMain.handle("secret:has", () => hasApiKey());

  ipcMain.handle("secret:set", (_e, key: string) => {
    const ok = setApiKey(typeof key === "string" ? key : "");
    refreshTrayMenu();
    return ok;
  });

  ipcMain.handle("secret:clear", () => {
    const ok = clearApiKey();
    refreshTrayMenu();
    return ok;
  });

  ipcMain.handle(
    "transform:test",
    async (_e, input: { text: string; level: Level; mode: TransformMode }) => {
      try {
        return await runTransform(input.text, input.level, input.mode);
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : "Transform failed" };
      }
    },
  );

  ipcMain.handle("accessibility:check", () => isAccessibilityTrusted());
  ipcMain.handle("accessibility:open", () => openAccessibilitySettings());
}
