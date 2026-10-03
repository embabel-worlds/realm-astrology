/*
 * Essential dignity, sect and angularity — computed, not recalled.
 *
 * A model asked to apply the dignity table from memory gets it wrong in the most confident possible
 * way. Observed in a live reading: Saturn in Taurus called "in domicile", Jupiter in Libra called
 * "its domicile", Mercury in Cancer called "its own domicile", and Mars in Cancer called "domiciled
 * ... (its fall)" in one sentence. None of those is a close call; they are the table misremembered.
 *
 * So the table lives here and the answer goes into the prompt as data. This is the same split the
 * rest of the realm makes: the facts are computed, the judgement is the model's.
 */
import type { Chart, Placement } from "./chart.js";
import type { Sign } from "./spec.js";

interface Rulership {
  domicile: Sign[];
  detriment: Sign[];
  exaltation: Sign | null;
  fall: Sign | null;
}

/* The seven classical planets. The moderns have no traditional dignity and are not given one. */
const RULERSHIP: Record<string, Rulership> = {
  Sun: { domicile: ["Leo"], detriment: ["Aquarius"], exaltation: "Aries", fall: "Libra" },
  Moon: { domicile: ["Cancer"], detriment: ["Capricorn"], exaltation: "Taurus", fall: "Scorpio" },
  Mercury: { domicile: ["Gemini", "Virgo"], detriment: ["Sagittarius", "Pisces"], exaltation: "Virgo", fall: "Pisces" },
  Venus: { domicile: ["Taurus", "Libra"], detriment: ["Aries", "Scorpio"], exaltation: "Pisces", fall: "Virgo" },
  Mars: { domicile: ["Aries", "Scorpio"], detriment: ["Libra", "Taurus"], exaltation: "Capricorn", fall: "Cancer" },
  Jupiter: { domicile: ["Sagittarius", "Pisces"], detriment: ["Gemini", "Virgo"], exaltation: "Cancer", fall: "Capricorn" },
  Saturn: { domicile: ["Capricorn", "Aquarius"], detriment: ["Cancer", "Leo"], exaltation: "Libra", fall: "Aries" },
};

/** `domicile`, `exaltation`, `detriment`, `fall`, `peregrine` (none of them), or `modern`. */
export function dignityOf(body: string, sign: string): string {
  const r = RULERSHIP[body];
  if (!r) return "modern (no traditional dignity)";
  if (r.domicile.includes(sign as Sign)) return "domicile";
  if (r.exaltation === sign) return "exaltation";
  if (r.detriment.includes(sign as Sign)) return "detriment";
  if (r.fall === sign) return "fall";
  return "peregrine";
}

export function angularityOf(house: number | null): string {
  if (house === null) return "no house";
  if ([1, 4, 7, 10].includes(house)) return "angular";
  if ([2, 5, 8, 11].includes(house)) return "succedent";
  return "cadent";
}

export interface Sect {
  known: boolean;
  /** `day`, `night`, or `unknown` without a birth time. */
  kind: string;
  sectLight: string | null;
  beneficOfSect: string | null;
  beneficContrary: string | null;
  maleficOfSect: string | null;
  /** The hardest placement in traditional practice. There is ALWAYS one. */
  maleficContrary: string | null;
  why: string;
}

/*
 * Sect, from whether the Sun stands above the horizon. Houses 7 to 12 are the half above it — the
 * twelfth sits immediately above the ascendant, which is the one that gets misread, and a live
 * reading did misread it: it called a Sun in the twelfth "below the horizon" and inverted every
 * assignment that follows.
 *
 * Without a birth time there are no houses and sect is genuinely unknown. It is reported as unknown
 * rather than assumed, because every benefic and malefic assignment below depends on it.
 */
export function sectOf(chart: Chart): Sect {
  const sun = chart.placements.find((p: Placement) => p.body === "Sun");
  if (!chart.timeKnown || !sun || sun.house === null) {
    return {
      known: false, kind: "unknown", sectLight: null, beneficOfSect: null, beneficContrary: null,
      maleficOfSect: null, maleficContrary: null,
      why: "The birth time is unknown, so there are no houses and sect cannot be determined. Every benefic and malefic of sect depends on it, so none is stated.",
    };
  }
  const day = sun.house >= 7 && sun.house <= 12;
  return day
    ? {
        known: true, kind: "day", sectLight: "Sun",
        beneficOfSect: "Jupiter", beneficContrary: "Venus",
        maleficOfSect: "Saturn", maleficContrary: "Mars",
        why: `The Sun is in house ${sun.house}, above the horizon (houses 7 to 12 are the half above it), so this is a DAY chart.`,
      }
    : {
        known: true, kind: "night", sectLight: "Moon",
        beneficOfSect: "Venus", beneficContrary: "Jupiter",
        maleficOfSect: "Mars", maleficContrary: "Saturn",
        why: `The Sun is in house ${sun.house}, below the horizon (houses 1 to 6 are the half below it), so this is a NIGHT chart.`,
      };
}

/** The computed condition of every body, as a prompt block the model must not contradict. */
export function conditionTable(chart: Chart): string {
  return chart.placements
    .map((p: Placement) => {
      const parts = [
        p.body.padEnd(8),
        p.position.padEnd(18),
        (p.house === null ? "no house" : `house ${p.house}`).padEnd(9),
        angularityOf(p.house).padEnd(10),
        dignityOf(p.body, p.sign),
      ];
      return "  " + parts.join(" ") + (p.retrograde ? "  retrograde" : "");
    })
    .join("\n");
}

export function sectBlock(s: Sect): string {
  if (!s.known) return s.why;
  return [
    s.why,
    `  sect light              ${s.sectLight}`,
    `  benefic of sect         ${s.beneficOfSect}`,
    `  benefic contrary        ${s.beneficContrary}`,
    `  malefic of sect         ${s.maleficOfSect}`,
    `  malefic contrary to sect ${s.maleficContrary}   <- the hardest placement in traditional practice`,
  ].join("\n");
}
