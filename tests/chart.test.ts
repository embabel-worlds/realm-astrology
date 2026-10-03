/*
 * The battery. Every number here is fetched or computed, never transcribed:
 *
 *   NASA        every body in every chart, against JPL Horizons, live.
 *   astro-seek  the signs and the ascendant, from the EXTERNAL_CHECKS deepnatal ships — values
 *               it scraped, so this realm is not re-copying a table by hand either.
 *   boundaries  deepnatal's 21 awkward births: daylight-saving holes that must throw, polar
 *               latitudes where Placidus must degrade and say so.
 *
 * The NASA suite needs the network. It is not mocked: a cross-check against a recording proves
 * the recording.
 */
import { describe, expect, it } from "vitest";
import { EXTERNAL_CHECKS, FIXTURES } from "deepnatal/fixtures";
import { chartOf } from "../src/lib/chart.js";
import { parseMoment, position } from "../src/lib/spec.js";
import { arcseconds, horizonsArgs, parseHorizons } from "../src/lib/horizons.js";
import { BODIES } from "../src/lib/sky.js";

const specOf = (b: { date: string; time: string; timezone: string; latitude: number; longitude: number }) =>
  `${b.date}T${b.time}|${b.latitude},${b.longitude}|${b.timezone}`;

/* Horizons is paced, so the suite asks it in series and keeps the set of charts small. */
async function horizons(body: string, at: Date): Promise<{ longitude: number; latitude: number } | null> {
  const args = horizonsArgs(body, at);
  const url = new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
  for (const [k, v] of Object.entries(args)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) return null;
  const body_ = (await res.json()) as { result?: string };
  return body_.result ? parseHorizons(body_.result) : null;
}

describe("positions against NASA JPL Horizons", () => {
  /*
   * Three charts, chosen to move the error terms: a 19th-century birth (the far end of the
   * ephemeris), a mid-20th-century one, and a recent one.
   *
   * The early one is a LONDON birth deliberately. Before standard time, a zone is a place's own
   * local mean time, so `Europe/Berlin` in 1879 means Berlin's — and a birth at Ulm, 6.5 minutes
   * of longitude away, is refused rather than cast (see "before standard time" below). London sits
   * on the meridian the zone is named for, so there the zone and the place agree.
   */
  const charts = [
    "1879-03-14T11:30|51.5074,-0.1278|Europe/London",
    "1962-05-17T14:30|51.5074,-0.1278|Europe/London",
    "2001-09-11T08:46|40.7128,-74.006|America/New_York",
  ];

  /*
   * One arcminute. The Moon is the binding case — astronomy-engine's own stated accuracy is about
   * an arcminute, and the Moon moves 33 arcseconds in the minute Horizons rounds its label to.
   * A tighter bound would be testing the rounding, not the ephemeris.
   */
  const TOLERANCE_ARCSEC = 60;

  for (const spec of charts) {
    it(`agrees with Horizons on every body: ${spec}`, async () => {
      const chart = chartOf(parseMoment(spec));
      const disagreements: string[] = [];
      for (const body of BODIES) {
        const theirs = await horizons(body, chart.utc);
        expect(theirs, `Horizons returned no row for ${body}`).not.toBeNull();
        const ours = chart.placements.find((p) => p.body === body);
        expect(ours).toBeDefined();
        const off = arcseconds(((ours!.longitude - theirs!.longitude + 540) % 360) - 180);
        if (off > TOLERANCE_ARCSEC) {
          disagreements.push(`${body}: ours ${ours!.longitude.toFixed(5)} vs NASA ${theirs!.longitude.toFixed(5)} (${off.toFixed(1)}")`);
        }
      }
      expect(disagreements, disagreements.join("; ")).toEqual([]);
    }, 180_000);
  }
});

describe("signs and ascendant against astro-seek", () => {
  for (const check of EXTERNAL_CHECKS) {
    const fixture = FIXTURES.find((f) => f.name === check.fixtureName);
    if (!fixture || fixture.expectThrows) continue;
    it(`matches ${check.source} for ${check.fixtureName}`, () => {
      const chart = chartOf(parseMoment(specOf(fixture.birth)));
      const wrong: string[] = [];
      for (const [name, expected] of Object.entries(check.signs)) {
        const actual = name === "ascendant"
          ? (chart.ascendant === null ? null : position(chart.ascendant).split(" ")[1])
          : chart.placements.find((p) => p.body.toLowerCase() === name)?.sign;
        if (actual?.toLowerCase() !== String(expected).toLowerCase()) {
          wrong.push(`${name}: ${actual} ≠ ${expected}`);
        }
      }
      expect(wrong, wrong.join("; ")).toEqual([]);
    });
  }
});

describe("the awkward births", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name} — ${fixture.covers}`, () => {
      const spec = specOf(fixture.birth);
      if (fixture.expectThrows) {
        /* A local time daylight saving skipped. Refusing is the whole point. */
        expect(() => chartOf(parseMoment(spec))).toThrow();
        return;
      }
      const chart = chartOf(parseMoment(spec));
      expect(chart.placements).toHaveLength(BODIES.length);
      if (fixture.expectHouseSystem) {
        expect(chart.houseSystem).toBe(fixture.expectHouseSystem);
        /* A degraded chart must say why, or the reader is misled by a house number. */
        if (fixture.expectHouseSystem === "whole-sign") expect(chart.degradedReason).toBeTruthy();
      }
      /* Our ephemeris against deepnatal's, both doing the same job. */
      expect(chart.engineAgreementArcmin).not.toBeNull();
      expect(chart.engineAgreementArcmin!).toBeLessThan(5);
    });
  }
});

describe("a birth time nobody remembers", () => {
  it("gives no ascendant, and says the Moon may be ambiguous", () => {
    const chart = chartOf(parseMoment("1962-05-17|51.5074,-0.1278|Europe/London"));
    expect(chart.timeKnown).toBe(false);
    expect(chart.ascendant).toBeNull();
    expect(chart.cusps).toEqual([]);
    expect(chart.placements.every((p) => p.house === null)).toBe(true);
    expect(chart.unavailable.length).toBeGreaterThan(0);
    expect(chart.moonUncertaintyDegrees).toBeGreaterThan(10);
  });
});

describe("before standard time", () => {
  /*
   * Germany had no standard time until 1893, so tzdata's `Europe/Berlin` for an 1879 date is
   * Berlin's local mean time. Ulm is 6.5 minutes of longitude from Berlin, and the chart is
   * refused with that number in the message — which is the right answer, not a limitation. A
   * silently-cast chart would put the ascendant about 1.6° out and look perfectly convincing.
   */
  it("refuses a pre-1893 German birth cast in Berlin's zone, and says why", () => {
    expect(() => chartOf(parseMoment("1879-03-14T11:30|48.4,10.0|Europe/Berlin")))
      .toThrow(/Cannot cast/);
  });
});
