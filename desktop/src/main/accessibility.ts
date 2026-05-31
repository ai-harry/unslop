import { systemPreferences, shell } from "electron";

// macOS gates synthetic keystrokes behind the Accessibility privacy permission.
// Without it, the Cmd+C / Cmd+V we send via osascript are silently dropped, so we
// surface the state in the UI and offer a one-click jump to the right settings pane.

export function isAccessibilityTrusted(): boolean {
  if (process.platform !== "darwin") return true;
  // `false` => check only, never show the system prompt (we drive our own UX).
  return systemPreferences.isTrustedAccessibilityClient(false);
}

// Triggers the native "grant Accessibility" prompt once. Safe to call repeatedly.
export function promptAccessibility(): boolean {
  if (process.platform !== "darwin") return true;
  return systemPreferences.isTrustedAccessibilityClient(true);
}

export async function openAccessibilitySettings(): Promise<void> {
  if (process.platform !== "darwin") return;
  await shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  );
}
