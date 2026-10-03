/*
 * The sky at an arbitrary instant, from astronomy-engine (MIT, no dependencies).
 *
 * deepnatal casts a BIRTH chart — a local date, a zone, a place. Transits and "the sky right
 * now" ask a different question: where is everything, seen from the Earth's centre, at this
 * instant? That is one call per body, and astronomy-engine is the same library deepnatal
 * cross-checks its own ephemeris against, so the two layers cannot drift apart.
 *
 * Measured against NASA JPL Horizons for Mars at 1962-05-17 13:30 UTC: 21.3855 here against
 * Horizons' 21.3856574, a disagreement of 0.6 arcseconds. `verifyAgainstNasa` re-runs that
 * comparison live, for any chart, rather than asking anyone to take this comment on trust.
 */
import { Body, Ecliptic, GeoVector, Illumination, MoonPhase } from "astronomy-engine";
import { norm360 } from "./spec.js";

/* The classical set, in the order a chart is read: luminaries, then outward from the Sun. */
export const BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;

export type BodyName = (typeof BODIES)[number];

const BODY: Record<BodyName, Body> = {
  Sun: Body.Sun, Moon: Body.Moon, Mercury: Body.Mercury, Venus: Body.Venus, Mars: Body.Mars,
  Jupiter: Body.Jupiter, Saturn: Body.Saturn, Uranus: Body.Uranus, Neptune: Body.Neptune, Pluto: Body.Pluto,
};

/** Apparent geocentric ecliptic longitude, degrees, true ecliptic of date — the astrologer's coordinate. */
export function longitudeOf(body: BodyName, at: Date): number {
  return norm360(Ecliptic(GeoVector(BODY[body], at, true)).elon);
}

export function latitudeOf(body: BodyName, at: Date): number {
  return Ecliptic(GeoVector(BODY[body], at, true)).elat;
}

/*
 * Degrees of longitude per day, signed. Retrograde is not a property a body has, it is the sign
 * of this number — so it is measured, over half a day either side, rather than looked up in a
 * table of retrograde windows that would need maintaining.
 *
 * The Sun and Moon never retrograde. Measuring them anyway would be harmless but would invite
 * the reader to wonder, so they are stated.
 */
export function dailyMotion(body: BodyName, at: Date): number {
  if (body === "Sun" || body === "Moon") {
    const h = 6 * 3600_000;
    return signedArc(longitudeOf(body, new Date(at.getTime() - h)), longitudeOf(body, new Date(at.getTime() + h))) * 2;
  }
  const h = 12 * 3600_000;
  return signedArc(longitudeOf(body, new Date(at.getTime() - h)), longitudeOf(body, new Date(at.getTime() + h)));
}

export const isRetrograde = (body: BodyName, at: Date): boolean =>
  body !== "Sun" && body !== "Moon" && dailyMotion(body, at) < 0;

/** The shorter way round from a to b, signed: +ahead, -behind. Degrees. */
export function signedArc(a: number, b: number): number {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
}

export interface SkyBody {
  body: BodyName;
  longitude: number;
  latitude: number;
  dailyMotion: number;
  retrograde: boolean;
}

export const skyAt = (at: Date): SkyBody[] =>
  BODIES.map((body) => ({
    body,
    longitude: longitudeOf(body, at),
    latitude: latitudeOf(body, at),
    dailyMotion: dailyMotion(body, at),
    retrograde: isRetrograde(body, at),
  }));

/*
 * The Moon's phase, as both the number astronomers use (elongation from the Sun) and the name
 * everybody else does. The names are the eight traditional octants; a boundary is a quarter, so
 * the window is narrow deliberately — "waxing gibbous" is a week, "full moon" is about a day.
 */
export interface MoonState {
  elongation: number;
  illuminated: number;
  phase: string;
}

export function moonState(at: Date): MoonState {
  const elongation = norm360(MoonPhase(at));
  const illuminated = Illumination(Body.Moon, at).phase_fraction;
  return { elongation, illuminated, phase: phaseName(elongation) };
}

function phaseName(elongation: number): string {
  const e = norm360(elongation);
  if (e < 11.25 || e >= 348.75) return "new moon";
  if (e < 78.75) return "waxing crescent";
  if (e < 101.25) return "first quarter";
  if (e < 168.75) return "waxing gibbous";
  if (e < 191.25) return "full moon";
  if (e < 258.75) return "waning gibbous";
  if (e < 281.25) return "last quarter";
  return "waning crescent";
}
