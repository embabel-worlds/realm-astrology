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
  /** One line, for a picker or a column heading. */
  tagline: string;
  /** The persona compacted for one request, from `brief.yml`. */
  brief: string;
  /** True for the persona `focuses/<realm>.yml#defaultPersona` names. */
  isDefault: boolean;
}

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
