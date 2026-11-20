/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Monaco + monaco-yaml web workers are bundled as ES module workers. Vite
// resolves the `?worker` imports in src/editors/monaco-setup.ts at build time;
// `worker.format: "es"` keeps them as ES modules so the YAML language worker and
// the base editor worker load from the same origin as the app (launcher loopback
// or static host) without a CDN.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
  build: {
    // Monaco pulls in a large graph; raise the warning limit so the production
    // build stays quiet while we keep the spike's full dependency set.
    chunkSizeWarningLimit: 4096,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: false,
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
