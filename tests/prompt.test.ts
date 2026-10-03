/*
 * What the astrologer is TOLD, as opposed to what it replies.
 *
 * A reader answers from its prompt and nothing else, so the prompt is the contract: a question the
 * prompt cannot answer is a question the model will answer wrongly rather than refuse. Asked "where
 * is Mars right now" with `on` set, a live Astrid quoted the NATAL degrees as today's and named two
 * retrogrades while missing three — because the day's block carried only ASPECTS, and a body with
 * no major aspect in orb was simply absent from it. These cases hold the day's own positions in.
 */
import { describe, expect, it } from "vitest";
import { askAstrologer } from "../src/api/astrology.js";
import { skyAt } from "../src/lib/sky.js";
import { position } from "../src/lib/spec.js";

const SPEC = "1980-06-15T14:30|51.5074,-0.1278|Europe/London";
const ON = "2026-10-03";

/* Captures the prompt instead of answering it. The reply is never asserted on — the model is not
 * under test here, the input it is given is. */
function capturing() {
  const seen: string[] = [];
  const ctx = {
    ai: {
      complete: async ({ prompt }: { prompt: string }) => {
        seen.push(prompt);
        return "(captured)";
      },
    },
  };
  return { ctx, prompt: () => seen[0] ?? "" };
}

const ask = async (question: string, on?: string) => {
  const c = capturing();
  await askAstrologer(c.ctx as never, { chartSpec: SPEC, astrologer: "astrid", question, ...(on ? { on } : {}) });
  return c.prompt();
};

describe("the day's sky reaches the prompt", () => {
  it("carries every body's position for the day, not only the ones that aspect the chart", async () => {
    const prompt = await ask("Where is Mars right now?", ON);
    const today = skyAt(new Date(`${ON}T12:00:00Z`));
    expect(today).toHaveLength(10);
    for (const body of today) {
      expect(prompt).toContain(`${body.body.padEnd(8)} ${position(body.longitude).padEnd(18)}`);
    }
  });

  it("marks every retrograde of that day, including bodies with no aspect in orb", async () => {
    const prompt = await ask("Is anything retrograde today?", ON);
    const retro = skyAt(new Date(`${ON}T12:00:00Z`)).filter((b) => b.retrograde);
    /* The defect was a SHORT list, so the count matters as much as the names. */
    expect(retro.length).toBeGreaterThan(1);
    const block = prompt.slice(prompt.indexOf(`THE SKY ON ${ON}`), prompt.indexOf("ITS ASPECTS TO THIS CHART"));
    for (const b of retro) expect(block).toMatch(new RegExp(`${b.body}\\s+\\S+[^\\n]*retrograde`));
  });

  it("tells the reader the natal table is not today's", async () => {
    const prompt = await ask("What is happening today?", ON);
    expect(prompt).toContain("a different thing, never today's");
  });

  it("says nothing about a day when no day was asked for", async () => {
    const prompt = await ask("What is my rising sign?");
    expect(prompt).not.toContain("THE SKY ON");
    expect(prompt).toContain("PLACEMENTS");
  });
});
