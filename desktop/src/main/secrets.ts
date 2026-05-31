import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// The Anthropic API key lives ONLY on this machine, encrypted at rest via
// Electron safeStorage (Keychain-backed on macOS). It is never written in
// plaintext and never leaves the device except in outbound requests to
// api.anthropic.com made by the engine. We cache the decrypted value in memory
// for the process lifetime so each hotkey transform doesn't hit the disk.

function keyPath(): string {
  return join(app.getPath("userData"), "secrets", "anthropic.key");
}

let cached: string | null = null;
let loaded = false;

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function getApiKey(): string {
  if (loaded) return cached ?? "";
  loaded = true;
  cached = "";
  const path = keyPath();
  try {
    if (!existsSync(path)) return "";
    const blob = readFileSync(path);
    if (safeStorage.isEncryptionAvailable()) {
      cached = safeStorage.decryptString(blob).trim();
    } else {
      // Fallback for the rare case the OS keychain is unavailable; the file is
      // still local-only and user-readable, matching the BYOK threat model.
      cached = blob.toString("utf8").trim();
    }
  } catch {
    cached = "";
  }
  return cached ?? "";
}

export function setApiKey(key: string): boolean {
  const trimmed = key.trim();
  const path = keyPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    if (trimmed.length === 0) {
      if (existsSync(path)) unlinkSync(path);
      cached = "";
      loaded = true;
      return true;
    }
    const blob = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(trimmed)
      : Buffer.from(trimmed, "utf8");
    writeFileSync(path, blob, { mode: 0o600 });
    cached = trimmed;
    loaded = true;
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(): boolean {
  return setApiKey("");
}
