/*
 * The host checks every handler's output against dist/manifest.json and refuses the call when it
 * does not match, so the realm's records and the schemas it publishes must agree. Two ways they
 * stopped agreeing: a field with no value sent as null where the schema says string or number,
 * and an optional boolean published as a type the host cannot read at all.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8")) as { entries: { name: string; outputSchema: unknown }[] };
const handlers = createRequire(import.meta.url)("../dist/api/astrology.js");
const KNOWN = "1962-05-17T14:30|51.5074,-0.1278|Europe/London";
const UNKNOWN = "1962-05-17|51.5074,-0.1278|Europe/London";

const types = (schema: unknown): string[] =>
  !schema || typeof schema !== "object" ? []
    : Object.entries(schema).flatMap(([k, v]) => (k === "type" ? [v as string].flat() : types(v)));

describe("the published schemas", () => {
  it("use only JSON Schema types", () => {
    const allowed = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
    for (const e of manifest.entries) expect(types(e.outputSchema).filter((t) => !allowed.has(t)), e.name).toEqual([]);
  });
});

describe("the records on the wire", () => {
  it.each([
    ["natalChart", { specs: [KNOWN, UNKNOWN] }],
    ["placements", { specs: [UNKNOWN] }],
    ["aspects", { specs: [KNOWN, UNKNOWN] }],
    ["transits", { specs: [`${UNKNOWN}@2026-10-03`] }],
  ])("%s sends no nulls: a field with no value is left out", async (name, args) => {
    const rows = JSON.parse(JSON.stringify(await handlers[name]({}, args))) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Object.entries(r).filter(([, v]) => v === null).map(([k]) => k)).toEqual([]);
  });
});
