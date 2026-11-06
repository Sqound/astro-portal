// A minimal, dependency-free JSON Schema (2020-12 subset) checker used only by
// this package's own schema tests. No ajv (or any schema library) is a repo
// dependency, so this supports exactly the keywords the schemas under
// schemas/ actually use: $ref (same-document, plus cross-file refs a test
// registered explicitly), oneOf/anyOf/allOf, const, enum, type,
// properties/required/additionalProperties (false, or a schema), items/minItems/maxItems/
// uniqueItems, minimum/maximum, exclusiveMinimum/exclusiveMaximum,
// multipleOf, minLength/maxLength, pattern, and format ("date", "date-time").

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
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

const externalDocuments = new Map();

/**
 * Makes one schema file resolvable by the exact relative reference its
 * siblings use, e.g. "plan.schema.json" or "../session-events/note.schema.json".
 * A reference whose file was NOT registered resolves to the empty schema,
 * which accepts everything: that is deliberate, so a schema may already point
 * at a registry file this branch does not ship yet, and the same schema starts
 * validating for real the moment that file exists and is registered. Only this
 * package's own tests call it.
 */
export function registerExternalSchema(reference, document) {
  externalDocuments.set(reference, document);
}

export function hasExternalSchema(reference) {
  return externalDocuments.has(reference);
}

/**
 * Returns `{ schema, root }`: crossing into another file also moves the root
 * the refs inside it resolve against, or a same-document "#/$defs/uuid" in the
 * target would be looked up in the referring file.
 */
function resolveRef(root, ref) {
  const separator = ref.indexOf("#");
  const file = separator === -1 ? ref : ref.slice(0, separator);
  const pointer = separator === -1 ? "" : ref.slice(separator + 1);
  let node = root;
  if (file) {
    if (!externalDocuments.has(file)) return { schema: {}, root: {} };
    node = externalDocuments.get(file);
    root = node;
  }
  if (pointer !== "") {
    if (!pointer.startsWith("/"))
      throw new Error(`Unsupported $ref "${ref}" (JSON pointer expected).`);
    for (const segment of pointer.slice(1).split("/")) {
      node = node?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
      if (node === undefined) throw new Error(`Cannot resolve $ref "${ref}".`);
    }
  }
  return { schema: node, root };
}

/** Returns a list of human-readable errors; an empty list means valid. */
export function schemaErrors(schema, value, root = schema, path = "$") {
  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref);
    return schemaErrors(target.schema, value, target.root, path);
  }

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
  if (schema.allOf)
    for (const branch of schema.allOf)
      errors.push(...schemaErrors(branch, value, root, path));

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
    // `additionalProperties` as a schema: every undeclared property is read by it.
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    )
      for (const key of Object.keys(value))
        if (!declared.has(key))
          errors.push(
            ...schemaErrors(
              schema.additionalProperties,
              value[key],
              root,
              `${path}.${key}`,
            ),
          );
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

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`must be <= ${schema.maximum}`);
    if (
      schema.exclusiveMinimum !== undefined &&
      !(value > schema.exclusiveMinimum)
    )
      fail(`must be > ${schema.exclusiveMinimum}`);
    if (
      schema.exclusiveMaximum !== undefined &&
      !(value < schema.exclusiveMaximum)
    )
      fail(`must be < ${schema.exclusiveMaximum}`);
    if (
      schema.multipleOf !== undefined &&
      !Number.isInteger(value / schema.multipleOf)
    )
      fail(`must be a multiple of ${schema.multipleOf}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      fail(`must have length <= ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail(`must match pattern ${schema.pattern}`);
    if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      fail("must be a date");
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value)))
      fail("must be a date-time");
  }

  return errors;
}

export function assertValid(schema, value) {
  const errors = schemaErrors(schema, value);
  if (errors.length)
    throw new Error(`Expected valid, got:\n${errors.join("\n")}`);
}

export function assertInvalid(schema, value) {
  if (schemaErrors(schema, value).length === 0)
    throw new Error("Expected the sample to be rejected, but it validated.");
}
