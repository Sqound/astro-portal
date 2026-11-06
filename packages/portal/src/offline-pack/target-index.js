import { promisify } from "node:util";
import { gzip } from "node:zlib";

// On the thread pool: `gzipSync` compressed each ≈250 kB page on the event
// loop, which a service answering a platform health probe (that gives up
// after one second) cannot spare. Same bytes, same sizes.
const gzipAsync = promisify(gzip);

/**
 * The compact catalogue index component's shape and cost estimate — shared between
 * `GET /v1/offline-pack` (`portal-app/lib/offline-pack.server.js`, which walks
 * `GET /v1/target-index`'s own pages) and a static pack (which
 * walks the very same pages from a static-data package, to also write them out as
 * files a plain file server can serve). `pageJson(page)` returns page `page`'s
 * already serialized JSON text (page 0 first) — this function measures it, it never
 * builds it, so the same sizing logic works whether a page comes from a live,
 * database-backed catalogue or from a static seed file.
 *
 * `pages`, `estimatedBytes` and `estimatedEncodedBytes` are measured against
 * the real, current pages — never hand-typed — so they track the installed
 * catalogue's actual size; only `urlTemplate` differs between a live API
 * (`/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}`)
 * and a self-hosted static pack (`target-index/{locale}/{offset}.json`), and
 * is therefore left entirely to the caller.
 */
export async function targetIndexPackComponent({
  total,
  pageSize,
  revision,
  urlTemplate,
  pageJson,
  knowledge = null,
}) {
  const pages = Math.ceil(total / pageSize);
  const { estimatedBytes, estimatedEncodedBytes } = await targetIndexPageSizes(
    pages,
    pageJson,
  );
  return {
    id: "target-index",
    kind: "index-pages",
    required: true,
    revision,
    pageSize,
    pages,
    estimatedBytes,
    estimatedEncodedBytes,
    urlTemplate,
    ...(knowledge ? { knowledge } : {}),
  };
}

/**
 * The `knowledge` part of the catalogue index component: the published pages
 * (the long catalogue texts) of the targets that have them, one file per
 * locale at `urlTemplate` (`{locale}`), measured against the file the
 * default locale gets. Absent from the component when no target has a page,
 * and a phone that does not know it ignores it.
 *
 * `document` is `{ json, count }` (`targetKnowledgeBundleDocument`).
 */
export async function targetKnowledgePackPart({ document, urlTemplate }) {
  if (!document?.count) return null;
  return {
    urlTemplate,
    count: document.count,
    estimatedBytes: Buffer.byteLength(document.json, "utf8"),
    estimatedEncodedBytes: (await gzipAsync(document.json)).length,
  };
}

/**
 * The size of one locale's catalogue index: its `pages` pages
 * (`pageJson(page)`, the serialized JSON text), summed as they are served and
 * gzipped. The live manifest measures the default locale; the pack builder
 * measures every locale it writes (`sizesByLocale`, see
 * `targetIndexSizesByLocale`).
 */
export async function targetIndexPageSizes(pages, pageJson) {
  let estimatedBytes = 0;
  let estimatedEncodedBytes = 0;
  for (let page = 0; page < pages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const json = await pageJson(page);
    estimatedBytes += Buffer.byteLength(json, "utf8");
    // eslint-disable-next-line no-await-in-loop
    estimatedEncodedBytes += (await gzipAsync(json)).length;
  }
  return { estimatedBytes, estimatedEncodedBytes };
}

/**
 * The size of the catalogue index of each of `locales`, keyed by tag:
 * `{ fr: { estimatedBytes, estimatedEncodedBytes } }` — the target-index
 * component's optional `sizesByLocale` (a pack holds one index per locale,
 * and a language's names make its index a little larger or smaller).
 * `pageJson(locale, page)` returns that page's serialized JSON text.
 */
export async function targetIndexSizesByLocale({ locales, pages, pageJson }) {
  const sizes = {};
  for (const locale of locales)
    // eslint-disable-next-line no-await-in-loop
    sizes[locale] = await targetIndexPageSizes(pages, (page) =>
      pageJson(locale, page),
    );
  return sizes;
}
