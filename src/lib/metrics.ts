/*
 * Metric values: how they are stated to a model, and how its answer is validated.
 *
 * The facility is the spec's `metrics/` — declared sets, scoped to the subject, the agent or the
 * conversation, updated once per turn by a second model call under the `routing` LLM role. The
 * implementation this generalises clamped every value to 1-10, which is why `type` exists here: a
 * stage is not a score and a count is neither, and a host that validated everything as one scale
 * would have silently misreported two of the three metrics in `conversion.yml`.
 *
 * WHERE VALUES LIVE. The spec says the host extracts and persists them. No host does yet, so the
 * caller carries them: they come in with the turn and go out with the answer. That is a stand-in,
 * not the design — it means values live wherever the caller puts them, which for the app is the
 * page's own thread state, and they are gone when the page is closed.
 */
import type { Metric, Persona } from "./personas.js";
import { metricsOf } from "./personas.js";

export type MetricValue = number | string | boolean;
export type MetricValues = Record<string, MetricValue>;

/*
 * A number, or nothing. `Number()` alone will not do: it maps null, "" and [] to 0, so a model
 * answering `null` for "I have no idea" floored `mood` to the bottom of its range and reported a
 * cheerful person as miserable. Absent must stay absent and leave the prior value standing.
 */
function asNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || typeof raw === "boolean") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A metric whose value, once true, never goes back in this conversation. */
const LATCHING = new Set(["askedToStop"]);

export const defaultsFor = (p: Persona): MetricValues =>
  Object.fromEntries(metricsOf(p).map((m) => [m.name, m.default]));

/*
 * One value, forced to fit its own declaration. An out-of-range number is clamped rather than
 * rejected — a turn should not fail because a model said 11 — but an unknown stage IS rejected,
 * because silently picking a neighbouring stage would invent a position the person never took.
 */
export function coerce(m: Metric, raw: unknown, previous: MetricValue | undefined): MetricValue {
  const prior = previous === undefined ? m.default : previous;
  switch (m.type) {
    case "boolean": {
      const v = raw === true || raw === "true" || raw === 1;
      /* Latching: a request to stop cannot be walked back by a later turn's extraction. */
      if (LATCHING.has(m.name) && prior === true) return true;
      return typeof raw === "boolean" || raw === "true" || raw === "false" || raw === 0 || raw === 1 ? v : prior;
    }
    case "stage": {
      const s = String(raw);
      return (m.stages ?? []).includes(s) ? s : prior;
    }
    case "count": {
      const n = asNumber(raw);
      return n !== null && n >= 0 ? Math.round(n) : prior;
    }
    case "ordinal":
    case "ratio": {
      const n = asNumber(raw);
      if (n === null) return prior;
      const [lo, hi] = m.range ?? [0, 1];
      const clamped = Math.min(hi, Math.max(lo, n));
      return m.type === "ordinal" ? Math.round(clamped) : clamped;
    }
    default:
      return prior;
  }
}

/** Every declared metric, validated against the model's JSON and the values carried in. */
export function applyExtraction(p: Persona, carried: MetricValues, emitted: unknown): MetricValues {
  const obj = (emitted && typeof emitted === "object" ? emitted : {}) as Record<string, unknown>;
  const out: MetricValues = {};
  for (const m of metricsOf(p)) {
    const has = Object.prototype.hasOwnProperty.call(obj, m.name);
    out[m.name] = has ? coerce(m, obj[m.name], carried[m.name]) : (carried[m.name] ?? m.default);
  }
  return out;
}

/** How a metric is described to the model that must produce it. */
function stateOf(m: Metric): string {
  const shape =
    m.type === "stage" ? `one of: ${(m.stages ?? []).join(", ")}`
    : m.type === "boolean" ? "true or false"
    : m.type === "count" ? "a whole number, 0 or more"
    : `a number from ${m.range?.[0]} to ${m.range?.[1]}`;
  return `  ${m.name} (${m.scope}, ${shape})${m.description ? ` — ${m.description.trim()}` : ""}`;
}

/** The block that tells a reader where things stand, so its behaviour can answer to it. */
export function currentBlock(p: Persona, values: MetricValues): string {
  const all = metricsOf(p);
  if (!all.length) return "";
  const rows = all.map((m) => `  ${m.name}: ${JSON.stringify(values[m.name] ?? m.default)}`).join("\n");
  return `\nWHERE THINGS STAND, from the conversation so far:\n${rows}\n`;
}

/*
 * The extraction prompt. A separate call on purpose: the reply is written to be read, and this is
 * written to be parsed, and one model asked to do both does neither well.
 *
 * It runs BEFORE the reply is generated, on what the person has just said. That ordering is the
 * whole point: extracting afterwards makes every metric one turn stale, and for `askedToStop` that
 * is not a lag but a defect — asked to stop, Astrid said "zero pressure" and then delivered an
 * unsolicited reading in the same breath, because the prompt that wrote it still believed nobody
 * had objected. A brake that engages on the next turn is not a brake.
 */
export function extractionPrompt(p: Persona, values: MetricValues, said: string, latest: string): string {
  return `Read the conversation below and report where things now stand. You are an observer, not a
participant: do not continue the conversation and do not judge it.

The metrics to report, with the shape each must take:
${metricsOf(p).map(stateOf).join("\n")}

Their values before this exchange:
${metricsOf(p).map((m) => `  ${m.name}: ${JSON.stringify(values[m.name] ?? m.default)}`).join("\n")}

${said ? `Earlier in the conversation:\n${said}\n\n` : ""}What they have just said:
${latest}

Return ONLY a JSON object whose keys are the metric names above and whose values take the shapes
stated. Change a value only where the exchange gives you a reason to; otherwise repeat it. Report
what is there, including that somebody has gone cold or asked to be left alone — an observer who
reports improvement that did not happen is worse than useless.`;
}

/* Models wrap JSON in prose and fences often enough to matter. Take the first object that parses. */
export function parseJsonObject(text: string): unknown {
  const t = String(text ?? "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const candidate of [fenced?.[1], t, t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    if (!candidate) continue;
    try {
      const v = JSON.parse(candidate);
      if (v && typeof v === "object") return v;
    } catch {
      /* try the next */
    }
  }
  return {};
}
