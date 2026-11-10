// The self-hosted Python server (run.py) serves app/static directly; the UI is TypeScript,
// so it gets compiled once into app/static/dist/app.js (talking to the server's /api).
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
await build({
  entryPoints: [join(root, "app", "static", "js", "app.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: join(root, "app", "static", "dist", "app.js"),
  logLevel: "warning",
});
console.log("app/static/dist/app.js built for the Python server");
