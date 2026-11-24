/*
 * Declares an optional boolean as a boolean in dist/manifest.json.
 *
 * The manifest generator reads `applying?: boolean` as the union `true | false | undefined` and
 * writes `{ oneOf: [{ type: "undefined" }, { type: "undefined" }] }`, because it renders each
 * boolean literal by `typeof` of a value it cannot read. "undefined" is not a JSON Schema type, so
 * the host refuses the whole output schema and every call to the handler fails, whatever it
 * returns. A oneOf whose every branch is that broken literal can only have meant boolean, so it is
 * rewritten to exactly that and nothing else is touched.
 *
 * Remove this step once the generator renders a boolean union as `{ type: "boolean" }`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "dist/manifest.json";
const manifest = JSON.parse(readFileSync(FILE, "utf8"));
let fixed = 0;
const visit = (node) => {
  if (Array.isArray(node)) return node.forEach(visit);
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.oneOf) && node.oneOf.length === 2 && node.oneOf.every((b) => b && b.type === "undefined")) {
    delete node.oneOf;
    node.type = "boolean";
    fixed++;
  }
  Object.values(node).forEach(visit);
};
visit(manifest.entries);
writeFileSync(FILE, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${fixed} optional boolean(s) declared as boolean`);
