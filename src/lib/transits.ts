/*
 * Transits: where the sky is today, measured against where it was at birth.
 *
 * The natal chart is a still photograph; a transit is the live sky making an angle to something
 * in that photograph. So this is the same aspect table as `aspects.ts`, applied between two
 * different moments rather than within one — which is why there is one matcher and not two.
 *
 * The ANGLES are included as targets (ascendant, midheaven) because the tradition reads a transit
 * to the ascendant as among the most consequential, and a chart cast without a birth time has no
 * angles to read. A transit list for an unknown-time birth is therefore shorter, and honest about it.
 */
import { aspectBetween, applying, type Hit } from "./aspects.js";
import type { Chart, Placement } from "./chart.js";
import { skyAt, type SkyBody } from "./sky.js";
import { position, signOf } from "./spec.js";

export interface Transit {
  transiting: string;
  natal: string;
  aspect: string;
  major: boolean;
  orb: number;
  orbAllowed: number;
  strength: number;
  /** True while the angle is closing, false while it opens, null where a speed is unknown. */
  applying: boolean | null;
  transitingLongitude: number;
  transitingPosition: string;
  transitingRetrograde: boolean;
  natalLongitude: number;
  natalPosition: string;
  /** The natal house the transiting body is passing through, where the chart has houses. */
  throughHouse: number | null;
}

const ANGLES = new Set(["Ascendant", "Midheaven"]);

/* A natal point a transit can be made to: the ten bodies, and the two angles when there are any. */
interface Target {
  name: string;
  longitude: number;
  motion: number;
}

function targets(chart: Chart): Target[] {
  const out: Target[] = chart.placements.map((p: Placement) => ({
    name: p.body,
    /* A natal point does not move: it is a fixed degree in a chart cast once. */
    motion: 0,
    longitude: p.longitude,
  }));
  if (chart.ascendant !== null) out.push({ name: "Ascendant", longitude: chart.ascendant, motion: 0 });
  if (chart.midheaven !== null) out.push({ name: "Midheaven", longitude: chart.midheaven, motion: 0 });
  return out;
}

export function transitsOf(chart: Chart, at: Date, houseOf: (lon: number) => number | null): Transit[] {
  const sky: SkyBody[] = skyAt(at);
  const out: Transit[] = [];
  for (const t of sky) {
    for (const n of targets(chart)) {
      const hit: Hit | null = aspectBetween(t.longitude, n.longitude, t.body, n.name);
      if (!hit) continue;
      out.push({
        transiting: t.body,
        natal: n.name,
        aspect: hit.aspect,
        major: hit.major,
        orb: Number(hit.orb.toFixed(3)),
        orbAllowed: hit.orbAllowed,
        strength: Number(hit.strength.toFixed(3)),
        applying: applying(t.longitude, t.dailyMotion, n.longitude, n.motion),
        transitingLongitude: t.longitude,
        transitingPosition: position(t.longitude),
        transitingRetrograde: t.retrograde,
        natalLongitude: n.longitude,
        natalPosition: position(n.longitude),
        throughHouse: houseOf(t.longitude),
      });
    }
  }
  /* Tightest first: an orb of a tenth of a degree is the one a reading should lead with. */
  return out.sort((a, b) => a.orb - b.orb);
}

/** Natal aspects — the chart talking to itself. Each pair once. */
export function natalAspects(chart: Chart): Transit[] {
  const ps = targets(chart);
  const out: Transit[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i] as Target;
      const b = ps[j] as Target;
      /*
       * The two angles are not independent points. How far the midheaven sits from the ascendant
       * is a function of the birth latitude and the obliquity of the ecliptic — it says nothing
       * about the person, and no tradition reads an aspect between them. Including it would put a
       * spurious row at the top of every chart whose latitude happened to make it tight.
       */
      if (ANGLES.has(a.name) && ANGLES.has(b.name)) continue;
      const hit = aspectBetween(a.longitude, b.longitude, a.name, b.name);
      if (!hit) continue;
      const pa = chart.placements.find((p) => p.body === a.name);
      const pb = chart.placements.find((p) => p.body === b.name);
      out.push({
        transiting: a.name,
        natal: b.name,
        aspect: hit.aspect,
        major: hit.major,
        orb: Number(hit.orb.toFixed(3)),
        orbAllowed: hit.orbAllowed,
        strength: Number(hit.strength.toFixed(3)),
        applying: applying(a.longitude, pa?.dailyMotion ?? NaN, b.longitude, pb?.dailyMotion ?? NaN),
        transitingLongitude: a.longitude,
        transitingPosition: position(a.longitude),
        transitingRetrograde: pa?.retrograde ?? false,
        natalLongitude: b.longitude,
        natalPosition: position(b.longitude),
        throughHouse: pa?.house ?? null,
      });
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

export const signAndDegree = (lon: number) => ({ sign: signOf(lon), position: position(lon) });
