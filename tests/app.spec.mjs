/*
 * The Wheel, driven headless against envelopes captured from live view runs
 * (tests/fixtures/envelopes.json, recaptured whenever a view changes). No network: the appliance
 * runtime is a stub and what runs is the page's own bytes.
 *
 * A call with no fixture THROWS. A missing capture must fail loudly, never pass as "no rows" — that
 * is the whole reason this file exists rather than a curl script, because curl cannot click.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = JSON.parse(readFileSync(join(here, "fixtures/envelopes.json"), "utf8"));

const APP = "http://astrology.test/apps/astrology/the-wheel.html";
const rows = (k) => fixtures[k].data;

/*
 * The runtime stub. Views resolve by NAME, and the args of every call are recorded so a test can
 * assert what the page actually sent — which is how the `timeKnown` contract is checked. An unknown
 * birth time selects the `_noTime` capture, because that is a genuinely different envelope: no
 * ascendant, and no house rows at all.
 */
function stub(overrides = {}, delays = {}) {
  return `window.__calls = [];
  window.__asked = [];
  (() => {
    const fx = Object.assign(${JSON.stringify(fixtures)}, ${JSON.stringify(overrides)});
    const delays = ${JSON.stringify(delays)};
    /* The overrides are needed by name inside askAstrologer, not only merged into the envelopes. */
    const ov = ${JSON.stringify(overrides)};
    const pick = (name, args) => {
      if (args && args.timeKnown === false && fx[name + '_noTime']) return name + '_noTime';
      return name;
    };
    const invoke = async (name, args) => {
      window.__calls.push({ name, args });
      const k = pick(name, args);
      if (delays[name]) await new Promise((r) => setTimeout(r, delays[name]));
      const env = fx[k];
      if (!env) throw new Error('NO FIXTURE for ' + k);
      if (env.status === 'FAILED') throw new Error((env.error && env.error.message) || 'failed');
      return env;
    };
    window.embabel = {
      views: { invoke },
      lenses: { invoke: async () => { throw new Error('this app uses no lenses'); } },
      manifest: { ready: Promise.resolve({ ok: true }), preflight: async () => ({ ok: true }) },
      progress: { subscribe: () => () => {} },
      createRunner: () => ({ lens: invoke }),
    };
    window.gateway = {
      astrology: {
        astrologers: async () => {
          const list = [
            { slug: 'hypatia', name: 'Hypatia', tagline: 'Hellenistic traditionalist: sect, dignity and the lord of the geniture.' },
            { slug: 'juno', name: 'Juno', tagline: 'Psychological astrology: the chart as a portrait of a psyche, not a forecast.' },
            { slug: 'mercer', name: 'Mercer', tagline: 'The column: one real configuration, one useful thought, short.' },
            { slug: 'cassius', name: 'Cassius', tagline: 'The astronomer: exact about the geometry, exact about what it does not show.' },
          ];
          const def = ov.__defaultSlug || 'mercer';
          return list.map((x) => ({ slug: x.slug, name: x.name, tagline: x.tagline, isDefault: x.slug === def }));
        },
        askAstrologer: async (a) => {
          window.__asked.push(a);
          if (delays.askAstrologer) await new Promise((r) => setTimeout(r, delays.askAstrologer));
          if (ov.__askFails) throw new Error('the model was unreachable');
          return {
            chartSpec: a.chartSpec, astrologer: a.astrologer,
            astrologerName: a.astrologer.charAt(0).toUpperCase() + a.astrologer.slice(1),
            question: a.question,
            answer: '**Sun 26 Taurus** a reply to: ' + a.question,
            caveats: ov.__caveats || [],
          };
        },
      },
    };
  })();`;
}

async function open(page, overrides = {}, delays = {}, expectWheel = true) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.host === "astrology.test") {
      if (url.pathname.includes("/apps-runtime/")) {
        const js = url.pathname.endsWith("embabel.js") ? stub(overrides, delays) : "";
        if (url.pathname.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: "" });
        return route.fulfill({ contentType: "text/javascript", body: js });
      }
      const file = url.pathname.replace("/apps/astrology/", "");
      return route.fulfill({ path: join(root, "apps", file) });
    }
    return route.abort();
  });
  await page.goto(APP);
  if (expectWheel) {
    await page.waitForFunction(() => document.querySelectorAll("#wheelWrap svg").length > 0, null, { timeout: 15000 });
  }
  return errors;
}

