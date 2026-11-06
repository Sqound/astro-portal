/**
 * The sanitizer of the application's error logs: what must never leave a phone in an entry of « Envoyer
 * les journaux d'erreur de l'application » — a precise place (coordinates),
 * a place's or a plan's name, an e-mail address, a network address, a
 * secret.
 *
 * The client sanitizes every text and every field of an entry before it
 * queues it; the service checks every entry of a batch again
 * ({@link findUnsafeAppLogEntry}) and refuses the batch at the first entry
 * that still holds such a value, never storing it.
 *
 * - {@link redactAppLogText} replaces, in a free text (a message, a stack,
 *   a route), what is recognised anywhere: a PEM block, a bearer or a keyed
 *   secret (`token=…`), a long run of a key's characters → `[secret]`; an
 *   e-mail address → `[e-mail]`; an IPv4, IPv6 or MAC address →
 *   `[réseau]`; a decimal number of three decimals or more within ±180
 *   (a coordinate to about a hundred metres) or a reading in degrees and
 *   minutes → `[coord]`. A query string (`?…`) of a route is dropped: it
 *   may carry a place's name.
 * - {@link sanitizeAppLogFields} keeps the fields of a breadcrumb (scalars
 *   only, twelve at most) and writes `[retiré]` in place of the value of a
 *   key that names a place, a person, a plan, a network or a secret.
 *
 * Neither ever returns a value it removed.
 */

/** The rules, in the order they are reported. */
export const APP_LOG_RULES = Object.freeze(
  "secret identity network place".split(" "),
);

/** The mark of a removed secret. */
const SECRET_MARK = "[secret]";

/** What the sanitizer writes in place of a value it removed. */
export const APP_LOG_PLACEHOLDERS = Object.freeze({
  secret: SECRET_MARK,
  identity: "[e-mail]",
  network: "[réseau]",
  place: "[coord]",
  removed: "[retiré]",
});

// The lists are written as one string each: they are field names of the
// application, not words of the interface.
const normalise = (key) =>
  String(key).toLowerCase().replaceAll("_", "").replaceAll("-", "");

/** Field names whose value never leaves the phone, compared normalised. */
const REMOVED_KEYS = new Set(
  "lat latitude lon lng long longitude coordinate coordinates coords altitude elevation place placename location locationname site sitename address email mail name username owner devicename nickname plan planname ssid bssid ip host hostname mac token password passwd secret key apikey authorization cookie signature".split(
    " ",
  ),
);

const removedKey = (key) => {
  const name = normalise(key);
  return (
    REMOVED_KEYS.has(name) ||
    name.startsWith("gps") ||
    name.startsWith("wifi") ||
    name.endsWith("address") ||
    name.endsWith("ssid") ||
    name.endsWith("token") ||
    name.endsWith("secret") ||
    name.endsWith("password")
  );
};

const PEM = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const KEYED =
  /\b(token|access_token|refresh_token|password|passwd|secret|api_?key|authorization|cookie|signature)(\s*[:=]\s*)(?!(?:Bearer|Basic)\s)("[^"]*"|'[^']*'|[^\s"',;&)]+)/gi;
const RUN = /(?<![A-Za-z0-9+=_-])[A-Za-z0-9+=_-]{40,}(?![A-Za-z0-9+=_-])/g;
const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const MAC =
  /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/g;
const IPV4 =
  /(?<![0-9.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![0-9]|\.\d)/g;
const IPV6_FULL =
  /(?<![0-9A-Za-z:])(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}(?![0-9A-Za-z:])/g;
const IPV6_SHORT =
  /(?<![0-9A-Za-z:])(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6})?::(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6})?(?![0-9A-Za-z:])/g;
