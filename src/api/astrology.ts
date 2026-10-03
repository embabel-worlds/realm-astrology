import type { GenericGatewayContext } from "@embabel/runtime-types";
import { chartOf, houseOf, type Chart } from "../lib/chart.js";
import { arcseconds, horizonsArgs, HORIZONS_ID, parseHorizons } from "../lib/horizons.js";
import { moonState, skyAt as sky, BODIES } from "../lib/sky.js";
import { natalAspects, transitsOf } from "../lib/transits.js";
import { bySlug, personas, slugs, tierFor, type Persona } from "../lib/personas.js";
import { conditionTable, sectBlock, sectOf } from "../lib/dignity.js";
import {
  applyExtraction, currentBlock, defaultsFor, extractionPrompt, parseJsonObject,
  type MetricValues,
} from "../lib/metrics.js";
import { degreeInSign, parseMoment, parseReadingKey, parseTransitDay, position, signOf } from "../lib/spec.js";

/*
 * The realm's verbs. Six compute — a chart, its placements, its aspects, its houses, the sky at
 * an instant, and the sky read against a chart — and two reach out: one resolves a birthplace to
 * the coordinates and zone a chart needs, one asks NASA whether the computed positions are right.
 *
 * Every verb is also a producer, so each is one Virtual Cypher hop from a pinned key. Each takes
 * a list and returns a flat list of records, every record carrying the key it was computed for:
 * that is what lets one query ask for forty charts and get them in one call.
 *
 * Nothing here interprets anything. A sign is where a body is, not what it means. The meaning is
 * `readChart`, which asks a model with the astrology skill attached, and which is deliberately a
 * separate verb with a separate cache: a position is a fact and a reading is a judgement, and the
 * two should never be mistaken for one another in the graph.
 */

/** Charts are cast once per key; a key with a bad shape is refused rather than guessed at. */
const chartsFor = (specs: string[] | undefined): Chart[] =>
  (specs ?? []).map((s) => chartOf(parseMoment(s)));

export interface NatalChartRecord {
  spec: string;
  utc: string;
  timeKnown: boolean;
  sunSign: string;
  moonSign: string;
  risingSign: string | null;
  ascendant: string | null;
  midheaven: string | null;
  ascendantLongitude: number | null;
  midheavenLongitude: number | null;
  houseSystem: string | null;
  moonPhase: string;
  moonIlluminated: number;
  /** Non-null when Placidus was abandoned for the latitude. Belongs in front of the reader. */
  degradedReason: string | null;
  ascendantUnstable: boolean;
  /** How far this realm's two ephemerides disagreed, arcminutes. Its own accuracy, as data. */
  engineAgreementArcmin: number | null;
  crossCheckMaxArcmin: number | null;
  /** A defensible alternative zone for these coordinates, where one exists. */
  tzAmbiguity: string | null;
  moonUncertaintyDegrees: number | null;
  moonSignAmbiguous: boolean;
  /** What this chart cannot say, and why: empty when the birth time is known. */
  unavailable: string[];
}

/** One chart per birth moment: the signs, the angles, and what the chart cannot say. */
export async function natalChart(
  _ctx: GenericGatewayContext,
  args: { specs: string[] },
): Promise<NatalChartRecord[]> {
  return chartsFor(args.specs).map((c) => ({
    spec: c.spec,
    utc: c.utc.toISOString(),
    timeKnown: c.timeKnown,
    sunSign: signOf(c.placements.find((p) => p.body === "Sun")!.longitude),
    moonSign: signOf(c.placements.find((p) => p.body === "Moon")!.longitude),
    risingSign: c.ascendant === null ? null : signOf(c.ascendant),
    ascendant: c.ascendant === null ? null : position(c.ascendant),
    midheaven: c.midheaven === null ? null : position(c.midheaven),
    ascendantLongitude: c.ascendant,
    midheavenLongitude: c.midheaven,
    houseSystem: c.houseSystem,
    moonPhase: c.moon.phase,
    moonIlluminated: Number(c.moon.illuminated.toFixed(4)),
    degradedReason: c.degradedReason,
    ascendantUnstable: c.ascendantUnstable,
    engineAgreementArcmin: c.engineAgreementArcmin,
    crossCheckMaxArcmin: c.crossCheckMaxArcmin,
    tzAmbiguity: c.tzAmbiguity,
    moonUncertaintyDegrees: c.moonUncertaintyDegrees,
    moonSignAmbiguous: c.moonSignAmbiguous,
    unavailable: c.unavailable.map((u) => `${u.field}: ${u.reason}`),
  }));
}

export interface PlacementRecord {
  placementId: string;
  spec: string;
  body: string;
  longitude: number;
  latitude: number;
  sign: string;
  degreeInSign: number;
  position: string;
  house: number | null;
  retrograde: boolean;
  dailyMotion: number;
}

