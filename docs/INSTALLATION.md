# Installation and configuration

To run Astro Portal on your own server — the sign-in, a service that starts
with the machine, backups and updates — follow
[SELF_HOSTING.md](SELF_HOSTING.md).

For the one-command Docker installation, start with `sh deploy/install.sh` in
the cloned checkout: [Install in one command](SELF_HOSTING.md#install-in-one-command).
Windows uses WSL. The instructions below are for running directly with Node.js.

## Requirements

- Node.js 24.21.0 (the version of `.nvmrc`);
- an image directory readable by the service account;
- a JSON metadata directory, writable only when the editor is used;
- optionally, Astrometry.net and suitable indexes (the HYG star catalog of the
  annotations installs itself, see below).

## Installation

```bash
git clone https://github.com/sqound/astro-portal.git
cd astro-portal
npm ci
npm run check
```

`npm run dev` starts Next.js in development mode on port 8787. For production,
build the application and start the bundled Node server:

```bash
npm run build
HOST=0.0.0.0 PORT=8787 npm start
```

The bundled server overwrites the internal client-address header with the
trusted TCP peer address. This is required for `/admin` access control. Do not
run `next start` directly when administration is enabled.

## Recommended layout

```text
/srv/astro-portal/
  app/                  Git repository
  images/               PNG, JPEG, WebP, SVG, and TIFF files
    presentation/
    progression/<target>/
  catalog/              one or more JSON files
    stellarium-previews/
  runtime/              WCS results and local indexes
```

Images may live elsewhere, including on an external volume. The `images`,
`catalog`, and `runtime` directories should not be committed to Git.

## Environment variables

| Variable                                         | Default                                     | Purpose                                                                                      |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `HOST`                                           | `0.0.0.0`                                   | Listen address                                                                               |
| `PORT`                                           | `8787`                                      | HTTP port                                                                                    |
| `ASTRO_PORTAL_IMAGES_DIR`                        | `examples/images`                           | Originals and previews                                                                       |
| `ASTRO_PORTAL_METADATA_DIR`                      | `examples/catalog`                          | JSON records                                                                                 |
| `ASTRO_PORTAL_RUNTIME_DIR`                       | `.astro-portal`                             | Generated runtime data                                                                       |
| `ASTRO_PORTAL_STELLARIUM_DIR`                    | `<catalog>/stellarium-previews`             | Sky maps                                                                                     |
| `ASTRO_PORTAL_REDACT_LOCATIONS`                  | `false`                                     | Removes locations and GPS from the public API                                                |
| `ASTRO_PORTAL_WEATHER_FALLBACK`                  | `met-norway`                                | Backup weather provider; `disabled` opts out                                                 |
| `ASTRO_PORTAL_MET_NORWAY_ENDPOINT`               | Locationforecast 2.0 `complete`             | MET Norway backup endpoint                                                                   |
| `ASTRO_PORTAL_MET_NORWAY_USER_AGENT`             | Astro Portal public repository identifier   | Required MET Norway client identification                                                    |
| `ASTRO_PORTAL_SKY_QUALITY_ENDPOINT`              | LightPollutionMap WMS                       | Sky-brightness WMS endpoint                                                                  |
| `ASTRO_PORTAL_SKY_QUALITY_LAYER`                 | `PostGIS:SB_2025_raw`                       | Modelled sky-brightness layer                                                                |
| `ASTRO_PORTAL_SKY_QUALITY_SAMPLE_RADIUS_DEGREES` | `0.005`                                     | Radius around the rounded observing place                                                    |
| `ASTRO_PORTAL_SKY_TILE_MIRROR`                   | on                                          | `off` removes the offline pack's sky-backdrop component (HiPS tile mirror)                   |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`               | `<runtime>/sky-tiles`                       | HiPS tile mirror disk cache (tiles, archives, `properties`)                                  |
| `ASTRO_PORTAL_SKY_CUTOUT_DIR`                    | `<runtime>/sky-cutouts`                     | Disk cache of the complete sky cutouts (`GET /v1/sky-cutout`)                                |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`         | `4294967296` (4 GiB)                        | HiPS tile mirror cache cap; LRU-evicted once exceeded                                        |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY`       | `4`                                         | Concurrent CDS connections, shared by tiles and archives, every mirrored root                |
| `ASTRO_PORTAL_TARGET_FIELD_IMAGES`               | on                                          | `off` turns off the eyepiece view's field images (`/api/v1/targets/{id}/field-image`)        |
| `ASTRO_PORTAL_TARGET_FIELD_IMAGE_DIR`            | `<runtime>/target-field-images`             | Field images of the eyepiece view cut from DSS2, and the tiles they were cut from            |
| `ASTRO_PORTAL_UPSTREAM_USER_AGENT`               | Astro Portal public repository identifier   | HiPS tile mirror's identification to the CDS                                                 |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS`       | `5000`                                      | Per-attempt connect timeout before falling over to the next mirrored root                    |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`               | `20000`                                     | Per-attempt overall timeout (connect and body); see SKY_TILES_MIRROR.md                      |
| `ASTRO_PORTAL_ADMIN_ALLOWED_IPS`                 | empty                                       | IPs/CIDRs allowed in addition to localhost                                                   |
| `ASTRO_PORTAL_ASTROMETRY_INDEX_DIR`              | `<runtime>/astrometry/indexes`              | Astrometry.net indexes                                                                       |
| `ASTRO_PORTAL_HYG_CATALOG`                       | `<runtime>/astrometry/catalogs/hyg_v41.csv` | HYG v4.1 star catalog of the sky annotations (fetched at start when missing)                 |
| `ASTRO_PORTAL_HYG_DOWNLOAD`                      | on                                          | `off` keeps the server from fetching a missing star catalog                                  |
| `ASTRO_PORTAL_SOLVE_FIELD`                       | `solve-field`                               | Solver command                                                                               |
| `ASTRO_PORTAL_WCSINFO`                           | `wcsinfo`                                   | WCS reader command                                                                           |
| `ASTRO_PORTAL_PLOT_CONSTELLATIONS`               | `plot-constellations`                       | Extended-object catalog command                                                              |
| `ASTRO_PORTAL_SCALE_LOW/HIGH`                    | `0.8` / `4.5`                               | Search field width in degrees                                                                |
| `ASTRO_PORTAL_SOLVE_CPU_LIMIT`                   | `90`                                        | Per-solve CPU limit in seconds                                                               |
| `ASTRO_PORTAL_AUTH_MODE`                         | `disabled`                                  | `password` or `email-code` only when ready                                                   |
| `ASTRO_PORTAL_DATABASE_PATH`                     | none                                        | Private SQLite database (required by the sign-in)                                            |
| `ASTRO_PORTAL_SQLITE_LEASE`                      | on                                          | `off` lets a second process open the SQLite database                                         |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                  | none                                        | First-account secret, private and one-use                                                    |
| `ASTRO_PORTAL_SIGN_IN_KEY`                       | none                                        | Base64 32-byte private key of the sign-in (codes, locks, recovery codes)                     |
| `ASTRO_PORTAL_COOKIE_SECURE`                     | production default                          | Secure session cookies; `false` (private server of the local network only) allows plain http |
| `ASTRO_PORTAL_CAPTURES_DIR`                      | `<runtime>/captures`                        | Private, per-tenant original capture bytes (capture uploads), outside the database           |
| `ASTRO_PORTAL_STORAGE_QUOTA_BYTES`               | `0` (no allocation)                         | Total capture bytes a tenant may store; `0` refuses every upload                             |
| `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`            | `0` (no allocation)                         | Largest single capture file accepted; `0` refuses every upload                               |

Copy `.env.example` to `.env.local` for development. For a system service, use
an environment file readable only by the service account.

See [PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md) before enabling the
sign-in: it lists the settings of each mode (e-mail code with `smtp`, or
password).

## Star catalog (HYG)

The stars of the gallery's sky annotations come from the HYG v4.1 catalog,
© David Nash (astronexus.com), licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
(<https://github.com/astronexus/HYG-Database>); the annotations drawn from it
are an adaptation under the same licence. When `ASTRO_PORTAL_HYG_CATALOG` is
missing, the server fetches the file (34 MB) from that repository at a fixed
commit when it starts, checks its SHA-256 and keeps it where the setting
points. Set `ASTRO_PORTAL_HYG_DOWNLOAD=off` to place `hygdata_v41.csv` there
yourself (as `hyg_v41.csv`), or run `npm run install:hyg-catalog` before the
start. Without the file the annotations hold the catalog's objects only and
the viewer says so.

## Captures (`POST /v1/uploads`, `GET /v1/captures`)

A capture's original bytes are stored unchanged, outside the database, under
`ASTRO_PORTAL_CAPTURES_DIR` (default `<runtime>/captures`), in a
per-tenant, content-addressed layout —
`<captures>/<tenantId>/<sha256[0:2]>/<sha256[2:4]>/<sha256>` — never named
after the person's original filename. Nothing under this directory is served
by any route: a capture is always private to its tenant, with no public URL.

`ASTRO_PORTAL_STORAGE_QUOTA_BYTES` and `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`
are both `0` (no allocation, every upload refused with `409`) until set. This
is the setting a self-hoster uses to grant themselves storage on their own
disk.

## Image formats

The scanner recursively walks the image directory. Supported previews are PNG,
JPEG, WebP, AVIF, and SVG. TIFF files with the same basename in the same
directory are associated as full-resolution downloads. The portal does not
transform any of these files.

For a maintainable image library, place each target's final renders in a
directory named after its catalogue identifier, for example
`images/veil-nebula/`. Keep a preview and its TIFF download in that same
directory. Existing `assetBaseNames` associations continue to work after this
move as long as basenames remain unique; use `assetPaths` when two targets need
the same basename.

Keep related variants beneath that target as well: use `presentation/` for
presentation-curve renders, `intermediaire/` for shorter or partial
integrations, and `progression/` for the cumulative steps. This keeps one
target self-contained while the recursive scanner continues to discover every
variant.
