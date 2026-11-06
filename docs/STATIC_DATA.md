# Initialization data package

## Purpose

Application code is public and immutable per release. Domain/reference data is
kept in a private, versionable initialization package. An instance imports that
package into SQLite, serves and edits the resulting tables, then explicitly
exports the current state back to JSON. The exported package can bootstrap a
second instance without copying its SQLite file.

The default directory is a private sibling of runtime state:

```text
<private-root>/static-data/
├── manifest.json
├── sky-quality/
│   ├── manifest.json
│   ├── raster.bin
│   └── pack/
│       ├── manifest.json
│       └── raster.bin
├── camera-catalogue/              (optional: Tycho-2 to V 11.5, CC BY-NC 3.0 IGO)
│   ├── stars.bin
│   └── source.json
├── read-aloud/                    (optional: the spoken reading, one folder per voice version and language)
│   └── <voiceVersion>/<locale>/
│       ├── manifest.json
│       └── u/<id>.m4a
├── documents/
│   ├── reference-taxonomy.json
│   ├── target-catalogue-descriptions.json
│   ├── target-common-names.json
│   ├── caldwell-crossreferences.json
│   ├── planner-curated-targets.json
│   ├── planner-equipment-presets.json
│   └── planner-planets.json
└── target-library/
    ├── catalogue.json
    └── texts/                      (the pages of every tier, and the children's texts)
        ├── index.json
        └── <locale>/<shard>.json
```

Set `ASTRO_PORTAL_STATIC_DATA_DIR` to use another location. Put this directory
under a **private** Git repository or another versioned backup system. It is
not part of the public application repository.

## Instance tables

`static_data_documents` stores each non-media initialization document. It keeps
both the imported source payload and the instance payload, making a local edit
detectable until export. `static_data_exports` records package manifests.

The target library has a structured row per object in
`target_catalogue_entries`. Its image metadata is normalized in `target_media`
with one row for each `dss`, `premium` or `visual` variant. Target selections
are real collections in `target_collections` and
`target_collection_memberships`: **Essentials** (`essential`) and **Extended**
(`extended`) are two disjoint lists — a target is in one of them at most, the
Extended completing the Essentials — and two more collections, `mode-visual`
and `mode-photo`, hold the modes a target of a selection is proposed in
(TARGET-SELECTIONS-TAGS-01). Legacy JSON columns remain as a compatibility
mirror during the migration (`is_best`, `is_extended`; the modes have no
column), but reads and writes hydrate the relational media and collection
tables. The seed carries `modes` (`["visual", "photo"]`, a subset in that
order) beside `isBest` and `isExtended`.

The target seed also carries the two calculated hemisphere-coverage flags per
object. They are derived from declination using the shared 30° culmination rule
and are recalculated by the instance if coordinates change.

### The default selections: `target-selection.json`

The default content of the two selections is a data file,
`packages/astro-core/sky-data/target-selection.json` (the list validated
on 03/11/2026): one entry per target,
`{ id, designation, tier, modes }`, `tier` being `essential` or `extended` and
`modes` a subset of `visual`, `photo`. `scripts/generate-target-selection-table.mjs`
builds `packages/astro-core/src/target-selection-table.ts` from it (run it after
an edit; `--check` says whether the table is the file's), which the curation
(`packages/portal-app/src/lib/target-library-curation.js`) reads: a target is
found by its identifier, else by its designation; no score fills a selection
up. The counts are those of the file (212 Essentials and 234 Extended in its
first version); the titles carry no number.

A target enters the **Essentials** (the `essential` collection, `isBest`) if it
is spectacular in a small instrument **and** observable every year from a
mid-latitude site; the **Extended** (`extended`, `isExtended`) hold the targets
worth proposing beyond them. The two are disjoint. Every Messier object but
M102 (which repeated M101) and every Caldwell object is in one of them. A
target is tagged `visual` when it is within reach of a 200 mm telescope under a
good sky, `photo` when it is a subject for a camera (not too small for a short
focal length, an object rather than a double star or an asterism); a target of
a selection with no mode is read as both. The planets are in visual mode only:
**Mars, Jupiter, Saturn and Venus** in the Essentials, **Mercury, Uranus and
Neptune** in the Extended; the **Moon** is an Essential in both modes. The
Solar System's bodies have no fixed coordinates, which a selection does not
need. **The Sun never enters**: observing it needs a dedicated, certified
filter, and a selection that every new user sees must not suggest pointing an
instrument at it. Pluto stays outside. A target the selections leave stays in
the catalogue (« Toutes »).

How the modes are read: the pool of the suggestions is the two selections
together, kept to the targets of the profile's mode (visual: `visual` or both;
photo: `photo` or both); a catalogue ticked in the suggestions' filters is that
whole catalogue, whatever the modes. `target-library-query` and `target-index`
take a `mode` that keeps, of the `selection` asked, the targets of that mode
and counts each list in it; `target-index` carries a `modes` column (1 visual,
2 photo, 3 both, 0 out of the selections).

An instance keeps its own memberships, edited in Administration. Once per
version of the file (`version`, recorded in `target_catalogue_relation_state`
as `target-selection-<version>`), an instance that already holds the catalogue
takes the file's selections and modes for every shared target, an earlier
edit included; a database with no target only records the version, and its
first import keeps the source's flags (a seed's) and curates the targets
without any.

### Corrections of the source records: `target-corrections.json`

`packages/astro-core/sky-data/target-corrections.json` lists the fields of a
source record that are wrong in the sources and what they become (a type, a
magnitude, a common name, a position): IC 1318 (the region of γ Cygni, typed as
the star), NGC 2244, IC 2118, NGC 3190, NGC 2372, NGC 6885, NGC 7235 (typed
« Ciel profond »), the name « Flame Nebula » moved from IC 434 to NGC 2024, the
magnitudes of NGC 253 (7.6) and NGC 4945 (9.3), and M102, which had M101's
position and alias: it takes NGC 5866's position (15h06m29s, +55°45′48″) and
stays an entry of its own, outside the selections. They are applied to every
source record the catalogue imports (`scripts/import-opengc-target-library.mjs`
and every seed), built into the same generated table; an administrator's own
edit of a field still wins.

### Catalogue descriptions