test("the wheel draws every body, sign and house from the fixture", async ({ page }) => {
  const errors = await open(page);
  const svg = page.locator("#wheelWrap svg");
  await expect(svg).toHaveCount(1);
  /* Ten planet glyphs, each with its degree label beneath. */
  const planets = rows("ChartPlacements").length;
  expect(planets).toBe(10);
  const texts = await svg.locator("text").allTextContents();
  const glyphs = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇"];
  for (const g of glyphs) expect(texts, `glyph ${g} on the wheel`).toContain(g);
  /* Twelve signs and twelve house numbers. */
  expect(texts.filter((t) => /^[♈-♓]$/.test(t)).length).toBe(12);
  for (let h = 1; h <= 12; h++) expect(texts).toContain(String(h));
  expect(texts).toContain("ASC");
  expect(errors).toEqual([]);
});

test("the summary states the chart and its own accuracy", async ({ page }) => {
  await open(page);
  const chart = rows("CastChart")[0];
  const sum = page.locator("#summary");
  await expect(sum).toContainText(chart.sun);
  await expect(sum).toContainText(chart.moon);
  await expect(sum).toContainText(chart.rising);
  await expect(sum).toContainText(chart.ascendant);
  /* The engine-agreement chip is the realm's own error bar and must be on the page. */
  await expect(sum).toContainText(String(chart.enginesAgreeToArcmin));
  await expect(sum).toContainText(chart.houseSystem);
});

test("every tab renders exactly the rows its view returned", async ({ page }) => {
  const errors = await open(page);
  const counts = {
    placements: rows("ChartPlacements").length,
    aspects: rows("ChartAspects").length,
    houses: rows("ChartHouses").length,
  };
  for (const [tab, n] of Object.entries(counts)) {
    await page.click(`#tabs button[data-tab="${tab}"]`);
    await expect(page.locator("#tabBody tbody tr")).toHaveCount(n);
  }
  /* Transits load after first paint, so wait for them rather than racing. */
  await page.click('#tabs button[data-tab="transits"]');
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(rows("TransitsOnDay").length, { timeout: 10000 });
  expect(errors).toEqual([]);
});

test("an unknown birth time removes the ascendant and the houses, and says so", async ({ page }) => {
  const errors = await open(page);
  await page.fill("#bornAt", "");
  await page.click('button[type="submit"]');
  await expect(page.locator("#summary")).not.toContainText("rising", { timeout: 15000 });
  /* The caveat is the point: a reader must be told, not left to notice. */
  await expect(page.locator("#caveats")).toContainText("no ascendant");
  await page.click('#tabs button[data-tab="houses"]');
  await expect(page.locator("#tabBody")).toContainText("no birth time");
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(0);
  await page.click('#tabs button[data-tab="placements"]');
  const houseCells = await page.locator("#tabBody tbody tr td:nth-child(3)").allTextContents();
  expect(houseCells.every((c) => c.trim() === "—")).toBe(true);
  /* And the page must have SENT the explicit flag, not an empty string. */
  const calls = await page.evaluate(() => window.__calls);
  const cast = calls.filter((c) => c.name === "CastChart").pop();
  expect(cast.args.timeKnown).toBe(false);
  expect(errors).toEqual([]);
});

test("a known birth time sends timeKnown true", async ({ page }) => {
  await open(page);
  const calls = await page.evaluate(() => window.__calls);
  const cast = calls.find((c) => c.name === "CastChart");
  expect(cast.args.timeKnown).toBe(true);
  expect(cast.args.bornAt).toBe("14:30");
  /* Every birth-data view gets the flag; a view that silently defaulted would be a wrong chart. */
  for (const name of ["ChartPlacements", "ChartHouses", "ChartAspects"]) {
    const c = calls.find((x) => x.name === name);
    expect(c, `${name} was called`).toBeTruthy();
    expect(c.args.timeKnown, `${name} carries timeKnown`).toBe(true);
  }
});

test("the NASA audit is button-triggered and explains its own units", async ({ page }) => {
  await open(page);
  await page.click('#tabs button[data-tab="nasa"]');
  /* Not fetched on load: ten requests to a paced source must be asked for. */
  const before = await page.evaluate(() => window.__calls.filter((c) => c.name === "AuditAgainstNasa").length);
  expect(before).toBe(0);
  await page.click("#runNasa");
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(rows("AuditAgainstNasa").length, { timeout: 15000 });
  const note = page.locator("#tabBody .note");
  await expect(note).toContainText("arc");
  await expect(note).toContainText("1/3600");
  await expect(note).toContainText("30°");
});

test("the place picker fills the coordinates and the zone", async ({ page }) => {
  await open(page);
  await page.fill("#place", "Sandringham");
  await page.click("#findPlace");
  const first = page.locator("#places button").first();
  await expect(first).toBeVisible({ timeout: 10000 });
  const picks = rows("FindBirthplace");
  await first.click();
  await expect(page.locator("#tz")).toHaveValue(String(picks[0].timeZone));
  await expect(page.locator("#lat")).toHaveValue(String(picks[0].latitude));
});