/** Every body in every chart: sign, degree, house and whether it was retrograde. */
export async function placements(
  _ctx: GenericGatewayContext,
  args: { specs: string[] },
): Promise<PlacementRecord[]> {
  return chartsFor(args.specs).flatMap((c) =>
    c.placements.map((p) => ({
      placementId: `${c.spec}|${p.body}`,
      spec: c.spec,
      body: p.body,
      longitude: Number(p.longitude.toFixed(6)),
      latitude: Number(p.latitude.toFixed(6)),
      sign: p.sign,
      degreeInSign: Number(p.degreeInSign.toFixed(4)),
      position: p.position,
      house: p.house,
      retrograde: p.retrograde,
      dailyMotion: Number(p.dailyMotion.toFixed(5)),
    })),
  );
}

export interface AspectRecord {
  aspectId: string;
  spec: string;
  from: string;
  to: string;
  aspect: string;
  major: boolean;
  orb: number;
  orbAllowed: number;
  strength: number;
  applying: boolean | null;
  fromPosition: string;
  toPosition: string;
}

/** The chart talking to itself: every pair of points standing at one of the read angles. */
export async function aspects(
  _ctx: GenericGatewayContext,
  args: { specs: string[] },
): Promise<AspectRecord[]> {
  return chartsFor(args.specs).flatMap((c) =>
    natalAspects(c).map((a) => ({
      aspectId: `${c.spec}|${a.transiting}-${a.aspect}-${a.natal}`,
      spec: c.spec,
      from: a.transiting,
      to: a.natal,
      aspect: a.aspect,
      major: a.major,
      orb: a.orb,
      orbAllowed: a.orbAllowed,
      strength: a.strength,
      applying: a.applying,
      fromPosition: a.transitingPosition,
      toPosition: a.natalPosition,
    })),
  );
}

export interface HouseCuspRecord {
  cuspId: string;
  spec: string;
  house: number;
  longitude: number;
  sign: string;
  degreeInSign: number;
  position: string;
  /** Degrees of ecliptic the house spans. Placidus houses are unequal; some are very wide. */
  span: number;
}

/** The twelve cusps. A chart cast without a birth time has none, and returns nothing. */
export async function houseCusps(
  _ctx: GenericGatewayContext,
  args: { specs: string[] },
): Promise<HouseCuspRecord[]> {
  const out: HouseCuspRecord[] = [];
  for (const c of chartsFor(args.specs)) {
    for (let i = 0; i < c.cusps.length; i++) {
      const lon = c.cusps[i] as number;
      const next = c.cusps[(i + 1) % 12] as number;
      out.push({
        cuspId: `${c.spec}|${i + 1}`,
        spec: c.spec,
        house: i + 1,
        longitude: Number(lon.toFixed(6)),
        sign: signOf(lon),
        degreeInSign: Number(degreeInSign(lon).toFixed(4)),
        position: position(lon),
        span: Number((((next - lon) % 360 + 360) % 360).toFixed(4)),
      });
    }
  }
  return out;
}

export interface TransitRecord {
  transitId: string;
  spec: string;
  /** The birth moment, without the day — so a transit row can be joined back to its chart. */
  chartSpec: string;
  on: string;
  transiting: string;
  natal: string;
  aspect: string;
  major: boolean;
  orb: number;
  strength: number;
  applying: boolean | null;
  transitingPosition: string;
  transitingRetrograde: boolean;
  natalPosition: string;
  throughHouse: number | null;
}

/*
 * The sky on a day, read against a chart. The instant is noon UTC of that day: a transit is read
 * as a condition of the day, not of a minute, and noon is the convention that minimises how far
 * the Moon — the only fast-moving body — can be from its daily mean.
 */
export async function transits(
  _ctx: GenericGatewayContext,
  args: { specs: string[] },
): Promise<TransitRecord[]> {
  const out: TransitRecord[] = [];
  for (const raw of args.specs ?? []) {
    const day = parseTransitDay(raw);
    const chart = chartOf(day.moment);
    const at = new Date(`${day.on}T12:00:00Z`);
    for (const t of transitsOf(chart, at, (lon) => houseOf(lon, chart.cusps))) {
      out.push({
        transitId: `${day.spec}|${t.transiting}-${t.aspect}-${t.natal}`,
        spec: day.spec,
        chartSpec: day.moment.spec,
        on: day.on,
        transiting: t.transiting,
        natal: t.natal,
        aspect: t.aspect,
        major: t.major,
        orb: t.orb,
        strength: t.strength,
        applying: t.applying,
        transitingPosition: t.transitingPosition,
        transitingRetrograde: t.transitingRetrograde,
        natalPosition: t.natalPosition,
        throughHouse: t.throughHouse,
      });
    }
  }
  return out;
}

export interface SkyPositionRecord {
  positionId: string;
  instant: string;
  body: string;
  longitude: number;
  sign: string;
  degreeInSign: number;
  position: string;
  retrograde: boolean;
  dailyMotion: number;
  moonPhase: string;
  moonIlluminated: number;
}

/*
 * The sky at an instant, with no chart involved. This is the hop that joins astrology to
 * everything else the world holds: anything with a timestamp — a commit, a workflow run, an
 * invoice, a conversation — has a sky over it, and this verb is how that sky is fetched.
 */
