/*
 * The metric layer: what a model is allowed to do to a declared value.
 *
 * Every case here is a way a model's JSON can be wrong — out of range, a stage that does not exist,
 * a negative count, a missing key, prose around the object — and the question each asks is whether
 * the wrong answer can change the record.
 */
import { describe, expect, it } from "vitest";
import { applyExtraction, coerce, defaultsFor, extractionPrompt, parseJsonObject } from "../src/lib/metrics.js";
import { bySlug, metricsOf, type Metric, type Persona } from "../src/lib/personas.js";

const astrid = () => bySlug("astrid") as Persona;
const metric = (name: string): Metric => metricsOf(astrid()).find((m) => m.name === name)!;

describe("Astrid declares both sets", () => {
  it("resolves theory-of-mind and conversion into one surface", () => {
    const p = astrid();
    expect(p.metrics.map((s) => s.name).sort()).toEqual(["conversion", "theory-of-mind"]);
    expect(metricsOf(p).map((m) => m.name).sort())
      .toEqual(["askedToStop", "confidence", "mood", "questionsOpen", "rapport", "stage"]);
  });

  it("has an objective, which is what makes her an advocate", () => {
    expect(astrid().objective).toBeTruthy();
    expect(astrid().openingMove).toBeTruthy();
    expect(astrid().avoids).toContain("politics");
    expect(astrid().extractionRole).toBe("cheap");
  });

  it("and the other readers have none", () => {
    for (const slug of ["mercer", "hypatia", "juno", "cassius"]) {
      const p = bySlug(slug)!;
      expect(p.objective, `${slug} has no objective`).toBeNull();
      expect(p.metrics, `${slug} keeps no metrics`).toEqual([]);
    }
  });

  it("starts from the declared defaults", () => {
    expect(defaultsFor(astrid())).toEqual({
      mood: 5, rapport: 5, confidence: 5, stage: "curious", questionsOpen: 0, askedToStop: false,
    });
  });
});

describe("a value is forced to fit its own declaration", () => {
  it("clamps an ordinal rather than failing the turn", () => {
    expect(coerce(metric("mood"), 99, 5)).toBe(10);
    expect(coerce(metric("mood"), -4, 5)).toBe(1);
    expect(coerce(metric("mood"), 7.4, 5)).toBe(7);
  });

  it("keeps the prior value when a number is not a number", () => {
    expect(coerce(metric("mood"), "chipper", 6)).toBe(6);
    expect(coerce(metric("mood"), "", 6)).toBe(6);
    expect(coerce(metric("mood"), true, 6)).toBe(6);
  });

  it("treats null as ABSENT, not as zero", () => {
    /*
     * Number(null) is 0, which is finite, so the first version clamped a null to the bottom of the
     * range: a model saying "I have no idea" reported a cheerful person as miserable.
     */
    expect(coerce(metric("mood"), null, 6)).toBe(6);
    expect(coerce(metric("mood"), undefined, 6)).toBe(6);
    expect(coerce(metric("questionsOpen"), null, 3)).toBe(3);
    /* And a real zero still means zero. */
    expect(coerce(metric("questionsOpen"), 0, 3)).toBe(0);
    expect(coerce(metric("questionsOpen"), "0", 3)).toBe(0);
  });

  it("REJECTS an unknown stage instead of picking a neighbour", () => {
    /* Snapping to the nearest stage would invent a position the person never took. */
    expect(coerce(metric("stage"), "enthusiastic", "sceptical")).toBe("sceptical");
    expect(coerce(metric("stage"), "persuaded", "curious")).toBe("persuaded");
    expect(coerce(metric("stage"), "declined", "persuaded")).toBe("declined");
  });

  it("takes a count as a whole number, never negative", () => {
    expect(coerce(metric("questionsOpen"), 3.7, 0)).toBe(4);
    expect(coerce(metric("questionsOpen"), -1, 2)).toBe(2);
    expect(coerce(metric("questionsOpen"), "two", 2)).toBe(2);
  });
});

describe("askedToStop latches", () => {
  /*
   * The brake must not be releasable by a later turn's extraction. A model that decided somebody
   * had cheered up could otherwise restart the advocacy they asked to end.
   */
  it("cannot be walked back once true", () => {
    expect(coerce(metric("askedToStop"), false, true)).toBe(true);
    expect(coerce(metric("askedToStop"), "false", true)).toBe(true);
    expect(applyExtraction(astrid(), { askedToStop: true }, { askedToStop: false }).askedToStop).toBe(true);
  });

  it("but can be set in the first place", () => {
    expect(coerce(metric("askedToStop"), true, false)).toBe(true);
    expect(applyExtraction(astrid(), { askedToStop: false }, { askedToStop: true }).askedToStop).toBe(true);
  });
});

describe("applying a model's answer", () => {
  it("keeps the carried value for any metric it did not mention", () => {
    const carried = { ...defaultsFor(astrid()), rapport: 8, stage: "engaged" };
    const out = applyExtraction(astrid(), carried, { mood: 7 });
    expect(out.mood).toBe(7);
    expect(out.rapport).toBe(8);
    expect(out.stage).toBe("engaged");
  });

  it("returns every declared metric, even from an empty answer", () => {
    const out = applyExtraction(astrid(), defaultsFor(astrid()), {});
    expect(Object.keys(out).sort()).toEqual(metricsOf(astrid()).map((m) => m.name).sort());
  });

  it("ignores junk rather than throwing", () => {
    const out = applyExtraction(astrid(), defaultsFor(astrid()), "not an object");
    expect(out).toEqual(defaultsFor(astrid()));
  });
});

describe("reading a model's JSON", () => {
  it("takes it out of a fence or out of prose", () => {
    expect(parseJsonObject('```json\n{"mood": 7}\n```')).toEqual({ mood: 7 });
    expect(parseJsonObject('Here you go: {"mood": 7} — hope that helps')).toEqual({ mood: 7 });
    expect(parseJsonObject('{"mood": 7}')).toEqual({ mood: 7 });
  });

  it("returns an empty object when there is nothing to read", () => {
    expect(parseJsonObject("sorry, I cannot")).toEqual({});
    expect(parseJsonObject("")).toEqual({});
  });
});

describe("the extraction prompt", () => {
  it("states every metric's shape, so a model has no reason to guess", () => {
    const prompt = extractionPrompt(astrid(), defaultsFor(astrid()), "", "I am not interested.");
    for (const m of metricsOf(astrid())) expect(prompt).toContain(m.name);
    expect(prompt).toContain("sceptical, curious, engaged, persuaded, declined");
    expect(prompt).toContain("true or false");
    expect(prompt).toContain("a number from 1 to 10");
    expect(prompt).toContain("a whole number, 0 or more");
  });

  it("reads what the person has just said, not a reply that does not exist yet", () => {
    /* Extracting after the reply made the brake a turn late, which is not a lag but a defect. */
    const prompt = extractionPrompt(astrid(), defaultsFor(astrid()), "", "Please stop.");
    expect(prompt).toContain("What they have just said");
    expect(prompt).toContain("Please stop.");
  });
});
