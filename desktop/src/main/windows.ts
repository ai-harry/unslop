import { BrowserWindow, shell } from "electron";
import { join } from "node:path";

// The settings window is the only visible UI. It is created lazily and hidden
// (not destroyed) on close so reopening from the tray is instant. We only ever
// show it on an explicit user action — never during a transform — so it can't
// steal focus mid copy/paste.

let settingsWindow: BrowserWindow | null = null;

export function showSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: true,
    fullscreenable: false,
    title: "Unslop",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.on("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  // Open any external links in the default browser, not inside the app window.
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void settingsWindow.loadURL(devUrl);
  } else {
    void settingsWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
