// New identifiers for the sample. Every identifier of the source is replaced
// by one derived only from its kind and its rank (the first session is always
// the same UUID), so nothing of the source database — not a random UUID, not
// a hash of a place — survives, and two exports of the same selection produce
// the same set.
import { createHash } from "node:crypto";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && UUID.test(value);

/** A version-5-shaped UUID, from the kind and the rank alone. */
export function sampleUuid(kind, rank) {
  const bytes = createHash("sha256")
    .update(`astro-portal-sample/v1/${kind}/${rank}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The two ids the records carry in place of a space and of its owner: the
 * `tenant_id` columns and the `created_by_user_id` columns. `install` replaces
 * them by those of the portal's owner; nothing else in the records may be an
 * id of a space or of a person.
 */
export const TENANT_PLACEHOLDER = sampleUuid("tenant", 1);
export const OWNER_PLACEHOLDER = sampleUuid("user", 1);

/** An unguessable-looking, stable public slug (24 base64url characters). */
export function sampleSlug(rank) {
  return createHash("sha256")
    .update(`astro-portal-sample/v1/slug/${rank}`)
    .digest("base64url")
    .slice(0, 24);
}

const pad = (rank, width = 2) => String(rank).padStart(width, "0");

export class IdMap {
  #byKind = new Map();
  #all = new Map();
  #issued = new Set();
  #dangling = new Map();

  /** Gives `oldIds` their new identifiers, in the order given. */
  register(kind, oldIds, { readable = null } = {}) {
    const map = this.#byKind.get(kind) || new Map();
    this.#byKind.set(kind, map);
    for (const oldId of oldIds) {
      if (map.has(oldId)) continue;
      const rank = map.size + 1;
      const next = readable
        ? `${readable}-${pad(rank)}`
        : sampleUuid(kind, rank);
      map.set(oldId, next);
      this.#all.set(oldId, next);
      this.#issued.add(next);
    }
  }

  get(kind, oldId) {
    return this.#byKind.get(kind)?.get(oldId);
  }

  require(kind, oldId) {
    const value = this.get(kind, oldId);
    if (value === undefined) throw new Error(`Unmapped ${kind} reference.`);
    return value;
  }

  size(kind) {
    return this.#byKind.get(kind)?.size || 0;
  }

  /** Registers a fixed new identifier for an old one (a place, the space). */
  alias(kind, oldId, newId) {
    const map = this.#byKind.get(kind) || new Map();
    this.#byKind.set(kind, map);
    map.set(oldId, newId);
    this.#all.set(oldId, newId);
    this.#issued.add(newId);
  }

  /** Marks an identifier written by the tool itself, never to be mistaken for a leftover. */
  issue(newId) {
    this.#issued.add(newId);
  }

  danglingCount() {
    return this.#dangling.size;
  }

  /**
   * The identifier a string stands for: the new one when it is a known old
   * identifier; a stable placeholder when it looks like a UUID that no record
   * of the sample has (a reference to something not exported); itself otherwise.
   */
  replaceString(value) {
    const known = this.#all.get(value);
    if (known !== undefined) return known;
    if (!isUuid(value) || this.#issued.has(value)) return value;
    const lower = value.toLowerCase();
    if (!this.#dangling.has(lower))
      this.#dangling.set(
        lower,
        sampleUuid("unexported", this.#dangling.size + 1),
      );
    return this.#dangling.get(lower);
  }
}
