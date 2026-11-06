# Offline packs

A client application can work fully offline: a device downloads an
**offline pack** once — the compact catalogue index, an optional
light-pollution raster, and an optional photographic sky backdrop — and the
planner then runs on that local copy with no network at all.

A private open-source portal serves the manifest and the files contained in
its static data through the routes described below. See
[Adding packs to a private portal](#adding-packs-to-a-private-portal).

Everything in this document is read from the implementation: the manifest
route (`packages/portal-app/src/routes/api/v1/offline-pack/route.js`,
`packages/portal-app/src/lib/offline-pack.server.js`), the component builders
(`packages/portal/src/offline-pack/manifest.js`, `target-index.js`,
`sky-quality.js`, `sky-backdrop.js`, `target-texts.js`), the sky-quality file
routes
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`),
the sky-tiles routes and mirror (`packages/portal/src/sky-tiles/`) and the
JSON Schema contract
(`packages/astro-contracts/schemas/api/offline-pack.schema.json`). The formal
request/response reference for every route mentioned here — including refusal
codes this document does not repeat — is
[`packages/astro-contracts/schemas/api/v1.md`](../packages/astro-contracts/schemas/api/v1.md#offline-pack-manifest).

## The manifest

`GET /v1/offline-pack` answers one JSON document describing what **this**
portal instance can currently serve for an offline pack — components,
revisions, sizes and URL templates — in one round trip. Nothing here is
personal to a device or a user: a guest is served exactly like an
authenticated one.

```json
{
  "v": 1,
  "catalogue": {
    "revision": "…",
    "targets": 14386,
    "locales": ["en", "fr", "ja"]
  },
  "components": [/* target-index, sky-quality, sky-backdrop */]
}
```

- `v` — the manifest notation's own version (currently `1`), independent of
  the target-index notation's own `v`.
- `catalogue.revision` — identical to `GET /v1/target-index`'s own
  `revision`: an opaque identifier for the loaded catalogue. A reader walking
  the whole index page by page compares it between pages; an import landing
  mid-walk changes it, so pages from two different revisions must never be
  stitched together.
- `catalogue.targets` / `catalogue.locales` — the catalogue's total row count
  and the instance's supported locales: the shipped locales of the locale
  registry (`packages/astro-contracts/src/locales.ts`) unless the instance's
  configuration narrows them. The pack holds one catalogue index per locale
  listed here (see [One index per language](#one-index-per-language)).
- `components` — an array of independent, self-contained units. **A
  component the portal cannot currently serve (no light-pollution pack
  raster prepared, the HiPS tile mirror disabled) is simply absent from the
  array, never present with an "unavailable" flag.** `component.kind` is
  open-ended: a reader dispatches on `id`/`kind` it recognizes and silently
  ignores one it does not, which is what lets a new component ship without a
  client release. A portal predating this route answers `404` — the whole
  negotiation a client needs.

### Caching

`GET /v1/offline-pack` answers a strong `ETag` — the SHA-256 digest of the
serialized manifest, base64url-encoded and truncated to 27 characters,
deliberately excluding any generation timestamp so the document is stable
when nothing it describes actually changed. Send it back as `If-None-Match`
to get a `304` with no body. `Cache-Control: public, max-age=60`.

Building the `target-index` component walks every catalogue page to size
it. The portal keeps each component in memory and in
`<runtime>/offline-pack/manifest-cache.json`, under what that component is
computed from and nothing else: the catalogue index under the catalogue's
fingerprint (the size and modification time of its source files, the
static-data documents' stamp, the catalogue database's state row — read
without loading the catalogue), the sky-quality component under its raster
files' identity and checksums. The `sky-backdrop` component is described
again on every request from the mirror's small index files, so the tiles
the mirror fetches for a client never invalidate the catalogue index. A
process that starts again over the same data answers its first manifest
without reading a single catalogue page. The file is a cache: deleting it
only costs one computation.

A component that has to be computed again (the catalogue changed) is
computed once, in the background, in slices that leave the event loop free;
concurrent requests share it. A request
waits for it at most `ASTRO_PORTAL_OFFLINE_PACK_WAIT_MS` (default 2000),
then gets the last manifest this portal knows — its sky backdrop always
current, only the component being computed as it last was — with
`Cache-Control: no-cache` and `X-Offline-Pack-Freshness: stale`
(`fresh` otherwise). Only a portal that has never computed a manifest
answers `503` with `Retry-After` (the last computation's duration, 5 to
120 s) and `offline_pack_preparing`, in the error envelope and at the top of
the body. To make that answer rare, a service asks itself for
its manifest once it is ready, in the background (asked again after each
`Retry-After`, each attempt in the log; never in development;
`ASTRO_PORTAL_OFFLINE_PACK_WARMUP=off` disables it), so that the
first client after a restart finds it kept or already being computed. It is
not part of the warm-up before ready: the first computation waits for the
import of every stored text (some 350 MB, minutes on the production data) and a
revision that waited for it would be given up by the platform's readiness probe.
A client that asks meanwhile gets the `503` above, never a manifest computed
from texts half imported. A
client reads that `503` as a wait — « the service is preparing its offline
data, trying again in N s » — and `404` alone as « this service offers no
offline data ».

## Components

### `target-index` (`kind: "index-pages"`) — always present

The compact catalogue index, walked page by page in designation order —
`GET /v1/target-index`'s own columnar notation
(`packages/astro-contracts/schemas/api/target-index.schema.json`), never
individually translated per row.

| Field                   | Meaning                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `revision`              | Identical to `catalogue.revision` and to a page's own `revision`.          |
| `pageSize`              | `1000` (`targetIndexMaximumPageSize`).                                     |
| `pages`                 | `ceil(catalogue.targets / pageSize)`.                                      |
| `estimatedBytes`        | The real, serialized size of every page, summed — measured, not typed.     |
| `estimatedEncodedBytes` | The same pages, gzipped — always smaller, a columnar page compresses well. |
| `urlTemplate`           | `{locale}`/`{offset}` placeholders; see below.                             |
| `sizesByLocale`         | Optional: `{ <locale>: { estimatedBytes, estimatedEncodedBytes } }`.       |
| `knowledge`             | Optional: the published pages of the targets that have them; see below.    |

The live route's `urlTemplate` is
`/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}`
— a client substitutes `{locale}` and `{offset}` (always a multiple of
`pageSize`) and walks `offset` from `0` up to `pages * pageSize`, merging rows
from every page that shares the same `revision`. A page's own envelope
(`fields`, `rows`, `types`, `constellations`, `attribution`) is exactly
`GET /v1/target-index`'s own response shape — see that schema for the column
list.

`estimatedBytes` and `estimatedEncodedBytes` measure one locale's index: the
instance's default locale on a live portal. `sizesByLocale`, every locale's
own measure, is left out by a live portal rather than walking the catalogue
once per language on every change.

**`knowledge`** (optional, absent when no target has a published page — the
long catalogue texts) rides with the index, so that the sheet of
those targets keeps its sections and its sources without a connection:
`{ urlTemplate, count, estimatedBytes, estimatedEncodedBytes }`. One JSON file
per locale at `urlTemplate` (`{locale}`; live portal
`/v1/offline-pack/target-knowledge/{locale}`), `{ v, locale, count, targets:
{ <targetId>: knowledge } }`, each knowledge being what
`GET /v1/targets/{targetId}` answers for that target in that locale. The sizes
are those of the default locale's file. A client that does not know the field
ignores it. Only the pages of tiers A and B travel in
the pack (a few hundred targets, small enough to be included whatever the
pack's options); tier C's pages (about 15 000 targets, about 37 MB of text per
language) are served online only (`isOfflinePackPagesResearch`), so that
offline a tier C target shows what the device already holds. The pages of tier
A come from the `target_texts` table like those of tier B (they left
`catalogue.json` for the shards), so this file is the same whichever of the two
places holds a page; the optional component below carries the full pages of
every tier.

The base file carries the lede of each target (and the pages a portal still
sends whole); the full pages of every tier come with the optional component
[`target-texts`](#target-texts-kind-text-shards--optional).

#### One index per language

The index carries the catalogue's words in one language — the type and
constellation labels of `types`/`constellations`, the localized names — so a
pack holds one index per locale of `catalogue.locales`, and a client
downloads one: the language of its interface (the registry's tag, such as
`zh-Hans` or `pt-BR`, never the bare language code). A client whose language
the pack has no index for — an older pack, or a service that does not build
that language yet — downloads the **English** index instead (the same rule as
a target's knowledge text, `packages/portal/src/locale-content.js`). It never
stores an English index under another language's name.

### `target-texts` (`kind: "text-shards"`) — optional

« Textes complets du catalogue »: the full pages of
the targets, with their sources and the children's text, for a device that
wants to read them without a network. A language's texts are about forty
megabytes (`docs/STATIC_DATA.md`, tiers B and C), so the base data never
includes them: a client asks for them separately, in its own language. A
portal that does not list the component offers no such download.

| Field         | Meaning                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `required`    | Always `false`.                                                                                                                 |
| `revision`    | A digest of every language's shard revisions.                                                                                   |
| `urlTemplate` | `{locale}`/`{shard}` placeholders: live portal `/v1/offline-pack/target-texts/{locale}/{shard}.json`.                           |
| `locales`     | `{ <locale>: [{ shard, bytes, sha256, revision, count }] }`, the shard index of the service (`target-texts-index.schema.json`). |

**What a portal lists**. The component is built from the shards
actually present in the static-data package's `target-library/texts/` folder
(`docs/STATIC_DATA.md`), by `packages/portal/src/offline-pack/target-texts.js`
and `packages/portal-app/src/lib/target-texts-pack.server.js`:

- the languages are the **shipped locales of the locale registry**
  (`astro-contracts/locales`), in its order — never a list typed in the code;
  a language the index holds and the registry does not ship is not listed, one
  the registry ships and the index has no shard for is not listed either;
- a shard is listed with the `bytes`, `sha256`, `revision` and `count` of the
  folder's `index.json`, **if its file is there with the size the index says**;
  a file that is absent or cut short (a copy in progress) is left out, and the
  component with it when no shard of any language is left. No folder, no index,
  an index that is not one: the component is simply absent from the manifest,
  never an error (the rule of every optional component);
- `revision` is a digest of the listed shards' revisions and digests
  (16 hexadecimal digits): it moves whenever any listed shard changes;
- what is kept between two requests is the index's identity and each
  language folder's modification time (a handful of `stat`s, no read of the
  index nor of a shard), looked at again every 30 s whatever they say.

`GET /v1/offline-pack/target-texts/{locale}/{shard}.json` serves a listed shard
like the other pack files: guest access, `ETag: "sha256-<hex>"` (the digest the
manifest states, and a client checks), `304` on `If-None-Match`, one byte
range honoured (`206`/`416`), `Cache-Control: no-transform`
(`packFileResponse`). Only a shipped locale and three digits are taken from the
path, and the file is the one the index names for that pair; anything else, a
shard the index does not list or whose file is not there with the right size,
is the v1 `404` `offline_pack_target_texts_not_found`.

Through the download host (`ASTRO_PORTAL_DOWNLOAD_ORIGIN`) the shards — about
forty megabytes a language — are the heaviest download there is, so the
manifest gives `urlTemplate` as an absolute address on that host with the
component's `revision` in the query (`…/target-texts/{locale}/{shard}.json?rev=…`):
a text that changes is a new revision, hence a new address, and a cached shard
is never stale.

A client downloads the shards of its own language only (a language the
component does not list is « not offered », never replaced by another). Each
shard is `target-texts-shard.schema.json` — `{ v, locale, shard, revision,
entries }`, `entries` being `{ id, revision, tier, lede, page?, children? }` —
and is checked against its `sha256` and its `bytes`. A shard whose `revision`
is already held does not need to be downloaded again. `story` and
`storyParagraphs` are not stored in a shard: they are derived from the
sections on reading (`docs/STATIC_DATA.md`, « Deriving `story` and
`storyParagraphs` »).

### `sky-quality` (`kind: "file-set"`) — present only when a pack raster exists

The downloadable, coarse (6′) derivation of the installed light-pollution
raster used for the planner's Bortle/SQM estimate — see
[SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md) for how the source composite
is prepared. Absent when there is neither a source raster installed nor a
previously derived pack raster on disk.

| Field            | Meaning                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `revision`       | `sha256:<hex>` of the raster's own bytes — recomputed against the actual file, never a fixed list. |
| `estimatedBytes` | The raster's real byte length (3,600 × 1,800 = 6,480,000 B at 6′).                                 |
| `files`          | Two entries, `manifest.json` and `raster.bin` (see below).                                         |
| `attribution`    | The pack raster's own `manifest.json.attribution`, or `null`.                                      |
| `license`        | The pack raster's own `manifest.json.license`, or `null`.                                          |
| `year`           | The pack raster's own `manifest.json.year`, or `null`.                                             |

The two files are served by
`GET /v1/offline-pack/sky-quality/manifest.json` and `.../raster.bin`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`, a strict
whitelist of exactly those two names):

