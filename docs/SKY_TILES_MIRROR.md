# Sky-tile mirror

The planner's photographic sky backdrop (HiPS tiles) is served from a cache
this instance keeps itself, in front of the CDS's own HiPS distribution,
rather than every client downloading tiles in bulk directly from the CDS. That is a deliberate decision, not an implementation detail: a portal is
self-hosted, so it is this instance's own bandwidth and this instance's own
politeness budget being spent, never the CDS's, once a tile has been fetched
once. Set `ASTRO_PORTAL_SKY_TILE_MIRROR=off` to disable the mirror entirely —
see [Licensing](#licensing) for why an instance would do that.

## Licensing

Three separate rights are in play, and this mirror does not resolve any of
them on an operator's behalf:

- The **HiPS tiling itself** (the pyramid of pre-cut, pre-projected images the
  CDS publishes) is distributed under the **ODbL-1.0** licence
  (Open Database License).
- The **DSS imagery** the tiles are cut from remains under its own copyright:
  **Caltech, AAO, SERC/PPARC, AURA**. The Digitized Sky Survey is not public
  domain.
- The **operator of this portal is responsible for how they use both.**
  Mirroring tiles for personal or small-group use is one thing; redistributing
  a packaged copy of the imagery to the public is a different question this
  document does not answer.

`ASTRO_PORTAL_SKY_TILE_MIRROR=off` is the lever for an instance that has not
settled that question: it removes the `sky-backdrop` component from
`GET /v1/offline-pack` entirely, and every route under `/api/v1/sky-tiles/`
answers `404`. Nothing else in the portal is affected.

The survey table (`packages/portal/src/sky-tiles/surveys.js`) keeps the tile
layer independent of any one survey: it carries the upstream URL, the
attribution string, the licence and the licence URL for whichever survey is
configured, so swapping to a differently-licensed survey later is a table
change, not a rewrite.

## Routes

```text
GET /api/v1/sky-tiles/{survey}/Norder{n}/Dir{d}/Npix{p}.{jpg|png}   one mirrored tile
GET /api/v1/sky-tiles/{survey}/Norder{n}/Chunk{c}/{pix}.tar         an aggregated archive
GET /api/v1/sky-tiles/{survey}/properties                          the survey's HiPS properties file
```

`{survey}` is resolved **only** against the server-side
`skyBackdropSurveys` table — never concatenated from the request — and
`[...path]` is fully validated by
`parseSkyTileRequestPath` (`packages/portal/src/sky-tiles/geometry.js`)
before anything touches the filesystem or the network: path traversal, an
order beyond the survey's `maxOrder`, a `pix` out of bounds for its order, a
`Dir` inconsistent with `pix`, an extension that does not match the survey's
own format, and a malformed archive address are all refused with `404`
`sky_tiles_path_invalid`, on the same model as
`packages/portal-app/src/routes/api/stellarium/milkyway/[...path]/route.js`'s
regex allowlist.

### Archive aggregation

One archive holds every tile of order `n` under one ancestor cell
`archiveChunkDelta` orders up (`4` by default): `4^archiveChunkDelta`
tiles, 256 of them for the default delta — the exact bytes that adds up to
depends on the order (see [Mean tile size by order](#mean-tile-size-by-order)
below: DSS colour tiles run bigger at deeper orders, from roughly 14 MiB per
256-tile archive at order 4 to roughly 24 MiB at order 6). The orders below
`archiveChunkDelta` (0..3 by default) do not each get their own per-order
archives; they are bundled into **one fixed, cumulative archive** instead
(1,020 tiles, ≈42.8 MiB for DSS colour — 44,856,832 B measured),
addressed through the same URL shape as every other archive by fixing
`order == chunkOrder == archiveChunkDelta - 1` and `chunkPix == 0` — for the
default delta of 4, that is `Norder3/Chunk3/0.tar`. This keeps a single,
uniform `archiveUrlTemplate` in the offline-pack manifest rather than a
special-cased URL for the low orders; a client that does not know about the
special case still resolves a working URL for it purely from
`archiveChunkDelta` and the general rule. The manifest additionally spells
this address out explicitly, additively, as `sky-backdrop.lowOrderArchive`
(`{ order, chunkOrder, chunkPix, tiles }`), for a client that would rather
read it than derive it.

Archive request/tile counts by cumulative max order (`archiveChunkDelta = 4`)
`standard` (additive) sits between `essential` and `comfort`:

| tier        | max order | tiles cumulative | archives | archive requests |
| ----------- | --------: | ---------------: | -------: | ---------------: |
| `essential` |         3 |            1,020 |        1 |                1 |
| `standard`  |         4 |            4,092 |       13 |               13 |
| `comfort`   |         5 |           16,380 |       61 |               61 |
| `quality`   |         6 |           65,532 |      253 |              253 |

### Mean tile size by order

**DSS colour-specific — these numbers do not generalize to another
survey.** A single flat "mean tile size" constant used to be documented,
measured once at whole-sky order 3. Filling the mirror for real, order by
order, showed that was wrong for anything deeper than order 3: **tile size
grows with order**, so that one constant badly understated `comfort` and
`quality`. `packages/portal/src/sky-tiles/surveys.js`'s
`dssColourMeanTileBytesByOrder` documents a mean **per order** instead:

| order | mean bytes/tile | how measured                              |
| ----: | --------------: | ----------------------------------------- |
|     0 |          48,467 | **exact** — full census, 12/12 tiles      |
|     1 |          43,093 | **exact** — full census, 48/48 tiles      |
|     2 |          41,740 | **exact** — full census, 192/192 tiles    |
|     3 |          43,507 | **exact** — full census, 768/768 tiles    |
|     4 |          54,519 | sampled — 150 of 3,072 tiles, fixed seed  |
|     5 |          75,403 | sampled — 150 of 12,288 tiles, fixed seed |
|     6 |          92,750 | sampled — 150 of 49,152 tiles, fixed seed |

All measured against the real CDS mirror (via
`alaskybis.cds.unistra.fr`, 4 concurrent connections). The order-0..3 census
came from filling the `essential` tier in full (1,020 tiles, 44,077,440 B of
real tile bytes, in 1 min 22 s); orders 4-6 came from a 150-tile random
sample per order (`prepare-sky-tile-pack.mjs --sample`, a fixed seed so a
re-measurement is reproducible and comparable) — not a full census, so the
true whole-sky mean could differ slightly. The densest sampled tiles, in
the Milky Way, ran 166-232 KiB — well above even order 6's own mean, so a
single device's real download can run higher than these means alone predict.
An order past this table (7+; none of today's tiers reach that far) has
never been measured — `dssColourMeanTileBytesForOrder` extrapolates the same
growth trend (order 5 → 6, ×1.230) rather than assuming flat.

Every tier's `estimatedBytes` (until it is `ready` — see
[below](#the-offline-pack-manifests-sky-backdrop-component)) is
Σ(tile count at order × that order's mean, for every order the tier
covers) **plus the real tar-archive overhead**: one 512-byte header and an
estimated half-block of padding per tile entry (image sizes land
effectively uniformly across the 512-byte boundary, so half a block is the
expected padding — confirmed against `Norder3/Chunk3/0.tar`'s own real
overhead, 779,392 B measured against 784,384 B this formula predicts, a
0.6% margin), plus one two-block end marker per archive file
(`tarArchiveOverheadBytes`, `packages/portal/src/sky-tiles/surveys.js`) —
never a flat percentage guess.

Resulting tier sizes (DSS colour, `archiveChunkDelta = 4`, from the table
above):

| tier        | max order | tiles cumulative | archives | estimated size        |
| ----------- | --------: | ---------------: | -------: | --------------------- |
| `essential` |         3 |            1,020 |        1 | ≈ 42.8 MiB            |
| `standard`  |         4 |            4,092 |       13 | ≈ 204.8 MiB (0.2 GiB) |
| `comfort`   |         5 |           16,380 |       61 | ≈ 1.07 GiB            |
| `quality`   |         6 |           65,532 |      253 | ≈ 5.35 GiB            |

Once a tier is actually `ready` (every archive it needs built), its
advertised size stops being an estimate at all — see
[below](#the-offline-pack-manifests-sky-backdrop-component).

### Integrity

Every binary response — a tile, an archive, or `properties` — carries a
strong `ETag: "sha256-<hex>"` (the sha-256 of the exact response body) and a
`Content-Length`; a matching `If-None-Match` answers `304`. There is no fixed
checksum list, since an archive can be built lazily on first request: the
digest is always computed against the actual bytes on disk. A client that
downloads a tile or an archive should verify its own sha-256 against the
`ETag` it received.

Responses are streamed off disk (`ReadableStream` over a `fs.ReadStream`),
never buffered whole in memory — an archive can be tens of megabytes.

### Cache-Control

A HiPS tile is immutable — the survey's own guarantee, one `Npix` at one
order is the same picture forever — so tiles and archives are served
`Cache-Control: public, max-age=31536000, immutable` and are **never
revalidated** against the upstream once cached. `properties` is the one
exception: it can legitimately change over time, so it is revalidated every
30 days (`public, max-age=2592000`) and a stale upstream falls back to
serving the last good copy rather than failing outright.

### Archive-building protocol (`503`)

Building a cold archive takes real time: at the CDS's own ~0.9 s round trip
and this mirror's default politeness of 4 concurrent connections, a 256-tile
archive is roughly a minute and the 1,020-tile low-order archive roughly four
minutes. Nothing in this mirror ever blocks a request on that.

The **first** request for an archive not yet on disk starts building it in
the background (single-flight per archive — a second, third, … concurrent
request for the same archive never starts a second build) and answers as
soon as the build knows which of its tiles are already on disk (at most one
second later; a `stat` per tile):

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 37
Content-Type: application/json

{ "error": { "code": "sky_tiles_archive_building", "message": "…" },
  "code": "sky_tiles_archive_building", "retryAfterSeconds": 37,
  "done": 84, "total": 256,
  "progress": { "done": 84, "total": 256, "upstreamRemaining": 160 } }
```

`code`, `retryAfterSeconds`, `done` and `total` repeat, at the top of the
body, what the envelope and `progress` say: that is where a client reads them. `Retry-After` counts only the tiles that really
have to come from the CDS (`upstreamRemaining`), queued behind the tiles of
every build started before this one, at the pace the CDS has actually shown
in this process (a moving average once eight tiles have been fetched, 0.9 s
per tile per connection before that), plus about 10 ms per tile for the
tiles already on disk. An archive whose tiles are all cached — a build
resumed after a restart, since the tiles fetched before it are kept — is
announced in seconds, not in minutes.

Every request while the build is in progress gets the same answer, with
`progress` and `Retry-After` updated to the live state — never a tight loop,
never a second build. A build lost to a restart or to the service going to
sleep leaves its tiles, and at worst an empty `.part` file, which the next
build ignores and replaces. Once the archive is complete on disk it answers `200`
like any other archive. If the upstream survey fails durably while building,
the mirror answers `503` `sky_tiles_upstream_unavailable` with a
`Retry-After` cooldown instead of restarting immediately.

A tile that is not yet cached is fetched inline (no `building` state for a
single tile — a tile fetch is one request, not thousands); a durably failing
upstream answers the same `sky_tiles_upstream_unavailable`.

An archive is always built from tiles already in the mirror's cache when
they are there: browsing the map (which fetches individual tiles) and then
downloading an archive never re-fetches what browsing already cached.

## Politeness towards the CDS

Everything here is configuration, not a hard-coded constant:

- **A single, process-wide semaphore**, shared by every tile fetch and every
  archive build — `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY` (default `4`).
  An archive under construction never opens more sockets to the CDS than this
  limit allows, no matter how many tiles it still needs; a tile request and
  an archive build compete for the same budget.
- **A self-identifying `User-Agent`**:
  `astro-portal/<version> (self-hosted HiPS mirror; +<this project's public
repository>)` by default, overridable with `ASTRO_PORTAL_UPSTREAM_USER_AGENT`.
  Never a personal address by default.
- **Bounded exponential backoff** on `429` and `5xx` upstream responses (a
  handful of attempts, capped delay), and a per-request upstream timeout.
  Never an unbounded retry loop: a durable failure is reported to the caller
  as `503` with a `Retry-After`, not retried forever server-side.
- Tiles are **never revalidated** once cached (see
  [Cache-Control](#cache-control) above) — the single biggest reduction in
  outbound requests this mirror makes, since the CDS is asked for a given
  `Npix` exactly once, ever, per instance.

## Mirrored upstream roots

**Why a list of roots.** The CDS's primary HiPS host,
`alasky.cds.unistra.fr`, once stopped accepting connections at all — not a slow or
erroring response, a TCP connect that never completed. Before this section's
fix, every tile request still paid the full single-host retry loop (four
attempts at a 15 s timeout each, plus backoff) before answering `503`: tens of
seconds for one tile. `alaskybis.cds.unistra.fr`, the CDS's own backup
instance, answered the exact same path in about a second throughout.

A survey's table entry (`packages/portal/src/sky-tiles/surveys.js`) now
carries an ordered `upstreamRoots` list instead of a single root, tried in
turn until one answers:

```js
upstreamRoot: "https://alasky.cds.unistra.fr/DSS/DSSColor/", // kept: upstreamRoots[0]
upstreamRoots: [
  "https://alasky.cds.unistra.fr/DSS/DSSColor/",
  "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
  "https://skies.esac.esa.int/DSSColor/", // ESASky, the last resort
],
```

`upstreamRoot` is kept, always equal to `upstreamRoots[0]`, for a reader
(or a schema version) that predates the list; `upstreamRoots` was added to
`GET /v1/offline-pack` and to
[its schema](../packages/astro-contracts/schemas/api/offline-pack.schema.json)
additively, alongside it, never replacing it.

**How the mirror is confirmed, and one honest gap.** Fetching
`https://alaskybis.cds.unistra.fr/DSS/DSSColor/properties` by hand
returns a `properties` file for the identical HiPS survey
(`creator_did = ivo://CDS/P/DSS2/color`, matching `hips_order`, `hips_frame`,
`hips_tile_width`, `hips_check_code`) at the exact same path — the same
verification was repeated for DSS2 Red (`DSS/DSS2Merged/`) and for CTA-FRAM
(`fzu.cz/fzu.cz_P_CTA-FRAM_survey_color/`), both used by the planner (see
below). None of these files actually fill in an active `hips_service_url`
field to _announce_ the mirror relationship — every one the CDS serves has it
present but commented out, as a template (`#hips_service_url = ex:
http://yourHipsServer/…`). So this was confirmed by directly comparing served
content at the identical path rather than by that field, which is the
stronger of the two anyway; a network capable of reaching both hosts should
re-verify this periodically, since nothing enforces that a mirror stays a
mirror forever.

**ESASky, the last resort for `dss-colour`.** On 2026-10-29 neither CDS
host accepted a connection for hours while ESA's ESASky mirror of the same
HiPS answered. Its `properties`
(`https://skies.esac.esa.int/DSSColor/properties`, read that day) declares
`creator_did = ivo://CDS/P/DSS2/color`, `hips_order = 9`,
`hips_tile_width = 512`, `hips_tile_format = jpeg` and
`hips_frame = equatorial`: the same tiles at the same paths. It is slower
(about 7 s a request), so it comes last; the breakers above skip the two
dead CDS hosts after their first three failures, and every tile after that
goes straight to ESASky.

**The DSS2 red survey (`dss2-red`) has no third root.** The visual mode's
survey (`CDS/P/DSS2/red`, `DSS/DSS2Merged/` on both CDS hosts, JPEG, order 9,
512 px tiles, the same attribution and licences as the colour survey) is in
the table too, for the sky cutouts (see [Sky cutouts](#sky-cutouts)). ESASky
has no copy of it (`https://skies.esac.esa.int/DSS2Merged/properties`
answered `404` on 2026-10-29), so while both CDS hosts are down only the
tiles already in this mirror's cache are served. It is never part of the
offline pack: the pack's `sky-backdrop` names `defaultSkyBackdropSurveyId`
(`dss-colour`) alone, and nothing iterates over the whole table.

**No wide-field survey is mirrored.** CTA-FRAM (the planner's wide-field
survey) stays out of this table: its terms of redistribution are not
settled, and the cutouts never need it.

**Two independent timeouts**, both configurable, because a host that never
answers at all and a host that connects but stalls mid-response call for
different budgets:

| Variable                                   | Default | Purpose                                                                                  |
| ------------------------------------------ | ------: | ---------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS` |  `5000` | How long one attempt waits for _any_ response at all before giving up on that root       |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`         | `20000` | The same attempt's overall budget, connect **and** body — a host that answers but stalls |

Only the connect timeout applies to the unreachable-host failure mode (nothing ever
answers), which is why it is the short one: a root that does not respond
within it is treated as a **connection failure** and the next configured root
is tried immediately, without the same-host backoff described below.

**A `429`/`5xx` response is not a connection failure.** A host that answers,
even with an error, has proven itself reachable — this repository's existing
bounded exponential backoff against the _same_ host (a handful of attempts,
capped delay) is unchanged and still applies before that host is given up on
(design doc §5's "Backoff on 429/5xx stays per host" is a deliberate
requirement, not an oversight). Only once that host's own retries are
exhausted, or it never answered at all, does the mirror move to the next
root. A permanent (non-`429`/`5xx`) HTTP status stops the search immediately
rather than trying another root — every mirror serves the exact same bytes at
the exact same path (see [Integrity](#integrity)), so a resource one root
does not have will not appear at another one either.

**A per-host circuit breaker**, private to one running mirror instance
(module-scope state, the same lifetime as the concurrency semaphore and the
archive/build maps above), so a request never pays a dead host's connect
timeout more than necessary:

- After **3 consecutive connection failures** against one host (an origin —
  scheme, hostname and port — not a whole survey; two surveys mirrored on the
  same CDS host share one breaker), that host is skipped outright — no
  network attempt at all — for a cooldown.
- The cooldown starts at **60 s** and **doubles on every further failure**
  once it has reopened, bounded at **15 min** — "1 → 15 min".
- **Any success closes the breaker fully** and resets the cooldown back to
  60 s, including the first attempt tried right after a cooldown expires.
- A `429`/`5xx` response does not count against this breaker (see above); a
  thrown network error (refused, reset, DNS failure, TLS failure) does,
  exactly like a timeout.

**The politeness budget stays shared, not per-host.** The single, process-wide
concurrency semaphore above still bounds every upstream connection this
mirror opens, combined across every configured root — a survey with two
mirrors never doubles the load it puts on the CDS as a whole.

**Worst-case latency, with the documented defaults** (the figures below
count the two CDS roots; for `dss-colour` a request that finds both dead
then goes on to ESASky, which adds its own answer time, about 7 s):

- **The unreachable-host failure mode** (a root that never answers at all): one
  connect timeout per dead root before the next is tried —
  `2 × 5 s = 10 s` the first time a request hits a newly-dead primary, and,
  once the breaker has opened after three such requests, effectively **0 s**
  extra for every request after that (the primary is skipped outright). This
  replaces the old single-host worst case of roughly `4 × 15 s` (attempts)
  `+ 2.1 s` (backoff) ≈ **62 s** for one tile.
- **Every configured root down at once** answers `503`
  `sky_tiles_upstream_unavailable` (with a `Retry-After`) in at most
  `2 × 5 s = 10 s`, never the old worst case above.
- **A host that answers but persistently `5xx`s** is unaffected by this
  change and keeps its pre-existing, unbounded-in-principle-but-attempt-capped
  worst case (`4` attempts × up to `20 s` each + ≈`2.1 s` backoff ≈ `82 s`,
  per such host) — a materially different failure mode (the host is up) from
  the one this section fixes, called out here only for completeness.

Every one of the timeouts, the breaker's three constants and the retry
policy is injectable in `createSkyTileMirror(...)`, and
`packages/portal/tests/sky-tiles-mirror.test.mjs` exercises all of the above
— a refused connection, a connection that hangs past its timeout, the
breaker opening, closing again after a simulated recovery, every root down,
and the shared concurrency cap — against real local sockets, never the CDS,
with every delay injected so the whole suite runs in milliseconds.

## Disk cache

```text
<mirror dir>/
├── tiles/<surveyId>/Norder{n}/Dir{d}/Npix{p}.{ext}
├── archives/<surveyId>/Norder{n}/Chunk{c}/{pix}.tar
├── properties/<surveyId>/properties
├── stats/<surveyId>.json          observed mean tile size PER ORDER, for the manifest
└── archive-index/<surveyId>.json  { archive path -> exact size }, so a `ready` tier's
                                   real size is one small read, not one `stat` per archive
```

Both `stats/<surveyId>.json` and `archive-index/<surveyId>.json` are shared,
mutable state a portal process and the `prepare:sky-tile-pack` CLI can both
be writing to at once, over the same directory — safely: every write reads
the file fresh immediately beforehand and merges its own delta in (one more
tile's bytes; one more archive's size) rather than overwriting it with
whatever this process's own, necessarily partial, in-memory view happens to
be, and the write is atomic (a `.part` sibling, renamed into place). Before
this, `stats/<surveyId>.json` was a single global `{ count, totalBytes }`
overwritten wholesale on every write: a `prepare:sky-tile-pack` run counting
1,016 tiles, followed by a live server process counting a mere 115 of its
own, would have the server's own write **replace** the script's total
outright — exactly the incident this format change fixes. Both files still
read an OLDER, incompatible shape without error (a lone `{ count,
totalBytes }` for stats, or an unrecognized shape for the archive index) —
simply ignored, starting fresh, never a crash.

The directory follows the same resolution order as this portal's other
generated-data directories (`ASTRO_PORTAL_SERVICE_DIR` →
`ASTRO_PORTAL_RUNTIME_DIR`, see `packages/portal/src/planner/sky-quality.server.js`
and [STATIC_DATA.md](STATIC_DATA.md)): `<runtime>/sky-tiles` by default,
overridable directly with `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`.

- **Capped, LRU-evicted.** `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES` (default
  4 GiB) bounds the _whole_ cache, tiles and archives together; once over
  budget, the least-recently-touched files are removed first, down to 90% of
  the cap. **This default is a real commitment on a small host**: filling the
  "quality" tier for one device is ≈5.35 GiB (DSS colour — see
  [Mean tile size by order](#mean-tile-size-by-order); a portal serving
  `quality` at all needs to raise this default) and 65,532 files — a
  Raspberry Pi with a small SD card will fill up silently without raising
  this, or without an administrator ever running `prepare:sky-tile-pack`
  past the tier they intend to actually offer. The archives of a tier being
  [prepared in the background](#preparing-a-tier-in-the-background) are
  never evicted while the task lives, nor the tiles of an archive being
  built; a tier that could not fit under the cap is refused rather than
  started.
- **Atomic writes.** Every file is written to a `.part` sibling and renamed
  into place only once complete, so a reader never observes a half-written
  tile or archive.
- **Crash-safe.** An orphaned `.part` file — a leftover from a process that
  died mid-write — is silently ignored and removed the next time that exact
  path is requested again; it is never served and never blocks a fresh fetch.

## Pre-filling the cache

An administrator can fill the mirror ahead of any device asking, so the
first real request gets an immediate `200` instead of paying for the CDS's
own latency:

```bash
npm run prepare:sky-tile-pack -- --survey dss-colour --max-order 3 \
  [--mirror-dir <dir>] [--concurrency <n>] [--sample <n>]
```

It uses the exact same mirror module a live request would — the same
semaphore, the same backoff, the same `User-Agent` — so it is no more
demanding of the CDS than ordinary traffic would be over the same number of
tiles. It is fully resumable: every tile and every archive it asks for is
checked on disk first, exactly as a live request is, so re-running the same
command after an interruption picks up where it left off rather than
starting over. `--max-order` must be at least `archiveChunkDelta - 1` (`3` by
default): the low-order archive is a single, indivisible unit, and any
`--max-order` below it would silently over-fetch beyond what was asked for
rather than build something meaningful.

Measured against the real CDS mirror, at 4 concurrent connections: filling `essential` in full (orders 0-3, 1,020 tiles) took
1 min 22 s.

`--sample <n>`, added alongside the per-order mean table
([above](#mean-tile-size-by-order)): for every order strictly above
`--max-order` (up to the survey's own `maxOrder`), fetches `n` tiles chosen
with a **fixed seed** — the same `(order, tile count, n)` always samples the
same pixels, so a re-measurement months later is directly comparable to this
one — to measure their mean size **without building an archive** for that
order. This is exactly how orders 4-6's own entries in
`dssColourMeanTileBytesByOrder` were first measured, by hand, before this
option existed; sampled tiles still land in the ordinary disk cache (and so
still count towards `observedMeanTileBytes`'s own per-order threshold) —
"no archive" is not "no cache".

The script prints per-order progress (tiles fetched vs. already cached,
bytes, mean bytes/tile against the documented per-order table) as it fills
the tile cache, then builds every archive the requested tier needs, then
(with `--sample`) the sampled orders beyond it, and finishes with a summary
of total tiles, bytes, duration, the EXACT combined size of every archive
file it just built, and — for every tier this run's own measurements reach —
the size that implies: exact for a tier now fully built, an estimate
(this run's own observed means, `--sample`'s if given, the documented table
beyond that) otherwise.

## Preparing a tier in the background

A mirror that is empty builds an archive only when a client asks for it —
about a minute each from the CDS — and stops as soon as nobody asks. A client
downloading a tier therefore waits on one `503 sky_tiles_archive_building`
after another, and nothing is built while nobody is connected.
`POST /v1/offline-pack/sky-backdrop/tiers/{tier}/prepare`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-backdrop/tiers/[tier]/prepare/route.js`,
the task itself in `packages/portal/src/sky-tiles/prepare.js`) starts a task
that builds every archive the tier lacks, one after the other, in the order a
client downloads them; `GET` on the same path reports its progress
(`archives.ready` of `archives.total`, the archive in progress with its
tiles, the time left, the state). The request and response formats are in
[the API reference](../packages/astro-contracts/schemas/api/v1.md#sky-backdrop-preparation);
what follows is how it behaves.

- **One task at a time, for the whole service.** A request for a tier the
  running task covers (tiers are cumulative) joins it; a larger tier is
  queued and starts by itself. Nothing about a task is written to disk:
  after a restart, `GET` reads what is on disk (the archive
  index; the tiles of an interrupted archive are found again and not
  fetched twice), says `idle`, and the next `POST` resumes.
- **Direct requests keep priority.** The task goes through the same
  connection limit (`ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY`) and host
  breakers as every other fetch, and requests only a few tiles ahead of the
  one it is appending (`backgroundBuildWindow`, twice the concurrency), so
  an archive a client asks for directly — whose tiles are requested all at
  once — is built ahead of the task's own, not behind the rest of the task's
  archive (`packages/portal/tests/sky-tiles-prepare.test.mjs` pins this
  against a fake CDS).
- **No tight loop, ever.** A CDS that does not answer puts the task in
  `waiting` (`upstream_unavailable`): first retry after 30 s, then 60 s,
  doubling up to 5 min, never before the host breaker allows a connection;
  `nextAttemptAt` says when. A tile the CDS refuses for good ends the task
  in `failed` until the next `POST`. Timers do not keep the process alive.
- **The size cap.** A tier whose archives (estimated from the per-order tile
  sizes) plus the tiles of the archive being built exceed 90 % of
  `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES` is refused with `409
sky_backdrop_tier_exceeds_mirror_limit`: it would evict its own archives
  as it went and never finish. With the default 4 GiB, `quality` (≈5.8 GB of
  archives, ≈6.4 GiB of cap needed) is refused; `comfort` (≈1.2 GB) is not.
  While a task lives its tier's archives are protected from the eviction;
  the tiles of archives already built go first. The manifest says the same
  beforehand — `unavailable: true` on a tier that is not built and would be
  refused — by the same function (`packages/portal/src/sky-tiles/tier-fit.js`), never a second
  copy of the arithmetic.
- **Polling.** The client reads the state every `retryAfterSeconds` (15 s
  while running), and at the latest once a minute, and asks again if the
  service was restarted meanwhile.

## The offline-pack manifest's `sky-backdrop` component

`GET /v1/offline-pack` (see
[the API reference](../packages/astro-contracts/schemas/api/v1.md#offline-pack-manifest),
or [OFFLINE_PACKS.md](OFFLINE_PACKS.md) for the full manifest format, the
licensing conditions on this component, and how to fold an already-built
mirror into a self-built pack)
describes what this mirror could serve — survey metadata, URL templates,
tiers and their sizes — without this instance ever having built anything.
Several fields are **observed**, not declared:

- `meanTileBytesByOrder` (additive) is a mean bytes/tile **per HEALPix
  order** — the documented per-order constant
  (`dssColourMeanTileBytesByOrder`, [above](#mean-tile-size-by-order)) until
  the mirror has itself fetched enough tiles AT THAT ORDER from the real
  upstream to trust its own observed mean instead, order by order
  (`minimumObservedTilesForMean` tiles seen at that exact order). Every
  tier's `estimatedBytes` still not `exactBytes` is computed from this
  table, order by order, plus the real tar-archive overhead — never
  `tiles * meanTileBytes` against one flat average, which is what made the
  original `comfort`/`quality` estimates badly understate reality once
  measured. `meanTileBytes` (singular) is kept for a reader that predates
  this table: the tile-count-weighted mean over the `essential` tier's own
  orders (0..3) alone.
- Each tier's `state` (`ready` or `on-demand`) reflects whether _every_
  archive that tier is made of already exists in this mirror's cache. A tier
  flips to `ready` exactly when `prepare:sky-tile-pack` (or organic traffic)
  has finished building it, and the manifest's own `ETag` changes exactly
  when that state changes and stays stable otherwise — never on a generation
  timestamp.
- Each tier's `archives` (additive) is `{ ready, total }`: how many of its
  archives the mirror has and how many it needs, counted from the archive
  index (`mirror.tierArchiveProgress`) — one small file read, never a walk of
  the disk. The manifest's `ETag` changes with it, archive by archive, and
  stays stable while nothing is built. Archives sitting on disk without an
  index entry are looked for
  once per process and tier, in the background, and counted from then on.
  `prepareUrlTemplate` (additive) names the
  [background preparation](#preparing-a-tier-in-the-background) route.
- Once a tier is `ready`, its `estimatedBytes` stops being an estimate at
  all: it becomes the **exact** combined size of that tier's real archive
  files on disk, flagged additively with `exactBytes: true` so a client
  knows the number is no longer a projection. Computing that exact total
  would mean `stat`-ing every archive a tier is made of (up to 253 of them,
  today) on every single manifest request; instead, the mirror keeps a
  small on-disk index (`archive-index/<surveyId>.json`, see
  [Disk cache](#disk-cache)) that a `ready` tier's exact size is read from
  in one small file read, self-healing itself from a real `stat` sweep the
  one time it does not yet cover every archive a tier needs (an older
  mirror version's archives, or ones copied in directly).

## Sky cutouts

```text
GET /api/v1/sky-cutout?survey=dss-colour|dss2-red&ra={deg}&dec={deg}&fov={deg}
```

A 640 px square JPEG of a mirrored survey around (`ra`, `dec`), `fov`
degrees on a side: the TAN projection hips2fits makes, north up and east
left, cut by the portal itself (`packages/portal/src/sky-cutout/service.js`,
with `hipsCutout` of `packages/portal/src/target-field-image/cutout.js`) from
the tiles of this mirror, fetched through `ensureTile` like any other tile.
The cutouts therefore share the mirror's cache, its upstream roots (ESASky
last for `dss-colour`), its breakers and its politeness budget. The pixels
are the tiles' own: no tone curve. The target sheet's « Prévisualiser » cuts
its sky from here (photo: `dss-colour` at the photo's field; visual:
`dss2-red` at the eyepiece's true field).

- `survey` is `dss-colour` (the default) or `dss2-red`; `ra` from 0 to 360,
  `dec` from −90 to 90, `fov` from 0.02 to 20; anything else answers `400`
  `sky_cutout_request_invalid`.
- The cache key is quantised: the field to three significant digits, the
  centre to the power of ten at or under one output pixel.
- A **complete** cutout (every tile it needed was had) is kept on disk under
  `ASTRO_PORTAL_SKY_CUTOUT_DIR` (`<runtime>/sky-cutouts`) and served
  `public, max-age=31536000, immutable` with a strong `ETag`.
- A **partial** cutout (a tile the mirror could not have) is served with
  `public, max-age=60` and never kept.
- **No tile at all** answers `503` `sky_cutout_unavailable` with
  `Retry-After`.
- A `dss2-red` cutout with no tile at all (its CDS hosts down and nothing
  cached) falls back on `dss-colour`, served `public, max-age=300`.
- `X-Sky-Cutout-Survey` names the survey actually served,
  `X-Sky-Cutout-Complete` says `true` or `false`.
- `ASTRO_PORTAL_SKY_TILE_MIRROR=off` turns this route off too (`404`
  `sky_cutout_disabled`).

The cutouts' directory is not under the mirror's byte budget; a cutout is
about 100 KB.

## Shared HEALPix geometry

`packages/portal/src/sky-tiles/geometry.js` is the one place the mirror's
HEALPix NESTED-scheme arithmetic lives — the ancestor shift used to climb the
pixel quadtree, and the `Dir{d}` bucketing a HiPS tree groups tiles under.
Both are pinned by a shared fixture
(`packages/astro-contracts/fixtures/healpix-ancestor.json`), so that any other
implementation of the same arithmetic can be checked against the same values.

## Environment variables

| Variable                                   | Default                                                                               | Purpose                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_SKY_TILE_MIRROR`             | on                                                                                    | `off` disables the mirror and removes `sky-backdrop` from the offline-pack manifest                     |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`         | `<runtime>/sky-tiles`                                                                 | Disk cache directory (tiles, archives, properties, per-order observed-size stats, archive index)        |
| `ASTRO_PORTAL_SKY_CUTOUT_DIR`              | `<runtime>/sky-cutouts`                                                               | Disk cache of the complete sky cutouts (see [Sky cutouts](#sky-cutouts))                                |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`   | `4294967296` (4 GiB)                                                                  | Cache size cap; LRU-evicted once exceeded, archives included                                            |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY` | `4`                                                                                   | Process-wide concurrent upstream connections, shared by tiles and archives, every configured root       |
| `ASTRO_PORTAL_UPSTREAM_USER_AGENT`         | `astro-portal/1.0 (self-hosted HiPS mirror; +https://github.com/sqound/astro-portal)` | Identification sent to the upstream survey                                                              |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS` | `5000`                                                                                | Per-attempt connect timeout before falling over to the next `upstreamRoots` entry                       |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`         | `20000`                                                                               | Per-attempt overall timeout, connect and body — see [Mirrored upstream roots](#mirrored-upstream-roots) |

See also [docs/INSTALLATION.md](INSTALLATION.md) for these alongside every
other portal environment variable.