The catalogue sheet's description of each catalogue (`catalogueOptions[]
.description`) falls back **per catalogue and per language**, never per
document: the stored `target-catalogue-descriptions` document in the reader's
language, then the code's text in that language
(`packages/astro-core/src/target-catalogues.ts`, and `locale-names-more.ts` for
zh-Hans, zh-Hant and ru), then the document's English, then the code's English.
A catalogue with no text anywhere has an empty description and no subtitle;
there is no generic sentence. A document saved before a catalogue existed
therefore never hides the code's texts for it.

The targets of the selections can additionally carry source-linked `catalogueResearch`
profiles in their editorial JSON. English is the source language for each
profile; French and Japanese are translations of the same structured facts and
references. Write them in the editorial JSON of the package, which
`npm run export:static-data` exports; the tool that drafts conservative base
profiles from the local target catalogue is not part of this repository.

A target can instead carry a **published page** (tiers A, B
and C): a text in every shipped language, cut into sections with intertitles,
with its sources and a note on their licences, and optionally a children's
text per language (`<slug>.<locale>.children.md`, one or two paragraphs read
aloud, stored as `childrenParagraphs` and served as `childrenSpokenParagraphs`).
A target without one is served none: the three-sentence template the field
once carried is gone, and the apps' « For children » control says the version
is coming. The pages are written outside the package (one
Markdown file per target and language, a facts table, a registry of the
finished targets) and loaded into the package by a loader, which replaces the
text of the finished targets only and leaves every other target as it is. It
refuses a target that lacks a page in a shipped language or states a number
its facts table does not hold, and can be run again as more targets are
finished.

**Every tier goes to the shards** (tiers B and C always did). The
loader writes the pages of the finished targets, in every shipped language,
under `target-library/texts/` (see « The `texts/` folder » below), with the
children's text where a language has one; the service imports them into
`target_texts` and serves a tier A page exactly as it serves one of tier B or C.
Tier C alone is about 15 900 targets in ten languages
(≈ 350 MB), so none of this ever enters `catalogue.json`.

What loading tier A does to the catalogue: for a target whose shard entries are
written, in every language, the loader **removes the published page from the
seed** — `target-library/catalogue.json` and, for the Solar System bodies,
`documents/solar-system-targets.json` with its line in `manifest.json` — and
leaves everything else of the target alone (a generated profile, an
administrator's edit). A target that is refused, or that the run did not take
(`--only`), keeps the page the seed still serves: no instance is ever left
without a text, which is also how a package of the older layout keeps working
until it is loaded again. The entry of the shard replaces the older
children-only entry of the same target and language (an entry is one per
target and language, never two). A dry run writes nothing.

An instance that already holds the catalogue picks the change up on its next
synchronization: the page the seed no longer carries leaves the stored
editorial (an administrator's edit of the same page goes with it) and is read
from the shards. **Upload the shards first, then `index.json`, then the lighter
`catalogue.json`** (the loader writes them in that order): a seed without its
pages in front of shards that are not there yet would serve the generated
text meanwhile.

### How the service reads the catalogue

The service never holds `catalogue.json`, nor the catalogue, in memory:

- **Import, once per revision of the files.** The source's revision is computed
  from the identity of its files (size and modification time of the seed, the
  runtime manifests, the visual references' folder, the Solar System
  document's revision): unchanged, nothing is read. Changed, the seed is read
  entry by entry from the file (a megabyte at a time, never parsed whole) and
  written to `target_catalogue_entries` by slices of 500; then the derived data
  of migration 93 (`docs/DATA_MODEL.md`) is rebuilt. The Solar System's bodies,
  the 92 bright stars and the 88 constellations are merged in from the code,
  whatever the source (`docs/DATA_MODEL.md`, « Bright stars, constellations and
  the constellation key »), and every target is stored under the IAU
  abbreviation of its constellation, placed by its position when the source
  gives none. A seed found invalid is
  not read again by the process until it changes; the runtime library, then the
  curated fallback, are imported instead.
- **Every read asks the database.** A page, a search with its counters, an
  index page, the planner's pool read the compact rows they filter and order
  (indexed conditions on the type, constellation, catalogue, selection,
  hemisphere, declination and the per-language search text), then the whole
  entries of the page alone. The answers are those the catalogue in memory
  gave. What is kept between requests is small: the catalogue's credit lines, the
  visual references whose file exists, at most 24 serialized index pages and
  the bounded knowledge bundles.
- **Without a database** (a development run) the catalogue uses a private
  SQLite database in a temporary folder, deleted when the process exits; it
  answers as the files did before (no normalization, no default curation, the
  source's own order and images) and also reads the texts' shards.
- **Several processes on one PostgreSQL database**: the catalogue's import, its
  derived data and its search text are each done by one process at a time
  (advisory locks, the work checked again under the lock); the import of the
  texts' shards is done by the process that takes its lock, the others skip it
  and look again a minute later.

### The `texts/` folder (catalogue texts, in shards)

```text
target-library/texts/
├── index.json
└── <locale>/<shard>.json       one folder per shipped language
```

A shard holds the targets whose identifier digests to its number (the first
four bytes of the SHA-1 of the identifier, big-endian, modulo the shard count,
written on three digits), so that a target keeps its shard as others come and
go. The folder keeps the shard count it was made with (32 by default, about 500
targets per shard for the 15 900 of tier C; `--shards <n>` sets another for a
new folder, and the loader warns above 800 on average). Files are compact JSON,
entries sorted by identifier.

A shard `<locale>/<shard>.json` is `{ v: 1, locale, shard, revision, entries }`
and an entry is

```json
{
  "id": "openngc-ngc0224",
  "revision": "e1f1a336df05cfbb",
  "tier": "C",
  "lede": "Title — first sentence(s), about 200 bytes",
  "page": {
    "storySections": [{ "heading": null, "paragraphs": ["…"] }],
    "researchSources": [{ "label": "…", "url": "https://…" }],
    "researchNote": "…"
  },
  "children": { "paragraphs": ["…"] }
}
```

- `page` holds what `GET /v1/targets/{id}` answers for a published page in
  that language (`target-page-fields.js`), **less `story` and `storyParagraphs`**:
  `storySections`, `researchSources`, and `researchNote` when the page has a
  note. The two fields left out repeated the text of the sections (the page
  was written three times: 742 MB for all shards, ≈ 70 MB per language) and
  are derived whenever a page is read; see « Deriving `story` and
  `storyParagraphs` » below. A shard that stores them is refused (the schema
  forbids any other field).
- `lede` is the title and the first one or two sentences of the page's opening
  paragraph (the second only if the whole stays within about 200 bytes): what a
  list shows under a name without opening the page. Always present with a page.
- `children` is the children's text of that language (`childrenSpokenParagraphs`
  of the route), only when the target has one.
- An entry of **tier A** is a page like the others; the older
  form of an entry of tier A, `children` only with no `page` and no `lede`
  (the page staying in the catalogue), is still valid, and a reader falls back
  to the page the seed serves when a target has no page entry in a language.
- `revision` is a digest of the tier and the content: an unchanged target keeps
  it. The shard's `revision` is a digest of its entries' revisions.
- `tier` (`A`, `B` or `C`) is an addition to the contract of the text shards
  (`target-texts-shard.schema.json`): the route
  answers it as `researchTier` and the base data of the offline pack takes the
  pages of tiers A and B only (the optional component carries every tier).

**Deriving `story` and `storyParagraphs`.** One rule, written once in
`packages/portal/src/target-page-story.js` (`targetPageStory(storySections)`,
used by the service) and fixed by the fixture
`packages/astro-contracts/fixtures/spec/target-page-story.json` (inputs; the
generated `fixtures/target-page-story.json` holds the expected results):

- `storyParagraphs` is the paragraphs of every section, in order, one section
  after the other; the intertitles (`heading`) are left out. A paragraph that is
  not a non-empty string is skipped; nothing is trimmed (the loader writes
  trimmed paragraphs). No section, or a value that is not a list, gives `[]`.
- `story` is `storyParagraphs` joined by a single space (U+0020), in every
  language (Japanese and Chinese included), and the empty string when there is
  none. This is exactly what the route answered when the shard held both
  fields.

`index.json` is `{ v: 1, shardCount, locales: { <locale>: [{ shard, path,
bytes, sha256, revision, count }] } }`: every shard file, with the digest of its
bytes. It is written after the shards, so a reader that sees a new index finds
its files; a file whose bytes do not match the index's `sha256` is left for the
next read. JSON Schemas: `packages/astro-contracts/schemas/api/target-texts-shard.schema.json`
and `target-texts-index.schema.json`, with a small fixture shard in
`packages/astro-contracts/fixtures/target-texts/`.

The loader is repeatable: a refused target keeps what the shards hold for it,
unchanged pages keep their revision, a shard file whose bytes would not change
is not written, and nothing is rewritten when nothing changed. It never removes
a target from the shards (delete the folder and load again to start over, which
also changes the shard count).

**How the service takes them in.** The `target_texts` table (one row per target
and language, the entry stored whole; `docs/DATA_MODEL.md`; under SQLite in
its own file, `<name>.texts.sqlite`, which no backup copies) is filled in the
background at start and whenever `index.json` changes: for each shard whose
`revision` differs from the recorded one, the service reads that one file
(verifying its `sha256`), upserts its changed entries by statements of 500
rows, deletes the rows of the targets that left the file, records the shard —
one transaction per shard —, lets the file go and hands the event loop back
before the next. Nothing ever holds two shards in memory, and a shard that is
unchanged is not read. Shards that left the index are forgotten with their
rows. The import writes one line per shard imported
(`[Astro Portal] info target-library.texts: shard <locale>/<shard>: N rows
written, N kept, N retired in N ms`), one at the end (shards, rows, duration),
one warning per shard that fails and one saying when it is tried again (60 s
later). On PostgreSQL one replica imports (advisory lock); the others say so
in a line, read its rows and look again a minute later. `GET /v1/targets/{id}` (and the web sheet) reads
only the target's own row; the pages of tiers B and C are served exactly like
a published page, with the same language fallback. The offline pack carries
the stored pages of tiers A and B, never those of tier C.

**In the offline pack.** The same files are the optional component
« Textes complets du catalogue » of the offline pack (`text-shards`,
[OFFLINE_PACKS.md](OFFLINE_PACKS.md)): a client that asks for it downloads the
shards of its own language and checks each against the index's `sha256`. A
shard whose `revision` it already holds is not downloaded again. The sections
alone are stored; `story` and `storyParagraphs` are derived with the same rule
as the service.

**Moving a package from the old layout.** A `catalogue.json` that still holds
published pages — tier A's, or tier B pages and children's texts of an older
loader — keeps serving them, and they take precedence over the shards. For tier
A, load it again (`--tier A`): the shards are written, then the seed's copy of
each loaded target goes. For the others, rebuild `catalogue.json` from the
package without those pages, then load tiers B and C again.

No image bytes are stored in SQLite or in the package. The package records
filename, source, credit and licence metadata. Copy the referenced private
image directories alongside it when bootstrapping a new installation.

## Lifecycle

1. A new instance reads the package when it first needs a dataset and imports
   it into its tables. If no package exists, the code's bundled defaults and
   legacy OpenNGC runtime source form the first seed.
2. Administration edits the instance tables. Target edits apply immediately;
   planner defaults, taxonomy and reference texts are passed to the planner or
   target catalogue on their next page request.
3. In **Administration → Initialization**, choose **Export initialization
   package** after a meaningful change. This writes every document, the full
   target catalogue seed and `manifest.json` atomically per file.
4. Commit or back up the private package, then copy it and the referenced media
   directories to another installation. Do not copy passwords, sessions,
   plans, equipment inventory or the source SQLite database.

The equivalent non-interactive export is:

```bash
ASTRO_PORTAL_DATABASE_PATH=/private/portal.sqlite \
ASTRO_PORTAL_RUNTIME_DIR=/private/runtime \
ASTRO_PORTAL_STATIC_DATA_DIR=/private/static-data \
npm run export:static-data
```

## What belongs here

`sky-quality/` is the exception to the "editable domain data" rule below: it is
generated, not edited, and it is the only binary here. It holds the self-hosted
VIIRS light-pollution raster the planner's Bortle/SQM estimate is sampled from,
built offline by `packages/portal/scripts/prepare-sky-quality-raster.mjs`. See
[SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md) for how to obtain the source
composite, prepare the raster, and what the estimate does and does not model.
An installation without it answers the sky-quality endpoints' existing
unavailable state; nothing else degrades.

`sky-quality/pack/` is a separate, optional derivation of the same raster at a
coarser 6' resolution (3,600 × 1,800 = 6,480,000 bytes), sized for an offline
pack rather than for a live sampling query. It is what
`GET /v1/offline-pack`'s `sky-quality` component checks for before advertising
itself, and what the `GET /v1/offline-pack/sky-quality/{manifest.json,raster.bin}`
routes serve; an installation without it simply omits that component, exactly
like `sky-quality/` itself being absent omits the live estimate. See
[OFFLINE_PACKS.md](OFFLINE_PACKS.md) for the offline pack's own manifest
format.

The package contains editable astronomy domain data: taxonomy and localized
labels, catalogue descriptions, localized common names, Caldwell references,
the planner's default target selection, guest equipment presets, planetary
presentation records and the complete target library. Formulae, protocol
rules, security controls, image-serving code and UI translations remain code or
dedicated configuration because changing them requires review and a release.

## The camera star catalogue (`camera-catalogue`)

The optional offline-pack component a telescope camera plate solves with
(CAM-3, [OFFLINE_PACKS.md](OFFLINE_PACKS.md)): Tycho-2 and its first
supplement to V 11.5, about 1.5 million stars, `stars.bin` (≈ 12 MB, zoned
`PSTZ` layout) and its provenance `source.json`. It is generated, not edited,
and **never committed** (CC BY-NC 3.0 IGO): neither the source files nor the
result enter a Git repository, the private one included only if its licence
terms allow it.

1. Download the VizieR I/259 files into a folder of their own: `ReadMe`,
   `tyc2.dat.00.gz` to `tyc2.dat.19.gz` (159 MB) and `suppl_1.dat.gz`, from
   `https://cdsarc.cds.unistra.fr/ftp/I/259/` or a VizieR mirror
   (`http://vizier.nao.ac.jp/ftp/cats/I/259/` answered when the CDS did not,
   04/11/2026). Check that the `ReadMe` still says « License:
   CC-BY-NC-3.0 IGO ».
