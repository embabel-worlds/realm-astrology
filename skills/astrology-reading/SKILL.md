---
name: astrology-reading
description: Read a natal chart or a day's transits from COMPUTED positions — signs, houses, dignities, aspects, sect — and write a reading in a named astrologer's voice. Use for "read my chart", "what's my rising sign", "what do my transits say", "what does Saturn in the 5th mean", "cast a chart for this birth data", or any request to interpret a horoscope; and whenever realm-astrology asks a model for a reading.
---

# Reading a chart

A reading is an interpretation of a configuration that has already been computed. This skill is
about the interpretation. It is not about the arithmetic, and it never supplies the arithmetic:
every degree, sign, house and aspect comes from realm-astrology's own records, which agree with
NASA JPL Horizons to within arcseconds. A remembered placement is not a placement.

## 0. In a conversation, fetch the chart first

When a view asks you for a reading, the records below arrive with the request. In a conversation
they do not: nothing has been cast until you cast it, and activating this skill casts nothing.
Every position you state comes from a `view_run` you made this turn, params inside `params`:

- **A birth chart.** `FindBirthplace {place}` for the latitude, longitude and time zone, then
  `CastChart {bornOn, bornAt, timeKnown, latitude, longitude, timeZone}` — `bornOn` `YYYY-MM-DD`,
  `bornAt` `HH:MM` local, `timeKnown: false` when the birth time is not known. The same six params
  give `ChartPlacements`, `ChartAspects` and `ChartHouses`.
- **Today's sky, or any moment.** `SkyAtMoment {instant}` — an ISO instant, e.g. today at noon UTC.
  Never the natal chart's positions: the sky today and a chart from 1962 are different skies.
- **Transits to a chart.** `TransitsOnDay {…the six birth params…, on}` — `on` is `YYYY-MM-DD`.
- **A chart this world already holds.** `MyChart`, `MyPlacements`, `MyTransits {subject}`.

No birth date, or no place, means no chart: ask for them. Never state a position you did not just
fetch — not even a sign everybody "knows", because a date near a cusp is exactly where memory is
wrong.

## 1. What you are given

For one birth key (`1962-05-17T14:30|51.5074,-0.1278|Europe/London`):

- a **NatalChart** — Sun, Moon and rising sign, the ascendant and midheaven in degrees, the
  house system actually used, the Moon's phase, and the chart's own honesty fields (below);
- **Placements** — each of the ten bodies with its sign, exact degree, house and retrograde state;
- **ChartAspects** — every pair standing at a read angle, with the orb and whether it was applying;
- **HouseCusps** — the twelve cusps and how wide each house is;
- **Transits**, for a chart and a date — what the live sky is doing to the natal figure;
- **NasaChecks** — the realm's own positions audited against NASA, body by body.

### The honesty fields come first

Read these *before* interpreting, and tell the reader what they say when they say anything:

| Field | What it means for the reading |
|---|---|
| `timeKnown: false` | There is **no ascendant and no house** for anything. Do not supply one. Say the birth time is needed. |
| `moonSignAmbiguous` | The Moon crossed a sign on the birth day; its sign depends on the hour. Give both, or ask. |
| `degradedReason` | Placidus failed for the latitude and whole-sign houses were used instead. Say which system the houses are in. |
| `ascendantUnstable` | A polar birth: the ascendant is mathematically unstable and another tool may legitimately differ by 180°. |
| `tzAmbiguity` | Another time zone is defensible for those coordinates. A wrong zone moves the ascendant by a whole sign, so resolve it before reading the houses. |
| `engineAgreementArcmin` | How far the realm's two ephemerides disagreed. Under a few arcminutes it affects nothing; mention it only if asked. |

A fluent reading built on a missing hour is the commonest way this craft is done badly. The fields
exist so that cannot happen quietly.

## 2. The order the tradition reads in

Do not start with the Sun sign. It is the least informative thing in the chart and starting there
is what makes a reading sound generic.

1. **Sect.** Is the Sun above the horizon (a day chart) or below (a night chart)? The sect light —
   Sun by day, Moon by night — governs the chart. Benefics and malefics change force by sect:
   Jupiter is the benefic of sect by day, Venus by night; Mars is the malefic of sect by night,
   Saturn by day. "Malefic contrary to sect" is the hardest placement in traditional practice.
2. **The angles.** The ascendant is the person's own orientation; the midheaven is what they are
   seen doing. Anything conjunct either is loud.
3. **The luminaries** by sign, house and condition — and crucially the **Moon's phase and speed**,
   which traditional practice reads and modern practice usually drops.
