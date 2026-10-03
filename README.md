# realm-astrology

Natal charts, transits, and the sky over anything you have a timestamp for — as an
Embabel realm. Keyless, offline for the arithmetic, and auditable against NASA.

```cypher
MATCH (b:BirthMoment {spec: '1962-05-17T14:30|51.5074,-0.1278|Europe/London'})-[:HAS_CHART]->(c:NatalChart)
RETURN c.sunSign, c.moonSign, c.risingSign, c.ascendant
```

```
Taurus   Scorpio   Virgo   20°56' Virgo
```

Nothing was stored first. Pin a birth moment and the chart behind it is computed on
demand — its placements, its aspects, its house cusps, the day's transits, and a
reading by any of four astrologers who disagree with each other.

## What makes it different

**It tells you how good it is.** Every chart carries how far its two independent
ephemerides disagreed (`engineAgreementArcmin`), whether Placidus had to be abandoned
for the latitude (`degradedReason`), whether another time zone is defensible for those
coordinates (`tzAmbiguity`), and whether an unknown birth time leaves the Moon's sign
undecided (`moonSignAmbiguous`). A reading is not entitled to say more than the chart
supports, and those fields are what say so — as data, not prose.

**The arithmetic is checkable.** `VERIFIED_BY` audits any chart against NASA JPL
Horizons, live, body by body, in arcseconds:

```cypher
MATCH (b:BirthMoment {spec: '1962-05-17T14:30|51.5074,-0.1278|Europe/London'})-[:VERIFIED_BY]->(c:NasaCheck)
RETURN c.body, c.ourLongitude, c.nasaLongitude, c.agreementArcsec, c.agrees
ORDER BY c.agreementArcsec DESC
```

Measured on that chart: worst disagreement 14.2″ (Neptune), best 0.66″ (Mars), all ten
bodies inside the stated one-arcminute tolerance and all ten in the same sign. No other
astrology surface will let a reader do this, and it is the whole reason to trust the rest.

**It refuses rather than guesses.** A birth time that daylight saving skipped, a zone
that contradicts the coordinates, a pre-standard-time birth cast in a zone that did not
yet exist — each is an error with the numbers in it, not a chart that looks fine and is
an hour wrong. An hour is a whole rising sign.

## The spine

```
BirthMoment {spec} ─HAS_CHART────▶ NatalChart
      │            ─HAS_PLACEMENT▶ Placement      every body: sign, degree, house, retrograde
      │            ─HAS_ASPECT───▶ ChartAspect    every read angle, with its orb
      │            ─HAS_CUSP─────▶ HouseCusp      the twelve cusps and how wide each house is
      │            ─VERIFIED_BY──▶ NasaCheck      the arithmetic, audited against JPL
      ▲
      │ chartSpec
BirthRecord (stored, yours) ─────▶ the same four

TransitDay {spec = <birth>@YYYY-MM-DD} ─HAS_TRANSIT──▶ Transit
SkyMoment {instant}                    ─HAS_POSITION─▶ SkyPosition
PlaceQuery {name}                      ─RESOLVES_TO──▶ Birthplace
ReadingRequest {<birth>#<reader>#<scope>} ─HAS_READING▶ Reading
```

The key grammar is `date[Thh:mm]|lat,lon|IANA zone`. Drop the time and the chart comes
back with no houses rather than inventing them. The zone is the **birthplace's** — use
`FindBirthplace` to get it, and the `birthSpec` verb to assemble the key, so a reader's
own zone can never be quietly substituted.

## The astrologers

Four readers, and the point is that they disagree. One chart read by all four, side by
side, is a single query:

```cypher
UNWIND ['hypatia','juno','mercer','cassius'] AS who
MATCH (q:ReadingRequest {spec: $chart + '#' + who + '#natal'})-[:HAS_READING]->(r:Reading)
RETURN r.astrologerName, r.reading
```