test("each astrologer keeps their own thread, and the chart is passed to them", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator(".astro")).toHaveCount(4);
  await page.click('.astro[data-slug="hypatia"]');
  await page.fill("#question", "Which planet rules this chart?");
  await page.click("#send");
  await expect(page.locator("#log .msg.astro-reply")).toContainText("a reply to", { timeout: 10000 });
  /* Switch reader: the new thread is empty, and the old one survives the switch back. */
  await page.click('.astro[data-slug="cassius"]');
  await expect(page.locator("#log .msg")).toHaveCount(0);
  await page.click('.astro[data-slug="hypatia"]');
  await expect(page.locator("#log .msg")).toHaveCount(2);
  const asked = await page.evaluate(() => window.__asked);
  expect(asked).toHaveLength(1);
  expect(asked[0].astrologer).toBe("hypatia");
  /* Grounded: the reader is handed the key of the chart on screen. */
  expect(asked[0].chartSpec).toBe("1962-05-17T14:30|51.5074,-0.1278|Europe/London");
  /* And the day, so a question about today has transits behind it rather than the natal chart alone. */
  expect(asked[0].on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(errors).toEqual([]);
});

test("a starter question carries the history on the second turn", async ({ page }) => {
  await open(page);
  await page.click('.astro[data-slug="juno"]');
  await page.click('#starters button:has-text("What dominates it?")');
  await expect(page.locator("#log .msg.astro-reply")).toHaveCount(1, { timeout: 10000 });
  await page.fill("#question", "And what should I do about it?");
  await page.click("#send");
  await expect(page.locator("#log .msg.astro-reply")).toHaveCount(2, { timeout: 10000 });
  const asked = await page.evaluate(() => window.__asked);
  expect(asked[1].history).toHaveLength(2);
  expect(asked[1].history[0].role).toBe("user");
  expect(asked[1].history[1].role).toBe("assistant");
});

test("a reader that cannot answer says so without breaking the page", async ({ page }) => {
  const errors = await open(page, { __askFails: true });
  await page.click('.astro[data-slug="mercer"]');
  await page.fill("#question", "Read this chart.");
  await page.click("#send");
  await expect(page.locator("#log .state.bad")).toContainText("unreachable", { timeout: 10000 });
  /* The input must come back, not stay disabled. */
  await expect(page.locator("#send")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a failed chart renders an error, not an empty wheel", async ({ page }) => {
  const errors = await open(page, {
    CastChart: { status: "FAILED", error: { message: "the time zone Europe/Nowhere disagrees with the coordinates" } },
  }, {}, false);
  await expect(page.locator("#caveats")).toContainText("Europe/Nowhere", { timeout: 15000 });
  await expect(page.locator("#caveats")).toContainText("refused");
  expect(errors).toEqual([]);
});

test("the caveats a reader is handed come back in English", async ({ page }) => {
  /* The house engine states its own degradation in Chinese; nothing localised may reach the page. */
  await open(page, {
    CastChart: Object.assign({}, fixtures.CastChart, {
      data: [Object.assign({}, fixtures.CastChart.data[0], {
        houseSystem: "whole-sign",
        houseSystemDegraded: "Placidus houses are undefined inside the polar circles, so whole-sign houses were used instead: the birthplace latitude is 78.22°, beyond the 66° limit.",
      })],
    }),
  });
  const caveats = page.locator("#caveats");
  await expect(caveats).toContainText("Placidus");
  await expect(caveats).toContainText("78.22");
  const text = await caveats.textContent();
  expect(text).not.toMatch(/[　-鿿＀-￯]/);
});

test("an interaction during a slow call still lands", async ({ page }) => {
  /* The stub answers instantly, which hides every timing defect — so one call is held back. */
  const errors = await open(page, {}, { TransitsOnDay: 4000 });
  await page.click('#tabs button[data-tab="transits"]');
  await expect(page.locator("#tabBody")).toContainText("Reading today");
  /* While transits are still in flight, the other tabs must work. */
  await page.click('#tabs button[data-tab="aspects"]');
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(rows("ChartAspects").length);
  await page.click('#tabs button[data-tab="transits"]');
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(rows("TransitsOnDay").length, { timeout: 15000 });
  expect(errors).toEqual([]);
});

test("how-it-works opens and names the views the page runs", async ({ page }) => {
  await open(page);
  await expect(page.locator("#how")).toBeHidden();
  await page.click("#howLink");
  await expect(page.locator("#how")).toBeVisible();
  const how = page.locator("#how");
  for (const v of ["CastChart", "ChartPlacements", "ChartHouses", "ChartAspects", "TransitsOnDay", "AuditAgainstNasa", "FindBirthplace"]) {
    await expect(how).toContainText(v);
  }
  await expect(how).toContainText("BirthMoment");
  await expect(how).toContainText("no birth time");
});

test("the Embabel badge is visible to the user, not merely present", async ({ page }) => {
  await open(page);
  const badge = page.locator("#embabel-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("Embabel Worlds");
  const link = badge.locator("a");
  await expect(link).toHaveAttribute("href", "https://worlds.embabel.com");
  /* Inside the viewport, and not covered by the page's own bottom content. */
  const box = await badge.boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.height).toBeGreaterThan(10);
});

test("no SVG coordinate is NaN, on any chart the page can draw", async ({ page }) => {
  /*
   * The defect this exists for: the views returned `position` as a readable string but no numeric
   * `longitude`, so every planet and cusp was placed at NaN and the wheel rendered empty while every
   * row count still matched. A browser reports it as an attribute error; curl cannot see it at all.
   */
  const errors = await open(page);
  const nan = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll("#wheelWrap svg *")) {
      for (const a of n.attributes) {
        if (/NaN|undefined/.test(a.value)) out.push(n.tagName + "@" + a.name + "=" + a.value);
      }
    }
    return out;
  });
  expect(nan).toEqual([]);
  expect(errors).toEqual([]);

  /* And again with no birth time, which removes the ascendant the geometry rotates around. */
  await page.fill("#bornAt", "");
  await page.click('button[type="submit"]');
  await expect(page.locator("#caveats")).toContainText("no ascendant", { timeout: 15000 });
  const nan2 = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll("#wheelWrap svg *")) {
      for (const a of n.attributes) if (/NaN|undefined/.test(a.value)) out.push(n.tagName + "@" + a.name);
    }
    return out;
  });
  expect(nan2).toEqual([]);
  expect(errors).toEqual([]);
});

