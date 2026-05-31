import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, Level, TransformMode, UnslopApi } from "../shared/types";

// The only bridge between the sandboxed renderer and the main process. Every
// method is a thin, typed wrapper over an ipcRenderer.invoke channel; no Node
// APIs are exposed to the renderer.
const api: UnslopApi = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke("config:set", patch),
  hasApiKey: () => ipcRenderer.invoke("secret:has"),
  setApiKey: (key: string) => ipcRenderer.invoke("secret:set", key),
  clearApiKey: () => ipcRenderer.invoke("secret:clear"),
  testTransform: (input: { text: string; level: Level; mode: TransformMode }) =>
    ipcRenderer.invoke("transform:test", input),
  checkAccessibility: () => ipcRenderer.invoke("accessibility:check"),
  openAccessibility: () => ipcRenderer.invoke("accessibility:open"),
};

contextBridge.exposeInMainWorld("api", api);