export async function skyAt(
  _ctx: GenericGatewayContext,
  args: { instants: string[] },
): Promise<SkyPositionRecord[]> {
  const out: SkyPositionRecord[] = [];
  for (const raw of args.instants ?? []) {
    const instant = raw.trim();
    const at = new Date(instant);
    if (Number.isNaN(at.getTime())) throw new Error(`Not an instant: ${instant}. Expected ISO 8601, e.g. 2026-10-02T21:00:00Z.`);
    const moon = moonState(at);
    for (const b of sky(at)) {
      out.push({
        positionId: `${instant}|${b.body}`,
        instant,
        body: b.body,
        longitude: Number(b.longitude.toFixed(6)),
        sign: signOf(b.longitude),
        degreeInSign: Number(degreeInSign(b.longitude).toFixed(4)),
        position: position(b.longitude),
        retrograde: b.retrograde,
        dailyMotion: Number(b.dailyMotion.toFixed(5)),
        moonPhase: moon.phase,
        moonIlluminated: Number(moon.illuminated.toFixed(4)),
      });
    }
  }
  return out;
}

/* ── The two verbs that leave the process ──────────────────────────────────────────────────── */

/* The gateway camelCases the name declared in apis.yml: `open_meteo_geocoding` is reached here as
 * `openMeteoGeocoding`. Getting it wrong is silent — an undefined namespace, no rows, no warning. */
interface GeocodingGateway {
  openMeteoGeocoding: {
    geocodeSearch(a: { name: string; count?: number; language?: string; format?: string }): Promise<{
      results?: { id?: number; name: string; latitude: number; longitude: number; timezone: string; country?: string; admin1?: string; population?: number }[];
    }>;
  };
}

export interface BirthplaceRecord {
  placeId: string;
  /** The name as asked for — the key this record answers. */
  nameQueried: string;
  name: string;
  country: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  timeZone: string;
  population: number | null;
  /** The key to cast a chart with, once a birth date and time are added in front of it. */
  specFragment: string;
}

/*
 * A place name to the coordinates and zone a chart needs. Open-Meteo's geocoder is keyless and,
 * crucially, returns the IANA zone — which is the field that actually decides a rising sign, and
 * the one a user cannot be expected to know.
 *
 * It returns SEVERAL places for a name, and that is kept: there are three Melbournes, and picking
 * the biggest silently would cast the wrong chart for anyone born in Arkansas. The caller chooses.
 */
export async function resolveBirthplace(
  ctx: GenericGatewayContext,
  args: { names: string[]; count?: number },
): Promise<BirthplaceRecord[]> {
  const api = (ctx as unknown as GeocodingGateway).openMeteoGeocoding;
  const count = Math.min(Math.max(args.count ?? 5, 1), 20);
  const out: BirthplaceRecord[] = [];
  for (const raw of args.names ?? []) {
    const nameQueried = raw.trim();
    if (!nameQueried) continue;
    const res = await api.geocodeSearch({ name: nameQueried, count, language: "en", format: "json" });
    for (const r of res.results ?? []) {
      out.push({
        placeId: `${nameQueried}|${r.latitude},${r.longitude}`,
        nameQueried,
        name: r.name,
        country: r.country ?? null,
        region: r.admin1 ?? null,
        latitude: r.latitude,
        longitude: r.longitude,
        timeZone: r.timezone,
        population: r.population ?? null,
        specFragment: `${r.latitude},${r.longitude}|${r.timezone}`,
      });
    }
  }
  return out;
}

interface HorizonsGateway {
  nasaHorizons: {
    horizonsLookup(a: Record<string, string>): Promise<{ result?: string }>;
  };
}

export interface NasaCheckRecord {
  checkId: string;
  spec: string;
  body: string;
  /** The instant checked — the chart's UTC moment, to the second. */
  utc: string;
  ourLongitude: number;
  nasaLongitude: number | null;
  /** How far apart, in arcseconds. Null when NASA could not be reached or gave no row. */
  agreementArcsec: number | null;
  /** Did the two agree inside the stated tolerance? Null means the check could not be made. */
  agrees: boolean | null;
  sign: string;
  /** The same sign either way? A disagreement that crosses a sign boundary is the one that matters. */
  sameSign: boolean | null;
  note: string | null;
}

/*
 * The audit. For each body in a chart, ask NASA JPL Horizons where it was and report the
 * difference, in arcseconds, as data.
 *
 * One request per body, because Horizons answers one body at a time and is paced by its
 * publisher: ten requests per chart, cached hard afterwards. This is not how charts are cast —
 * it is how a reader satisfies themselves that they were cast correctly, which no other
 * astrology surface will let them do at all.
 *
 * A tolerance is stated rather than implied: one arcminute, which is astronomy-engine's own
 * stated accuracy and far finer than any astrological distinction. A check that could not be
 * made says so and claims nothing — an unreachable NASA is not a pass.
 */
const TOLERANCE_ARCSEC = 60;

