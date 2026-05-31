import { Tray, Menu, nativeImage, app } from "electron";
import type { Tray as TrayType } from "electron";
import { getConfig, setConfig } from "./config";
import { isAccessibilityTrusted } from "./accessibility";
import { hasApiKey } from "./secrets";
import { showSettingsWindow } from "./windows";
import { registerHotkeys } from "./hotkeys";
import { TRAY_ICON_16, TRAY_ICON_32 } from "./tray-icon";

// The menu-bar presence. Builds a template image from the bundled base64 icon so
// macOS recolors it for light/dark menu bars, and renders a status-aware menu
// (shows whether the API key and Accessibility permission are set).

let tray: TrayType | null = null;

function trayImage(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_16}`);
  img.addRepresentation({ scaleFactor: 2, dataURL: `data:image/png;base64,${TRAY_ICON_32}` });
  img.setTemplateImage(true);
  return img;
}

export function buildTray(): void {
  if (!tray) {
    tray = new Tray(trayImage());
    tray.setToolTip("Unslop");
  }
  refreshTrayMenu();
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  const cfg = getConfig();
  const keyOk = hasApiKey();
  const accessOk = isAccessibilityTrusted();

  const menu = Menu.buildFromTemplate([
    { label: "Unslop", enabled: false },
    {
      label: keyOk ? "API key: set" : "API key: missing",
      enabled: false,
    },
    {
      label: accessOk ? "Accessibility: granted" : "Accessibility: not granted",
      enabled: false,
    },
    { type: "separator" },
    { label: `Subtle  ${cfg.hotkeys.subtle}`, enabled: false },
    { label: `Human  ${cfg.hotkeys.human}`, enabled: false },
    { label: `CEO  ${cfg.hotkeys.ceo}`, enabled: false },
    { label: `Polish  ${cfg.hotkeys.polish}`, enabled: false },
    { type: "separator" },
    {
      label: `Default mode: ${cfg.defaultMode === "fast" ? "Fast" : "Full"}`,
      submenu: [
        {
          label: "Fast (1–2s)",
          type: "radio",
          checked: cfg.defaultMode === "fast",
          click: () => {
            setConfig({ defaultMode: "fast" });
            registerHotkeys();
            refreshTrayMenu();
          },
        },
        {
          label: "Full (4–7s)",
          type: "radio",
          checked: cfg.defaultMode === "full",
          click: () => {
            setConfig({ defaultMode: "full" });
            registerHotkeys();
            refreshTrayMenu();
          },
        },
      ],
    },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: cfg.launchAtLogin,
      click: (item) => {
        setConfig({ launchAtLogin: item.checked });
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "Settings…", click: () => showSettingsWindow() },
    { label: "Quit Unslop", click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
}
