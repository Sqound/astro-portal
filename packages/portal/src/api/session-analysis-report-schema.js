import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A production-code JSON Schema (2020-12 subset) evaluator for
 * `session-analysis.schema.json`'s `$defs.report` — the production counterpart of
 * `packages/astro-contracts/tests/ schema-assert.mjs`, on the exact precedent
 * `session-events/registry.js`'s own module doc comment already explains for that
 * file's own payload schemas: astro-contracts exports no validator of its own, and
 * schema-assert.mjs lives under that package's tests/ and is not part of its build
 * output, so this route validates against the schema FILE directly with the smallest
 * evaluator that supports the keywords it actually uses. Unlike `registry.js`'s own
 * evaluator, this one DOES implement `$ref` (same-document only) and `const`, since
 * session-analysis.schema.json is built entirely out of `$defs`/`$ref` — every other
 * keyword it needs (type, required, properties/ additionalProperties, anyOf, enum,
 * minLength, maxLength, minimum) is the same subset `registry.js` already covers,
 * plus `maximum` and `maxItems` (the report v3's trace).
 *
 * This is also where the evidence rule is enforced at the wire boundary:
 * `additionalProperties: false` on every object in the schema means a
 * stray `score`/`rating`/`grade` field (or any field this contract never
 * named) fails validation and the whole report is refused with
 * `invalid_request` — for a report from ANY producer against this public
 * contract, not only `astro-sync-core`'s own.
 */

let cachedDocument = null;

// Built with `dirname(fileURLToPath(...))` + `join`, not `new URL(relative,
// import.meta.url)` — the same pitfall `session-events/registry.js`'s own
// `defaultSessionEventSchemaDirectory` documents: a literal relative-URL
// form is what Next's Turbopack/webpack pattern-match to inline a bundled
// asset, and this target (a JSON file two packages away) is not one either
// bundler can resolve, which silently breaks every route that imports this
// module once served through `next dev`/`next build` rather than plain
// `node --test`.
function schemaDocumentPath() {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "astro-contracts",
    "schemas",
    "api",
    "session-analysis.schema.json",
  );
}

function schemaDocument() {
  if (!cachedDocument)
    cachedDocument = JSON.parse(readFileSync(schemaDocumentPath(), "utf8"));
  return cachedDocument;
}

/** Test-only: forces the next call to re-read the schema file from disk. */
export function resetSessionAnalysisSchemaCache() {
  cachedDocument = null;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

function matchesType(value, type) {
  switch (type) {
    case "object":
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/"))
    throw new Error(
      `Unsupported $ref "${ref}" (same-document pointer expected).`,
    );
  let node = root;
  for (const segment of ref.slice(2).split("/")) {
    node = node?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    if (node === undefined) throw new Error(`Cannot resolve $ref "${ref}".`);
  }
  return node;
}

function schemaErrors(schema, value, root, path = "$") {
  if (schema.$ref)
    return schemaErrors(resolveRef(root, schema.$ref), value, root, path);

  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema.allOf)
    for (const branch of schema.allOf)
      errors.push(...schemaErrors(branch, value, root, path));
  if (schema.anyOf) {
    const matched = schema.anyOf.some(
      (branch) => schemaErrors(branch, value, root, path).length === 0,
    );
    if (!matched) fail("must match at least one anyOf branch");
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const))
    fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((option) => deepEqual(option, value)))
    fail(`must be one of ${JSON.stringify(schema.enum)}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      fail(`must be of type ${types.join("|")}`);
      return errors;
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || [])
      if (!(key in value)) fail(`missing required property "${key}"`);
    const declared = new Set(Object.keys(schema.properties || {}));
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!declared.has(key)) fail(`unexpected property "${key}"`);
    for (const [key, subschema] of Object.entries(schema.properties || {}))
      if (key in value)
        errors.push(
          ...schemaErrors(subschema, value[key], root, `${path}.${key}`),
        );
  }

  if (
    Array.isArray(value) &&
    schema.maxItems !== undefined &&
    value.length > schema.maxItems
  )
    fail(`must have at most ${schema.maxItems} items`);

  if (Array.isArray(value) && schema.items)
    value.forEach((item, index) =>
      errors.push(
        ...schemaErrors(schema.items, item, root, `${path}[${index}]`),
      ),
    );

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`must be <= ${schema.maximum}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      fail(`must have length <= ${schema.maxLength}`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value)))
      fail("must be a date-time");
  }

  return errors;
}

/**
 * Validates a candidate report body against `session-analysis.schema.json`'s
 * `$defs.report`. Returns a list of human-readable errors; an empty list
 * means the report is valid and safe to store verbatim.
 */
export function reportSchemaErrors(report) {
  const document = schemaDocument();
  return schemaErrors({ $ref: "#/$defs/report" }, report, document);
}