export async function verifyAgainstNasa(
  ctx: GenericGatewayContext,
  args: { specs: string[]; bodies?: string[] | string },
): Promise<NasaCheckRecord[]> {
  const api = (ctx as unknown as HorizonsGateway).nasaHorizons;
  /*
   * `bodies` arrives through the producer's pushdown — `WHERE c.body = 'Mars'` rendered into the
   * `{filters}` slot — so it may be a list, a bare string, or the unrendered placeholder itself
   * when nothing was pushed. Anything that is not a body this realm knows is dropped, which makes
   * the placeholder case mean "check all ten" without a special case for its spelling.
   */
  const asked = Array.isArray(args.bodies) ? args.bodies : typeof args.bodies === "string" ? [args.bodies] : [];
  const wanted = asked.filter((b) => b in HORIZONS_ID);
  const bodies = wanted.length ? wanted : [...BODIES];
  const out: NasaCheckRecord[] = [];
  for (const chart of chartsFor(args.specs)) {
    for (const body of bodies) {
      const ours = chart.placements.find((p) => p.body === body);
      if (!ours) continue;
      /*
       * A transport failure THROWS rather than returning a row. The difference matters because
       * these rows are cached: a row saying "could not reach NASA" would be cached as though it
       * were a finding, and an outage would turn into a permanent unaudited chart. An error is
       * loud, uncached, and retried.
       *
       * Horizons answering with no ephemeris row IS a finding — the instant is outside its span —
       * so that comes back as a row, with `agrees: null` and the reason.
       */
      const res = await api.horizonsLookup(horizonsArgs(body, chart.utc) as unknown as Record<string, string>);
      const row = res.result ? parseHorizons(res.result) : null;
      const nasaLongitude: number | null = row ? row.longitude : null;
      const note: string | null = row ? null : "Horizons returned no ephemeris row for this instant.";
      const off = nasaLongitude === null ? null : arcseconds(((ours.longitude - nasaLongitude + 540) % 360) - 180);
      out.push({
        checkId: `${chart.spec}|${body}`,
        spec: chart.spec,
        body,
        utc: chart.utc.toISOString(),
        ourLongitude: Number(ours.longitude.toFixed(6)),
        nasaLongitude: nasaLongitude === null ? null : Number(nasaLongitude.toFixed(6)),
        agreementArcsec: off === null ? null : Number(off.toFixed(2)),
        agrees: off === null ? null : off <= TOLERANCE_ARCSEC,
        sign: ours.sign,
        sameSign: nasaLongitude === null ? null : signOf(nasaLongitude) === ours.sign,
        note,
      });
    }
  }
  return out;
}

export interface BirthSpecRecord {
  spec: string;
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timeZone: string;
  timeKnown: boolean;
}

/*
 * Assemble a birth key from its parts, and refuse the ones that are not keys.
 *
 * It exists so that nothing downstream — an app, a chat turn, a stored BirthRecord — ever builds
 * the string by concatenation. The key carries the birthplace zone, and a key assembled by hand
 * is the one place a reader's zone could quietly be substituted for the birthplace's.
 */
export async function birthSpec(
  _ctx: GenericGatewayContext,
  args: { births: { date: string; time?: string | null; latitude: number; longitude: number; timeZone: string }[] },
): Promise<BirthSpecRecord[]> {
  return (args.births ?? []).map((b) => {
    const when = b.time ? `${b.date}T${b.time}` : b.date;
    const m = parseMoment(`${when}|${b.latitude},${b.longitude}|${b.timeZone}`);
    return {
      spec: m.spec,
      date: m.date,
      time: m.time,
      latitude: m.latitude,
      longitude: m.longitude,
      timeZone: m.timeZone,
      timeKnown: m.time !== null,
    };
  });
}

/* ── The reading: a judgement, not a fact ──────────────────────────────────────────────────── */

interface AiGateway {
  ai: { complete(a: { prompt: string; role?: string; skills?: string[] }): Promise<unknown> };
}

/*
 * Metric values are STORED, keyed on the conversation, because a client cannot be trusted with them
 * and a stateless surface has nowhere to put them. The host owns conversation identity — the OpenAI
 * surface's `embabel_conversation`, a connector's thread identity on Discord, a thread key in an app
 * — so the realm takes the id as given and owns only what is known about it.
 */
interface StoreGateway {
  /*
   * `kg.query`, not `cypher.query`. The alias takes NO params, so a parameterised read against it
   * leaves `$key` unbound and the call fails \u2014 and because the first version of this caught every
   * error and fell back to the declared defaults, metrics silently restarted every single turn while
   * looking like they worked. A catch that cannot tell "no row yet" from "the query is wrong" hides
   * precisely the bug it is most likely to be hiding.
   */
  kg: { query(a: { cypher: string; params?: Record<string, unknown> }): Promise<unknown> };
  repository: {
    createEntry(a: Record<string, unknown>): Promise<unknown>;
    updateEntry(a: Record<string, unknown>): Promise<unknown>;
  };
}

const conversationKey = (persona: string, conversation: string) => `${persona}|${conversation}`;

