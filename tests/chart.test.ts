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

/*
 * Horizons is paced by its publisher and this battery asks it thirty times — ten bodies for each of
 * three charts. Run flat out, the later requests are refused and the suite reports a position
 * disagreement that is really a rate limit: the first version of this file did exactly that, passing
 * each case alone and failing two of three together.
 *
 * So the requests are serialised through one queue with a gap between them, and a refusal is retried
 * once before being reported AS a refusal. A rate limit must never read as a passing comparison, and
 * it must never read as a wrong ephemeris either.
 */
const SPACING_MS = 1200;
let lastCall = 0;

async function paced<T>(f: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, lastCall + SPACING_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return f();
}

async function horizons(body: string, at: Date): Promise<{ longitude: number; latitude: number } | null> {
  const args = horizonsArgs(body, at);
  const url = new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
  for (const [k, v] of Object.entries(args)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await paced(() => fetch(url));
    if (res.ok) {
      const payload = (await res.json()) as { result?: string };
      return payload.result ? parseHorizons(payload.result) : null;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
    else throw new Error(`Horizons refused ${body} with HTTP ${res.status} — paced out, not a disagreement.`);
  }
  return null;
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
    }, 300_000);
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

describe("what a reader is told", () => {
  /*
   * The house engine states its refusals and its degradation in Chinese. An earlier version of
   * chart.ts passed those through verbatim, so a polar chart explained itself in a language the
   * page could not render and the astrologers were handed it as a caveat. Every string this realm
   * surfaces must be its own.
   */
  const CJK = /[　-鿿＀-￯]/;

  it("explains a degraded house system in English, with the latitude", () => {
    const chart = chartOf(parseMoment("1985-03-10T03:15|78.22,15.65|Arctic/Longyearbyen"));
    expect(chart.houseSystem).toBe("whole-sign");
    expect(chart.degradedReason).toBeTruthy();
    expect(chart.degradedReason!).not.toMatch(CJK);
    expect(chart.degradedReason!).toContain("78.22");
    expect(chart.degradedReason!).toContain("Placidus");
  });

  it("explains a zone that contradicts the coordinates in English", () => {
    try {
      chartOf(parseMoment("1879-03-14T11:30|48.4,10.0|Europe/Berlin"));
      throw new Error("expected a refusal");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).not.toMatch(CJK);
      expect(m).toContain("Europe/Berlin");
      expect(m).toContain("rising sign");
    }
  });

  /*
   * 02:30 on a US spring-forward morning: the clocks went 02:00 to 03:00, so no instant corresponds
   * to this birth time. deepnatal's own fixtures do not cover a hole that THROWS — its one throwing
   * fixture is the zone-versus-coordinates guard below — so the case is stated explicitly here.
   */
  it("explains a local time daylight saving skipped in English", () => {
    try {
      chartOf(parseMoment("2026-03-08T02:30|40.7128,-74.006|America/New_York"));
      throw new Error("expected a refusal");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).not.toMatch(CJK);
      expect(m).toContain("no such local time");
      expect(m).toContain("America/New_York");
    }
  });

  /* The zone guard, which IS a shipped fixture: Taipei's zone with New York's coordinates. */
  it("explains a zone that cannot belong to those coordinates in English", () => {
    const guard = FIXTURES.find((f) => f.expectThrows);
    expect(guard).toBeDefined();
    try {
      chartOf(parseMoment(specOf(guard!.birth)));
      throw new Error("expected a refusal");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).not.toMatch(CJK);
      expect(m).toContain("disagrees with what the coordinates");
    }
  });
});
