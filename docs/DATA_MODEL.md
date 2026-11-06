# Data model

The directory configured by `ASTRO_PORTAL_METADATA_DIR` contains JSON files. A
file may describe one target or contain `{ "targets": [...] }`. The editor
preserves this organization when it updates an existing record.

## Associating images

The scanner groups extensions that share the same basename. A target then
claims files through:

- `assetBaseNames`: basenames without extensions;
- `assetPaths`: relative paths without extensions, useful when several
  directories contain identical names;
- `matchPatterns`: regular expressions applied to relative paths.

Explicit associations are preferred. Unclaimed images are not published.

## Target fields

| Field                  | Type    | Description                                      |
| ---------------------- | ------- | ------------------------------------------------ |
| `id`                   | string  | Lowercase, hyphenated URL identifier             |
| `title`                | string  | Target-page title                                |
| `category`             | string  | Deep sky, Solar, Planetary, and so on            |
| `objects`              | strings | Messier, NGC, IC identifiers and common names    |
| `tags`                 | strings | Filters offered in the gallery                   |
| `featuredBaseName`     | string  | Image used by the gallery card                   |
| `referenceBaseName`    | string  | Initial image on the target page                 |
| `hiddenBaseNames`      | strings | Scanned files that must never be displayed       |
| `skyTarget`            | object  | `type` and `constellation`                       |
| `acquisition`          | object  | Displayed label/value pairs                      |
| `processing`           | object  | `profile`, `pipeline`, `tools`, and related data |
| `description`          | strings | Context paragraphs                               |
| `technicalDescription` | strings | Technical paragraphs                             |
| `integrations`         | objects | Per-filter integration-table rows                |
| `assetMetadata`        | objects | Per-image overrides                              |
| `progressions`         | objects | Progression-step definitions                     |
| `moonObservationDates` | dates   | Dates used for Moon illumination calculations    |
| `stellarium`           | object  | Target, field, and Stellarium Web note           |
| `skyMap`               | object  | Sky-map file                                     |
| `plateSolveHints`      | object  | Optional solving hints                           |
| `skyQuality`           | object  | Optional precomputed Bortle/SQM estimate         |

## Per-image metadata

Each `assetMetadata` entry identifies a `baseName` and can override inferred
fields:

```json
{
  "baseName": "2026-01-15_M42_20x120s_presentation",
  "assetLabel": "Natural render — presentation curve",
  "variant": "Natural render — presentation curve",
  "renderFamily": "Natural render",
  "colorCurve": "presentation",
  "kind": "presentation",
  "date": "2026-01-15",
  "integration": "20 × 120 s",
  "totalSeconds": 2400,
  "acquisition": { "Filter": "Dual-band" },
  "sky": {
    "ra": 83.822,
    "dec": -5.391,
    "fieldWidth": 2.4,
    "fieldHeight": 1.5,
    "scale": 3.2,
    "orientation": 0
  }
}
```

`ra` and `dec` are expressed in degrees. Field dimensions and orientation are
also in degrees; `scale` is expressed in arcseconds per pixel.

## Precomputed sky quality

`skyQuality` is structured, non-localized metadata. It may live on a target or
an `assetMetadata` item and has this shape:

```json
{
  "bortleClass": 4,
  "sqm": 20.72,
  "source": "lightpollutionmap",
  "method": "viirs-modeled-zenith-sky-brightness",
  "estimated": true,
  "calculatedAt": "2026-01-01T00:00:00.000Z"
}
```

A private installation may keep a coordinate-free overlay, `sky-quality.json`,
alongside the catalogue: modelled SQM and Bortle estimates keyed by target and
basename, with their provenance. Catalogue detail pages read that overlay
locally and do not call a provider. The tool that builds it from a WMS layer is
not part of this repository.
Separately, the planner can request a live place estimate through
`/api/planner-sky-quality`; the server answers it from the installed
sky-quality raster (docs/SKY_QUALITY_RASTER.md), sends nothing to an outside
provider, rounds the place to three decimals for its cache and returns no
coordinates. Entries with no reliable
coordinate are omitted rather than guessed. Both uses are modelled guides,
not on-site SQM measurements.

## Integration

```json
{
  "filter": "Dual-band",
  "frames": 20,
  "seconds": 120,
  "totalSeconds": 2400
}
```

`totalSeconds` can represent an adjusted total when all frames do not have the
same exposure length. Otherwise it may equal `frames × seconds`.

