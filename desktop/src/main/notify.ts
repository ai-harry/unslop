import { Notification } from "electron";
import { getConfig } from "./config";

// Lightweight native notifications. Used to confirm a transform, warn when nothing
// was selected, or report a missing API key / permission. Respects the user's
// notifications preference.
export function notify(title: string, body: string, force = false): void {
  if (!force && !getConfig().notifications) return;
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, silent: true }).show();
  } catch {
    // Notifications are best-effort; never let one break a transform.
  }
}
