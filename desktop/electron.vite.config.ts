import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// The main process bundles the shared TypeScript engine from ../lib (pure source,
// so Rollup inlines it). Runtime node dependencies (@anthropic-ai/sdk,
// electron-store) are listed in package.json and externalized by
// externalizeDepsPlugin, so electron-builder packages them from node_modules.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: { settings: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
