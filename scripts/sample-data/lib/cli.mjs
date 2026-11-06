// A small command-line reader shared by the three commands: flags with a
// value, repeatable flags, switches; anything else is a usage error (exit 2).

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * @param {string[]} argv
 * @param {Record<string, { key: string, type: "string" | "list" | "boolean" | "integer" }>} spec
 */
export function parseArguments(argv, spec) {
  const result = {};
  for (const definition of Object.values(spec))
    if (definition.type === "list") result[definition.key] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const definition = spec[flag];
    if (!definition) throw new UsageError(`Unknown argument: ${flag}`);
    if (definition.type === "boolean") {
      result[definition.key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && value.length > 2))
      throw new UsageError(`${flag} requires a value.`);
    index += 1;
    if (definition.type === "list") result[definition.key].push(value);
    else if (definition.type === "integer") {
      if (!/^\d+$/.test(value))
        throw new UsageError(`${flag} expects a whole number.`);
      result[definition.key] = Number(value);
    } else result[definition.key] = value;
  }
  return result;
}

/** Splits `a,b,c` values of a list flag (an id list may be given either way). */
export function splitCommas(values) {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}