const DECIMAL = /(?<![0-9.:])[-+]?\d{1,3}\.\d{3,}(?![0-9.])/g;
const DEGREES = /\d{1,3}\s?°\s?\d{1,2}\s?['′]/g;

/** A run that is a key's, not a word: a digit and a letter at least. */
const isKeyRun = (run) => /\d/.test(run) && /[A-Za-z]/.test(run);

/** An IPv6 candidate of the short form that holds a group at least. */
const isShortIpv6 = (match) => /[0-9A-Fa-f]/.test(match);

/**
 * Applies every rule to `text`, in order; `found` collects the names of the
 * rules that matched.
 */
function redact(text, found) {
  const replace = (pattern, rule, replacement, keep = () => false) => {
    text = text.replace(pattern, (...match) => {
      if (keep(match[0])) return match[0];
      found.add(rule);
      return typeof replacement === "function"
        ? replacement(...match)
        : replacement;
    });
  };
  replace(PEM, "secret", APP_LOG_PLACEHOLDERS.secret);
  replace(
    BEARER,
    "secret",
    (_whole, scheme) => `${scheme} ${APP_LOG_PLACEHOLDERS.secret}`,
  );
  replace(
    KEYED,
    "secret",
    (_whole, key, separator) =>
      `${key}${separator}${APP_LOG_PLACEHOLDERS.secret}`,
    (whole) => whole.endsWith(APP_LOG_PLACEHOLDERS.secret),
  );
  replace(EMAIL, "identity", APP_LOG_PLACEHOLDERS.identity);
  replace(MAC, "network", APP_LOG_PLACEHOLDERS.network);
  replace(IPV4, "network", APP_LOG_PLACEHOLDERS.network);
  replace(IPV6_FULL, "network", APP_LOG_PLACEHOLDERS.network);
  replace(
    IPV6_SHORT,
    "network",
    APP_LOG_PLACEHOLDERS.network,
    (match) => !isShortIpv6(match),
  );
  replace(
    RUN,
    "secret",
    APP_LOG_PLACEHOLDERS.secret,
    (match) => !isKeyRun(match),
  );
  replace(
    DECIMAL,
    "place",
    APP_LOG_PLACEHOLDERS.place,
    (match) => Math.abs(Number(match)) > 180,
  );
  replace(DEGREES, "place", APP_LOG_PLACEHOLDERS.place);
  return text;
}

/**
 * @param {unknown} text A free text of an entry (a message, a stack).
 * @returns {string} The text with every value the rules recognise replaced.
 */
export function redactAppLogText(text) {
  return redact(String(text ?? ""), new Set());
}

/**
 * A route as an entry carries it: its path only (the query string may
 * carry a place's name), then redacted as a text.
 */
export function redactAppLogRoute(route) {
  const text = String(route ?? "");
  const query = text.search(/[?#]/);
  return redactAppLogText(query === -1 ? text : text.slice(0, query));
}

/** The names of the rules `text` breaks, in the order of {@link APP_LOG_RULES}. */
export function appLogTextRules(text) {
  const found = new Set();
  redact(String(text ?? ""), found);
  return APP_LOG_RULES.filter((rule) => found.has(rule));
}

/** The longest text of a field of a breadcrumb. */
const FIELD_TEXT_LIMIT = 120;
/** The most fields a breadcrumb keeps. */
const FIELD_LIMIT = 12;

/**
 * @param {unknown} fields The fields of a breadcrumb, as JSON.
 * @returns {Record<string, string | number | boolean | null>} Scalars only,
 *   twelve at most, in their order; the value of a key that names a place, a
 *   person, a plan, a network or a secret replaced by `[retiré]`; every text
 *   redacted and cut to 120 characters; a nested value dropped.
 */
export function sanitizeAppLogFields(fields) {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields))
    return {};
  const kept = {};
  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (count >= FIELD_LIMIT) break;
    const name = redactAppLogText(key).slice(0, 40);
    if (!name) continue;
    if (removedKey(key)) {
      kept[name] = APP_LOG_PLACEHOLDERS.removed;
    } else if (value === null || typeof value === "boolean") {
      kept[name] = value;
    } else if (typeof value === "number") {
      kept[name] = !Number.isFinite(value)
        ? null
        : preciseNumber(value)
          ? APP_LOG_PLACEHOLDERS.place
          : value;
    } else if (typeof value === "string") {
      kept[name] = redactAppLogText(value).slice(0, FIELD_TEXT_LIMIT);
    } else continue;
    count += 1;
  }
  return kept;
}