## Progression

A progression step usually lives under `images/progression/<target>/` and has
an entry in `progressions`:

```json
{
  "baseName": "M42_progression_10x120s_natural",
  "progressionLabel": "Step 2",
  "progressionPeriod": "January 15, 2026, 21:00 → 21:20",
  "progressionFilter": "Dual-band",
  "renderFamily": "Natural render",
  "colorCurve": "raw",
  "integration": "10 × 120 s",
  "totalSeconds": 1200,
  "date": "2026-01-15"
}
```

The complete [examples/catalog/m42-demo.json](../examples/catalog/m42-demo.json)
file is the executable reference.

## Local deep-sky target library

The planner's OpenNGC/Barnard library is separate from the public capture
catalogue above. The private runtime JSON and its three image manifests seed a
shared SQLite table named `target_catalogue_entries`; the running portal reads
that structured table after the first synchronization. Each row contains the
stable source identifier, designation, aliases, common names, type,
constellation, J2000 RA/Dec, apparent size, magnitude, surface brightness,
catalogue references and the original source JSON.

Each target also stores two independent derived flags:
`visible_from_northern_hemisphere` and
`visible_from_southern_hemisphere`. They describe broad, practical coverage,
not the horizon at one observing site. A flag is set when the target culminates
at least 30° high from a reference latitude of 30° north or south. This makes
declinations from −30° to +30° visible from both hemispheres; more northern or
southern targets keep only the corresponding flag. The flags are recalculated
when a target's declination changes.

The catalogue’s optional seasonal filter is a discovery aid built from right
ascension, not a site-specific visibility promise. It selects targets that
typically culminate during the local evening of the chosen astronomical season.
Its season-to-right-ascension mapping is reversed for the southern hemisphere;
the planner remains the authoritative calculation for an exact date and site.

`target_media` keeps the three media variants independent, one row each for
`dss`, `premium` and `visual`. Each contains a local filename plus applicable
source, credit, licence and source URL metadata; the image bytes remain in the
private runtime directories. `target_collections` and
`target_collection_memberships` hold the two editorial selections, disjoint
(`essential`, `extended`: a target is in one of them at most), and the modes a
target of a selection is proposed in (`mode-visual`, `mode-photo`; a target of
a selection in neither is read as both). The compact rows read the modes from
the memberships (`selection_modes`, their bits); they have no column of their
own. The historical `dss_image_json`, `premium_image_json`,
`visual_image_json`, `is_best` and `is_extended` columns remain a
compatibility mirror. `target_catalogue_relation_state` records, besides the
normalization, the version of the default selections an instance took
(`target-selection-<version>`). `editorial_json` is
reserved for additional localized editorial content. `overrides_json` keeps
administrator changes to catalogue and media values when a later source
synchronization updates the stored source record.

The optional `editorial_json.catalogueResearch` profile is the source-linked
editorial layer for curated targets. English is its source language; the French
and Japanese paragraphs are translations of the same structured facts and
source-backed assertions, not independently gathered material. It contains
localized paragraphs, common names, catalogue-history context, angular
measurements, an explicitly labelled distance estimate when one can be derived
from a published radial velocity, and reference links. It never invents an
individual discovery date or a physical distance when the selected source does
not support one. A locally edited research profile is retained when the OpenNGC
source is synchronized again.

For the 500 extended targets, `editorial_json.observingGuide` may override a
derived observing aid: an indicative focal-length range and a minimum visual
aperture from 50 to 400 mm under dark skies. Until an override is saved, the
portal derives both from apparent size, integrated magnitude, surface
brightness and object class. The focal range is intentionally only a broad
sensor-dependent reference; the planner's configured sensor or eyepiece still
calculates the actual field and visual suitability for the selected equipment.

### Catalogue texts of tiers B and C and children's texts

