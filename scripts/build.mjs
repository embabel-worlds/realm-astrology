/*
 * The sandbox is seeded with dist/ and nothing else — node_modules never reaches it. So each
 * handler namespace is bundled with everything it imports into one CommonJS file.
 *
 * That matters more here than it looks: the whole ephemeris (astronomy-engine, and deepnatal with
 * the house engine behind it) goes into the bundle, which is why a chart needs no network. There
 * is no data file to copy beside it and no engine binary — unlike realm-chess, this realm's
 * arithmetic is all code.
 */
import { build } from "esbuild";
import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

rmSync("dist", { recursive: true, force: true });
const entries = readdirSync("src/api").filter((f) => f.endsWith(".ts")).map((f) => join("src/api", f));
await build({
  entryPoints: entries,
  outdir: "dist/api",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  logLevel: "warning",
});
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }));
for (const f of readdirSync("dist/api")) {
  console.log(`${join("dist/api", f)}: ${(statSync(join("dist/api", f)).size / 1024).toFixed(0)} KiB`);
}
