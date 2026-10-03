/*
 * Personas, loaded from what the build compiled.
 *
 * NOTHING HERE IS ABOUT ASTROLOGY. A persona is a world-level concept: a voice the assistant can
 * run as, with a slug that must be unique across the whole world. This realm happens to use four of
 * them as readers, but the shape is the spec's, not this realm's, and an earlier version of this
 * file called the type `Astrologer` — naming a general thing after the first place it was used.
 *
 * Authoring lives in `personalities/<slug>/`: `identity.yml` for the display name, the `.jinja`
 * slots for the chat system prompt, and `brief.yml` for the compact form a single non-chat call
 * needs. Prose belongs in a data file, not compiled into a source file.
 *
 * WHAT THIS DOES NOT DO, and should not have to: resolve a persona. The spec says a slug is unique
 * across the world and that a world-authored persona SHADOWS a realm's of the same name. No gateway
 * namespace exposes personas, so a realm has no way to ask who `mercer` actually resolves to — it
 * can only read its own directory. So a world that authors its own `mercer` changes the chat voice
 * and leaves the brief here untouched: one slug, two people, depending on the surface. That is a
 * host gap, not a thing to paper over here, and it is filed as one.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";

export interface Persona {
  /** The persona's directory name, and its slug across the world. */
  slug: string;
  /** Display name, from `identity.yml`. */
  name: string;
  /** One line, for a picker or a column heading, from `identity.yml#description`. */
  tagline: string;
  /** The persona compacted for one request, from `brief.yml`. */
  brief: string;
  /** True for the persona `focuses/<realm>.yml#defaultPersona` names. */
  isDefault: boolean;
  /*
   * The agenda. A persona with an `objective` ADVOCATES; one without it answers. It is declared
   * rather than implied so that an operator can read what a reader is trying to achieve, instead of
   * inferring it from the way it argues.
   */
  objective: string | null;
  openingMove: string | null;
  /** The metric sets this persona keeps, resolved from `metrics/` at build time. */
  metrics: MetricSet[];
  /** The LLM ROLE that extracts metric values. Never a model: the world decides which plays it. */
  extractionRole: string | null;
}

export interface Metric {
  name: string;
  scope: "subject" | "agent" | "conversation";
  description: string | null;
  type: "ordinal" | "stage" | "count" | "ratio" | "boolean";
  range: [number, number] | null;
  stages: string[] | null;
  default: number | string | boolean;
}

export interface MetricSet {
  name: string;
  description: string | null;
  metrics: Metric[];
}

/** Every metric across a persona's sets, which is the unit the extraction prompt works in. */
export const metricsOf = (p: Persona): Metric[] => p.metrics.flatMap((s) => s.metrics);

let cache: Persona[] | null = null;

/*
 * The compiled personas, built by scripts/build.mjs into dist/data/ beside the handler — found
 * there from the bundle, and from the source tree (tests) via dist/.
 */
function readData(file: string): unknown {
  const tried: string[] = [];
  for (const dir of [path.join(__dirname, "..", "data"), path.join(__dirname, "..", "..", "dist", "data")]) {
    const p = path.join(dir, file);
    tried.push(p);
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* try the next */
    }
  }
  throw new Error(
    `Could not read ${file}. Looked in: ${tried.join(", ")}. Personas are compiled from ` +
      `personalities/*/brief.yml by \`npm run build\` — run it before the tests.`,
  );
}

export function personas(): Persona[] {
  if (!cache) cache = readData("personas.json") as Persona[];
  return cache;
}

export const bySlug = (slug: string): Persona | null =>
  personas().find((p) => p.slug === (slug ?? "").toLowerCase()) ?? null;

export const slugs = (): string[] => personas().map((p) => p.slug);

/** The persona a surface opens on, from `focuses/<realm>.yml#defaultPersona`. */
export const defaultPersona = (): Persona => {
  const all = personas();
  return all.find((p) => p.isDefault) ?? (all[0] as Persona);
};

/*
 * A realm declares a SPEC role id; `gateway.ai.complete` documents its own, smaller set of tiers.
 * The two vocabularies diverge today:
 *
 *   spec (realm-spec README, "LLM roles")  chat_best chat_cheap code_best code_cheap
 *                                          routing narration vc_execution vc_relevance agentic_rag
 *   gateway.ai.complete                    cheap | workhorse | best
 *
 * Both are real contracts and neither is wrong: the spec's ids are what a realm FILE declares, the
 * gateway's tiers are what that one tool accepts. An unknown role resolves to the host default
 * rather than failing, so passing `routing` straight through would run whichever model the default
 * happens to be and nobody would ever learn which — the quiet degradation the fallback exists to
 * make invisible. So the declaration is mapped to a tier at the call.
 *
 * When `ai.complete` grows the spec's ids this collapses to identity and should be deleted.
 */
const TIER_FOR_ROLE: Record<string, string> = {
  chat_best: "best",
  chat_cheap: "cheap",
  code_best: "best",
  code_cheap: "cheap",
  routing: "cheap",
  narration: "cheap",
  vc_execution: "cheap",
  vc_relevance: "workhorse",
  agentic_rag: "workhorse",
};

/** The `ai.complete` tier for a declared role, or the role itself if it is already a tier. */
export function tierFor(role: string | null): string | undefined {
  if (!role) return undefined;
  if (role === "cheap" || role === "workhorse" || role === "best") return role;
  return TIER_FOR_ROLE[role] ?? undefined;
}