4. **Dignity.** A planet in its own sign acts well however it is aspected; a planet in fall does
   not become strong by being trined. The essential dignities:

   | Planet | Domicile | Detriment | Exaltation | Fall |
   |---|---|---|---|---|
   | Sun | Leo | Aquarius | Aries | Libra |
   | Moon | Cancer | Capricorn | Taurus | Scorpio |
   | Mercury | Gemini, Virgo | Sagittarius, Pisces | Virgo | Pisces |
   | Venus | Taurus, Libra | Aries, Scorpio | Pisces | Virgo |
   | Mars | Aries, Scorpio | Libra, Taurus | Capricorn | Cancer |
   | Jupiter | Sagittarius, Pisces | Gemini, Virgo | Cancer | Capricorn |
   | Saturn | Capricorn, Aquarius | Cancer, Leo | Libra | Aries |

   Uranus, Neptune and Pluto have no traditional dignities. Do not invent them; modern rulerships
   (Uranus of Aquarius, Neptune of Pisces, Pluto of Scorpio) are a modern convention and should be
   named as such if used.
5. **Angularity.** A planet in the 1st, 4th, 7th or 10th acts on the world. Succedent (2, 5, 8, 11)
   is slower; cadent (3, 6, 9, 12) is weaker in traditional terms.
6. **Aspects**, tightest orb first. An aspect inside a degree dominates a chart; one at seven
   degrees is a footnote. The realm gives you the orb — use it to rank, and say the orb when a
   configuration is doing a lot of work.

## 3. What the pieces signify

**The bodies.** Sun: vitality, the thing a life is organised around. Moon: need, habit, what
soothes. Mercury: how the mind moves and what it does with language. Venus: what is wanted and
how it is sought. Mars: how force is used. Jupiter: where the person expands and overreaches.
Saturn: where limit is met, and the work. Uranus: where the pattern breaks. Neptune: where the
edges dissolve. Pluto: what will not stay buried.

**The houses.** 1 the self and body; 2 resources; 3 siblings, near things, the daily mind; 4 home
and origin; 5 pleasure, play, children; 6 work, routine, the body's maintenance; 7 the partner and
the open enemy; 8 death, debt, what is shared; 9 travel, doctrine, the long view; 10 the career and
the visible life; 11 friends and patrons; 12 what is hidden, including from oneself.

**The aspects.** Conjunction: fused, inseparable. Opposition: two things in a standoff that must be
held apart and in relation. Square: friction demanding action. Trine: easy, and easily wasted.
Sextile: available if taken. The minor angles — semisextile, semisquare, sesquiquadrate, quincunx —
are optional; traditional practice ignores them, and a reading leaning on a quincunx should say
that it is doing so.

**Applying or separating.** An applying aspect is still ripening; a separating one has largely
happened. The realm gives you this. Modern readings usually ignore it and are the poorer for it.

## 4. Transits

A transit is the live sky making an angle to a fixed natal point. Read:

- **What is being transited** matters more than what is transiting. A transit to the ascendant,
  the Sun or the Moon is felt; one to a cadent, undignified planet usually is not.
- **The slow bodies.** Saturn, Uranus, Neptune and Pluto transits last months to years and are the
  ones worth talking about. A Moon transit lasts hours — do not build a reading on one.
- **Applying and exact.** An applying transit is the story; a separating one is already told.
- **Retrograde.** A retrograde transiting body will cross the same point three times, so the theme
  returns. The realm computes retrograde from the body's own motion, so it is a fact, not a table.
- **The house being crossed** locates the area of life. `throughHouse` gives it.

Mercury retrograde specifically: it happens three or four times a year for about three weeks, which
is roughly a fifth of all time. Any claim that it explains an unusual event has to contend with how
ordinary it is. Say so when it comes up.

## 5. Writing it

- **Lead with the configuration, not the conclusion.** Name what is in the sky, then what the
  tradition reads in it.
- **Give the degree** the first time a placement is mentioned: `Moon 2°27' Scorpio, 2nd house`.
  It is what lets a reader check you against any other tool.
- **Rank ruthlessly.** Three configurations, well explained, beat twelve listed. The orb tells you
  which three.
- **Say "the tradition holds", not "this means".** You are reporting a symbolic system, and the
  distinction is the difference between a reading and a false claim.
- **Never explain everything.** A chart that accounts for every fact about a person has been bent
  to fit. Where the chart and what you know of the reader disagree, the disagreement is the
  interesting part; say it.
- **Never use the chart to excuse conduct.** A placement is not a reason someone was unkind.

## 6. What this skill never does

- Supply a position from memory. Cast the chart.
- Forecast health, death, pregnancy, diagnosis, legal outcomes, or what to do with money — in any
  voice, however pressed, however hedged.
- Claim evidence. There is no known mechanism and the large trials found no effect. A reader who
  asks deserves that answer straight, and it does not stop you reading the chart afterwards.
- Pretend certainty the data does not have. The honesty fields in §1 exist to be used.
