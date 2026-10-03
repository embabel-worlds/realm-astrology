/*
 * A second harness, authored independently of tests/app.spec.mjs and kept beside it on purpose.
 *
 * Where that one serves the app over an intercepted route, this one injects the stub directly in
 * place of the two runtime script tags. Two harnesses that disagree about the same page tell you
 * something a single one cannot: whether a failure is in the app or in the scaffolding around it.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(here, "..", "apps", "the-wheel.html"), "utf8");
const ENV = JSON.parse(readFileSync(join(here, "fixtures", "envelopes.json"), "utf8"));

const READERS = [
  { slug: "hypatia", name: "Hypatia", tagline: "Hellenistic traditionalist." },
  { slug: "juno", name: "Juno", tagline: "Psychological astrology." },
  { slug: "mercer", name: "Mercer", tagline: "The column." },
  { slug: "cassius", name: "Cassius", tagline: "The astronomer." },
];

function stub(o) {
  return `
  window.__calls = []; window.__asked = [];
  var ENV = ${JSON.stringify(ENV)};
  var READERS = ${JSON.stringify(READERS)};
  var DELAY = ${o.delayMs || 0};
  var FAILVIEW = ${JSON.stringify(o.failView || null)};
  var ASKFAILS = ${o.askFails ? "true" : "false"};
  var NOTIME = ${o.noTime ? "true" : "false"};
  function later(v) { return new Promise(function (res, rej) { setTimeout(function () { v instanceof Error ? rej(v) : res(v); }, DELAY); }); }
  window.embabel = {
    manifest: { ready: Promise.resolve({ ok: true }) },
    views: { invoke: function (name, args) {
      window.__calls.push({ name: name, args: args });
      if (FAILVIEW === name) return later(new Error("stubbed " + name + " failure"));
      var key = (NOTIME && args && args.timeKnown === false && ENV[name + "_noTime"]) ? name + "_noTime" : name;
      return ENV[key] ? later(ENV[key]) : later(new Error("no fixture " + key));
    } }
  };
  window.gateway = { astrology: {
    astrologers: function () { return later(READERS); },
    askAstrologer: function (a) {
      window.__asked.push(a);
      if (ASKFAILS) return later(new Error("the model was unreachable"));
      return later({
        chartSpec: a.chartSpec, astrologer: a.astrologer,
        astrologerName: (READERS.filter(function (r) { return r.slug === a.astrologer; })[0] || {}).name,
        question: a.question,
        answer: "REPLY-FROM-" + a.astrologer + " to: " + a.question,
        caveats: NOTIME ? ["No birth time, so no ascendant."] : []
      });
    }
  } };`;
}

async function open(page, o = {}) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const html = APP
    .replace('<script src="/api/v1/apps-runtime/v1/embabel.js"></script>', `<script>${stub(o)}</script>`)
    .replace('<script src="/api/v1/apps-runtime/gateway.js"></script>', "")
    .replace('<link rel="stylesheet" href="/api/v1/apps-runtime/v1/theme.css">', "");
  await page.setContent(html, { waitUntil: "load" });
  return errors;
}

test("the wheel draws, with no NaN coordinate anywhere", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("svg.wheel")).toBeVisible();
  /* The defect this harness was written to catch: views returning readable strings but no numbers. */
  const svg = await page.locator("svg.wheel").innerHTML();
  expect(svg).not.toContain("NaN");
  expect(await page.locator("svg.wheel text").count()).toBeGreaterThan(ENV.ChartPlacements.data.length);
  expect(errors).toEqual([]);
});

test("asking a reader appends their reply to that reader's thread", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator(".astro")).toHaveCount(4);
  await page.locator('.astro[data-slug="hypatia"]').click();
  await page.locator("#question").fill("What rules this chart?");
  await page.locator("#send").click();

  await expect(page.locator("#log .msg.astro-reply")).toContainText("REPLY-FROM-hypatia");
  await expect(page.locator("#log .msg.them")).toContainText("What rules this chart?");

  /* The chart key travels with the question. */
  const asked = await page.evaluate(() => window.__asked);
  expect(asked).toHaveLength(1);
  expect(asked[0].chartSpec).toContain("1962-05-17T14:30|");
  expect(asked[0].astrologer).toBe("hypatia");
  expect(errors).toEqual([]);
});