2. Build it into the static data:

   ```bash
   node scripts/build-camera-catalogue.mjs --tycho <folder of the I/259 files> \
     --out <static data>/camera-catalogue \
     --source-url <the URL the files came from> --retrieved <YYYY-MM-DD>
   ```

   It prints the entries read (2 539 913 + 17 588), the stars kept
   (1 500 277), the zones (10 312) and the size (12 043 672 bytes for the
   files of 04/11/2026). `source.json` holds the URL, the date and the SHA-256
   of every source file; the manifest carries it as the component's `source`.

3. Upload both files with the rest of the static data, **after** the text
   shards and in any order with the other components (a portal lists the
   component as soon as `stars.bin` is complete; upload `source.json` first so
   the first listing carries the provenance):

   ```bash
   az storage file upload --account-name <storage account> --share-name astro-data \
     --source <static data>/camera-catalogue/source.json \
     --path private/static-data/camera-catalogue/source.json
   az storage file upload --account-name <storage account> --share-name astro-data \
     --source <static data>/camera-catalogue/stars.bin \
     --path private/static-data/camera-catalogue/stars.bin
   ```

   No restart is needed: the manifest sees the file at its next `stat`. A
   static pack (`scripts/build-offline-pack.mjs`) copies the folder, or builds
   it with `--tycho <folder>`.

