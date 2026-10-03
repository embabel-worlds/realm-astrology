/*
 * Aspects: which pairs of bodies stand at one of the angles the tradition reads, and by how far
 * they miss it.
 *
 * This is computed here rather than taken from a library because it is arithmetic over a table
 * of nine angles — an angular difference and a lookup, not a format anybody has to parse. The
 * table is the part that carries judgement, so it is declared as data and the orbs are stated
 * rather than buried in conditionals. deepnatal computes no aspects, and the orb a reading
 * should use is a choice an astrologer makes, not a constant a library should make for them.
 *
 * The orbs below are the common modern-traditional compromise: wide for the Ptolemaic five,
 * tight for the minor angles, and wider again when a luminary is involved, because the Sun and
 * Moon are given more room by almost every school.
 */
import { signedArc } from "./sky.js";

export interface AspectKind {
  name: string;
  angle: number;
  orb: number;
  /** Ptolemaic — the five every school reads. The rest are minor, and a reading may ignore them. */
  major: boolean;
}

export const ASPECTS: AspectKind[] = [
  { name: "conjunction", angle: 0, orb: 8, major: true },
  { name: "opposition", angle: 180, orb: 8, major: true },
  { name: "trine", angle: 120, orb: 7, major: true },
  { name: "square", angle: 90, orb: 7, major: true },
  { name: "sextile", angle: 60, orb: 5, major: true },
  { name: "semisextile", angle: 30, orb: 2, major: false },
  { name: "semisquare", angle: 45, orb: 2, major: false },
  { name: "sesquiquadrate", angle: 135, orb: 2, major: false },
  { name: "quincunx", angle: 150, orb: 3, major: false },
];

const LUMINARY_BONUS = 2;

const isLuminary = (body: string): boolean => body === "Sun" || body === "Moon";

export const orbFor = (kind: AspectKind, a: string, b: string): number =>
  kind.orb + (isLuminary(a) || isLuminary(b) ? LUMINARY_BONUS : 0);

export interface Hit {
  aspect: string;
  major: boolean;
  /** Degrees from exact. 0 is exact; never negative. */
  orb: number;
  /** The orb allowed for this pair — so a reader can see how wide the net was. */
  orbAllowed: number;
  /** How close to exact, 1 at exact and 0 at the edge of orb. For ordering by strength. */
  strength: number;
  /** The angle actually between them, 0–180. */
  separation: number;
}

/*
 * The one aspect a pair makes, or none. A pair cannot hold two of these at once — the angles are
 * further apart than the widest orb — so the closest is the only one, and taking the closest
 * keeps that true even if someone later widens an orb past its neighbour.
 */
export function aspectBetween(lonA: number, lonB: number, a: string, b: string): Hit | null {
  const separation = Math.abs(signedArc(lonA, lonB));
  let best: Hit | null = null;
  for (const kind of ASPECTS) {
    const orb = Math.abs(separation - kind.angle);
    const orbAllowed = orbFor(kind, a, b);
    if (orb > orbAllowed) continue;
    const hit: Hit = {
      aspect: kind.name,
      major: kind.major,
      orb,
      orbAllowed,
      strength: 1 - orb / orbAllowed,
      separation,
    };
    if (!best || hit.orb < best.orb) best = hit;
  }
  return best;
}

/*
 * Applying or separating, from the two bodies' speeds: the pair is applying when the angle
 * between them is closing. A natal chart is a still photograph, so this is the direction the
 * aspect was moving at birth — which the tradition reads as an aspect still ripening rather
 * than one already spent.
 *
 * Where either speed is unknown the honest answer is neither word, so it returns null and the
 * record carries no claim.
 */
export function applying(lonA: number, motionA: number, lonB: number, motionB: number): boolean | null {
  if (!Number.isFinite(motionA) || !Number.isFinite(motionB)) return null;
  const now = Math.abs(signedArc(lonA, lonB));
  const soon = Math.abs(signedArc(lonA + motionA / 24, lonB + motionB / 24));
  if (now === soon) return null;
  const target = ASPECTS.reduce((t, k) => (Math.abs(now - k.angle) < Math.abs(now - t) ? k.angle : t), 0);
  return Math.abs(soon - target) < Math.abs(now - target);
}
