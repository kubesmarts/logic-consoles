/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The pinned OWS editor does not expose React Flow interaction props. Adapt
// its canvas only; keep its model, auto-layout, read-only links and node views.
function interactiveWorkflowPreview(): Plugin {
  return {
    name: "interactive-workflow-preview",
    enforce: "pre",
    transform(source, id) {
      if (!id.split("?", 1)[0]?.endsWith("/@openworkflowspec/diagram-editor/dist/index.js")) return;
      const replacements = [
        ["onlyRenderVisibleElements: !0", "onlyRenderVisibleElements: !1"],
        ["panOnDrag: !1", "panOnDrag: !0"],
        ["selectionOnDrag: !0", "selectionOnDrag: !1"],
        ["nodesDraggable: !1", "nodesDraggable: !0"],
      ] as const;
      for (const [before, after] of replacements) {
        if (source.split(before).length !== 2) this.error(`Review OWS editor canvas integration after dependency update: ${before}`);
        source = source.replace(before, after);
      }
      return {code: source, map: null};
    },
  };
}

// The Monaco + monaco-yaml web workers are bundled as ES module workers. Vite
// resolves the `?worker` imports in src/editors/monaco-setup.ts at build time;
// `worker.format: "es"` keeps them as ES modules so the YAML language worker and
// the base editor worker load from the same origin as the app (launcher loopback
// or static host) without a CDN.
export default defineConfig({
  plugins: [interactiveWorkflowPreview(), react()],
  optimizeDeps: {
    exclude: ["@openworkflowspec/diagram-editor"],
    // The unbundled editor still imports this CommonJS shim in development.
    include: ["use-sync-external-store/shim/with-selector.js"],
  },
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
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}", "launcher/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