- `manifest.json` — `ETag: "sha256-<hex>"` (the file's own bytes), `304` on a
  matching `If-None-Match`.
- `raster.bin` — `ETag: "sha256-<hex>"`, taken from the pack manifest's own
  `checksum` field (falling back to hashing the bytes on the spot only if
  that field is missing). Served identity by default; when the client sends
  `Accept-Encoding: gzip`, a precomputed `raster.bin.gz` sitting next to it is
  served instead with `Content-Encoding: gzip` and the **same** `ETag` (the
  digest is always of the uncompressed bytes, so a client can verify
  integrity after decoding regardless of which encoding it received);
  `Vary: Accept-Encoding` is always set.

### `sky-backdrop` (`kind: "hips-tiles"`) — present unless the tile mirror is disabled

The whole-sky photographic backdrop, mirrored from a HiPS survey (DSS2
colour by default) in cumulative quality tiers — see
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md) for the mirror itself.
`ASTRO_PORTAL_SKY_TILE_MIRROR=off` removes this component entirely (the lever
for an instance that has not settled the survey's redistribution question —
see [Licences and attribution](#licences-and-attribution)).

| Field                  | Meaning                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `survey`               | `{ id, hipsId, format, tileWidth, maxOrder, frame, attribution, license, licenseUrl, imageryCopyright, upstreamRoot, upstreamRoots }`.                                                                                                           |
| `meanTileBytes`        | Kept for a reader that predates `meanTileBytesByOrder`: the tile-count-weighted mean over the lowest tier's own orders (0..3).                                                                                                                   |
| `meanTileBytesByOrder` | Mean bytes/tile per HEALPix order (tile size grows with order); observed from the mirror's own real fetches once enough exist, the documented constants (`dssColourMeanTileBytesByOrder`, `packages/portal/src/sky-tiles/surveys.js`) otherwise. |
| `archiveChunkDelta`    | `4` — one archive at order `N ≥ archiveChunkDelta` aggregates every tile under one ancestor cell `archiveChunkDelta` orders up.                                                                                                                  |
| `archiveUrlTemplate`   | `{survey}`/`{order}`/`{chunkOrder}`/`{chunkPix}` placeholders — the unit a device actually downloads.                                                                                                                                            |
| `tileUrlTemplate`      | `{survey}`/`{order}`/`{dir}`/`{pix}`/`{format}` placeholders — one mirrored tile, used outside the downloaded tiers (panning the live map).                                                                                                      |
| `tiers`                | Four cumulative levels, see below.                                                                                                                                                                                                               |
| `topUp`                | `{ maxOrderWide, maxOrderFocus, estimatedBytes }` — the fine top-up around plans, favorites and the extended catalogue (orders 7–8), estimated, not derived from a formula.                                                                      |
| `lowOrderArchive`      | `{ order, chunkOrder, chunkPix, tiles }` — the fixed orders-0..`archiveChunkDelta - 1` archive's own address (see below).                                                                                                                        |
| `prepareUrlTemplate`   | `{tier}` placeholder — where a client asks the portal to build a tier's missing archives itself, and reads how far it got (see below). Absent from a static pack.                                                                                |

#### Tiers (cumulative, never additive)

| Tier        | `maxOrder` | Archives |  Tiles |
| ----------- | ---------: | -------: | -----: |
| `essential` |          3 |        1 |  1,020 |
| `standard`  |          4 |       13 |  4,092 |
| `comfort`   |          5 |       61 | 16,380 |
| `quality`   |          6 |      253 | 65,532 |

(`archiveCumulativeCount`, `packages/portal/src/sky-tiles/surveys.js` — exact
counts, not estimates.)

`tiles` is the exact HEALPix cumulative count (Σ 12·4^k for k = 0..maxOrder);
`estimatedBytes` is that many tiles at `meanTileBytesByOrder`, plus the real
tar-archive overhead the number of archives involved actually pays
(`skyBackdropTiers`, `packages/portal/src/sky-tiles/surveys.js`) — **unless**
`state` is `"ready"` (every archive the tier needs already exists in the
mirror's own disk cache), in which case `estimatedBytes` is replaced by the
_exact_ combined size of those real files and `exactBytes: true` is added.
`state` is asked of the mirror on every manifest build
(`mirror.tierState`, `packages/portal/src/sky-tiles/mirror.js`) — it is never
declared ahead of what is actually on disk, and answering it never touches
the network, only the mirror's own local archive index.

Each tier also states `archives: { ready, total }` (additive): how many of
the archives it is made of the mirror already has, and how many it needs —
counted from that same index, so it is exact on every request, and `state`
is `ready` exactly when `ready` equals `total`. A mirror that is empty
builds an archive only when a client asks for it, about a minute each, so a
client that wants a whole tier asks the portal to prepare it
(`POST` the `prepareUrlTemplate` with the tier's `id`) and reads the same
route to show "12 parts ready out of 61"; see
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#preparing-a-tier-in-the-background)
and [the API reference](../packages/astro-contracts/schemas/api/v1.md#sky-backdrop-preparation).
The manifest itself is cached for a minute: progress is read from that
route, not from the manifest.

A tier the portal cannot provide — not built yet, and too big for the
mirror's size limit, the very rule of the `409`
`sky_backdrop_tier_exceeds_mirror_limit` (see
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#preparing-a-tier-in-the-background))
— says so beforehand with `unavailable: true` (additive, only ever `true`,
never on a `ready` tier), so that a client does not offer it and find out at
the request.

#### Unit addressing

A device downloads **archives**, not individual tiles: one `.tar` per unit,
extracted locally. Orders `0` through `archiveChunkDelta - 1` (`0..3` by
default) are small enough — 1,020 tiles, the whole `essential` tier — to ship
as a single fixed archive rather than one per order; `lowOrderArchive` names
its exact `(order, chunkOrder, chunkPix)` address so a reader does not have
to special-case it out of `archiveUrlTemplate`'s general placeholders (a
reader that predates this field falls back to the documented convention:
`order = chunkOrder = archiveChunkDelta - 1`, `chunkPix = 0`). From order
`archiveChunkDelta` on, one archive aggregates every tile of that order under
one ancestor cell `archiveChunkDelta` orders up (`4^4 = 256` tiles per
archive) — see `tierArchiveAddresses` in
`packages/portal/src/sky-tiles/geometry.js`.

`GET /v1/sky-tiles/{survey}/Norder{n}/Dir{d}/Npix{p}.{jpg|png}` (one tile),
`.../Norder{n}/Chunk{c}/{pix}.tar` (an archive) and `.../{survey}/properties`
(the survey's HiPS properties file) are the three routes this addressing
resolves to on a live portal — see
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#routes). Every binary response
there carries a strong `ETag: "sha256-<hex>"`; a tile or an archive is served
`Cache-Control: public, max-age=31536000, immutable` (content-addressed by
its own path, so it never needs revalidating), `properties` every 30 days
instead.

### `solve-catalogue` (`kind: "file-set"`) — optional

A deep star catalogue: the HYG v4.1 stars to magnitude 8.5, the whole sky, in
one binary file (`stars.bin`, about 0.75 MB). `required: false`; `revision`
and the file's `checksum` are digests of the bytes; `attribution` and
`license` credit the catalogue (David Nash, astronexus.com, CC BY-SA 4.0). A
portal lists it, and serves `GET /v1/offline-pack/solve-catalogue/stars.bin`
(ETag = the SHA-256 of the bytes, `Range` honoured), when
`<static data>/solve-catalogue/stars.bin` is installed. HYG v4.1 is
CC BY-SA 4.0: the converted file is an adaptation under the same licence.

### `camera-catalogue` (`kind: "file-set"`) — optional, asked for

The star catalogue of a telescope camera's plate solving (a guide camera
behind a 120 to 240 mm guide scope, CAM-3): Tycho-2 (VizieR I/259) and its
first supplement to V 11.5, the whole sky, about 1.5 million stars in one
zoned binary file (`stars.bin`, `PSTZ`, about 12 MB; 2° declination bands cut
into cells of about the same width, so the phone reads the cone around the
mount's position and never the whole file). `required: false`, and never part
of the base: the person asks for it from Settings › Offline data.
`revision` and the file's `checksum` are digests of the bytes; `stars`,
`magnitudeLimit` and `layout` describe it; `source` is the provenance written
by `scripts/build-camera-catalogue.mjs` (catalogue, download URL and date, the
SHA-256 of each source file). A portal lists it, and serves
`GET /v1/offline-pack/camera-catalogue/stars.bin` (ETag = the SHA-256 of the
bytes, `Range` honoured), when `<static data>/camera-catalogue/stars.bin` is
installed and its header matches its size. Generating and uploading it:
[STATIC_DATA.md § The camera star catalogue](STATIC_DATA.md#the-camera-star-catalogue-camera-catalogue).

### `read-aloud` (`kind: "audio-units"`) — optional, asked for

« Lecture à voix haute »: the paragraphs of the target pages, the
introductions and the guided evening, spoken once by a neural voice at
generation time (« Voix de synthèse neuronale HD »), one `.m4a` (HE-AAC
32 kbit/s mono) per paragraph, a « unit ». `required: false`, never part of
the base, absent while nothing is deposited. `locales` has, per language: the
voice (`voice`, `voiceVersion`), its `source`, `attribution` and `license`,
the totals `{ fiches, units, bytes }` of the three nested levels (`essential`
⊂ `extended` ⊂ `complete`; Essentiel ⊂ Étendu ⊂ Complet) and the address and
digest of the **language manifest**, which lists the fiches of each level and
their units `{ id, bytes, sha256, cues }` (`cues`: the start of each sentence,
in ms): hundreds of kilobytes a language, so it is not repeated in
`GET /v1/offline-pack` and a device fetches it when the person asks for a
level. A unit is `urlTemplate` with `{locale}`, `{voice}` (the
`voiceVersion`) and `{unit}` (its id) substituted. A unit's id is a hash of the
text, the language, the voice and the version, so a device that computes the
same ids finds its units without a table, downloads only the ones it lacks
(`absent` / `installed` / `update`), and resumes per unit.

Served by `GET /v1/offline-pack/read-aloud/{locale}/{voice}/manifest.json` and
`GET /v1/offline-pack/read-aloud/{locale}/{voice}/u/{id}.m4a` (`{voice}` is the
`voiceVersion`): guest access; the `ETag` is the SHA-256 of the bytes (the
digest the manifest states), `Range` is honoured, `Cache-Control: no-transform`
is set and a unit is `immutable` (its address holds its content's hash). The id
is whitelisted (`[0-9a-f]{32}`) and the language manifest must list it: anything
else is `404`. Behind a download host, units are addressed there without a
revision and the language manifest with its digest in `?rev=`. The contract
(layout, ids, manifest, publication order) is in
[STATIC_DATA.md § The spoken reading](STATIC_DATA.md#the-spoken-reading-read-aloud);
the schema is `read-aloud-manifest.schema.json`. A static pack
(`scripts/build-offline-pack.mjs`) does not carry this component yet.

## Resumable downloads

The file routes of this portal — `sky-quality/{manifest.json,raster.bin}` and
every `sky-tiles` tile, archive and `properties` file — honour one byte range:
`206` with `Content-Range` and `Accept-Ranges: bytes`, or `416` with
`Content-Range: bytes */<size>` for a range starting past the end, so that a
client can resume an interrupted download with `Range: bytes=<done>-` and
verify the digest of what it has received as it streams. A range always
addresses the **uncompressed** bytes the manifest describes, and a `206` is
never encoded; only a whole-file answer may be gzip (the raster's
precomputed `.gz`). Every file response carries `Cache-Control:
no-transform`, which keeps Next's own compression — and any proxy — from
re-encoding bytes whose size and digest the manifest already states. The
compact index pages (`GET /v1/target-index`) stay compressible and are not
ranged: they are small and fetched whole.

A plain static file server that ignores `Range` therefore stays correct, only
less efficient on a retry.

## Licences and attribution

Each component carries a different data licence — never assume one covers
another:

- **`target-index`** — whatever the loaded catalogue's own `attribution`
  says (`library.source`/`library.license`/`library.url`, carried through
  unchanged from `GET /v1/target-index`'s own envelope). For the static-data
  package's default seed, see the sources listed for the target library
  itself; only include catalogue data your own installation has the right to
  redistribute.
- **`sky-quality`** — derived from VIIRS Nighttime Lights (Earth Observation
  Group, Payne Institute for Public Policy, Colorado School of Mines),
  **Creative Commons Attribution 4.0 International**. EOG's own licence
  requires a specific attribution notice on every derived product — see
  [SKY_QUALITY_RASTER.md § Attribution](SKY_QUALITY_RASTER.md#attribution)
  for the exact wording, which is what the component's own `attribution`
  field carries. CC BY 4.0 permits redistribution with attribution: this
  component is safe to include in a publicly distributed pack as
  long as that attribution travels with it.
- **`sky-backdrop`** — the HiPS tiling itself is **ODbL-1.0**; the DSS
  imagery the tiles are cut from remains under its own copyright (Caltech,
  AAO, SERC/PPARC, AURA) and is **not** public domain. See
  [SKY_TILES_MIRROR.md § Licensing](SKY_TILES_MIRROR.md#licensing): mirroring
  tiles for personal or small-group use is one thing, redistributing a
  packaged copy of the imagery to the public is a different question that
  document does not answer on an operator's behalf. **Do not include this
  component in a pack you distribute beyond your own use without your own
  agreement with STScI/CDS covering that redistribution.** An instance that
  only ever serves the operator's own devices is a materially different case
  from publishing a downloadable pack to strangers.

- **`solve-catalogue`** — HYG v4.1, David Nash, astronexus.com,
  **CC BY-SA 4.0**; the converted file is an adaptation under the same
  licence.
- **`camera-catalogue`** — Tycho-2 Catalogue (Høg et al. 2000), ESA
  Hipparcos mission, **CC BY-NC 3.0 IGO** (the ReadMe of VizieR I/259). The
  ESA archives ask a written authorisation before any commercial use; it was
  asked on 04/11/2026, and the component's `license` says so (« autorisation
  commerciale demandée à l'ESA le 04/11/2026 »). Credit: ESA. Nothing of
  Tycho-2 is committed to this repository.

- **`read-aloud`** — the voice's provider and licence are those the language
  manifest states (`source`, `attribution`, `license`) and the app shows. The
  texts read are the portal's own pages; the audio is generated once by the
  operator and contains no data of any person. Nothing of it is committed to
  this repository.

## Adding packs to a private portal

Set `ASTRO_PORTAL_STATIC_DATA_DIR` to your static-data package
([STATIC_DATA.md](STATIC_DATA.md)). Its default is `<runtime>/../static-data`,
which is `/data/static-data` in the self-hosting image. Mount or copy your
licensed data there; no remote service is needed.

- `target-library/catalogue.json`: a valid exported catalogue seed provides
  the `target-index` pages. Each advertised locale and page is served by
  `GET /api/v1/target-index`.
- `sky-quality/pack/manifest.json` and `raster.bin`: provide the coarse
  raster component. A source `sky-quality/{manifest.json,raster.bin}` can
  also be installed; the portal derives the pack raster when requested.
  Without either raster, the component is absent.
- The sky backdrop uses the separate tile mirror and its existing on-disk
  cache (`ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`, [SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md)).
  `ASTRO_PORTAL_SKY_TILE_MIRROR=off` removes `sky-backdrop` from the manifest.
  Otherwise missing archives are built on demand; a demonstration refuses
  the preparation `POST` like every other write.

Read `GET /api/v1/offline-pack` to see what this instance actually offers.
Manifest paths use the API documentation's `/v1/…` shorthand: resolve them
under `/api/v1/…`, preserving their query and substituting each placeholder.
This includes every index page and the sky-quality manifest and raster files.
The same reads remain available with `ASTRO_PORTAL_DEMO=1`.

Keep the [licences and attribution](#licences-and-attribution) of each
component; installing data does not grant redistribution rights.
