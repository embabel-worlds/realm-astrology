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

/*
 * Metric sets, read once and resolved into the personas that name them. A set is a reusable
 * artifact precisely so two personas can keep the same metrics without retyping them.
 */
const METRIC_DIR = "metrics";
const TYPES = ["ordinal", "stage", "count", "ratio", "boolean"];
const SCOPES = ["subject", "agent", "conversation"];
const sets = new Map();
if (existsSync(METRIC_DIR)) {
  for (const file of readdirSync(METRIC_DIR).sort()) {
    if (!file.endsWith(".yml")) continue;
    const path = join(METRIC_DIR, file);
    const set = parse(readFileSync(path, "utf8"));
    if (!set?.name) throw new Error(`${path} has no \`name\`.`);
    if (!Array.isArray(set.metrics) || set.metrics.length === 0) throw new Error(`${path} declares no metrics.`);
    for (const m of set.metrics) {
      if (!m.name) throw new Error(`${path}: a metric has no \`name\`.`);
      if (!SCOPES.includes(m.scope)) throw new Error(`${path}: ${m.name} has scope '${m.scope}'; expected one of ${SCOPES.join(", ")}.`);
      if (!TYPES.includes(m.type)) throw new Error(`${path}: ${m.name} has type '${m.type}'; expected one of ${TYPES.join(", ")}.`);
      if (m.default === undefined) throw new Error(`${path}: ${m.name} has no \`default\`.`);
      /* The declaration must be usable: a range for a scale, stages for a stage. */
      if ((m.type === "ordinal" || m.type === "ratio")) {
        if (!Array.isArray(m.range) || m.range.length !== 2) throw new Error(`${path}: ${m.name} is ${m.type} and needs \`range: [min, max]\`.`);
        if (m.default < m.range[0] || m.default > m.range[1]) throw new Error(`${path}: ${m.name} default ${m.default} is outside its range ${JSON.stringify(m.range)}.`);
      }
      if (m.type === "stage") {
        if (!Array.isArray(m.stages) || m.stages.length < 2) throw new Error(`${path}: ${m.name} is a stage and needs two or more \`stages\`.`);
        if (!m.stages.includes(m.default)) throw new Error(`${path}: ${m.name} default '${m.default}' is not one of its stages.`);
      }
    }
    if (sets.has(set.name)) throw new Error(`Two metric sets are called '${set.name}'; a set name is unique across the world.`);
    sets.set(set.name, {
      name: set.name,
      description: set.description ?? null,
      metrics: set.metrics.map((m) => ({
        name: m.name, scope: m.scope, description: m.description ?? null, type: m.type,
        range: m.range ?? null, stages: m.stages ?? null, default: m.default,
      })),
    });
  }
}
if (sets.size) console.log(`metric sets: ${[...sets.keys()].join(", ")}`);

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
  /* A persona may name metric sets; every one it names must exist. */
  const wantedSets = brief.metrics?.sets ?? [];
  const resolved = wantedSets.map((n) => {
    const set = sets.get(n);
    if (!set) {
      throw new Error(
        `${briefFile} names metric set '${n}', which no file under ${METRIC_DIR}/ declares. ` +
          `Declared: ${[...sets.keys()].join(", ") || "none"}.`,
      );
    }
    return set;
  });
  const role = brief.metrics?.extraction?.role ?? null;
  if (resolved.length && !role) {
    throw new Error(`${briefFile} declares metric sets but no \`metrics.extraction.role\`; nothing would update them.`);
  }
  personas.push({
    slug,
    name: String(identity.name),
    tagline: String(brief.tagline),
    brief: String(brief.brief).trim(),
    isDefault: slug === wanted,
    objective: brief.objective ? String(brief.objective).trim() : null,
    openingMove: brief.openingMove ? String(brief.openingMove).trim() : null,
    avoids: brief.avoids ?? [],
    unversed: brief.unversed ?? [],
    metrics: resolved,
    extractionRole: role,
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
console.log(`personas: ${personas.map((p) => p.slug + (p.isDefault ? " (default)" : "") + (p.metrics.length ? ` [${p.metrics.map((s2) => s2.name).join("+")}]` : "")).join(", ")}`);