async function loadMetrics(ctx: GenericGatewayContext, who: Persona, conversation: string): Promise<{ values: MetricValues; turns: number; id: string | null; error: string | null }> {
  const store = ctx as unknown as StoreGateway;
  const key = conversationKey(who.slug, conversation);
  const fresh = { values: defaultsFor(who), turns: 0, id: null as string | null, error: null as string | null };
  try {
    const res = (await store.kg.query({
      cypher: "MATCH (m:ConversationMetrics {conversationKey: $key}) RETURN m.id AS id, m.values AS values, m.turns AS turns",
      params: { key },
    })) as { rows?: { id?: string; values?: string; turns?: number }[] };
    const row = res?.rows?.[0];
    /* No row is the normal first turn. An ERROR is not, and is reported rather than absorbed. */
    if (!row?.values) return fresh;
    return {
      values: { ...defaultsFor(who), ...(parseJsonObject(row.values) as MetricValues) },
      turns: row.turns ?? 0,
      id: row.id ?? null,
      error: null,
    };
  } catch (e) {
    return { ...fresh, error: `could not read stored metrics: ${(e as Error).message}` };
  }
}

async function saveMetrics(
  ctx: GenericGatewayContext, who: Persona, conversation: string,
  values: MetricValues, turns: number, id: string | null,
): Promise<string | null> {
  const store = ctx as unknown as StoreGateway;
  const key = conversationKey(who.slug, conversation);
  const entry = {
    type: "ConversationMetrics",
    conversationKey: key,
    persona: who.slug,
    conversation,
    values: JSON.stringify(values),
    turns,
    updatedAt: new Date().toISOString(),
  };
  /* A failed write must not lose the reply the person is waiting for — but it must be visible. */
  try {
    if (id) await store.repository.updateEntry({ ...entry, id });
    else await store.repository.createEntry(entry);
    return null;
  } catch (e) {
    return `could not store metrics: ${(e as Error).message}`;
  }
}

export interface ReadingRecord {
  readingId: string;
  spec: string;
  chartSpec: string;
  astrologer: string;
  astrologerName: string;
  tagline: string;
  scope: string;
  /** The reading itself, as markdown. */
  reading: string;
  /** What the chart could not say, carried onto the reading so it cannot be read without them. */
  caveats: string[];
  sunSign: string;
  moonSign: string;
  risingSign: string | null;
  /** Which model role produced it. A reading is not reproducible; this says who to ask about it. */
  role: string | null;
}

/*
 * One reading of one chart by one astrologer.
 *
 * The facts are computed first and handed to the model as a table; the model's job is the
 * interpretation and nothing else, with the `astrology-reading` skill carrying the craft — the
 * order the tradition reads in, the dignities, what the honesty fields mean, and what a reading
 * must never claim. That split is deliberate and it is the same one realm-chess makes: the engine
 * finds the moves, the model with the skill says what they are for.
 *
 * The caveats are not left to the model's discretion. They are computed from the chart and attached
 * to the record, so a reading of a chart with no birth time carries "no ascendant" as DATA even if
 * the prose forgets. A view can filter on them; a page can print them beside the reading.
 *
 * `role` resolves the model through the world's LLM roles. No model is named here: which model
 * plays a role is the world's decision, not this realm's.
 */
export async function readChart(
  ctx: GenericGatewayContext,
  args: { specs: string[]; role?: string },
): Promise<ReadingRecord[]> {
  const ai = (ctx as unknown as AiGateway).ai;
  const out: ReadingRecord[] = [];
  for (const raw of args.specs ?? []) {
    const key = parseReadingKey(raw);
    const who = bySlug(key.astrologer);
    if (!who) {
      throw new Error(`No astrologer called '${key.astrologer}'. This realm ships: ${slugs().join(", ")}.`);
    }
    const chart = chartOf(key.moment);
    const caveats = caveatsOf(chart);
    const at = key.on === null ? null : new Date(`${key.on}T12:00:00Z`);
    const moving = at === null ? [] : transitsOf(chart, at, (lon) => houseOf(lon, chart.cusps));
    const prompt = readingPrompt(who, chart, caveats, key, moving);
    const answer = await ai.complete({
      prompt,
      skills: ["astrology-reading"],
      ...(args.role ? { role: args.role } : {}),
    });
    const reading = (typeof answer === "string" ? answer : JSON.stringify(answer)).trim();
    out.push({
      readingId: key.spec,
      spec: key.spec,
      chartSpec: key.moment.spec,
      astrologer: who.slug,
      astrologerName: who.name,
      tagline: who.tagline,
      scope: key.scope,
      reading,
      caveats,
      sunSign: signOf(chart.placements.find((p) => p.body === "Sun")!.longitude),
      moonSign: signOf(chart.placements.find((p) => p.body === "Moon")!.longitude),
      risingSign: chart.ascendant === null ? null : signOf(chart.ascendant),
      role: args.role ?? null,
    });
  }
  return out;
}