test("a second turn carries the first as history", async ({ page }) => {
  const errors = await open(page);
  await page.locator('.astro[data-slug="juno"]').click();
  await page.locator("#question").fill("one");
  await page.locator("#send").click();
  await expect(page.locator("#log .msg.astro-reply")).toHaveCount(1);
  await page.locator("#question").fill("two");
  await page.locator("#send").click();
  await expect(page.locator("#log .msg.astro-reply")).toHaveCount(2);

  const asked = await page.evaluate(() => window.__asked);
  expect(asked[0].history).toEqual([]);
  expect(asked[1].history.map((h) => h.text)).toEqual(["one", "REPLY-FROM-juno to: one"]);
  expect(errors).toEqual([]);
});

test("threads are per reader and survive switching", async ({ page }) => {
  const errors = await open(page);
  await page.locator('.astro[data-slug="mercer"]').click();
  await page.locator("#question").fill("mercer question");
  await page.locator("#send").click();
  await expect(page.locator("#log .msg.astro-reply")).toContainText("REPLY-FROM-mercer");

  await page.locator('.astro[data-slug="cassius"]').click();
  await expect(page.locator("#log .msg")).toHaveCount(0);
  await expect(page.locator("#log")).toContainText("Cassius");

  await page.locator('.astro[data-slug="mercer"]').click();
  await expect(page.locator("#log .msg.them")).toContainText("mercer question");
  expect(errors).toEqual([]);
});

test("a reader that cannot answer says so and leaves the thread usable", async ({ page }) => {
  const errors = await open(page, { askFails: true });
  await page.locator('.astro[data-slug="hypatia"]').click();
  await page.locator("#question").fill("anything");
  await page.locator("#send").click();
  await expect(page.locator("#log .state.bad")).toContainText("did not answer");
  /* The send button must come back, or one failure ends the conversation. */
  await expect(page.locator("#send")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("an unknown birth time strips the ascendant from the page and the wheel", async ({ page }) => {
  const errors = await open(page, { noTime: true });
  await page.locator("#bornAt").fill("");
  await page.locator('#birthForm button[type="submit"]').click();
  await expect(page.locator(".chip.warn", { hasText: "no birth time" })).toBeVisible();
  await expect(page.locator("svg.wheel text", { hasText: "ASC" })).toHaveCount(0);
  await page.locator('#tabs button[data-tab="houses"]').click();
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(0);
  const sent = await page.evaluate(() => window.__calls.filter((c) => c.args && c.args.timeKnown === false).length);
  expect(sent).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("a failed chart shows the refusal instead of an empty wheel", async ({ page }) => {
  const errors = await open(page, { failView: "CastChart" });
  await expect(page.locator("#caveats .state.bad")).toContainText("refused");
  await expect(page.locator("svg.wheel")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an interaction lands while the first paint is still in flight", async ({ page }) => {
  const errors = await open(page, { delayMs: 700 });
  await expect(page.locator("#summary .spin")).toBeVisible();
  await page.locator('#tabs button[data-tab="aspects"]').click();
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(ENV.ChartAspects.data.length, { timeout: 6000 });
  await expect(page.locator("svg.wheel")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the badge is visible in the viewport and links out", async ({ page }) => {
  await open(page);
  const badge = page.locator("#embabel-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("Embabel Worlds");
  await expect(badge.locator("a")).toHaveAttribute("href", "https://worlds.embabel.com");
  const box = await badge.boundingBox();
  expect(box.height).toBeGreaterThan(8);
  expect(box.y).toBeLessThan(page.viewportSize().height);
});

test("the NASA panel is asked for, and explains its own unit", async ({ page }) => {
  const errors = await open(page);
  await page.locator('#tabs button[data-tab="nasa"]').click();
  const before = await page.evaluate(() => window.__calls.map((c) => c.name));
  expect(before).not.toContain("AuditAgainstNasa");
  await page.locator("#runNasa").click();
  await expect(page.locator("#tabBody tbody tr")).toHaveCount(ENV.AuditAgainstNasa.data.length);
  const txt = await page.locator("#tabBody").innerText();
  expect(txt).toMatch(/1\/3600 of a degree/);
  expect(errors).toEqual([]);
});
