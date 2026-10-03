/*
 * The key grammar. Everything this realm computes hangs off ONE opaque string, the way
 * realm-chess hangs an analysis off a FEN: pin the string and the whole chart is a Virtual
 * Cypher hop away, for anybody, with nothing stored first.
 *
 *   1962-05-17T14:30|51.5074,-0.1278|Europe/London     a birth moment
 *   1962-05-17|51.5074,-0.1278|Europe/London           the same birth, time unknown
 *
 * The zone is the BIRTHPLACE's, never the reader's. A chart cast in the wrong zone is wrong by
 * a whole rising sign, and that is the single most common way these things are wrong, so the
 * zone is part of the key rather than a default anybody could forget.
 *
 * Pipes, commas and the slash in `Europe/London` are all fine here because every producer hands
 * keys over with `keyArg` as a plain list. `keyArgs` would make them path segments, and a key
 * with a slash in it cannot be one.
 */

/** A birth moment, parsed. `time` is null when the birth time is not known. */
export interface Moment {
  spec: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timeZone: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/*
 * Refuse, rather than repair. A chart built from a key this function guessed at would look
 * exactly as authoritative as one built from a key the caller meant.
 */
export function parseMoment(raw: string): Moment {
  const spec = raw.trim();
  const parts = spec.split("|");
  if (parts.length !== 3) {
    throw new Error(
      `Not a birth moment: ${spec}. Expected date[Thh:mm]|lat,lon|IANA zone, e.g. 1962-05-17T14:30|51.5074,-0.1278|Europe/London`,
    );
  }
  const [when = "", where = "", timeZone = ""] = parts;
  const [date = "", time = null] = when.includes("T") ? when.split("T") : [when, null];
  if (!DATE.test(date)) throw new Error(`Not a date: ${date} (in ${spec})`);
  if (time !== null && !TIME.test(time)) throw new Error(`Not a 24-hour time: ${time} (in ${spec})`);
  const coords = where.split(",");
  if (coords.length !== 2) throw new Error(`Not a coordinate pair: ${where} (in ${spec})`);
  const latitude = Number(coords[0]);
  const longitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error(`Not a latitude: ${coords[0]} (in ${spec})`);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error(`Not a longitude: ${coords[1]} (in ${spec})`);
  if (!timeZone.length) throw new Error(`No time zone in ${spec}. The BIRTHPLACE's zone, e.g. Europe/London.`);
  return { spec, date, time, latitude, longitude, timeZone };
}

/** `<birth spec>@2026-10-02` — a chart and the day the sky is read against it. */
export interface TransitDay {
  spec: string;
  moment: Moment;
  on: string;
}

export function parseTransitDay(raw: string): TransitDay {
  const spec = raw.trim();
  const at = spec.lastIndexOf("@");
  if (at < 0) throw new Error(`Not a transit day: ${spec}. Expected <birth moment>@YYYY-MM-DD.`);
  const on = spec.slice(at + 1);
  if (!DATE.test(on)) throw new Error(`Not a date: ${on} (in ${spec})`);
  return { spec, moment: parseMoment(spec.slice(0, at)), on };
}

/*
 * The 12 signs, and where a longitude falls. deepnatal names signs in lower case; these are the
 * names a reader expects to see, so the conversion happens once, here.
 */
export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

export type Sign = (typeof SIGNS)[number];

export function signOf(longitude: number): Sign {
  const i = Math.floor(norm360(longitude) / 30) % 12;
  return SIGNS[i] ?? "Aries";
}

export const degreeInSign = (longitude: number): number => norm360(longitude) % 30;

/** `26°09' Taurus` — how a chart is read aloud, and how it is checked against a published one. */
export function position(longitude: number): string {
  const d = degreeInSign(longitude);
  const deg = Math.floor(d);
  const min = Math.round((d - deg) * 60);
  const [dd, mm] = min === 60 ? [deg + 1, 0] : [deg, min];
  return `${dd}°${String(mm).padStart(2, "0")}' ${signOf(longitude)}`;
}

export const norm360 = (x: number): number => ((x % 360) + 360) % 360;

/** Title case for the names deepnatal returns in lower case: `sun`, `north node`. */
export const titleCase = (s: string): string => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/*
 * `<birth key>#<astrologer>#<natal|YYYY-MM-DD>` — one reading, by one reader, of one chart.
 *
 * The reader is part of the KEY rather than a pushdown argument, and that is the whole design: four
 * pinned ReadingRequests are four readings of one chart in a single query, which is what makes
 * "what would each of them say" one question instead of four.
 *
 * The scope is `natal` or an explicit date, never `today`. A cached reading keyed on "today" would
 * be yesterday's answer under today's name.
 */
export interface ReadingKey {
  spec: string;
  moment: Moment;
  astrologer: string;
  scope: string;
  on: string | null;
}

export function parseReadingKey(raw: string): ReadingKey {
  const spec = raw.trim();
  const parts = spec.split("#");
  if (parts.length !== 3) {
    throw new Error(
      `Not a reading key: ${spec}. Expected <birth key>#<astrologer>#<natal|YYYY-MM-DD>, e.g. 1962-05-17T14:30|51.5074,-0.1278|Europe/London#hypatia#natal`,
    );
  }
  const [birth = "", astrologer = "", scope = ""] = parts;
  const on = scope === "natal" ? null : scope;
  if (on !== null && !DATE.test(on)) {
    throw new Error(`Not a reading scope: ${scope} (in ${spec}). Use \`natal\`, or a date as YYYY-MM-DD.`);
  }
  return { spec, moment: parseMoment(birth), astrologer: astrologer.toLowerCase(), scope, on };
}