| | |
|---|---|
| **Hypatia** | Hellenistic traditionalist. Opens with sect, weighs by dignity and angularity before aspect, and will tell you which planet is the malefic contrary to sect. |
| **Juno** | Psychological, Jung through Rudhyar to Greene. Finds the one configuration that organises the chart, offers an image, and asks whether you recognise it. |
| **Mercer** | The daily column, done well. One real configuration, one useful thought, short, and committed to a situation you could actually test. |
| **Cassius** | An observational astronomer. Exact about the geometry, exact about what it does not show, and not interested in sneering at a two-thousand-year symbolic system. |

Each is both a `personalities/` bundle — so `/focus astrology` puts one in front of you
in chat — and a prompt brief for the `readChart` verb. The facts are computed and handed
to the model; the `astrology-reading` skill carries the craft. A reading is a judgement
and a position is a fact, so they are separate types with separate caches and the graph
cannot confuse them.

## The sky over your own data

`SkyMoment` is keyed on an instant and nothing else, so anything with a timestamp can be
given a sky — a workflow run, an invoice, a conversation. `views/joins.yml` does this for
CI history, and **computes its own denominator**:

```
mercuryRetrograde  runs  failures  failureRatePercent
false              …     …         …
true               …     …         …
```

Mercury is retrograde about a fifth of all time. If a fifth of your failed builds happened
under it, nothing happened — and the view says so rather than leaving a reader to be
impressed by the numerator. A joke with a correct denominator is the only kind worth telling.

## How it is built

| | |
|---|---|
| positions | [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT) — 0.66″ from NASA on a planet |
| houses, zones | [deepnatal](https://github.com/breezefeng/deepnatal) (MIT) — Placidus, historical time zones, and a refusal where the data will not bear a chart |
| birthplaces | [Open-Meteo geocoding](https://open-meteo.com/) (CC BY 4.0) — keyless, and returns the IANA zone |
| the audit | [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) — public domain |

Both ephemerides are bundled into the handler, so casting a chart needs no network, no key
and no account. `swisseph` is deliberately not used: its licence is AGPL unless you buy a
commercial grant, which is not a thing to put in a public realm.

## Verification

`npm test` runs the battery. Nothing in it is a transcribed number:

- **against NASA** — every body in three charts spanning 1879 to 2001, fetched live from
  Horizons, asserted inside one arcminute;
- **against astro-seek** — signs and ascendants, from the external checks `deepnatal`
  publishes, so this realm is not re-copying a table by hand either;
- **the awkward births** — 21 boundary cases: daylight-saving holes that must throw, polar
  latitudes where Placidus must degrade *and say why*, quarter-hour offsets, date-line
  births, a Sun on a sign boundary;
- **before standard time** — an 1879 German birth cast in `Europe/Berlin` must be refused,
  because in 1879 that zone is Berlin's own local mean time and the birthplace was 6.5
  minutes of longitude away.

27 tests, including 30 live NASA comparisons.

## What it does not do yet

- **No sidereal zodiac and no Vedic reading.** That needs an ayanamsa this realm does not
  compute, and offering one without it would be inventing an offset.
- **The CI-join views are written against realm-github-actions' declared contract but have
  not been reconciled against a real run history** — GitHub was unreachable from the
  appliance when they were authored. Run them before trusting a figure.
- **No chart wheel.** The data is all there; nothing draws it yet.

## Install

```
realm_install from path /realms/realm-astrology     # or install from this repo's URL
```

Keyless — there is nothing to configure. Build the handler bundle first if you have edited
`src/`:

```
npm install && npm run check
```

## Licence

Apache-2.0. Positions and house computation from MIT-licensed libraries; Horizons output is
public domain; Open-Meteo's gazetteer is CC BY 4.0.

Astrology has no known mechanism and no reliable evidence behind it. This realm computes a
real configuration of the heavens to arcsecond accuracy and reads a symbolic tradition over
it, and it is careful not to confuse the two. Cassius will tell you so himself.
