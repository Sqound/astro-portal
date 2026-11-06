/**
 * A minimal, dependency-free JSON Schema (2020-12 subset) checker — the
 * production-side counterpart of `packages/astro-contracts/tests/schema-assert.mjs`
 * (test-only, and this package must never import another workspace
 * package's `tests/` directory from production code). No ajv
 * (or any schema library) is a repo dependency; this supports exactly the
 * keywords the import's schemas use: $ref (same-document only), oneOf/anyOf,
 * const, enum, type, properties/required/additionalProperties,
 * items/minItems/maxItems/uniqueItems, minLength/maxLength, pattern, and
 * format ("date-time").
 *
 * Used by the import of an export (`reader.js`) to refuse a document that
 * does not match its schema before anything is written.
 */

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
    case "null":
      return value === null;
    default:
      return true;
  }
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

function resolveRef(root, ref) {
  if (!ref.startsWith("#/"))
    throw new Error(`Unsupported same-document $ref "${ref}".`);
  let node = root;
  for (const segment of ref.slice(2).split("/")) {
    node = node?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    if (node === undefined) throw new Error(`Cannot resolve $ref "${ref}".`);
  }
  return node;
}

/** Returns a list of human-readable errors; an empty list means valid. */
export function schemaErrors(schema, value, root = schema, path = "$") {
  if (schema.$ref)
    return schemaErrors(resolveRef(root, schema.$ref), value, root, path);

  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema.oneOf) {
    const matched = schema.oneOf.filter(
      (branch) => schemaErrors(branch, value, root, path).length === 0,
    ).length;
    if (matched !== 1)
      fail(`must match exactly one oneOf branch (matched ${matched})`);
    return errors;
  }
  if (schema.anyOf) {
    const matched = schema.anyOf.some(
      (branch) => schemaErrors(branch, value, root, path).length === 0,
    );
    if (!matched) fail("must match at least one anyOf branch");
    return errors;
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

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      fail(`must have at most ${schema.maxItems} items`);
    if (
      schema.uniqueItems &&
      value.some((item, index) =>
        value.slice(index + 1).some((other) => deepEqual(item, other)),
      )
    )
      fail("must not contain duplicate items");
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(
          ...schemaErrors(schema.items, item, root, `${path}[${index}]`),
        ),
      );
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      fail(`must have length <= ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail(`must match pattern ${schema.pattern}`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value)))
      fail("must be a date-time");
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`must be <= ${schema.maximum}`);
  }

  return errors;
}