## The spoken reading (`read-aloud`)

The optional offline-pack component « Lecture à voix haute »
(READ-ALOUD-SERVICE-01, [OFFLINE_PACKS.md](OFFLINE_PACKS.md); study
READ-ALOUD-CLOUD-01): the paragraphs of the target pages, the introductions
and the guided evening, spoken **once**, at generation time, by a neural voice,
and served as static files. The portal only serves them; the generator
(`READ-ALOUD-GEN-01`, run by a person with the provider's key, which never
enters the portal) writes the files below and **must conform to this
contract**. Nothing here is edited by hand.

**Layout**, per voice version and language, in the static data:

```text
read-aloud/<voiceVersion>/<locale>/manifest.json
read-aloud/<voiceVersion>/<locale>/u/<id>.m4a
```

- `<voiceVersion>` names the voice and the generation (`azure-hd-2026-11`;
  `^[a-z0-9][a-z0-9._-]{0,63}$`). A new voice, or a new generation, is a new
  folder and changes every id: versions never mix. A language with several
  versions is listed with the latest (the greatest name); the older ones keep
  answering their addresses until their folder is removed.
- `<locale>` is a language of the registry (`fr`, `en`, `pt-BR`, `zh-Hans`…).
- `<id>` is the unit's id, 32 lowercase hexadecimal digits: the first 16 bytes
  of `sha256(normalisedText + "\n" + locale + "\n" + voice + "\n" +
voiceVersion)`, where `normalisedText` is the text the app would read (after
  its normaliser and lexicon) and `voice` the provider's name of the voice. The
  app computes the same id: a key is found without a table, and a sentence
  that is not found is a sentence the phone reads itself.
- A unit is one paragraph (about 600 characters), **HE-AAC 32 kbit/s mono in
  an `.m4a`** (`afconvert -f m4af -d aach -b 32000 -c 1`), with no pause at its
  ends (the reader adds the 350 ms between paragraphs).

**`manifest.json`** (schema:
`packages/astro-contracts/schemas/api/read-aloud-manifest.schema.json`;
example, with three units of silence:
`packages/astro-contracts/fixtures/read-aloud/azure-hd-test/fr/`):

```json
{
  "v": 1,
  "kind": "read-aloud-manifest",
  "locale": "fr",
  "voiceVersion": "azure-hd-2026-11",
  "voice": "fr-FR-VivienneMultilingualNeural",
  "source": "Voix de synthèse neuronale HD",
  "attribution": "…",
  "license": "…",
  "format": {
    "container": "m4a",
    "codec": "he-aac",
    "bitrate": 32000,
    "channels": 1,
    "sampleRate": 24000
  },
  "generatedAt": "2026-11-05T15:40:00Z",
  "fiches": [
    {
      "id": "guided-evening-intro",
      "level": "essential",
      "units": [
        {
          "id": "<32 hex>",
          "bytes": 4297,
          "sha256": "<64 hex>",
          "cues": [0, 520]
        }
      ]
    }
  ]
}
```

- `source`, `attribution` and `license` are required and shown to the person:
  the provider's terms for the redistribution of the generated audio are read
  before the first deposit.
- **Levels.** Every fiche names the smallest level it belongs to (`essential`,
  `extended`, `complete`), so the three levels nest by construction: Essentiel
  is the fiches of level `essential`, Étendu those of `essential` and
  `extended`, Complet all of them. `fiches` is in reading order and a fiche's
  `units` are in the order of the page. A fiche's `id` is unique in the file: a
  target's slug (`m31`) or the name of a guide page.
- **Units.** `bytes` and `sha256` are those of the `.m4a`; `cues` are the start
  of each sentence in the file, in milliseconds (the first is 0, never
  decreasing). A paragraph two fiches share is one file, listed in both with the
  same `id`, `bytes` and `sha256`; a manifest that gives one id two different
  files is ignored.
