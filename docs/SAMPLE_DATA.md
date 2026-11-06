# Sample data

An Astro Portal can be filled with a real demonstration set: a few observing
nights made with one small telescope, with their field journal, debriefing,
analyses, captures, equipment, plans and framings, so that the gallery, the
journal and the debriefing show something. The
place of the shots is deliberately not the place of the shots (see
[What the anonymisation leaves](#what-the-anonymisation-leaves)).

- **Licence**: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
  (CC BY 4.0), for the records and for the images. The code of the repository is
  under AGPL-3.0; a software licence does not suit images and journals.
- **Attribution**: « PlanAstro » (the product, never the name of a person).
- Tools: `scripts/sample-data/export.mjs`, `verify.mjs` and `install.mjs`
  (npm scripts `sample:export`, `sample:verify`, `sample:install`). ESM, no
  dependency beyond the repository's own.

The sample holds **only what the portal itself declares and serves**: database
records and processed images (JPEG or PNG). It holds no FITS file and no raw
log of an acquisition program.

## With the one-command installer

`sh deploy/install.sh` offers this step by default after the owner's first
sign-in; `--no-sample` skips it, and `--yes` prints the command for later.
Until `sample/` and the pack are published, the step reports their absence in
one line and succeeds. From the checkout, after owner setup:

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" exec -T portal node deploy/install-sample.mjs
```

The helper runs `node scripts/sample-data/install.mjs --yes` inside the
container, with its database URL, `/data/images` and `/data/runtime/captures`.
It requires no npm in the distroless image. It preserves the existing installer
rules: an active owner, an empty space, all or nothing, size and SHA-256 checks.
Use your chosen data folder in place of the default above.

## The two artifacts

The tool produces two things, which live in different places:

1. **The records**: small JSON files, versioned in the code repository under
   `sample/`, read by hand before each commit. No image in them.
2. **The image pack**: `astro-portal-sample-images-v<N>.tar.gz` (ustar +
   gzip), with a `manifest.json` beside it, under `build/sample-data/` (ignored
   by git). It is published by the site, not by the repository.

The records refer to the images by their relative path inside the pack.

```text
sample/                                 (in the repository)
  manifest.json                         format, licence, counts, SHA-256 of every file
  LICENSE                               CC BY 4.0
  README.md                             what it is, how to install, that the place is imprecise
  records/
    equipment.json  known_locations.json  planner_contexts.json
    framings.json  plans.json  plan_items.json  plan_framings.json
    observation_sessions.json  session_events.json  session_supplements.json
    session_analyses.json  captures.json  capture_targets.json  capture_equipment.json
    target_media.json
    images.json                         which capture is which file of the pack

build/sample-data/                      (not in git; published by the site)
  astro-portal-sample-images-v1.tar.gz  the images: astro-portal-sample/session-NN/image-NNNN.jpg|png
  manifest.json                         { format, version, url, sizeBytes, sha256, license, attribution, files }
```

The records carry **no organization, no user and no membership**: the sample
has no account and no space of its own. Their `tenant_id` and
`created_by_user_id` columns hold two fixed placeholder ids that `install`
replaces by the space and the owner of the portal it installs into.

`target_media` holds records only (never files) and only for the licences the
export was told to allow (none by default): the images of the catalogue come
from surveys that are not under CC BY.

## Install

```bash
npm run sample:install -- --database <sqlite file | postgres url> --images-dir <images folder of the portal>
```

What it does, in this order:

1. Checks the records of `sample/` (the same rules as `verify`); damaged
   records stop everything.
2. Looks at the target **without writing**: finds the space of the portal's
   owner, checks that the portal holds no data yet.
3. Without `--pack`: reads the manifest of the image pack (by default
   `https://www.planastro.space/samples/astro-portal-sample/latest.json`),
   **shows version, size and SHA-256 and asks for your confirmation** (`--yes`
   skips the question; without a terminal and without `--yes` it refuses).
4. Downloads the archive, and **checks its size and its SHA-256 before extracting
   anything**.
5. Extracts with the tool's own strict tar reader (refuses a path that leaves the
   folder, links, devices, and any file the records do not list or whose bytes
   differ from their record), into `--images-dir`.
6. Writes the records in **one transaction**, in the space of the owner, and copies
   each image into the store of the captures of the core (`--captures-dir`;
   default: the portal's own, `ASTRO_PORTAL_CAPTURES_DIR`).

All or nothing: a failure at any step leaves no record, no image, no temporary
folder. `--records-only` writes the records without the images (for tests and
development) and says so.

### The portal must be set up first

A private portal is the space of one person, created at the first sign-in. The
sample goes **into that space**, so the portal must be set up (it has its
owner) before `install`:

- The installer detects the owner by itself; there is no option to name a space.
- **It never creates an account.** A sample account would close the bootstrap
  of a portal that is not set up yet. On a portal with no active owner (no
  database yet, no owner yet, or the owner disabled), `install` refuses **before
  downloading or writing anything** and says: _This portal is not set up yet …
  Set the portal up first (create the owner's account: open the portal and sign
  in for the first time), then run this command again. Nothing was installed._
- A portal that holds several spaces is refused (the sample is for a private
  portal of one person).
- A portal that already holds data (sessions, equipment, captures, plans, …) is
  refused: the sample goes into an empty space only.
- The records are the owner's: the plans and framings are marked as created by
  the owner. Nothing else about the account changes.

### Options

| Option                 | Meaning                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--database <target>`  | The SQLite file or `postgres://` URL of the portal (never printed).                                                    |
| `--images-dir <dir>`   | Where the pack is extracted (the portal's images folder, `ASTRO_PORTAL_IMAGES_DIR`). Required unless `--records-only`. |
| `--pack <archive>`     | A local archive instead of the site. The `manifest.json` beside it, when there is one, must match.                     |
| `--manifest-url <url>` | Another manifest than the default. `https` only (plain `http` only for this machine).                                  |
| `--yes`                | Skip the confirmation of the download.                                                                                 |
| `--records-only`       | Records without images.                                                                                                |
| `--captures-dir <dir>` | Store of the captures of the core (default: the portal's own).                                                         |
| `--records-dir <dir>`  | Records to install (default: `sample/`).                                                                               |

Exit code 0 when installed, 1 when refused or failed (nothing written), 2 for a
usage error. The version of the pack the manifest offers must be the one the
records ask for (`packVersion`).

## Visibility, checks, publications

- **Visibility travels.** A capture keeps its `visibility` (`private` or
  `public`): one that was public in the source portal is public once
  installed. Its two checks do not travel: the owner of a private server is
  its administrator.
- **No publications.** The publications of earlier versions are gone from the
  portal and from the tool; a public capture is the only thing a gallery
  shows.

## Prerequisite of the real set: the images are the captures of sessions

The image pack only holds images that are **captures of a session** — what the
portal declares and serves for a session. Images that are only files of the old
gallery, or media of the catalogue, have no `captures` row and are not part of
the sample. To produce the real set, the sessions of the instrument must first
exist in a portal as sessions with their captures: import them with Astro Sync
into a private portal, then export from that portal.

## Produce a set: `export`

```bash
node scripts/sample-data/export.mjs --database <sqlite file | postgres url> \
  (--sessions <id,id…> | --equipment "<name>" [--from <date>] [--to <date>]) \
  --captures-dir <dir> [--images-dir <dir>] \
  --forbid "<a word>" --forbid "<another>" --forbid-near <lat>,<lon>,<km>
```

The source is opened **read-only**. Options:

| Option                                   | Meaning                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--sessions <id,…>`                      | Explicit sessions. Excludes the filters below.                                                                                         |
| `--equipment "<name>"`, `--from`, `--to` | Sessions that used this instrument, between these dates (`YYYY-MM-DD`). The filters combine.                                           |
| `--tenant <space id>`                    | Restricts to one space (the selection must not span several).                                                                          |
| `--captures-dir`, `--images-dir`         | Folders searched for the bytes of the captures; equivalent and repeatable. A file is a capture when its SHA-256 is the one of the row. |
| `--forbid <word>`                        | A word that must appear **nowhere** (repeatable; case- and accent-insensitive; never written anywhere). A hit stops the export.        |
| `--forbid-near <lat>,<lon>,<km>`         | Refuses any coordinate within that distance of the point (never stored).                                                               |
| `--allow-urls`                           | Lifts the rule against URLs in free text (only that one).                                                                              |
| `--allow-media-licence <regex>`          | Keeps the `target_media` records whose licence matches (repeatable; default none).                                                     |
| `--with-session-documents`               | Keeps the metrics and event documents of the sessions, as text (excluded by default).                                                  |
| `--records-out`, `--pack-out`            | Default `sample/` and `build/sample-data/`.                                                                                            |
| `--pack-version <n>`, `--pack-url <url>` | Version of the pack (default 1) and the address written in its manifest (the site fills it).                                           |
| `--date <YYYY-MM-DD>`, `--replace`       | Date written in the manifests; overwrite an existing set.                                                                              |

The export prints the rows per table, the number of images, and **counts of
what it changed or left out** (never the values), then runs `verify` on its own
output. The pack must stay under 200 MB.

## Check a set: `verify`

```bash
node scripts/sample-data/verify.mjs [<records dir>] [--pack <archive>] \
  [--forbid <word>]… [--forbid-near <lat>,<lon>,<km>]
```

`verify` is independent of how the set was made: it replays every rule on the
records and, with `--pack`, on the archive and the images. It prints a readable
report (where and which rule, never the value) and exits with 0 when nothing is
found, 1 otherwise, 2 for a usage error. Run it with the words and the point of
the real site before every commit of `sample/`.

## The rules of the anonymisation

A whitelist, not a blacklist: a table or a column that is not written in
`scripts/sample-data/lib/constants.mjs` cannot travel.

- **One place.** Every place (known places, planner context, coordinates of a
  session or a plan) becomes « Alpes-Maritimes (France) », 43.9 N 7.1 E,
  elevation 500 m, no time zone (a place without a time zone: the night is
  computed from the longitude). Horizon profiles are left out. The nights of
  the plans are recomputed for that place.
- **No account, no space, no device.** Users, organizations, memberships,
  devices, tokens, audit events, plan versions: never exported.
- **Images.** A whitelist too: a JPEG keeps only the segments needed to display
  it (headers, tables, scans), a PNG only its critical chunks and the ones that
  change how the pixels look. EXIF, XMP, IPTC, comments, extra pictures, text
  chunks, the modification time, trailing data and any block the tool does not
  know are removed. The **pixels are copied byte for byte** (no recompression).
  Only JPEG and PNG captures travel; the others are excluded with what depends
  on them, and counted.
- **Names and identifiers.** Files are renamed by a stable pattern
  (`session-01/image-0001.jpg`), identifiers are renumbered deterministically,
  slugs regenerated, any identifier the sample does not carry becomes a stable
  placeholder. The same selection gives the same files, byte for byte, from SQLite
  and from PostgreSQL. No file time is kept.
- **Free text** (notes, titles, descriptions, payloads): kept, but a forbidden word
  (`--forbid`), a coordinate, an altitude and azimuth, a path, an e-mail address,
  a network address or a URL **stops the export**, naming the table and the
  column. Nothing is silently edited.

## What the anonymisation leaves

The tool cannot remove what makes the set useful, and it cannot judge prose or
pictures. Honestly:

- **UTC times and the pointings (RA/Dec) stay.** They are what the analysers and
  the debriefing read. They do not give a site: with them alone, the site can only
  be placed within some **hundreds of kilometres, up to about a thousand** (the
  season and the duration of the night constrain the latitude, the UTC time of the
  dusk the longitude, with an uncertainty of the hour at which the observer
  started). This is an order of magnitude, not a measurement.
- **The label says the department.** « Alpes-Maritimes (France) » is public by
  decision: an area about 100 km across. The data do not narrow it further; the
  label itself is what is disclosed.
- **The pixels are not looked at.** A landscape at the edge of a frame, a
  caption or a date burned into the picture, a watermark: none of that is
  detected. **Look at every image** before publishing.
- **Prose is only as clean as the words you gave.** `--forbid` catches the names
  you list (the commune, the street, a nickname); a description of a place that
  uses none of them (« the terrace behind the church ») is not caught. Read the
  notes.
- **Values measured on the sky remain** (guiding and seeing statistics,
  temperatures, remarks on the weather). They say little more than a weather
  forecast for a region.
- **The same instrument**: the attribution « PlanAstro » and the instrument
  name are public by choice.

## For maintainers: publishing the pack

`install` reads, by default, `https://www.planastro.space/samples/astro-portal-sample/latest.json`
(constant `DEFAULT_MANIFEST_URL` in `scripts/sample-data/lib/constants.mjs`,
overridable with `--manifest-url`). The site must serve at that address the
`manifest.json` produced next to the archive under `build/sample-data/`, **with
its `url` filled in**:

```json
{
  "format": "astro-portal-sample-images",
  "version": 1,
  "url": "https://www.planastro.space/samples/astro-portal-sample/astro-portal-sample-images-v1.tar.gz",
  "sizeBytes": 123456789,
  "sha256": "<64 hex digits, as produced>",
  "license": { "id": "CC-BY-4.0", "name": "…", "url": "…" },
  "attribution": "PlanAstro",
  "files": [ … ]
}
```

- `version` must equal the `packVersion` of the records of the checkout
  (`sample/manifest.json`); a new pack means a new version, and new records.
- `url` is absolute `https` (or relative to the manifest's address); redirects are
  followed. `sizeBytes` and `sha256` are the ones `export` printed, and the
  installer compares both to what it downloads.
- Deposit the archive at that address, next to `latest.json`, under
  `/samples/astro-portal-sample/`. The archive may also be hosted elsewhere
  (any `https` address, for example a release asset): put that address in
  `url`, keeping `latest.json` where the installer reads it.
- `export --pack-url <url>` writes the address into the manifest at export time;
  otherwise fill `url` by hand. Nothing else in the manifest should be edited.
- Publish the archive **before** the records that ask for its version are
  released, and check with `install --manifest-url` on a set-up portal.
