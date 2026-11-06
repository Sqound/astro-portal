/**
 * The download origin of the heavy files: when
 * `ASTRO_PORTAL_DOWNLOAD_ORIGIN` names one (for example
 * `https://downloads.example`), the offline pack's manifest gives the
 * absolute address of its files there. That origin is a cache in front of
 * this service: it asks the service for the same paths (with the header
 * `x-astro-download-proxy`), and those requests are served here as usual.
 *
 * What moves: the pack's files (sky quality, base map, solve catalogue, each
 * with its component's revision in the query so that a new revision is a new
 * address), the shards of the catalogue texts (`target-texts`, about forty
 * megabytes a language, addressed by the same revision), the units of the
 * spoken reading (`read-aloud`, addressed by the hash of their content) and
 * its language manifests, the sky tiles and their archives.
 * What stays here: the manifest itself, the catalogue pages and the published
 * pages (they change with the catalogue and are small).
 *
 * Unset (the default, every self-hosted portal), nothing changes.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The configured origin (`https://host[:port]`), or null. */
export function downloadOrigin(env = process.env) {
  const raw = String(env.ASTRO_PORTAL_DOWNLOAD_ORIGIN ?? "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `ASTRO_PORTAL_DOWNLOAD_ORIGIN is not an address: ${JSON.stringify(raw)}`,
    );
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK.has(url.hostname));
  if (!secure || url.pathname !== "/" || url.search || url.hash)
    throw new Error(
      "ASTRO_PORTAL_DOWNLOAD_ORIGIN must be an https origin without a path (http only on a loopback address).",
    );
  return url.origin;
}

/** `/v1/…` (a manifest URL) as an absolute address on `origin`. */
function absolute(origin, url, revision) {
  if (typeof url !== "string" || !url.startsWith("/v1/")) return url;
  const target = `${origin}/api${url}`;
  if (!revision) return target;
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}rev=${encodeURIComponent(revision)}`;
}

/**
 * The manifest with its heavy files on `origin`. Pure: returns a new object.
 * Template placeholders (`{order}`, `{pix}`…) are kept as they are.
 */
export function withDownloadOrigin(manifest, origin) {
  if (!origin || !manifest || !Array.isArray(manifest.components))
    return manifest;
  return {
    ...manifest,
    components: manifest.components.map((component) => {
      const next = { ...component };
      if (Array.isArray(component.files))
        next.files = component.files.map((file) => ({
          ...file,
          url: absolute(origin, file.url, component.revision),
        }));
      if (component.id === "target-texts" && component.urlTemplate)
        // One address per shard, all under the component's revision: a text
        // that changes is a new revision, so no cached shard is ever stale.
        next.urlTemplate = absolute(
          origin,
          component.urlTemplate,
          component.revision,
        );
      if (component.id === "read-aloud" && component.urlTemplate) {
        // A unit's address holds the hash of its content, so it never
        // changes (the worker caches it for a month without a revision); a
        // language manifest is addressed by its own digest.
        next.urlTemplate = absolute(origin, component.urlTemplate);
        next.locales = Object.fromEntries(
          Object.entries(component.locales ?? {}).map(([locale, entry]) => [
            locale,
            entry?.manifest?.url
              ? {
                  ...entry,
                  manifest: {
                    ...entry.manifest,
                    url: absolute(
                      origin,
                      entry.manifest.url,
                      entry.manifest.checksum,
                    ),
                  },
                }
              : entry,
          ]),
        );
      }
      if (component.id === "sky-backdrop") {
        // The survey's tiles never change at the same address.
        for (const key of ["archiveUrlTemplate", "tileUrlTemplate"])
          if (component[key]) next[key] = absolute(origin, component[key]);
      }
      return next;
    }),
  };
}

/** The manifest's ETag once rewritten: another origin, another ETag. */
export function downloadOriginEtag(etag, origin) {
  if (!origin || !etag) return etag;
  let hash = 0;
  for (const character of origin)
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  const suffix = `-dl${(hash >>> 0).toString(36)}`;
  return etag.endsWith('"') ? `${etag.slice(0, -1)}${suffix}"` : etag + suffix;
}
