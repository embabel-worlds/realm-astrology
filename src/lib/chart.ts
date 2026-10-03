/*
 * A chart: where everything was, and which house it fell in.
 *
 * Two libraries, each doing the job it is best at, and the split is deliberate:
 *
 *   positions   astronomy-engine — 0.6" from NASA JPL Horizons on a planet, 4" on the Moon.
 *   houses      deepnatal — the ascendant, the midheaven, the Placidus cusps, and the two
 *               things that are far more likely to be wrong than any arcsecond: the birthplace
 *               time zone (with its historical rules and its daylight-saving holes) and the
 *               degradation of Placidus inside the polar circles.
 *
 * deepnatal computes planets too, from a second ephemeris, and it disagrees with astronomy-engine
 * by up to about half an arcminute on the Moon. That disagreement is not hidden: it is a property
 * on the chart (`engineAgreementArcmin`), beside deepnatal's own internal cross-check figure. A
 * realm that quietly picked one and said nothing would be hiding the single most useful fact
 * about its own accuracy.
 */
import { calculateNatalChart, calculateWithoutTime, localToUtc, type NatalChart as DeepChart } from "deepnatal";
import { norm360, position, signOf, degreeInSign, titleCase, type Moment } from "./spec.js";
import { BODIES, dailyMotion, latitudeOf, longitudeOf, moonState, type BodyName, type MoonState } from "./sky.js";

export interface Placement {
  body: BodyName;
  longitude: number;
  latitude: number;
  sign: string;
  degreeInSign: number;
  /** `26°09' Taurus` — the form a published chart states, so the two can be compared by eye. */
  position: string;
  /** 1–12, or null when the birth time is unknown and there are no houses. */
  house: number | null;
  retrograde: boolean;
  dailyMotion: number;
}

export interface Chart {
  spec: string;
  utc: Date;
  timeKnown: boolean;
  placements: Placement[];
  moon: MoonState;
  /** Null when the birth time is unknown: there is no ascendant without one. */
  ascendant: number | null;
  midheaven: number | null;
  /** 12 cusp longitudes, house 1 first. Empty when the birth time is unknown. */
  cusps: number[];
  houseSystem: string | null;
  /** Non-null when Placidus had to be abandoned — the reason belongs in front of the reader. */
  degradedReason: string | null;
  ascendantUnstable: boolean;
  /** deepnatal's own two engines, worst disagreement in arcminutes. */
  crossCheckMaxArcmin: number | null;
  /** This realm's two engines against each other, worst disagreement in arcminutes. */
  engineAgreementArcmin: number | null;
  tzAmbiguity: string | null;
  /** How far the Moon travels on an unknown-time birth day; it may cross a sign. */
  moonUncertaintyDegrees: number | null;
  moonSignAmbiguous: boolean;
  /** What a chart from this key cannot say, and why. Empty when it can say everything. */
  unavailable: { field: string; reason: string }[];
}

/*
 * deepnatal throws rather than returning a chart it cannot stand behind — its engines disagreeing,
 * a zone that contradicts the coordinates, a local time that daylight saving skipped. Those are
 * the errors worth having, so they are passed through with the key that caused them attached.
 */
export function chartOf(moment: Moment): Chart {
  const birth = {
    date: moment.date,
    latitude: moment.latitude,
    longitude: moment.longitude,
    timezone: moment.timeZone,
  };

  if (moment.time === null) {
    const partial = cast(() => calculateWithoutTime(birth), moment);
    const utc = new Date(partial.utc);
    return {
      spec: moment.spec,
      utc,
      timeKnown: false,
      placements: placementsAt(utc, []),
      moon: moonState(utc),
      ascendant: null,
      midheaven: null,
      cusps: [],
      houseSystem: null,
      degradedReason: null,
      ascendantUnstable: false,
      crossCheckMaxArcmin: null,
      engineAgreementArcmin: agreement(utc, partial.planets),
      tzAmbiguity: null,
      moonUncertaintyDegrees: partial.moonUncertaintyDegrees,
      moonSignAmbiguous: partial.moonSignAmbiguous,
      unavailable: partial.unavailable,
    };
  }

  const deep: DeepChart = cast(() => calculateNatalChart({ ...birth, time: moment.time as string }), moment);
  const utc = new Date(deep.utc);
  return {
    spec: moment.spec,
    utc,
    timeKnown: true,
    placements: placementsAt(utc, deep.houseCusps),
    moon: moonState(utc),
    ascendant: deep.ascendant.longitude,
    midheaven: deep.midheaven.longitude,
    cusps: deep.houseCusps,
    houseSystem: deep.houseSystem,
    degradedReason: deep.degradedReason ? degradationReason(moment, deep.houseSystem) : null,
    ascendantUnstable: deep.ascendantUnstable,
    crossCheckMaxArcmin: deep.crossCheckMaxArcmin,
    engineAgreementArcmin: agreement(utc, deep.planets),
    tzAmbiguity: deep.tzAmbiguity
      ? `Zone ${deep.tzAmbiguity.used} was used; ${deep.tzAmbiguity.alternative} is also defensible for these coordinates, a difference of ${deep.tzAmbiguity.diffMinutes} minutes. Confirm which was in force at the birthplace.`
      : null,
    moonUncertaintyDegrees: null,
    moonSignAmbiguous: false,
    unavailable: [],
  };
}