test("the page opens on the reader the realm marks default, not the first listed", async ({ page }) => {
  /*
   * Mercer is third in the list. Opening on list order put the Hellenistic traditionalist in front of
   * somebody asking what today held, and got them a survey of the chart's dignities.
   */
  await open(page);
  await expect(page.locator('.astro[data-slug="mercer"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.astro[data-slug="hypatia"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#question")).toHaveAttribute("placeholder", /Mercer/);
  /* Asking without touching the picker goes to Mercer. */
  await page.fill("#question", "What does today hold?");
  await page.click("#send");
  const asked = await page.evaluate(() => window.__asked);
  expect(asked[0].astrologer).toBe("mercer");
});

test("the flag decides which reader opens, not the position in the list", async ({ page }) => {
  /* Move the flag to the LAST reader and the page must follow it, not fall back to order. */
  const errors = await open(page, { __defaultSlug: "cassius" });
  await expect(page.locator('.astro[data-slug="cassius"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.astro[data-slug="mercer"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.astro[aria-pressed="true"]')).toHaveCount(1);
  await page.fill("#question", "Anything in this?");
  await page.click("#send");
  const asked = await page.evaluate(() => window.__asked);
  expect(asked[0].astrologer).toBe("cassius");
  expect(errors).toEqual([]);
});

test("with no reader flagged at all, the page still opens on someone", async ({ page }) => {
  /* A realm that ships no default must not leave the picker empty and the Ask button inert. */
  const errors = await open(page, { __defaultSlug: "nobody" });
  await expect(page.locator('.astro[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.astro[data-slug="hypatia"]')).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("the harness's own stub is valid JavaScript", async ({ page }) => {
  /*
   * This guard exists because a broken stub does not look like a broken stub: it looks like the app
   * failing nineteen different ways. It has happened twice — once referencing an `overrides` variable
   * the generated code never declared, once with an unbalanced paren — and both times the failures
   * pointed at the page. Parse it here, where the blame is unambiguous.
   */
  const sources = [stub(), stub({ __askFails: true, __defaultSlug: "cassius" }, { TransitsOnDay: 100 })];
  for (const src of sources) {
    expect(() => new Function(src), "generated stub must parse").not.toThrow();
  }
  /* And it must actually install both globals the page needs. */
  await page.goto("about:blank");
  const present = await page.evaluate((src) => {
    // eslint-disable-next-line no-new-func
    new Function(src)();
    return {
      views: typeof window.embabel?.views?.invoke,
      ready: !!window.embabel?.manifest?.ready,
      readers: typeof window.gateway?.astrology?.astrologers,
      ask: typeof window.gateway?.astrology?.askAstrologer,
    };
  }, stub());
  expect(present).toEqual({ views: "function", ready: true, readers: "function", ask: "function" });
});
