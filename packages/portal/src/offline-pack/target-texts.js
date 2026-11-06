import { createHash } from "node:crypto";

/**
 * The offline pack's optional « Textes complets du catalogue » component: the
 * full pages of the targets, their sources and the children's text, in the
 * shards written under `target-library/texts/`. A language's texts are about forty megabytes, so
 * the base data never includes them: a device asks for them, in the language
 * of its interface.
 *
 * This module is the one place the component's shape lives, for
 * `GET /v1/offline-pack` (`portal-app/lib/target-texts-pack.server.js`, which
 * reads the folder's index and checks the files) and for a static pack (which
 * copies the shards): it only turns an index already read into the component and never
 * touches the filesystem. A pack with no shard to offer has no component —
 * `null`, never a component with nothing in it.
 */

/** The component's `id` in the manifest. */
export const targetTextsComponentId = "target-texts";

/** The component's `kind`: a reader that does not know it ignores it. */
export const targetTextsComponentKind = "text-shards";

/** The live route's address template; `{locale}` and `{shard}` (three digits). */
export const targetTextsUrlTemplate =
  "/v1/offline-pack/target-texts/{locale}/{shard}.json";

const shardName = /^[0-9]{3}$/u;
const digest = /^[0-9a-f]{64}$/u;

/** Whether [item] is a shard the manifest can describe. */
export function isListableTextShard(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.shard === "string" &&
    shardName.test(item.shard) &&
    Number.isInteger(item.bytes) &&
    item.bytes > 0 &&
    typeof item.sha256 === "string" &&
    digest.test(item.sha256) &&
    typeof item.revision === "string" &&
    item.revision.length > 0 &&
    Number.isInteger(item.count) &&
    item.count > 0
  );
}

/** The manifest's entry of a shard: what a device needs to fetch and check it. */
export function textShardEntry(item) {
  return {
    shard: item.shard,
    bytes: item.bytes,
    sha256: item.sha256,
    revision: item.revision,
    count: item.count,
  };
}

/**
 * The component's `revision`: a digest of every language's shard revisions
 * (and of what they are, so that the same revision under another digest is
 * another revision). 16 hexadecimal digits, like a shard's own revision.
 */
export function targetTextsRevision(locales) {
  const hash = createHash("sha256");
  for (const [locale, shards] of Object.entries(locales))
    for (const item of shards)
      hash.update(`${locale}/${item.shard}:${item.revision}:${item.sha256}\n`);
  return hash.digest("hex").slice(0, 16);
}

/**
 * The component, from the index of the shards (`index.json`, shape of
 * `target-texts-index.schema.json`) and the languages the registry ships
 * (`locales`, in the order the registry gives them: a language the index
 * lists and the registry does not ship is left out, whatever the index says).
 * `urlTemplate` is the live route's, or the static pack's own relative one.
 * Returns `null` when no shipped language has a shard.
 *
 * @param {{ index: { locales?: Record<string, unknown[]> }, locales: string[], urlTemplate?: string }} options
 */
export function targetTextsPackComponent({
  index,
  locales,
  urlTemplate = targetTextsUrlTemplate,
}) {
  const listed = {};
  for (const locale of locales) {
    const shards = Array.isArray(index?.locales?.[locale])
      ? index.locales[locale]
      : [];
    const items = shards
      .filter(isListableTextShard)
      .sort((left, right) => (left.shard < right.shard ? -1 : 1))
      .map(textShardEntry);
    if (items.length) listed[locale] = items;
  }
  if (!Object.keys(listed).length) return null;
  return {
    id: targetTextsComponentId,
    kind: targetTextsComponentKind,
    required: false,
    revision: targetTextsRevision(listed),
    urlTemplate,
    locales: listed,
  };
}