/*
 * The house engine states its refusals in Chinese. Those messages are correct and carry the right
 * numbers, but they are not something to hand a reader, and the earlier version of this file passed
 * them through verbatim — so a polar chart explained itself in a language the page could not render
 * and the astrologers were given it as a caveat.
 *
 * The failures are classified by CONTROL FLOW rather than by matching the message text: a local time
 * the zone never had is caught by calling `localToUtc` first, and anything that survives that and
 * still fails is the library's own zone-versus-coordinates guard. Parsing its prose for the numbers
 * would be fragile in exactly the cases nobody tested; stating what this realm already knows is not.
 */
function cast<T>(f: () => T, m: Moment): T {
  try {
    localToUtc(m.date, m.time ?? "12:00", m.timeZone);
  } catch {
    throw new Error(
      `Cannot cast ${m.spec}: there was no such local time as ${m.date} ${m.time ?? ""} in ${m.timeZone}. ` +
      `A daylight-saving jump skipped it, so no instant corresponds to this birth time. Check the hour.`,
    );
  }
  try {
    return f();
  } catch {
    throw new Error(
      `Cannot cast ${m.spec}: the time zone ${m.timeZone} disagrees with what the coordinates ` +
      `${m.latitude},${m.longitude} imply, by more than the engine will accept. Before standard time a ` +
      `zone is a particular place's own local mean time, so a historical birth needs the zone of the ` +
      `BIRTHPLACE, not of the country's present-day capital. An hour of error is a whole rising sign.`,
    );
  }
}

/*
 * Why the house system was abandoned, in English and from this realm's own facts. The engine
 * degrades inside the polar circles, where Placidus is undefined; `ascendantUnstable` carries the
 * separate and stranger consequence, so this says only the one thing.
 */
function degradationReason(m: Moment, houseSystem: string): string {
  return `Placidus houses are undefined inside the polar circles, so ${houseSystem} houses were used ` +
    `instead: the birthplace latitude is ${Math.abs(m.latitude).toFixed(2)}\u00b0, beyond the 66\u00b0 limit. ` +
    `House positions here are a convention, not a measurement.`;
}

function placementsAt(utc: Date, cusps: number[]): Placement[] {
  return BODIES.map((body) => {
    const longitude = longitudeOf(body, utc);
    const motion = dailyMotion(body, utc);
    return {
      body,
      longitude,
      latitude: latitudeOf(body, utc),
      sign: signOf(longitude),
      degreeInSign: degreeInSign(longitude),
      position: position(longitude),
      house: houseOf(longitude, cusps),
      retrograde: body !== "Sun" && body !== "Moon" && motion < 0,
      dailyMotion: motion,
    };
  });
}

/*
 * Which house a longitude falls in, from the cusps. Houses are unequal under Placidus and the
 * twelfth wraps past 0° Aries, so the test is "how far round from this cusp" rather than a
 * comparison of the two numbers.
 */
export function houseOf(longitude: number, cusps: number[]): number | null {
  if (cusps.length !== 12) return null;
  for (let i = 0; i < 12; i++) {
    const from = cusps[i] as number;
    const to = cusps[(i + 1) % 12] as number;
    const span = norm360(to - from);
    const into = norm360(longitude - from);
    if (into < (span === 0 ? 360 : span)) return i + 1;
  }
  return null;
}

/** The worst disagreement, in arcminutes, between this realm's positions and deepnatal's. */
function agreement(utc: Date, theirs: { planet: string; longitude: number }[]): number | null {
  let worst = 0;
  let compared = 0;
  for (const p of theirs) {
    const body = titleCase(p.planet) as BodyName;
    if (!BODIES.includes(body)) continue;
    const d = Math.abs(((longitudeOf(body, utc) - p.longitude + 540) % 360) - 180);
    worst = Math.max(worst, d * 60);
    compared++;
  }
  return compared ? Number(worst.toFixed(3)) : null;
}