/*
 * The caveats, computed rather than asked for. Each one changes what a reading is entitled to say,
 * so each is stated in those terms rather than as a technical note.
 */
function caveatsOf(chart: Chart): string[] {
  const out: string[] = [];
  if (!chart.timeKnown) {
    out.push("The birth time is not known, so this chart has no ascendant and no houses. Any reading of a rising sign or a house placement would be invented.");
  }
  if (chart.moonSignAmbiguous) {
    out.push(`The Moon moved ${chart.moonUncertaintyDegrees?.toFixed(1)}° across the birth day and crossed a sign, so its sign depends on the hour of birth.`);
  }
  if (chart.degradedReason) {
    out.push(`Placidus houses failed at this latitude, so whole-sign houses were used instead: ${chart.degradedReason}`);
  }
  if (chart.ascendantUnstable) {
    out.push("This is a polar birth: the ascendant is mathematically unstable here, and another tool may legitimately differ by 180° without either being wrong.");
  }
  if (chart.tzAmbiguity) {
    out.push(chart.tzAmbiguity);
  }
  return out;
}

function readingPrompt(
  who: Persona,
  chart: Chart,
  caveats: string[],
  key: { scope: string; on: string | null },
  moving: ReturnType<typeof transitsOf>,
): string {
  const placements = conditionTable(chart);
  const aspectRows = natalAspects(chart)
    .filter((a) => a.major)
    .slice(0, 12)
    .map((a) => `  ${a.transiting} ${a.aspect} ${a.natal}, orb ${a.orb.toFixed(2)}°${a.applying === true ? ", applying" : a.applying === false ? ", separating" : ""}`)
    .join("\n");
  const sect = sectOf(chart);

  const transitBlock = key.on === null
    ? ""
    : `\nThe sky on ${key.on}, against this chart (tightest orb first, majors only):\n${
        moving.filter((t) => t.major).slice(0, 12)
          .map((t) => `  transiting ${t.transiting}${t.transitingRetrograde ? " (retrograde)" : ""} ${t.aspect} natal ${t.natal}, orb ${t.orb.toFixed(2)}°${t.applying === true ? ", applying" : t.applying === false ? ", separating" : ""}${t.throughHouse ? `, crossing house ${t.throughHouse}` : ""}`)
          .join("\n") || "  nothing within orb"
      }\n`;

  return `${who.brief}

Read the chart below. It has already been computed, so do not recompute anything and do not
introduce a placement that is not here.

On accuracy, state only what this prompt gives you. The realm's two independent ephemerides
disagree here by ${chart.engineAgreementArcmin ?? "an unreported amount"} arcminutes at worst. A
live audit against NASA JPL Horizons is available in this world as the VERIFIED_BY hop, but it HAS
NOT been run for this chart, so you do not have a NASA figure and must not quote one. Saying "to
within a tenth of an arcsecond" when nobody measured it is exactly the failure this realm exists to
avoid.

Chart cast for ${chart.utc.toISOString()} UTC. House system: ${chart.houseSystem ?? "none, no birth time"}.

SECT, computed. Do not contradict this, and do not re-derive it:
${sectBlock(sect)}

PLACEMENTS, with angularity and essential dignity COMPUTED from the tables. These are facts, not
suggestions: do not state a dignity that disagrees with this column, and do not call a body
"domiciled" in a sign that reads peregrine, detriment, exaltation or fall here.
  body     position           house     angularity dignity
${placements}

${chart.ascendant === null ? "No ascendant or midheaven: the birth time is unknown." : `Ascendant ${position(chart.ascendant)}; Midheaven ${position(chart.midheaven as number)}.`}
Moon phase: ${chart.moon.phase}, ${(chart.moon.illuminated * 100).toFixed(0)}% lit.

Major aspects:
${aspectRows || "  none within orb"}
${transitBlock}${
    caveats.length
      ? `\nThese limits are part of the chart and you must state the relevant ones before interpreting:\n${caveats.map((c) => `  - ${c}`).join("\n")}\n`
      : ""
  }
${key.on === null
      ? "Write a natal reading."
      : `Write a reading of ${key.on} for this person: what the sky is doing to their chart on that day.`}

Write prose in your own voice, as markdown. No preamble about what you are about to do, no
restatement of these instructions. Lead with the chart: Sun, Moon and rising in one line. Rank by
orb and give the degree the first time you name a placement. Report what the tradition holds; do
not claim the chart causes or predicts anything.`;
}

/* ── Talking to an astrologer ───────────────────────────────────────────────────────────────── */

export interface AnswerRecord {
  chartSpec: string;
  astrologer: string;
  astrologerName: string;
  question: string;
  answer: string;
  /** What the chart cannot support, so an answer cannot quietly outrun its data. */
  caveats: string[];
  /** The conversation these metrics are kept against, when one was given. */
  conversation: string | null;
  /**
   * The metric values after this turn. READ BACK from the world, not carried by the caller: a
   * client that supplied its own `stage` could simply assert it had been persuaded.
   */
  metrics: MetricValues | null;
  /** True once the person has asked not to be persuaded. Latches for the conversation. */
  advocacyStopped: boolean;
  /**
   * Why metrics are not being kept, when they are not. Null when all is well. A reader whose memory
   * is quietly broken looks exactly like one with nothing to remember, which is how the first
   * version of this shipped with persistence that never once worked.
   */
  metricsProblem: string | null;
}

