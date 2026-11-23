import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* The app is written as one script split across files that share top-level names.
   This plugin joins them, in order, into one module: `import "virtual:socent-app"`. */
const APP_FILES = ["core.js", "data.js", "ui.js", "pages1.js", "pages2.js", "pages2b.js", "pages3.js", "pages4.js"]
  .map(f => path.resolve(ROOT, "src/app", f));
function socentApp() {
  const id = "virtual:socent-app";
  return {
    name: "socent-app",
    resolveId(source) { return source === id ? "\0" + id : null; },
    load(resolved) {
      if (resolved !== "\0" + id) return null;
      for (const f of APP_FILES) this.addWatchFile(f);
      const code = APP_FILES.map(f => `// ---- ${path.basename(f)} ----\n` + fs.readFileSync(f, "utf8")).join("\n;\n");
      // automated tests only: expose app state to the test runner
      return code + "\n;if (import.meta.env.VITE_EXPOSE_FOR_TESTS === 'true') Object.assign(window, { S, UI, IMP, render });\n";
    },
    handleHotUpdate(ctx) {
      if (APP_FILES.includes(ctx.file)) { ctx.server.ws.send({ type: "full-reload" }); return []; }
    }
  };
}

export default defineConfig({
  plugins: [socentApp()],
  build: { target: "es2020", sourcemap: true, chunkSizeWarningLimit: 1500 }
});
