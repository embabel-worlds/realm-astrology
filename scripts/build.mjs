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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

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

/*
 * Personas, compiled from their authoring form into one file the handler can read.
 *
 * The sandbox is seeded with dist/ and nothing else, so YAML under personalities/ never reaches the
 * running verb. That is the only reason this step exists — and it is the reason the briefs were
 * once compiled into a TypeScript source file instead, which put prose in code to avoid writing
 * these twenty lines.
 *
 * Every check below fails the BUILD. The chat bundle and the brief describe one person and can
 * drift silently; a build error is the only thing that actually stops them.
 */
const PERSONA_DIR = "personalities";
const FOCUS = join("focuses", "astrology.yml");

const focus = parse(readFileSync(FOCUS, "utf8"));
const wanted = focus.defaultPersona;
if (!wanted) throw new Error(`${FOCUS} declares no defaultPersona; nothing would open by default.`);

const personas = [];
for (const slug of readdirSync(PERSONA_DIR).sort()) {
  const dir = join(PERSONA_DIR, slug);
  if (!statSync(dir).isDirectory()) continue;
  const briefFile = join(dir, "brief.yml");
  const identityFile = join(dir, "identity.yml");
  /* A persona with no brief is chat-only, which is legal — it simply is not offered to a verb. */
  if (!existsSync(briefFile)) {
    console.log(`persona ${slug}: chat only (no brief.yml)`);
    continue;
  }
  if (!existsSync(identityFile)) {
    throw new Error(`${briefFile} exists but ${identityFile} does not: a persona needs its display name.`);
  }
  const identity = parse(readFileSync(identityFile, "utf8")) ?? {};
  const brief = parse(readFileSync(briefFile, "utf8")) ?? {};
  if (!identity.name) throw new Error(`${identityFile} has no \`name\`.`);
  if (!brief.tagline) throw new Error(`${briefFile} has no \`tagline\`.`);
  if (!brief.brief || !String(brief.brief).trim()) throw new Error(`${briefFile} has no \`brief\`.`);
  personas.push({
    slug,
    name: String(identity.name),
    tagline: String(brief.tagline),
    brief: String(brief.brief).trim(),
    isDefault: slug === wanted,
  });
}

if (personas.length === 0) throw new Error(`No persona under ${PERSONA_DIR}/ ships a brief.yml.`);
if (!personas.some((p) => p.isDefault)) {
  throw new Error(
    `${FOCUS} names defaultPersona '${wanted}', which ships no brief.yml. ` +
      `Personas with a brief: ${personas.map((p) => p.slug).join(", ")}.`,
  );
}

/*
 * The default leads, then the rest alphabetically. Ordered HERE so every surface gets the same
 * order from one place, and ordered by the FLAG rather than by name: change
 * focuses/astrology.yml#defaultPersona and the card order follows, with nobody's name written twice.
 *
 * Directory order is alphabetical, which put the Hellenistic traditionalist first — a reasonable
 * listing and the wrong front door.
 */
personas.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.slug.localeCompare(b.slug));

mkdirSync("dist/data", { recursive: true });
writeFileSync("dist/data/personas.json", JSON.stringify(personas));
console.log(`personas: ${personas.map((p) => p.slug + (p.isDefault ? " (default)" : "")).join(", ")}`);