`target_texts(target_id, locale, shard, tier, revision, content, updated_at)`,
primary key `(target_id, locale)`, holds the catalogue texts that do not fit in
the seed (`docs/STATIC_DATA.md`, “The `texts/` folder”): the published pages of
tiers A, B and C and the children's text of any tier, one row per target and
language. `content` is the JSON of the entry of the shard it came from (`id`,
`revision`, `tier`, `lede`, `page`, `children`; a tier A row written before the
pages of tier A were stored has `children` only, one written since has its page like the others;
`page` stores the sections, sources and note, `story` and `storyParagraphs` are
derived when the row is read), `revision` the entry's digest, `shard` the shard
it was imported from (so that a target that left its shard file is retired with it). The table has an
index on `(locale, shard)` and one on `(locale, tier)`; it has no foreign key to
`target_catalogue_entries`, because a shard may be imported before the
catalogue row exists. `target_text_shards(locale, shard, revision, targets,
imported_at)`, primary key `(locale, shard)`, records the revision of each
shard file as imported, so that an unchanged shard is never read again. Both
are created by migration 92, identical on SQLite and PostgreSQL. The service
fills them from the package one shard at a time and reads one row per target
and language; the offline pack never takes a tier C row.

**Where they live (migration 94).** Both tables hold only what the
service re-imports from the static data, so they stay out of the backups.
Under SQLite they live in a second database file next to the main one,
`<name>.texts.sqlite`, which the driver attaches to every connection under the
schema name `texts` and defines itself (`persistence/reimported-data.ts`);
queries name no schema (SQLite resolves an unqualified name in `main` first,
then in the attached files). Migration 94 drops the copies migration 92 made in
the main file; the attached file starts empty and the import fills it. A
missing or unreadable texts file is created again, empty, and filled the same
way. Under PostgreSQL the tables stay in the one database (migration 94 does
nothing there); a dump made by the backup scripts keeps their definitions and
leaves their rows out. A later migration that changes one of these tables
changes the definition in `reimported-data.ts` too, and the attached table of
an existing SQLite database explicitly (`ALTER TABLE texts.target_texts …`).

### What the catalogue's reads are built on (migration 93)

The running service never holds the catalogue in memory: every page, search,
index page and planner pool reads the rows it needs. Migration 93 adds what
those reads filter, count and order on, all derived from the rows of
`target_catalogue_entries` and rebuilt whenever the catalogue's revision moves
(`target_catalogue_state.derived_revision` records the revision they describe):

- on `target_catalogue_entries`: `catalogue_sequence` (the order in which the
  catalogue first wrote each row: SQLite's `rowid` order, kept on PostgreSQL
  too), `storage_rank` (the rows ordered by their designation with ASCII
  letters folded, compared byte by byte, then by `catalogue_sequence`: of
  several targets sharing a lookup key, the first in this order answers),
  `designation_rank` (the catalogue's designation order: numeric collation,
  stable over `storage_rank`; every page starts from it), and the flags
  `has_premium_image`, `has_distance`, `has_published_pages`; indexes on the
  ranks, the constellation, the Extended flag, the magnitude and the
  declination;
- `target_catalogue_lookup_keys(lookup_key, target_id)`: every lookup key of a
  present target (identifier, designation, aliases, common names, folded);
- `target_catalogue_names(target_id, catalogue)`: the catalogues a target
  belongs to;