/**
 * A number that could be a coordinate: within ±180, written with three
 * decimals or more (`45.1234`), as `String` writes it.
 */
const preciseNumber = (value) =>
  Number.isFinite(value) &&
  Math.abs(value) <= 180 &&
  /\.\d{3,}/.test(String(value));

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The marks a device incident's fields may hold under a removed key: the
 * breadcrumbs' `[retiré]`, and those the device journal's redactor writes at
 * the source (`[secret]`, `[id]`, `[réseau]`, `[plan]`, `[lieu]`), `[coord]`
 * and `[e-mail]`. None of them holds a value.
 */
export const APP_LOG_INCIDENT_MARKS = Object.freeze([
  APP_LOG_PLACEHOLDERS.removed,
  APP_LOG_PLACEHOLDERS.secret,
  APP_LOG_PLACEHOLDERS.place,
  APP_LOG_PLACEHOLDERS.identity,
  "[id]",
  "[réseau]",
  "[plan]",
  "[lieu]",
]);

/** The texts of an incident's header, each checked as a free text. */
const INCIDENT_TEXTS = Object.freeze(
  "family model firmware makerApp command variant step code answer cause before after".split(
    " ",
  ),
);

/**
 * The service's check of one entry (as the contract `app-log-batch`
 * describes it): the names of the rules it breaks, empty when it is clean.
 * Every text is checked by the rules of {@link redactAppLogText}; the
 * fields of each breadcrumb must be what {@link sanitizeAppLogFields}
 * leaves; a route must hold no query string. A device incident
 * (`incident`) is checked the same way: the texts of its header, its
 * `params`, and the name, channel, code and fields of each exchange line
 * (a removed key may then hold one of {@link APP_LOG_INCIDENT_MARKS}).
 */
export function findUnsafeAppLogEntry(entry) {
  const found = new Set();
  const check = (text) => {
    if (typeof text === "string") redact(text, found);
  };
  const checkFields = (fields, marks = [APP_LOG_PLACEHOLDERS.removed]) => {
    if (!isObject(fields)) return;
    for (const [key, value] of Object.entries(fields)) {
      check(key);
      if (removedKey(key)) {
        if (value !== null && !marks.includes(value)) found.add(placeRule(key));
      } else if (typeof value === "number" && preciseNumber(value))
        found.add("place");
      else check(value);
    }
  };
  if (!isObject(entry)) return [];
  check(entry.event);
  check(entry.message);
  check(entry.stack);
  if (isObject(entry.diagnostic)) {
    for (const [key, value] of Object.entries(entry.diagnostic)) {
      if (key === "route" && typeof value === "string" && /[?#]/.test(value))
        found.add("place");
      check(value);
    }
  }
  for (const crumb of [
    ...(Array.isArray(entry.breadcrumbs) ? entry.breadcrumbs : []),
    ...(Array.isArray(entry.debugTrail) ? entry.debugTrail : []),
  ]) {
    if (!isObject(crumb)) continue;
    check(crumb.name);
    checkFields(crumb.fields);
  }
  if (isObject(entry.incident)) {
    const incident = entry.incident;
    for (const key of INCIDENT_TEXTS) check(incident[key]);
    checkFields(incident.params, APP_LOG_INCIDENT_MARKS);
    for (const line of Array.isArray(incident.lines) ? incident.lines : []) {
      if (!isObject(line)) continue;
      check(line.name);
      check(line.channel);
      check(line.code);
      checkFields(line.fields, APP_LOG_INCIDENT_MARKS);
    }
  }
  return APP_LOG_RULES.filter((rule) => found.has(rule));
}

/** The rule a removed key falls under, for the refusal's names. */
function placeRule(key) {
  const name = normalise(key);
  if (
    /token|secret|password|passwd|key|authorization|cookie|signature/.test(name)
  )
    return "secret";
  if (
    /email|mail|name|owner|nickname|username/.test(name) &&
    !/place|site|location|plan/.test(name)
  )
    return "identity";
  if (/ssid|wifi|ip|host|mac/.test(name) && !/address/.test(name))
    return "network";
  return "place";
}