- The folder names are `voiceVersion` and `locale` themselves: a manifest that
  contradicts its folder, that is not valid, or is empty is ignored (the
  language is not listed), never an error.
- A unit file whose size is not the manifest's `bytes` answers `404`.

**Publishing a language**: upload the unit files first and `manifest.json`
**last**: the portal lists the language as soon as its manifest is valid (a
`readdir` and a `stat`, in memory, no restart), so the manifest appearing is
the language being complete. Re-publishing after a correction: upload the new
unit files, then the manifest (a corrected paragraph has a new id; the old file
may stay until the next clean-up).

The files carry no data of the person and are the same for everybody. Nothing
of the audio is committed to a Git repository.

## Catalogue sources and licences

The current [CDS general terms](https://cds.unistra.fr/legals/) require users to
follow each dataset's own licence. They say datasets containing only public
information are distributed under Licence Ouverte, ODbL or CC BY; non-public
information requires applicable third-party rights-holder agreement; and a
contributor-specific licence is shown on that dataset's page. The particular
licence for each legacy catalogue must therefore be identified before import.

The archived [NASA/ADC use policy](https://web.archive.org/web/20070301221749/http://adc.gsfc.nasa.gov/adc/questions_feedback.html#policies)
said ADC data were public domain unless a ReadMe stated otherwise, and separately
described them as for scientific use only and having no commercial value. The
scope of that historical wording for these later CDS files is uncertain; “no
commercial value” is not treated as an explicit commercial-use prohibition. NASA's current [Science
data licence guidance](https://science.data.nasa.gov/about/license) also
cautions that NASA may not be the original source and that original usage
rights must be checked for data outside qualifying NASA-led mission data.

| Source                                                                                                  | Licence or stated condition                                                                                                                                                                                                                                                            | Attribution                                                                            | Data decision                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenNGC](https://github.com/mattiaverga/OpenNGC), pinned at `da90466031b0372c896588b85be6016c617e205b` | CC BY-SA 4.0                                                                                                                                                                                                                                                                           | Mattia Verga, pinned revision, CC BY-SA 4.0                                            | Existing baseline source retained under its stated licence.                                                                                        |
| [Barnard VII/220A](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/220A?format=html&tex=true)          | CDS terms require the dataset's own licence; ReadMe provides attribution context but does not identify the applicable redistribution licence                                                                                                                                           | Barnard (1927), CDS/VizieR VII/220A                                                    | Existing baseline reference retained; applicable licence unresolved and no new import authorized by this review.                                   |
| [Sharpless VII/20](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/20?format=html&tex=true)            | CDS general licence categories apply, but the dataset page/ReadMe does not identify which one; historical ADC FAQ states public domain by default, then scientific-use-only/no-commercial-value wording of uncertain scope                                                             | Sharpless (1959), CDS/VizieR VII/20                                                    | Imported: no explicit licence published for this version.                                                                                          |
| [LDN VII/7A](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/7A?format=html&tex=true)                  | CDS general licence categories apply, but the dataset page/ReadMe does not identify which one; historical ADC FAQ scope is uncertain; its “no commercial value” phrase is not treated as a commercial prohibition                                                                      | Lynds (1962), CDS/VizieR VII/7A                                                        | Imported: no explicit licence published for this version.                                                                                          |
| [LBN VII/9](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/9?format=html&tex=true)                    | CDS general licence categories apply, but the dataset page/ReadMe does not identify which one; historical ADC FAQ states public domain by default, then scientific-use-only/no-commercial-value wording of uncertain scope                                                             | Lynds (1965), CDS/VizieR VII/9                                                         | Imported: no explicit licence published for this version.                                                                                          |
| Abell planetary nebulae (Abell 1966)                                                                    | AAS's [article copyright and licensing policy](https://journals.aas.org/article-charges-and-copyright/) covers the article's publication/reuse; it does not establish copyright in underlying catalogue facts or rights in a separate data file. No data licence/supplement identified | Abell (1966), _ApJ_ 144, 259–279, DOI [10.1086/148602](https://doi.org/10.1086/148602) | Imported from CDS V/84 and J/A+A/408/1029 (79 of 86); no explicit licence published.                                                               |
| [Strasbourg-ESO PN catalogue V/84](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/84)                      | CDS terms; no dataset-specific licence identified                                                                                                                                                                                                                                      | Acker et al. (1992), CDS/VizieR V/84                                                   | Names, B1950 positions and diameters of the Abell planetaries; no explicit licence published.                                                      |
| [Kerber et al. J/A+A/408/1029](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/408/1029)                | CDS terms; no dataset-specific licence identified                                                                                                                                                                                                                                      | Kerber et al. (2003), A&A 408, 1029, CDS/VizieR                                        | J2000 positions of the Abell planetaries; no explicit licence published.                                                                           |
| [Tycho-2 I/259](https://cdsarc.cds.unistra.fr/viz-bin/cat/I/259) and its supplement 1                   | CC BY-NC 3.0 IGO (ReadMe); the [ESA archives' terms](https://www.cosmos.esa.int/web/esdc/terms-and-conditions) ask a written authorisation before any commercial use: written authorisation requested from ESA, pending                                                                | Tycho-2 Catalogue (Høg et al. 2000), ESA Hipparcos mission — Credit: ESA               | Optional offline-pack component `camera-catalogue` (V ≤ 11.5); shipped while the answer is pending, a fallback only on a refusal; never committed. |
| [SIMBAD](https://simbad.cds.unistra.fr/) cross-identifications (TAP query)                              | CDS terms; citation of SIMBAD                                                                                                                                                                                                                                                          | SIMBAD, CDS, Strasbourg                                                                | Identifiers only, to merge without duplicates; nothing of SIMBAD is shown or stored beyond the merge.                                              |

The project accepts the absence of an explicit licence for these catalogue
versions. The four catalogues are therefore imported, and every place that
credits the catalogue says plainly that no explicit licence is published for
these versions (`astro-core/catalogue-sources.js`). Only facts
are embedded: positions, designations, sizes and types; no image and no text
copied from an article. Their positions are given in FK4 (B1900.0, B1950.0)
or galactic coordinates and are brought to J2000 FK5 by
`astro-core/fk4-fk5.js` (E-terms removed, FK4 → FK5 matrix), not by a plain
precession. The import script records the SHA-256 of every source file it
reads in the catalogue's `sources`.

## Target distances

A target's distance is shown when it is known and left out when it is not
The tile is absent rather than a value invented. The
import (rule in `astro-core/target-distance.js`) writes `distance` on each
target record, in this order:

1. **Published value** (`published`): the curated table
   `packages/astro-core/src/target-distances.json` has the object. Its value
   wins over the two layers below, and a far globular cluster, a galaxy whose
   velocity is no distance indicator (a Virgo galaxy at 1 100 km/s) or a nebula
   goes through it. Each entry is one value, never the mean of contradictory
   values, with its reference.
2. **OpenNGC parallax** (`parallax`): an open or globular cluster, a planetary
   nebula or a nebula with `Pax` of at least 0.5 mas; distance = 1 / `Pax`, three
   significant digits. Never for a galaxy (its `Pax` is noise) and never below
   0.5 mas, where inverting a parallax is no longer reliable.
3. **Hubble's law** (`redshift`): a galaxy with `RadVel` of at least 1 000 km/s;
   distance = `RadVel` / 70 km/s/Mpc, two significant digits. It is a model, an
   estimate: every screen that shows it writes « estimation ».
4. Otherwise nothing.

### Licences

- OpenNGC parallaxes and radial velocities, and the distances computed from
  them (layers 2 and 3), are an adaptation of OpenNGC and fall under its
  CC BY-SA 4.0 (share-alike). The OpenNGC credit line says so
  (`distanceSourceCredits`, `astro-core/catalogue-sources.js`, ten languages).
- The curated table is a compilation of **facts** (a measured distance) each
  cited with its bibliographic reference: no text, table or file of a source is
  redistributed. NED-D (NASA/IPAC Extragalactic Database) asks for its
  acknowledgement and publishes no explicit licence (same case as the nebula
  catalogues above); SIMBAD (CDS) asks for its acknowledgement.
  Both acknowledgements are in the credit line. Nothing is non-commercial,
  ODbL or without a licence.
- Wikidata (P2583, CC0) is **not** a source: its values contradict each other
  for one object.
- Harris's catalogue of Milky Way globular clusters (1996, 2010 edition) was
  read to cross-check the globular-cluster distances; none of its values is
  copied.

### How an entry was chosen

Every value was fetched from its source, and the line that carries it is
kept with its evidence. An entry is kept only when it could be checked against a second, independent
source; the rest is left out.

- **Galaxies**: NED-D 17.1.2 (NASA/IPAC). One value per object, from the most
  direct method — Cepheids, then tip of the red giant branch, then surface
  brightness fluctuations, Miras, masers, RR Lyrae, red clump, planetary-nebula
  luminosity function — taking the most recent reference with a stated
  uncertainty of 0.25 mag or less, published in 2000 or later. It is kept when
  another method, or two other references of the same method, agree within
  12 % and the value is within 15 % of the median of the other methods. A
  galaxy with no such primary distance is kept at the Cosmicflows-2 value
  (Tully et al. 2013) only when at least eight Tully–Fisher values from five
  references agree with it within 15 %.
- **Galaxies whose redshift distance was wrong **: a Virgo or
  Ursa Major galaxy at 1 000 to 2 500 km/s has a peculiar velocity that
  spoils Hubble's law (M99 and M61 came out twice too far). For every Messier
  or Caldwell galaxy that was still on the `redshift` layer, or had no
  distance, a redshift-independent value was added, in this order. (1)
  Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94; VizieR J/ApJ/944/94, table 2):
  the galaxy's own distance modulus, converted to Mpc at three digits, kept when
  it is within 25 % of the median of all NED-D values. (2) Otherwise the
  Cosmicflows-4 distance of the galaxy's group (VizieR table 3, at least three
  galaxies), under the same 25 % test (M109: the Ursa Major group, 20.9 Mpc,
  where its own Tully–Fisher value, 25.2 Mpc, is 31 % above the NED-D median).
  (3) Otherwise NED-D: the most direct method with a value since 2000, else the
  published Tully–Fisher value nearest to the median of all NED-D values (at
  least ten values, and no more than 25 % from the Cosmicflows-4 group
  distance when there is one). A galaxy that passes none of these stays on its
  layer (NGC 2775, M77). The Extragalactic Distance Database itself is behind a
  CAPTCHA and was not read.
- **Globular clusters**: Baumgardt & Vasiliev 2021 (MNRAS 505, 5957), kept when
  Harris (2010 edition) is within 20 %.
- **Open clusters and nebulae**: SIMBAD's table of measured distances, taking the
  most precise Gaia parallax since 2019 that agrees with the median of the
  other published values within 15 % and with at least one other independent
  publication; a nebula takes the distance of its exciting cluster where the
  reference says so.

| Object   | Published value | Reference                                                                                                                                                           |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C014     | 2246 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax (clusters NGC 869 and NGC 884) · via SIMBAD                                                  |
| C041     | 47 pc           | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| IC 342   | 3.28 Mpc        | Saha et al. 2002, AJ 124, 839 · 2002AJ....124..839S · Cepheids · via NED-D                                                                                          |
| IC 410   | 3019 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax (cluster NGC 1893) · via SIMBAD                                                              |
| IC 1613  | 0.698 Mpc       | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| IC 1805  | 2187 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax (cluster Melotte 15) · via SIMBAD                                                            |
| IC 1848  | 1981 pc         | Zucker et al. 2020, A&A 633, 51 · 2020A&A...633A..51Z · Gaia parallax · via SIMBAD                                                                                  |
| M2       | 11.69 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M3       | 10.18 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M4       | 1.85 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M5       | 7.48 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M8       | 1272 pc         | Zucker et al. 2020, A&A 633, 51 · 2020A&A...633A..51Z · Gaia parallax (cluster NGC 6530) · via SIMBAD                                                               |
| M9       | 8.3 kpc         | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M10      | 5.07 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M11      | 1888 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| M12      | 5.11 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M13      | 7.42 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M14      | 9.14 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M15      | 10.71 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M19      | 8.34 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M22      | 3.3 kpc         | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M28      | 5.37 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M30      | 8.46 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M31      | 0.78 Mpc        | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| M32      | 0.718 Mpc       | Mould & Sakai 2009, ApJ 694, 1331 · 2009ApJ...694.1331M · TRGB · via NED-D                                                                                          |
| M33      | 0.836 Mpc       | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| M42      | 403 pc          | Kuhn et al. 2019, ApJ 870, 32 · 2019ApJ...870...32K · Gaia parallax (Orion Nebula Cluster) · via SIMBAD                                                             |
| M49      | 16.7 Mpc        | Blakeslee et al. 2009, ApJ 694, 556 · 2009ApJ...694..556B · SBF · via NED-D                                                                                         |
| M51      | 8.58 Mpc        | McQuinn et al. 2016, ApJ 826, 21 · 2016ApJ...826...21M · TRGB · via NED-D                                                                                           |
| M53      | 18.5 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M54      | 26.28 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M55      | 5.35 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M56      | 10.43 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M58      | 16.7 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| M59      | 15.6 Mpc        | Cantiello et al. 2011, A&A 532, 154 · 2011A&A...532A.154C · SBF · via NED-D                                                                                         |
| M60      | 16.5 Mpc        | Blakeslee et al. 2009, ApJ 694, 556 · 2009ApJ...694..556B · SBF · via NED-D                                                                                         |
| M61      | 12.3 Mpc        | Bose & Kumar 2014, ApJ 782, 98 · 2014ApJ...782...98B · expanding photosphere method (SN 2008in) · via NED-D                                                         |
| M62      | 6.03 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M63      | 8.83 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, TRGB and Tully-Fisher, m-M = 29.73 ± 0.02 · via VizieR J/ApJ/944/94                           |
| M64      | 4.36 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, TRGB, SBF and Tully-Fisher, m-M = 28.198 ± 0.03 · via VizieR J/ApJ/944/94                     |
| M65      | 12.2 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| M66      | 10.6 Mpc        | Lee & Jang 2013, ApJ 773, 13 · 2013ApJ...773...13L · TRGB · via NED-D                                                                                               |
| M68      | 10.4 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M69      | 8.9 kpc         | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M70      | 9.36 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M71      | 4 kpc           | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M72      | 16.66 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M74      | 9.77 Mpc        | McQuinn et al. 2017, AJ 154, 51 · 2017AJ....154...51M · TRGB · via NED-D                                                                                            |
| M75      | 20.52 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M79      | 13.08 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M80      | 10.34 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M81      | 3.31 Mpc        | Gerke et al. 2011, ApJ 743, 176 · 2011ApJ...743..176G · Cepheids · via NED-D                                                                                        |
| M82      | 3.53 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · TRGB · via NED-D                                                                                              |
| M83      | 4.61 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| M84      | 17.5 Mpc        | Cantiello et al. 2011, A&A 532, 154 · 2011A&A...532A.154C · SBF · via NED-D                                                                                         |
| M85      | 17.9 Mpc        | Blakeslee et al. 2009, ApJ 694, 556 · 2009ApJ...694..556B · SBF · via NED-D                                                                                         |
| M86      | 17.9 Mpc        | Blakeslee et al. 2009, ApJ 694, 556 · 2009ApJ...694..556B · SBF · via NED-D                                                                                         |
| M87      | 16.7 Mpc        | Blakeslee et al. 2009, ApJ 694, 556 · 2009ApJ...694..556B · SBF · via NED-D                                                                                         |
| M88      | 19.7 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| M89      | 15.9 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · SBF · via NED-D                                                                                               |
| M90      | 17 Mpc          | Kim et al. 2014, ApJ 782, 4 · 2014ApJ...782....4K · TRGB · via NED-D                                                                                                |
| M91      | 15.8 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| M92      | 8.5 kpc         | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M94      | 4.25 Mpc        | Makarov et al. 2013, AstBu 68, 125 · 2013AstBu..68..125M · TRGB · via NED-D                                                                                         |
| M95      | 10.5 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| M96      | 11.7 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| M98      | 13.6 Mpc        | Tully et al. 2009, AJ 138, 323 · 2009AJ....138..323T · Tully-Fisher · via NED-D                                                                                     |
| M99      | 14.4 Mpc        | Poznanski et al. 2009, ApJ 694, 1067 · 2009ApJ...694.1067P · type II supernova (SN 1986I) · via NED-D                                                               |
| M100     | 17.2 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| M101     | 6.71 Mpc        | Riess et al. 2016, ApJ 826, 56 · 2016ApJ...826...56R · Cepheids · via NED-D                                                                                         |
| M103     | 2292 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| M104     | 9.55 Mpc        | McQuinn et al. 2016, AJ 152, 144 · 2016AJ....152..144M · TRGB · via NED-D                                                                                           |
| M105     | 10.2 Mpc        | Lee & Jang 2016, ApJ 822, 70 · 2016ApJ...822...70L · TRGB · via NED-D                                                                                               |
| M106     | 6.85 Mpc        | Hoffmann & Macri 2015, AJ 149, 183 · 2015AJ....149..183H · Cepheids · via NED-D                                                                                     |
| M107     | 5.63 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| M108     | 9.18 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, Tully-Fisher, m-M = 29.815 ± 0.4 · via VizieR J/ApJ/944/94                                    |
| M109     | 20.9 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, Tully-Fisher, group of 9 galaxies (PGC 37617), m-M = 31.596 ± 0.139 · via VizieR J/ApJ/944/94 |
| M110     | 0.81 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · TRGB · via NED-D                                                                                              |
| NGC 55   | 1.86 Mpc        | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| NGC 104  | 4.52 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 147  | 0.755 Mpc       | McQuinn et al. 2017, ApJ 834, 78 · 2017ApJ...834...78M · TRGB · via NED-D                                                                                           |
| NGC 185  | 0.682 Mpc       | McQuinn et al. 2017, ApJ 834, 78 · 2017ApJ...834...78M · TRGB · via NED-D                                                                                           |
| NGC 247  | 3.28 Mpc        | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| NGC 253  | 3.5 Mpc         | Radburn-Smith et al. 2011, ApJS 195, 18 · 2011ApJS..195...18R · TRGB · via NED-D                                                                                    |
| NGC 300  | 1.8 Mpc         | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| NGC 362  | 8.83 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 457  | 2540 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| NGC 891  | 9.1 Mpc         | Radburn-Smith et al. 2011, ApJS 195, 18 · 2011ApJS..195...18R · TRGB · via NED-D                                                                                    |
| NGC 1023 | 9.7 Mpc         | Tikhonov & Galazoutdinova 2002, Ap 45, 253 · 2002Ap.....45..253T · TRGB · via NED-D                                                                                 |
| NGC 1097 | 16 Mpc          | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| NGC 1261 | 16.4 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 1275 | 62.9 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, supernova Ia, m-M = 33.993 ± 0.15 · via VizieR J/ApJ/944/94                                   |
| NGC 1313 | 3.88 Mpc        | Tikhonov & Galazutdinova 2016, AstL 42, 428 · 2016AstL...42..428T · TRGB · via NED-D                                                                                |
| NGC 1365 | 18.3 Mpc        | Riess et al. 2016, ApJ 826, 56 · 2016ApJ...826...56R · Cepheids · via NED-D                                                                                         |
| NGC 1512 | 12 Mpc          | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| NGC 1851 | 11.95 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 1980 | 377 pc          | Poggio et al. 2021, A&A 651, 104 · 2021A&A...651A.104P · Gaia parallax · via SIMBAD                                                                                 |
| NGC 1981 | 378 pc          | Poggio et al. 2021, A&A 651, 104 · 2021A&A...651A.104P · Gaia parallax · via SIMBAD                                                                                 |
| NGC 2070 | 50.12 kpc       | Bono et al. 2010, ApJ 715, 277 · 2010ApJ...715..277B · Cepheids (Large Magellanic Cloud) · via SIMBAD                                                               |
| NGC 2237 | 1304 pc         | Dias et al. 2019, MNRAS 486, 5726 · 2019MNRAS.486.5726D · Gaia parallax (cluster NGC 2244) · via SIMBAD                                                             |
| NGC 2244 | 1304 pc         | Dias et al. 2019, MNRAS 486, 5726 · 2019MNRAS.486.5726D · Gaia parallax · via SIMBAD                                                                                |
| NGC 2403 | 3.06 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| NGC 2419 | 88.47 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 2506 | 3231 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| NGC 2903 | 9.46 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| NGC 3115 | 10.2 Mpc        | Peacock et al. 2015, ApJ 800, 13 · 2015ApJ...800...13P · TRGB · via NED-D                                                                                           |
| NGC 3201 | 4.74 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 3226 | 23.6 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · SBF · via NED-D                                                                                               |
| NGC 3293 | 2590 pc         | Bisht et al. 2021, MNRAS 503, 5929 · 2021MNRAS.503.5929B · Gaia parallax · via SIMBAD                                                                               |
| NGC 3626 | 22.5 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, SBF and Tully-Fisher, m-M = 31.761 ± 0.207 · via VizieR J/ApJ/944/94                          |
| NGC 3628 | 10.3 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| NGC 3766 | 1862 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| NGC 4038 | 21.6 Mpc        | Jang & Lee 2015, ApJ 807, 133 · 2015ApJ...807..133J · TRGB · via NED-D                                                                                              |
| NGC 4039 | 21.6 Mpc        | Jang & Lee 2015, ApJ 807, 133 · 2015ApJ...807..133J · TRGB · via NED-D                                                                                              |
| NGC 4236 | 4.41 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · TRGB · via NED-D                                                                                              |
| NGC 4244 | 4.34 Mpc        | Makarov et al. 2013, AstBu 68, 125 · 2013AstBu..68..125M · TRGB · via NED-D                                                                                         |
| NGC 4372 | 5.71 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 4449 | 4.2 Mpc         | Lelli et al. 2014, A&A 566, 71 · 2014A&A...566A..71L · TRGB · via NED-D                                                                                             |
| NGC 4559 | 7.31 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · Tully-Fisher (Cosmicflows-2) · via NED-D                                                                      |
| NGC 4565 | 11.9 Mpc        | Radburn-Smith et al. 2011, ApJS 195, 18 · 2011ApJS..195...18R · TRGB · via NED-D                                                                                    |
| NGC 4631 | 7.52 Mpc        | Monachesi et al. 2016, MNRAS 457, 1419 · 2016MNRAS.457.1419M · TRGB · via NED-D                                                                                     |
| NGC 4697 | 12.4 Mpc        | Tully et al. 2013, AJ 146, 86 · 2013AJ....146...86T · SBF · via NED-D                                                                                               |
| NGC 4755 | 1887 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| NGC 4833 | 6.48 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 4889 | 106 Mpc         | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, fundamental plane, m-M = 35.126 ± 0.46 · via VizieR J/ApJ/944/94                              |
| NGC 4945 | 3.58 Mpc        | Monachesi et al. 2016, MNRAS 457, 1419 · 2016MNRAS.457.1419M · TRGB · via NED-D                                                                                     |
| NGC 5005 | 16.6 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, supernova Ia and Tully-Fisher, m-M = 31.094 ± 0.206 · via VizieR J/ApJ/944/94                 |
| NGC 5128 | 3.55 Mpc        | Lee & Jang 2016, ApJ 822, 70 · 2016ApJ...822...70L · TRGB · via NED-D                                                                                               |
| NGC 5139 | 5.43 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 5248 | 13.4 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, Tully-Fisher, m-M = 30.635 ± 0.4 · via VizieR J/ApJ/944/94                                    |
| NGC 5253 | 3.36 Mpc        | Sakai et al. 2004, ApJ 608, 42 · 2004ApJ...608...42S · Cepheids · via NED-D                                                                                         |
| NGC 5286 | 11.1 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 5694 | 34.84 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6101 | 14.45 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6352 | 5.54 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6397 | 2.48 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6541 | 7.61 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6744 | 9.09 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, TRGB and Tully-Fisher, m-M = 29.792 ± 0.097 · via VizieR J/ApJ/944/94                         |
| NGC 6752 | 4.12 kpc        | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6822 | 0.481 Mpc       | Bhardwaj et al. 2016, AJ 151, 88 · 2016AJ....151...88B · Cepheids · via NED-D                                                                                       |
| NGC 6934 | 15.72 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 6946 | 6.72 Mpc        | Tikhonov 2014, AstL 40, 537 · 2014AstL...40..537T · TRGB · via NED-D                                                                                                |
| NGC 7006 | 39.32 kpc       | Baumgardt & Vasiliev 2021, MNRAS 505, 5957 · 2021MNRAS.505.5957B · via Baumgardt & Vasiliev table                                                                   |
| NGC 7331 | 15.1 Mpc        | Saha et al. 2006, ApJS 165, 108 · 2006ApJS..165..108S · Cepheids · via NED-D                                                                                        |
| NGC 7380 | 2394 pc         | Dias et al. 2021, MNRAS 504, 356 · 2021MNRAS.504..356D · Gaia parallax · via SIMBAD                                                                                 |
| NGC 7479 | 31.3 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, Tully-Fisher, m-M = 32.475 ± 0.39 · via VizieR J/ApJ/944/94                                   |
| NGC 7814 | 13.6 Mpc        | Tully et al. 2023, ApJ 944, 94 · 2023ApJ...944...94T · Cosmicflows-4, TRGB, SBF and Tully-Fisher, m-M = 30.66 ± 0.08 · via VizieR J/ApJ/944/94                      |
