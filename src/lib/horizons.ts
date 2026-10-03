/*
 * NASA JPL Horizons, as a cross-check anybody can run.
 *
 * Horizons is the authority on where a body was. It is not, however, how this realm casts a
 * chart: it is rate-limited, it answers one body at a time, and it cannot tell you a house. So
 * it does the job it is actually best at — proving the realm's own numbers, live, for any chart,
 * rather than asking a reader to trust a figure in a README.
 *
 * Quantity 31 is the observer's ecliptic longitude and latitude: apparent, geocentric, referred
 * to the true ecliptic of date. That is the astrologer's coordinate, and it is the coordinate
 * astronomy-engine produces, so the two are comparable without conversion. Measured: Mars at
 * 1962-05-17 13:30 UTC, Horizons 21.3856574 against this realm's 21.3855 — 0.6 arcseconds.
 *
 * The response is one text table. Parsing it is two floats off the end of each line between
 * $$SOE and $$EOE — a tiny, stable format, which is the only kind worth hand-parsing.
 */

/** Horizons body ids. The body centre, not the barycentre: `4` is the Mars system, `499` is Mars. */
export const HORIZONS_ID: Record<string, string> = {
  Sun: "10", Moon: "301", Mercury: "199", Venus: "299", Mars: "499",
  Jupiter: "599", Saturn: "699", Uranus: "799", Neptune: "899", Pluto: "999",
};

export interface HorizonsArgs {
  format: string;
  COMMAND: string;
  OBJ_DATA: string;
  MAKE_EPHEM: string;
  EPHEM_TYPE: string;
  CENTER: string;
  START_TIME: string;
  STOP_TIME: string;
  STEP_SIZE: string;
  QUANTITIES: string;
  CAL_FORMAT: string;
  ANG_FORMAT: string;
}

/*
 * One minute of ephemeris starting at the instant asked for: the first row IS that instant, and
 * a one-row request is refused by Horizons, which wants a span it can step through.
 *
 * Horizons takes `YYYY-MMM-DD HH:MM:SS` in UTC. Minute precision would be enough for a planet
 * and not for the Moon, which moves 33 arcseconds in a minute — so seconds are sent.
 */
export function horizonsArgs(body: string, at: Date): HorizonsArgs {
  const id = HORIZONS_ID[body];
  if (!id) throw new Error(`No Horizons id for ${body}`);
  const start = horizonsTime(at);
  const stop = horizonsTime(new Date(at.getTime() + 60_000));
  return {
    format: "json",
    COMMAND: `'${id}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'500@399'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1 m'",
    QUANTITIES: "'31'",
    CAL_FORMAT: "'CAL'",
    ANG_FORMAT: "'DEG'",
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function horizonsTime(at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${MONTHS[at.getUTCMonth()]}-${p(at.getUTCDate())} ${p(at.getUTCHours())}:${p(at.getUTCMinutes())}:${p(at.getUTCSeconds())}`;
}

export interface HorizonsRow {
  longitude: number;
  latitude: number;
}

/*
 * The first ephemeris row. Horizons prefixes a header and appends notes; the table is delimited
 * by $$SOE/$$EOE, and inside it every line ends with the two quantities asked for. Anything else
 * — a missing table, an error page, a row that does not end in two numbers — returns null, and
 * the caller reports a check that could not be made rather than a check that passed.
 */
export function parseHorizons(result: string): HorizonsRow | null {
  const start = result.indexOf("$$SOE");
  const end = result.indexOf("$$EOE");
  if (start < 0 || end < start) return null;
  for (const line of result.slice(start + 5, end).split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2) continue;
    const latitude = Number(fields[fields.length - 1]);
    const longitude = Number(fields[fields.length - 2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    return { longitude, latitude };
  }
  return null;
}

/** Degrees to arcseconds, for stating an agreement at the scale it actually lives at. */
export const arcseconds = (degrees: number): number => Math.abs(degrees) * 3600;