- `target_catalogue_search(locale, target_id, folded, compact)`: the folded
  text a query is searched in, per language, and the compact forms of the
  designation and aliases (« sh2 155 », « ldn1622 »), built the first time a
  language is searched after a change; `target_catalogue_search_state(locale,
stamp, built_at)` says for which revision (and which build's naming rules);
- `target_catalogue_state.metadata_json`: the source line, licence and export
  date of the package the catalogue was imported from.

No foreign keys: the tables are rebuilt from the rows, never edited. A space's
personal targets (`source_present = 0`) have no derived rows.

### Planner and capture lookups

At planning time, `/api/planner-targets` ranks every locally stored deep-sky
entry against the observer latitude, altitude threshold, object type,
magnitude, apparent size, editorial selection and available media. It returns
only a bounded, localized candidate projection to the browser (720 entries at
most), where time-dependent visibility and scheduling are calculated. The
bound keeps the interactive plan fast; it does not restrict the library that is
considered by the server. The full searchable catalogue remains available from
the catalogue endpoint.

The same ranking is available to paired applications on the public catalogue
endpoint, as `GET /v1/targets?sort=planner` with the optional `latitude` and
`minimumAltitude` parameters. Without `sort` that endpoint is unchanged and
still orders by designation, which is what a catalogue index wants; with it,
one bounded page is the page worth planning against rather than whichever
designations sort first. The observer latitude only feeds the score, so
clients send it coarsely — rounded to the whole degree — rather than putting
a precise location in a query string.

The catalogue endpoint's result counters — `counts.best`/`counts.extended`
(the editorial selection dropdown), `catalogueOptions[].count` and
`typeOptions[].count` — are **faceted**: each is computed over targets
matching every _other_ active filter, with that counter's own dropdown filter
ignored. Choosing `selection=best` therefore leaves `counts.extended`
unchanged, and choosing a `catalogue` leaves every `typeOptions[].count`
unchanged, because a single-select dropdown's own counters describing a
filter it cannot combine with itself would otherwise silently double-apply
that filter — the earlier behaviour, where `selection=best` collapsed
`counts.total`/`.best`/`.extended` onto the same, already-`best`-restricted
number. `countsUnfiltered` and each option's `total` are the additive,
unfiltered companions (`n` of an "`x`/`n`" display once any filter is
active): the same counts with no filter at all, constant for a given
catalogue revision. Clients read these facets for their dropdown and summary
counters; a client predating them falls back to the single number the
corresponding field already carried.

`GET /v1/target-index` is the same catalogue, with the same filters, orderings
and refusals, in a compact columnar notation: the column names once in
`fields`, each target a positional array in `rows`, the object types and
constellations as `[key, label]` dictionaries the rows index into. A target
presented in full is roughly 7 kB — knowledge article, observing prose, image
credits — against 270 bytes for a compact row, so a page cap of 1000 replaces
the full view's 96 and one request holds the whole planning pool rather than a
48-target fragment of it. `include=extended` additionally appends every
extended editorial target of the same ranked set after the page, which is the
web planner's own pool shape. The response carries a strong `ETag` and honours
`If-None-Match`, and `revision` identifies the catalogue import the rows came
from, so a reader walking the whole index page by page can tell an import that
landed mid-walk. A portal predating the route answers `404`, and a client falls
back to `GET /v1/targets`.

Capture records resolve their local target knowledge by stable identifier,
designation, aliases, common names, displayed title and nested Stellarium
source. A matching capture therefore uses the same localized editorial text,
facts, sources and image metadata as the planner and local catalogue. Records
such as Solar or eclipse captures that have no deep-sky counterpart remain
valid capture-only records.

### Bright stars, constellations and the constellation key (migration 109)

Two kinds of catalogue entry are written by the application itself, beside the
imported library and the Solar System's bodies, and merged into the catalogue at
every import (`packages/astro-core/src/sky-targets.ts`; the catalogue's source
revision includes their fingerprint, so an instance imports them again when
they change):

- **92 bright stars** (type `Étoile brillante`, catalogue `BrightStars`): every
  star of visual magnitude 2.5 or brighter, with its Hipparcos number, its
  proper name in the ten languages of the application, its Bayer designation
  (`α Lyr`, genitive `α Lyrae`), its HR and HD numbers, its B−V colour index, its
  spectral type, its J2000.0 position and magnitude, and its distance (a
  `parallax` layer of the distance record, from the Hipparcos parallax; a star
  beyond 150 parsecs says « Estimation : » in the reference and
  `stellar.distanceIsEstimate`). The record is `stellar` in the full view
  (`GET /v1/targets/{id}`).
- **88 constellations** (type `Constellation`, catalogue `Constellations`): the
  Latin name, the IAU abbreviation, the genitive, the name in the ten
  languages, the centre and the radius of the smallest circle that holds the
  stars of its lines (the entry's own `coordinate` is that centre), how many of
  the 92 stars it holds and whether the sky culture draws it. The record is
  `constellationInfo` in the full view, which adds two lists read by the
  constellation key: `brightStars` (its stars, the brightest first) and
  `targets` (the catalogue's objects in it, the editorial selection first, then
  by brightness), each `{ total, items }` with at most `listLimit` items
  (default 12, at most 24).

A bright star is **never offered by the suggestions** (it is out of the
planner's ranking, of `sort=planner` and of the Essentials) but may be added to a
plan by hand, in visual mode: `planVisualOnly` is true for it. A constellation
is never put in a plan: `planExcluded`. Both flags are derived from the type
(`planUseOfType`) and travel in the full view and as two columns of the compact
index.

**The constellation key is the IAU abbreviation** (`Lyr`, `UMa`, `CrB`) for every
entry, in `target_catalogue_entries.constellation_key`, in the `constellation`
filter and in the compact index's `constellations` dictionary. Until migration
109 it was the French name (« Lyre »), with a few strays (`Car`, `Se1` / `Se2`
for the one Serpent, English labels such as « Air Pump »). The migration renames
the column and the key an administrator may have written into a row's
`overrides_json` (`constellation-key-seed.js` holds the pairs, frozen); the
import gives every source target the key of its own constellation, whatever
spelling the source used (`canonicalConstellationKey`), and a target with a
position and no constellation the one the IAU boundaries place it in
(`constellationAt`). A query may name a constellation by its abbreviation or by
any name that names it (`constellation=Lyr`, `Lyre`, `Lyra`), and the type by
`type=stellar` or `type=constellation`.

**`constellationAt(raDegrees, decDegrees)`** (`astro-core/constellation-at.ts`,
and the phone's port of it, held by one fixture, `constellation-at.json`) gives the IAU abbreviation of the constellation that
holds a J2000.0 position. The boundaries are the 392 parallels of the 781
segments of the western sky culture (`public/vendor/stellarium/skydata/
skycultures/western/index.json`, Delporte's, **epoch B1875.0**: they are axis
aligned in that frame only, and reading them as J2000.0 puts 45 of the 695
stars of the constellation lines in the wrong constellation); the position is
precessed from J2000.0 to B1875.0 (IAU 1976 angles) and the parallels above it
are counted. On 400 000 random points it agrees with `astronomy-engine`'s
`Constellation` (the FK4-based chain of Roman's table) on all but 58, each within
ten seconds of arc of a boundary. `scripts/generate-constellation-boundaries.mjs`
builds the table for both implementations; `scripts/generate-sky-catalogue-tables.mjs`
builds the constellation and star tables from `packages/astro-core/sky-data/`.

The sources of the star data: the ESA Hipparcos catalogue (positions,
magnitudes, parallaxes), the IAU Catalog of Star Names (proper names), and the
HYG database (spectral types, colour indices, HR and HD numbers; CC BY-SA 4.0).
Six names are in common use but not in the IAU catalogue (`nameKind:
"traditional"`), and one star (η Centauri) has no proper name.

The short texts of the 92 stars and the 88 constellations live in
`packages/astro-core/sky-data/texts/`: `facts.json`, the verified facts of
each entry (key `hip:<HIP>` for a star, the IAU abbreviation for a
constellation; every fact `sure` or `estimate`), and one file per shipped
language, `{ "<key>": "two to four sentences" }`. `scripts/check-sky-texts.mjs`
checks a language against the facts (at most 700 characters, every number in
the facts of its entry, the rule of the published pages);
`scripts/generate-sky-text-table.mjs` builds the table the service reads
(`sky-text-table.ts`). `GET /v1/targets/{id}` of a star or a constellation
serves the text as `description`: the asked language, else English, else
`null`. A language listed in `COMPLETE_TEXT_LOCALES`
(`packages/portal-app/src/lib/sky-text-check.js`) must hold every key, each
text checked, or the tests fail.

### Guided evenings

A guided evening is a walk through tonight's sky, step by step. Each evening
is one file of `packages/astro-core/sky-data/guided-evenings/`, checked
against `guided-evening.schema.json`: its level (`beginner`, `curious`,
`telescope`), the ways of observing it goes with (`observingModes`: the
naked eye, binoculars, an instrument on a tripod with the phone on it, a GoTo
mount, a smart telescope — the first step of the app's choice sheet), its
typical length, its hemispheres and seasons (the astronomical seasons of the place's own hemisphere). A
**written** evening lists its steps, one list per hemisphere and season; a
step is a bright star (`hip:<HIP>`), a constellation (IAU abbreviation), a
deep-sky object (catalogue id), or a look around with no target. A
**computed** evening holds only its rules (candidates, minimum altitude,
order) and generic texts chosen by condition (position, altitude, colour
index, body, Moon phase); the app computes its steps from the place, the date
and the horizon. Every text lives in `texts/<locale>.json` under a key derived
from the evening (`<evening>.<list>.<step>`, `<evening>.intro`…), French
first, in every shipped language; a step's text completes the target's own
sheet and does not repeat it. `tests/guided-evenings.test.mjs` checks the
targets against the catalogue, that every written list stands high enough
early in the evening of its season (from 45° N or 35° S), and the length of
every text in every language.

### Private favorite targets

`user_target_favorite_modes` stores a `user_id`, a shared `target_id`, a
`favorite_mode` (`photo` or `visual`), and its creation timestamp. It is not
part of initialization exports or the shared target catalogue, and it is
intentionally scoped to the individual user rather than the observatory tenant.
An authenticated user can therefore list and change only their own photo and
visual favorites, even when several users share one tenant.

## Versionable initialization documents

`static_data_documents` is the generic table for editable initialization
documents with different shapes. Each row holds its source payload, the active
instance payload, schema version and source revision. `static_data_exports`
records a generated package manifest. This covers taxonomy, localized catalogue
reference copy, planner defaults and other domain data that must travel to a
new instance, while keeping application code and private user state separate.

See [Initialization data package](STATIC_DATA.md) for the package layout and
export/import lifecycle.

## Private equipment inventory

The public capture catalogue JSON remains canonical for gallery targets, media
and their editorial metadata. A private SQLite migration creates a separate, tenant-scoped
equipment inventory for durable facts about equipment you own. It never moves,
copies or rewrites image/FITS/TIFF files or the catalogue JSON.

Each equipment record has a UUID, `tenant_id`, a type (`telescope`,
`guide-scope`, `camera`, `eyepiece`, `lens`, `filter`, `mount` or
`controller`), a display name, optional manufacturer/model/notes, and
extensible `specifications_json` and `planner_json` documents. The current
admin form exposes useful fields per type, including telescope aperture and
focal length, camera sensor dimensions, lens multiplier, and filter bandpass.

`capture_equipment` associates one or more private equipment records with a
catalogue target identifier and an assignment role: `main` or `guiding`. It is
an overlay, rather than a foreign key to the JSON catalogue. The public
catalogue derives its equipment rows exclusively from these associations:
main equipment supplies the telescope, camera, mount, filter, controller and
optical rows; guiding equipment supplies the dedicated guiding row. The public
projection contains only the selected display names and a small technical
summary. It never exposes private notes, inventory identifiers or planner
settings. The authenticated planner reads the same inventory. When private
authentication is enabled, guest planning deliberately exposes only editable
custom fields, never the private inventory.

This schema uses UUID/text/UTC/JSON fields and ordinary relations only, so its
repository API can be carried to PostgreSQL without changing catalogue files.

## Captures: visibility and the two checks

A capture (`captures`) is **private** by default (`visibility`): seen in its
own space and in the space's private gallery. Its owner may make it
**public** (`public`): it then also appears in the public gallery, unless it
was removed from it or refused by the administration. Every capture carries two
checks:

| Column                                                                    | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto_check`, `auto_check_reason`, `auto_check_at`                        | The automatic check: `NULL` until it has run, then `sky` (the sky or a landscape), `undetermined` (a person — reason `person_detected` —, a dark, a flat, a clouded exposure, neither a sky nor a landscape…) or `other` (painted: it did not pass); a machine reason and the time. The owner reads the reason only in its own words (`automaticReason`).                                                                               |
| `admin_check`, `admin_check_at`, `admin_check_reason`, `admin_check_note` | The administration's flag: `NULL` until the administration looks, then `approved` or `refused`, with its time, a reason (`not_sky`, `offensive`, `identifiable`, `other`) and a free note.                                                                                                                                                                                                                                              |
| `review_requested_at`                                                     | When the owner asked for a verification of an `undetermined` capture.                                                                                                                                                                                                                                                                                                                                                                   |
| `protection_notice_at`, `protection_lifted_at`                            | The notice given on a private capture that did not pass (`other`), and when its private protection was lifted: the owner accepted the verification, or the delay of the notice passed (`ASTRO_PORTAL_CHECK_NOTICE_DAYS`, 14 days). The service never deletes a capture itself.                                                                                                                                                          |
| `removed_from_gallery_at`                                                 | When reports removed a public capture not yet verified from the public gallery; cleared when the administration approves it.                                                                                                                                                                                                                                                                                                            |
| `made_public_at`                                                          | When the capture last turned public (“Public since …”): written when it goes from private to public (the owner choosing public, the administration validating a verification the owner asked for), cleared when it turns private again, left alone by a write that keeps it public. `NULL` on a private capture, and on a capture that was already public when the column was added (migration 91): the date is unknown, never guessed. |

What the owner sees and may do from these columns (the state of the
capture, whether « Publique » is allowed and why not, the administration's line, the
date the protection lifts) is one pure rule, written in JavaScript
(`packages/portal/src/captures/capture-state.js`). The administration wins over the automatic
check: a capture whose check did not pass may be
public once the administration approves it, a refusal by the administration stays final, and the
rule has one switch: on a server with no team (a private server), no check is
run and every capture is recorded as `sky`: the administration's flag stays
`NULL`, nothing is asked, refused or shown of a check, and the owner makes a
capture public when they want.

The automatic check runs after each upload, once per capture, on the server
(`packages/portal/src/captures/capture-processing.js`; the captures left
without a result are taken again at startup, every hour and when their owner
lists them). The rule in force (`sky-check-3`,
`packages/portal/src/sky-check/rule.js`) has four outcomes: the sky or a
landscape (`sky`, publishable at once), a person (stored `undetermined` with
the reason `person_detected`) and neither a sky nor a landscape
(`undetermined`) — both wait for the administration —, and painted (`other`). People
are found by a small object detector run on the server itself (YOLOX-nano,
Apache-2.0, on ONNX Runtime's WebAssembly build). A result `other` is stored
and counted for the administrator, no notice is given, and its owner reads it
as `undetermined` (`packages/portal/src/captures/sky-check-verdict.js`).
After a change of the rule, `POST /api/admin/captures/recheck` runs the check
again on every image — on a test deployment only (`ASTRO_PORTAL_ENVIRONMENT`
set to `staging`, `development` or `test`, and a public address that is not a
production host), or with `ASTRO_PORTAL_ALLOW_SKY_CHECK_RECHECK=1`. A production
host is one named `…-prod…` or `…production…`, or listed in
`ASTRO_PORTAL_PRODUCTION_HOSTS` (host names separated by commas or spaces;
`*.example.org` stands for every subdomain of a domain). A server whose test
copy shares settings with its production should list its production hosts there.

**Derived files.** Beside each original, under its space's directory,
`<captures>/<space>/derived/<sha256>/` holds the files the service derives
from it, never counted in the space's storage: `thumbnail.webp` (oriented,
768 px at most, without metadata; a FITS file whose pixels are read gets one
too) and `shared.jpg`, the **shared copy** — the only file the public gallery
and a private gallery serve: JPEG, 8 bits, sRGB, without EXIF, XMP or IPTC,
4096 px at most on its long side. The shared copy is written at its first
need (the capture made public, or first shown in a private gallery); only a
raster image that is not a camera's raw file can have one. The original is
never modified. Deleting a capture, or its space, removes its derived files.

**The owner's own tags.** `capture_tags` holds the tags the owner gives a
capture in « Mon espace » → « Captures »: `capture_id`, `tenant_id` and
`tag`, free text kept as typed (only the spaces around it are trimmed), 40
characters at most, unique per capture; 20 tags at most per capture. They are
shown in the private gallery only, beside the generic tags derived from the
target's object type; the public gallery never reads this table. Deleting a
capture, or its space, deletes its tags.

The former publications (a title, a visibility and a list of captures) are
retired: their two tables are dropped, nothing was converted.

## The private gallery of a space

Each space (`organizations`) has a private gallery:

- `portal_token`: its address, random (18 random bytes in base64url), minted
  at its first read, unique, never chosen by the owner; a new one replaces
  it on request, and the former one stops at once.
- `portal_mode`: who may see it — `none` (shared with nobody, the default) or
  `link` (anyone who has the address). A server that opens spaces may store
  a third value, its own (the column accepts `invited`); a private server,
  which has one account, never does.
- `public_name` (60 characters at most) signs the space's public captures;
  `portal_name` (80 at most) is the gallery's title. Both optional, kept as
  typed. `public_name_refused_at` and `portal_name_refused_at`: when the
  administration refused that name (it is then emptied); cleared when the owner saves
  another one.
- `hide_default_equipment`: whether the equipment kept by the administration
  is hidden from the space. `equipment.scope` tells that equipment
  (`default`) from the space's own (`private`).

`portal_access` is the access list of the third mode of a server that opens
spaces: one row per space and normalised address. The table stays in the
schema, empty and unused, on a private server (no destructive migration); its
rows are written by the hosted service alone.

## Messages of the private galleries, and the tables of a team

- `portal_mail_budget`: the messages of the private galleries, counted in a
  budget of their own (a time, a kind and `space_key`, a digest of the space
  for its limit an hour; no address; purged after a day).

A service with a team that reads the captures (the hosted service) keeps the
reports of its visitors, the warnings and blocks of its people, its dictionary
of forbidden words in the names and the log of the looks at private captures in
tables of its own. A private server does not read them: its owner is the only
person who sees a capture and decides alone what is public.