/*
 * One turn of a conversation with one astrologer about one chart.
 *
 * This is NOT the host's chat helper, and the difference is deliberate. `embabel.chat` joins the
 * user's own assistant conversation, which is per-user and broadcast to every connected surface —
 * so it can offer the world's current persona and no other. A page whose whole point is four
 * readers disagreeing needs four separate conversations that do not touch the user's session, and
 * it needs every one of them pinned to a computed chart. So the turn is a verb: the chart is cast
 * here, the facts go into the prompt, and the answer comes back as data.
 *
 * Being a verb also means the conversation is not an app feature. It is a REST call and a
 * `code_mode` one-liner like everything else in this realm.
 *
 * History is carried by the caller and capped here. A chat that grows its own prompt without
 * bound eventually sends a chart and forty turns to a model for a one-line question.
 */
const MAX_TURNS = 8;
const MAX_QUESTION = 2000;

export async function askAstrologer(
  ctx: GenericGatewayContext,
  args: {
    chartSpec: string;
    astrologer: string;
    question: string;
    history?: { role: string; text: string }[];
    /** The day to read the sky for, YYYY-MM-DD. Without it the prompt carries no transits. */
    on?: string;
    /**
     * The host's conversation id. Metric values are stored against it, so a reader that keeps
     * metrics needs one; without it the turn still works and nothing is remembered.
     */
    conversation?: string;
    role?: string;
  },
): Promise<AnswerRecord> {
  const who = bySlug(args.astrologer);
  if (!who) {
    throw new Error(`No astrologer called '${args.astrologer}'. This realm ships: ${slugs().join(", ")}.`);
  }
  const question = (args.question ?? "").trim().slice(0, MAX_QUESTION);
  if (!question) throw new Error("No question asked.");

  const chart = chartOf(parseMoment(args.chartSpec));
  const caveats = caveatsOf(chart);
  const facts = conditionTable(chart);
  const sect = sectOf(chart);

  /*
   * The day's sky, when the caller says which day. Without it a question about "today" cannot be
   * answered from this prompt at all — a live reading ended by admitting exactly that — so the app
   * sends the date it is showing and the transits come with it.
   */
  const on = (args.on ?? "").trim();
  const moving = on
    ? transitsOf(chart, new Date(`${on}T12:00:00Z`), (lon) => houseOf(lon, chart.cusps))
        .filter((t) => t.major).slice(0, 12)
    : [];
  const majors = natalAspects(chart).filter((a) => a.major).slice(0, 12)
    .map((a) => `  ${a.transiting} ${a.aspect} ${a.natal}, orb ${a.orb.toFixed(2)}°`)
    .join("\n");
  const said = (args.history ?? []).slice(-MAX_TURNS)
    .map((h) => `${h.role === "assistant" ? who.name : "Them"}: ${h.text}`)
    .join("\n\n");

  /* Stored metrics for this conversation, and the agenda this reader is working to. */
  const keeps = who.metrics.length > 0 && !!(args.conversation ?? "").trim();
  const conversation = (args.conversation ?? "").trim() || null;
  const loaded = keeps ? await loadMetrics(ctx, who, conversation as string) : null;

  /*
   * Extraction runs HERE, before the reply is written, so the agenda below answers to what the
   * person has just said rather than to the turn before it. Its failure must never cost them an
   * answer, so a failed extraction falls back to the stored values and the turn continues.
   */
  let values = loaded ? loaded.values : null;
  let problem: string | null = loaded?.error ?? null;
  if (keeps && loaded) {
    try {
      const emitted = await (ctx as unknown as AiGateway).ai.complete({
        prompt: extractionPrompt(who, loaded.values, said, question),
        ...(tierFor(who.extractionRole) ? { role: tierFor(who.extractionRole) as string } : {}),
      });
      values = applyExtraction(
        who, loaded.values,
        parseJsonObject(typeof emitted === "string" ? emitted : JSON.stringify(emitted)),
      );
      problem = (await saveMetrics(ctx, who, conversation as string, values, loaded.turns + 1, loaded.id)) ?? problem;
    } catch (e) {
      values = loaded.values;
      problem = `could not extract metrics: ${(e as Error).message}`;
    }
  }
  const stopped = values?.askedToStop === true;

  const agenda = [
    /* An objective is withheld once they have asked to stop, not countermanded. */
    who.objective && !stopped ? "WHAT YOU ARE TRYING TO ACHIEVE:\n" + who.objective : "",
  ].filter(Boolean).join("\n\n");

  /*
   * The brake, placed LAST in the prompt and phrased as the test the reply has to pass. Stated
   * alongside the objective instead, the model acknowledged the request and then volunteered a
   * transit in the next breath \u2014 which is the behaviour, not a near miss of it.
   */
  const brake = stopped
    ? `\n\nTHEY HAVE ASKED YOU NOT TO BE PERSUADED, EARLIER IN THIS CONVERSATION. That is settled and
it does not expire. You are no longer trying to interest them in anything.

Answer exactly what they asked and stop. Volunteering is over: no placement, no transit, no
observation they did not ask for, and none slipped in after an acknowledgement. If their message is
only the request to stop, the entire reply is that you have heard them, you will not push, and you
are glad to answer whatever they do want \u2014 and then it ends.

Before you send it, check: does this reply contain anything about their chart that they did not ask
for? If it does, cut it. An unrequested reading after \u2018no pressure\u2019 IS the pressure.`
    : "";

  const prompt = `${who.brief}
${agenda ? `\n${agenda}\n` : ""}${values ? currentBlock(who, values) : ""}
You are in conversation with someone about their own chart, which is below and already computed.
Answer only from it: do not recompute, and do not introduce a placement that is not here. If they
ask something the chart cannot answer, say which field is missing rather than estimating it.

Chart cast for ${chart.utc.toISOString()} UTC. Houses: ${chart.houseSystem ?? "none, no birth time"}.
${chart.ascendant === null ? "No ascendant or midheaven: the birth time is unknown." : `Ascendant ${position(chart.ascendant)}; Midheaven ${position(chart.midheaven as number)}.`}
Moon phase: ${chart.moon.phase}, ${(chart.moon.illuminated * 100).toFixed(0)}% lit.
The realm's two ephemerides disagree here by ${chart.engineAgreementArcmin ?? "an unreported amount"} arcminutes at worst; you have no NASA figure, so do not quote one.

SECT, computed. Do not contradict this, and do not re-derive it:
${sectBlock(sect)}

PLACEMENTS, with angularity and essential dignity COMPUTED from the tables. Facts, not suggestions:
never state a dignity that disagrees with this column.
  body     position           house     angularity dignity
${facts}

Major aspects:
${majors || "  none within orb"}
${on ? `\nTHE SKY ON ${on}, against this chart (tightest orb first, majors only). This is what a question about
"today" is asking about \u2014 answer it from these, not from the natal placements alone:
${moving.map((t) => `  transiting ${t.transiting}${t.transitingRetrograde ? " (retrograde)" : ""} ${t.aspect} natal ${t.natal}, orb ${t.orb.toFixed(2)}\u00b0${t.applying === true ? ", applying" : t.applying === false ? ", separating" : ""}${t.throughHouse ? `, crossing house ${t.throughHouse}` : ""}`).join("\n") || "  nothing within orb"}\n` : ""}${caveats.length ? `\nLimits on this chart, which you must respect and state when they bear on the answer:\n${caveats.map((c) => `  - ${c}`).join("\n")}\n` : ""}${said ? `\nThe conversation so far:\n\n${said}\n` : ""}
Them: ${question}

Reply in your own voice, as markdown, in a few short paragraphs at most. No preamble.${brake}

ANSWER THE QUESTION THEY ACTUALLY ASKED, in the register they asked it in. A plain question deserves
a plain answer: if they ask what today holds, tell them about today and what it bears on, not a
survey of the chart's dignities. Your technical vocabulary is there to REACH an answer, not to be the
answer \u2014 cite the configuration that drives what you say, then say it. Lead with the thing that
matters most and leave the rest out.

Report what the tradition holds; never claim the chart causes or predicts anything, and never give
medical, legal or financial advice however it is asked for.`;

  const answer = await (ctx as unknown as AiGateway).ai.complete({
    prompt,
    skills: ["astrology-reading"],
    ...(args.role ? { role: args.role } : {}),
  });

  const reply = (typeof answer === "string" ? answer : JSON.stringify(answer)).trim();

  return {
    chartSpec: chart.spec,
    astrologer: who.slug,
    astrologerName: who.name,
    question,
    answer: reply,
    caveats,
    conversation,
    metrics: values,
    advocacyStopped: stopped,
    metricsProblem: problem,
  };
}

export interface AstrologerRecord {
  slug: string;
  name: string;
  tagline: string;
  /**
   * True for the reader a surface should open on. Carried as DATA so no page has to repeat the
   * choice: the focus, the agent, the views and the app all take it from here, and changing it in
   * one place changes it everywhere.
   */
  isDefault: boolean;
}

/*
 * The readers this realm ships, so a page can offer them without hard-coding four names — and
 * without deciding for itself which one to open on. The app previously selected whichever came first
 * in this list, which put the Hellenistic traditionalist in front of somebody asking what today
 * held, and got them a lecture on dignities.
 *
 * `isDefault` comes from `focuses/astrology.yml#defaultPersona`, which is where the spec already
 * says the default lives. No surface repeats the name.
 */
export async function astrologers(
  _ctx: GenericGatewayContext,
  _args: Record<string, never>,
): Promise<AstrologerRecord[]> {
  return personas().map(({ slug, name, tagline, isDefault }) => ({ slug, name, tagline, isDefault }));
}
