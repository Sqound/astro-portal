/**
 * The reactive change signal (`GET /v1/changes`). The server-sent stream carries exactly two event
 * kinds, `change` and `resync`, and this module is the one place — shared between the
 * server (before it emits) and a client (before it acts on a payload it did
 * not itself validate) — that decides whether a payload is one of them.
 *
 * The doctrine is that **no business data ever
 * rides this channel**: not a plan id, not a device name, nothing besides a
 * cursor and which domains changed. This parser is the enforcement point for
 * that doctrine: it rejects anything the wire format does not name, on
 * either side, rather than silently ignoring an unexpected field.
 */

/** The closed list of domains the signal may name. Adding a domain is a
 * contract change, not a client-side surprise. */
export const CHANGE_SIGNAL_DOMAINS = [
  "plans",
  "sessions",
  "debrief",
  "equipment",
  "places",
  "framings",
  "favorites",
  "captures",
  "devices",
  "projects",
] as const;

export type ChangeSignalDomain = (typeof CHANGE_SIGNAL_DOMAINS)[number];

/** `<boot>:<n>`: `boot` identifies one server process's lifetime, `n` is a
 * non-negative integer with no leading zero (`0` itself is the exception).
 * Neither half may be empty, and `boot` may not itself contain a colon. */
const CURSOR_PATTERN = /^[^:\s]+:(?:0|[1-9][0-9]*)$/;

export interface ParsedChangeSignalEvent {
  readonly valid: true;
  readonly kind: "change";
  readonly cursor: string;
  readonly domains: ChangeSignalDomain[];
}

export interface ParsedResyncSignalEvent {
  readonly valid: true;
  readonly kind: "resync";
  readonly cursor: string;
}

export interface InvalidSignalEvent {
  readonly valid: false;
  readonly error: string;
}

export type ParsedSignalEvent =
  ParsedChangeSignalEvent | ParsedResyncSignalEvent | InvalidSignalEvent;

function isChangeSignalDomain(value: unknown): value is ChangeSignalDomain {
  return (
    typeof value === "string" &&
    (CHANGE_SIGNAL_DOMAINS as readonly string[]).includes(value)
  );
}

/**
 * Validates one SSE `event`/`data` pair against the reactive-signal contract.
 * `data` is the already `JSON.parse`d payload (this module never touches
 * transport framing). Never throws: every rejection is a returned
 * `{ valid: false, error }`, so a caller — server-side self-check before
 * `publishChange`, or a client deciding whether to act on what it just
 * received — always gets a value it can branch on.
 */
export function parseChangeSignalEvent(
  event: string,
  data: unknown,
): ParsedSignalEvent {
  if (event !== "change" && event !== "resync") {
    return { valid: false, error: `Unknown signal event "${event}".` };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, error: "Signal payload must be a JSON object." };
  }
  const payload = data as Record<string, unknown>;
  const cursor = payload.cursor;
  if (typeof cursor !== "string" || !CURSOR_PATTERN.test(cursor)) {
    return { valid: false, error: "Signal payload has an invalid cursor." };
  }

  const keys = Object.keys(payload);

  if (event === "resync") {
    if (keys.length !== 1) {
      return {
        valid: false,
        error: "A resync payload accepts only cursor.",
      };
    }
    return { valid: true, kind: "resync", cursor };
  }

  if (keys.length !== 2 || !keys.includes("domains")) {
    return {
      valid: false,
      error: "A change payload accepts only cursor and domains.",
    };
  }
  const domains = payload.domains;
  if (!Array.isArray(domains) || domains.length === 0) {
    return {
      valid: false,
      error: "A change payload's domains must be a non-empty array.",
    };
  }
  const seen = new Set<string>();
  const normalized: ChangeSignalDomain[] = [];
  for (const domain of domains) {
    if (!isChangeSignalDomain(domain)) {
      return {
        valid: false,
        error: `A change payload names an unknown domain: ${JSON.stringify(domain)}.`,
      };
    }
    if (seen.has(domain)) {
      return {
        valid: false,
        error: `A change payload repeats domain "${domain}".`,
      };
    }
    seen.add(domain);
    normalized.push(domain);
  }
  return { valid: true, kind: "change", cursor, domains: normalized };
}
