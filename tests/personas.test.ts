/*
 * Personas are authored as YAML under personalities/ and compiled into dist/data/personas.json by
 * the build. These tests hold the compiled artifact to the authored files, because the two can
 * drift and nothing else would notice: a brief edited and not rebuilt ships the old prose.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { bySlug, defaultPersona, personas, slugs } from "../src/lib/personas.js";

const root = join(import.meta.dirname, "..");
const PERSONA_DIR = join(root, "personalities");
const authored = readdirSync(PERSONA_DIR)
  .filter((d) => statSync(join(PERSONA_DIR, d)).isDirectory())
  .filter((d) => existsSync(join(PERSONA_DIR, d, "brief.yml")));

describe("the compiled personas match what was authored", () => {
  it("ships one per persona directory that has a brief", () => {
    expect(slugs().slice().sort()).toEqual(authored.slice().sort());
  });

  for (const slug of authored) {
    it(`${slug}: name, tagline and brief are the authored ones`, () => {
      const identity = parse(readFileSync(join(PERSONA_DIR, slug, "identity.yml"), "utf8"));
      const brief = parse(readFileSync(join(PERSONA_DIR, slug, "brief.yml"), "utf8"));
      const p = bySlug(slug)!;
      expect(p, `${slug} was compiled`).toBeTruthy();
      expect(p.name).toBe(identity.name);
      /* The picker label lives with the display name, not in the file about the agenda. */
      expect(p.tagline).toBe(identity.description);
      /* Exact, not merely similar: a stale build is the failure this catches. */
      expect(p.brief).toBe(String(brief.brief).trim());
      expect(p.brief.length).toBeGreaterThan(200);
    });
  }
});

describe("the default comes from the focus file, not from code", () => {
  it("is the persona focuses/astrology.yml names", () => {
    const focus = parse(readFileSync(join(root, "focuses", "astrology.yml"), "utf8"));
    expect(focus.defaultPersona, "the focus declares a default").toBeTruthy();
    expect(defaultPersona().slug).toBe(focus.defaultPersona);
  });

  it("exactly one persona is flagged", () => {
    expect(personas().filter((p) => p.isDefault)).toHaveLength(1);
  });

  it("leads the order, so a picker shows it first", () => {
    /* Ordered by the flag, not by name: directory order is alphabetical and put Cassius first. */
    expect(personas()[0]!.isDefault).toBe(true);
    expect(personas()[0]!.slug).toBe(defaultPersona().slug);
  });

  it("and the rest follow alphabetically, so the order is stable", () => {
    const rest = personas().slice(1).map((p) => p.slug);
    expect(rest).toEqual(rest.slice().sort());
  });
});

describe("lookup", () => {
  it("is case-insensitive, because a key or a URL may not be", () => {
    expect(bySlug("MERCER")?.slug).toBe("mercer");
    expect(bySlug("Hypatia")?.slug).toBe("hypatia");
  });

  it("returns null for an unknown slug rather than guessing", () => {
    expect(bySlug("nostradamus")).toBeNull();
    expect(bySlug("")).toBeNull();
  });
});

describe("a persona is a world concept, not an astrology one", () => {
  /*
   * The type was once called `Astrologer` — a general thing named after the first place it was used.
   * Nothing in the shape is astrological, and this test fails if that creeps back.
   */
  it("carries no realm-specific field", () => {
    /*
     * The intent, not a frozen list: an earlier version pinned the exact keys and failed the moment
     * the spec's agenda fields arrived, which told us nothing about whether the shape had gone
     * astrological. Every key must be one the SPEC defines for a persona.
     */
    const allowed = new Set([
      "slug", "name", "tagline", "brief", "isDefault",
      "objective", "openingMove", "metrics", "extractionRole",
    ]);
    for (const p of personas()) {
      for (const key of Object.keys(p as object)) {
        expect(allowed.has(key), `'${key}' is not a persona field the spec defines`).toBe(true);
        expect(key.toLowerCase()).not.toMatch(/astro|chart|zodiac|sign|reader/);
      }
    }
  });

  it("the module names nothing after this realm", () => {
    const src = readFileSync(join(root, "src", "lib", "personas.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const word of ["Astrologer", "astrolog", "chart", "zodiac"]) {
      expect(code.toLowerCase(), `persona module mentions ${word} outside a comment`)
        .not.toContain(word.toLowerCase());
    }
  });
});

describe("the chat bundle and the brief describe one person", () => {
  /*
   * They are two surfaces of the same persona and can disagree silently. A full semantic check is
   * not possible, but the cheap invariants are worth holding: both exist, and the display name in
   * identity.yml is the one the brief addresses itself as.
   */
  for (const slug of authored) {
    it(`${slug} ships both a voice and a brief, and the brief owns the name`, () => {
      const dir = join(PERSONA_DIR, slug);
      expect(existsSync(join(dir, "identity.yml")), "identity.yml").toBe(true);
      expect(existsSync(join(dir, "personality.jinja")), "personality.jinja").toBe(true);
      expect(existsSync(join(dir, "guardrails.jinja")), "guardrails.jinja").toBe(true);
      const p = bySlug(slug)!;
      expect(p.brief, `${slug}'s brief names ${p.name}`).toContain(p.name);
    });
  }
});
