# Catalog administration

## Access control

When a private server signs in (`ASTRO_PORTAL_AUTH_MODE=password` or
`email-code`, docs/PRIVATE_NOTEBOOK_AUTH.md), `/admin`, `/api/admin/catalog`,
`/api/admin/target-library` and the private equipment endpoints require the
owner's session. Administration is then available from the account menu,
including through the TLS tunnel.

When authentication is disabled, the legacy access control uses the TCP peer
address injected by `server.mjs` into an internal header. The server overwrites
any value supplied by the client.

The following are allowed:

- `127.0.0.1` and `::1`;
- exact IP addresses in `ASTRO_PORTAL_ADMIN_ALLOWED_IPS`;
- IPv4 CIDR networks declared in the same variable.

Example:

```bash
ASTRO_PORTAL_ADMIN_ALLOWED_IPS=192.168.1.42,10.20.0.0/16 npm start
```

When authentication is disabled, a request carrying Cloudflare headers is
always denied, even when `cloudflared` connects to the server through localhost.

Do not start the application with `next start` directly. Use `npm start`, which
runs the access-control server.

## What the administration holds

The portal's administration (`/{locale}/admin`) holds what the owner of a
server administers, and nothing else:

| Tab                     | What                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue               | the targets ([Target catalogue](#target-catalogue))                                                                                                                       |
| Initialisation          | the initialization data ([Initialization data](#initialization-data))                                                                                                     |
| Matériel par défaut     | the equipment a new space starts with ([Default equipment](#default-equipment))                                                                                           |
| Traductions, Références | the words of the instance and its reference libraries                                                                                                                     |
| Journaux                | the logs of the instance ([Logs](#logs))                                                                                                                                  |
| Galerie de fichiers     | the operator's file gallery, only with `ASTRO_PORTAL_GALLERY_SOURCE=files` ([Creating a capture](#creating-a-capture-preparation-to-publication-workflow)) — not a review |
| (no tab)                | the backups, by their API ([Service backups](#service-backups))                                                                                                           |

It opens on « Catalogue ». Nothing commercial is administered here: a private
server sells nothing and has no team — its owner decides alone what is public
(the « rendre privé » of « Mon espace »). The hosted service administers its
commercial side (the review of its public gallery, the feedback, the beta,
the subscriptions it gives, its offers) in a platform administration of its
own, private, outside this repository. The bar is the same on every server:
no package adds a section to it, and the administration's API under
`/api/admin/*` is the same on every server too.

**No last-resort access here.** Opening a space's files on an authority's
request is not a gesture of this administration, on any server. On a private
server there is no one else's space to open: the owner reads their own files.
The hosted service's last-resort access lives in its platform
administration (the authority, its request and its reference required, a
line of `admin_access_log` written before the place of the files is given,
never their content), and its command line is kept beside it, for the day
that administration cannot be reached; neither is part of this repository.

## Target catalogue

The **Catalogue** administration section manages the local deep-sky catalogue,
not the public gallery's capture records. On its first use, the portal imports
every available OpenNGC/Barnard target into the private SQLite table
`target_catalogue_entries`. The original OpenNGC record remains attached to
each row as a read-only source record; the catalogue is never queried from the
network while the portal is in use.

The target form exposes the stable identifier, designations and aliases, common
names, type, constellation, J2000 coordinates, dimensions, magnitude, surface
brightness and catalogue references. Its three media panels retain separate
metadata for the DSS fallback, selected premium photograph and optional visual
reference. Image files themselves remain in the private runtime directories;
the form edits their local filename and attribution metadata, not image pixels.

The form also shows two read-only hemisphere flags. They are derived from the
target declination using a 30° minimum culmination at representative 30° north
and south latitudes. Both flags are therefore possible; saving a changed
declination recalculates them automatically.

The additional editorial JSON may contain a `catalogueResearch` profile. Its
English source text, localized translations and source links are used by the
planner’s “About this target” panel. The research generator preserves this
profile through later source-catalogue synchronizations, so the administrator
can improve an individual target without losing that work.

The editorial selection is deliberately a starting point rather than an
observing-site filter. Its default content is
`packages/astro-core/sky-data/target-selection.json` (see
[STATIC_DATA.md](STATIC_DATA.md)):

- **Essentials**: the targets that are spectacular in a small instrument and
  observable every year from a mid-latitude site.
- **Extended**: the targets worth proposing beyond the Essentials. The two
  lists are disjoint: a target is in one of them at most.

Each target of a selection carries its modes, two boxes of its sheet,
« Visuel » and « Photo »: the suggestions of a profile in visual mode propose
the targets ticked « Visuel » (or neither), those of a profile in photo mode
the targets ticked « Photo » (or neither); a catalogue ticked in the
suggestions' filters is proposed whole, whatever the modes. The memberships
and the modes are editable for every object; the administrator's choices are
stored in the database (`target_collection_memberships`: `essential`,
`extended`, `mode-visual`, `mode-photo`). A new version of the default file
replaces them once on an existing instance (see STATIC_DATA.md). Saving a
target also stores an editorial override for its editable catalogue and media
fields. A later import refreshes the attached source record without replacing
those manual choices. There is no image upload in this first screen: import or
place an asset in the correct private media directory first, then enter its
valid filename, source, credit and licence in the target record.

## Initialization data

The **Initialization** section lists every editable domain/reference dataset
that ships with an instance: taxonomy, catalogue descriptions, common names,
Caldwell links, planner targets, guest equipment presets and planetary display
records. It edits the instance's database copy. Select **Export initialization
package** to write the complete private JSON package, including the target
catalogue and its media metadata. See [Initialization data package](STATIC_DATA.md)
for the schema, lifecycle and copy boundary.

## Creating a capture: preparation-to-publication workflow

The catalogue record describes the astronomical target, selected renders and
the editorial/processing context. The private inventory is the only source of
equipment shown on the public detail panel. Prepare the inventory first, then
create or edit the capture.

1. Open **My space** → **Equipment** (`/{locale}/manage/equipment`).
2. Create or complete every piece of equipment used by the session before
   editing the capture. Use a stable display name and complete the technical
   fields that are known (for example aperture and focal length for an
   instrument). Create a separate record for a mount, controller, guide scope
   or guide camera when it must be named publicly.
3. Open **Captures** at `/{locale}/admin/captures` (the
   section has no tab of its own; each space's captures are in « Mon
   espace »), choose **New capture**. Give it a stable lowercase,
   hyphenated identifier, select controlled category/object/constellation
   values, and enter the title for every active portal language.
4. In **Images of this capture**, first review the automatically detected
   candidates, then select only the files belonging to this target. Automatic
   matching is useful for a coherent naming convention; manual selection is
   the authoritative choice when a folder also contains tests or unrelated
   renders.
5. Choose the **gallery image** (blue marker) and the **reference image**
   (orange marker). The gallery image is the card shown in the gallery. The
   reference image is the fallback used when no gallery image is explicitly
   chosen. Check the quick preview: it reproduces the gallery carousel and
   information panel in compact form.
6. Complete the target, acquisition, processing, integration and editorial
   sections. Per-image metadata is for a property specific to one render;
   target-level metadata is for facts shared by every render. Describe
   processing in the processing section, not in the astronomical editorial
   description.
7. Save the capture once. This creates its catalogue identifier and enables
   its equipment associations.
8. In **Equipment used for this capture**, make two explicit selections:
   **Main equipment** for the imaging instrument, main camera, mount, filters,
   controller and optical accessories; and **Guiding** for the guide scope and
   guide camera. Save the association. An item can belong to one role for a
   capture; move it between the two roles rather than selecting it twice.
9. Reopen the public detail page and verify the selected render, acquisition
   values, processing information and equipment rows before sharing it.

Saving a capture writes its metadata atomically and makes the public catalogue
update immediately. The editor never modifies image files. Advanced blocks are
JSON: validation reports the first invalid field. The full JSON editor is for
unusual target/media metadata only; do not add an `equipment` block there.

## Equipment

Every person keeps their own equipment in **My
space** → **Equipment** (`/{locale}/manage/equipment`), the administrator
included: the administration no longer has an **Equipment** tab. There, create
private records for telescopes, guide scopes, cameras, eyepieces,
lenses/optical modifiers, filters, mounts and controllers. Enter a clear display name and the technical values needed by the
planner; for example, a telescope's aperture and focal length. The equipment
data is stored in the private SQLite database, not in the public release or
the catalogue JSON.

Back in **Captures**, select the equipment used for the current catalogue
target in the **Main equipment** and **Guiding** groups, then save the
association. This does not modify media or JSON metadata. It is the source for
the public equipment rows, the session journal and, when signed in, the
planner's equipment selectors. Only the selected display name and public
technical summary are projected to the public catalogue; private notes,
inventory identifiers and planner settings are never exposed. A guest sees
only **Custom** fields and an explanation that sign-in is required to use the
private inventory. Archiving a record is non-destructive: it removes it from
future choices but keeps the audit trail and past capture associations.

## Default equipment

The administration's **Default equipment** tab (`/{locale}/admin/default-equipment`)
keeps the list every space is offered in the group « Matériel par défaut » of
the planner's pickers, for every kind, with the same list and form: add, edit,
order, archive and restore. Its rows are held by the platform organisation
(id `platform`), which is no one's space: a deleted space never takes them
along and an export never carries them. The list was seeded from the common
equipment profiles of the open core, each with the profile's own identifier,
so that a plan naming one still resolves. A space may hide it (« Masquer le
matériel par défaut ») to see its own equipment only.

The session journal keeps the concise equipment name. Its information control
uses the same private record to show the relevant technical characteristics.
There is no free-form catalogue-equipment fallback: complete the private record
and associate it if a public detail row is missing.

## Logs

The **Logs** section (« Journaux », `/{locale}/admin/logs`) lists the lines of
the application log, newest first (250 shown): the service's warnings and
errors (source « Service », stored as `server`), the incidents the browsers
report anonymously (`POST /api/logs`, source « Web », stored as `client`) and
the error logs sent by the applications whose person did not turn the option
off (source « Mobile », stored as `mobile`; `api/v1.md`, « Application error
logs »). The list filters by level and by source. A line from an application
names neither a space nor a device: it is anonymous, and, tied to no space, it
expires by age.

`GET /api/admin/logs?level=&source=client|server|mobile&limit=` returns
`{ logs }` (at most 500) for the administrator alone (403 otherwise).

Every line is kept 30 days, whatever its source: the service deletes the
older ones every hour (and the phones' at each new batch too).

## Devices and their versions

The mobile application and Astro Sync say which build makes each request
(`X-PlanAstro-Client`, `api/v1.md`, « Client identity »): the service keeps the
version and the system each device last named with the time it was last seen,
and « Mes appareils » (`GET /v1/devices`) gives them as `appVersion` and
`osVersion` — `null` for a device that never sent the header. Nothing else of
the device is read from it.

## Writes and backups

The server writes only inside `ASTRO_PORTAL_METADATA_DIR`. It first creates a
temporary file in the same directory and then renames it, so an interruption
during the write does not leave a partially replaced JSON file.

Atomic writes are not a backup. Version the metadata directory in a private
repository or back it up before an important imaging campaign. The editor never
modifies image files.

If a file contains a `{ "targets": [...] }` document, only the matching entry is
replaced. A new target is written to `<id>.json`.

## Runtime backup and restore

`scripts/backup-runtime.mjs` and `scripts/restore-runtime.mjs`
(`npm run backup:runtime` / `npm run restore:runtime`) are the scripted
procedure for both persistence backends.

**Backup.** SQLite is snapshotted with `node:sqlite`'s own backup API — never
a copy of a live database file. PostgreSQL is dumped with `pg_dump` run
**inside** the dev container (`docker exec astro-dev-postgres …`); no
PostgreSQL client tools are assumed on the host. Either way the command
selects its backend from `ASTRO_PORTAL_DATABASE_PATH`/`ASTRO_PORTAL_DATABASE_URL`
(or the matching `--database-path`/`--database-url` flag) and writes a
timestamped directory under `backups/` (override with `--out`) containing the
database artifact, `backup-info.json` (backend, schema version, app version,
row counts per table) and `media-manifest.json` (every file under the media
directory, by relative path, byte size and SHA-256 — never copied unless
`--with-media` is given). The media directory defaults to
`ASTRO_PORTAL_IMAGES_DIR`, overridable with `--media-dir`. The container name
is read from `ASTRO_PORTAL_POSTGRES_CONTAINER` (default `astro-dev-postgres`).

```bash
npm run backup:runtime -- --with-media
ASTRO_PORTAL_DATABASE_URL=… npm run backup:runtime -- --media-dir /path/to/images
```

**Restore.** `scripts/restore-runtime.mjs --backup backups/<id>` restores
**only** into an explicitly named, empty target: `--target-path <directory>`
for SQLite (refused if the directory exists and is not empty) or
`--target-database-url <url>` for PostgreSQL (refused if the database already
has any table), restored with `pg_restore` run inside the same container.
It never touches a live directory or database. After restoring it recomputes
row counts per table and, with `--with-media --media-dir <directory>`, every
restored file's SHA-256, and exits non-zero on any mismatch with
`backup-info.json`/`media-manifest.json`.

```bash
npm run restore:runtime -- --backup backups/2026-09-27T07-42-13-912Z-806913 \
  --target-path /path/to/empty/directory
```

Neither script ever reads or writes a live directory or database as a
restore target.

**What is left out.** The rows the service re-imports from the static data
(the catalogue texts, `target_texts`, and the record of their shards,
`target_text_shards`): under SQLite they live in a second file,
`<name>.texts.sqlite` next to the database, which no backup copies; under
PostgreSQL the dump keeps their tables' definitions and leaves their rows out
(`pg_dump --exclude-table-data`, recorded as `excludedTableData` in
`backup-info.json`, with their row counts at 0). A restored database starts
with them empty and the service imports them again from
`target-library/texts/`.

The scripts are thin command-line wrappers: the backup and restore code
lives in the portal package (`packages/portal/src/persistence/backup/`) and
is the same code the service uses for its own backups, below. A backup
directory is assembled under a hidden `.partial-…` name and renamed into
place once complete, so an interrupted run never leaves a directory that
looks finished.

## Service backups

A portal running on **SQLite** backs itself up, in its own process, with
SQLite's backup API — never a copy of the open database file. This is what
the distroless image relies on: there is no shell in it and nothing else may
open its database. Under **PostgreSQL**
the service attempts nothing and says so in one log line (`backups are
managed outside the service`): back that database up where it is hosted, or
with `scripts/backup-runtime.mjs` above.

### What a backup contains

```text
<backup directory>/2026-09-29T02-00-00-000Z-v1.0.1-s28/
  portal.sqlite        the snapshot (an ordinary SQLite database)
  backup-info.json     versions, row counts, size, SHA-256, kind
  media-manifest.json  every media file: relative path, size, SHA-256
```

The snapshot is the main database file only: the catalogue texts live in
`<name>.texts.sqlite` next to it, which the service rebuilds from the static
data and never backs up (see "What is left out" above).

The name is the UTC time, the application version and the schema version.
`backup-info.json` carries the same fields as a script backup (backend,
schema version, app version, row count per table, media summary) plus
`appBuild` (the image's `sha-…` tag), `kind` (`startup`, `on-demand`,
`scheduled` or `pre-restore`), `keep`, `artifactBytes`, `artifactSha256`, `integrity`
(SQLite's quick check of the snapshot) and `durationMs`. The media are
never copied: the manifest records them only, and a file whose size and
modification time did not change keeps the digest of the previous backup
instead of being read again.

| Variable                           | Default                                                        | Role                                                           |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `ASTRO_PORTAL_BACKUP_DIR`          | `<ASTRO_PORTAL_RUNTIME_DIR>/backups`                           | Where backups and restore requests live.                       |
| `ASTRO_PORTAL_BACKUP_MEDIA_DIR`    | the captures directory (`<ASTRO_PORTAL_RUNTIME_DIR>/captures`) | The tree the media manifest describes; `none` for no manifest. |
| `ASTRO_PORTAL_BACKUP_KEEP_LATEST`  | `10`                                                           | Latest backups kept, per kind (startup, on-demand).            |
| `ASTRO_PORTAL_BACKUP_KEEP_DAILY`   | `7`                                                            | Days (UTC) for which the newest backup is kept.                |
| `ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS` | none                                                           | No backup is kept past this age (see « Retention »).           |
| `ASTRO_PORTAL_BUILD_ID`            | empty (set by the image to its `sha-…` tag)                    | The build compared at startup; its commit is in the footer.    |
| `ASTRO_PORTAL_SQLITE_LEASE`        | on                                                             | `off` disables the single-process lease (below).               |

The footer of every page ends with the version of the software and, small,
the commit it was built from (« v1.0.1 · 5f295f159 »). An image gives the
commit by `ASTRO_PORTAL_BUILD_ID` (`deploy/install.sh` passes the checkout's
commit to the image it builds); a release made by `scripts/deploy-release.mjs`
carries it in its file `.astro-portal-commit`; a checkout started with
`node server.mjs` asks git once at start. When none is known, the footer
shows the version alone.

### At every start

Before Next.js is prepared and before any migration, `server.mjs`:

1. takes the SQLite lease, which only one process can hold: a second
   process on the same database waits up to 40 s for it, then does not
   start;
2. refuses a database migrated by a newer version (one that records a
   migration this code does not know) before writing anything, and exits.
   With a restore request pending, the request is processed first and the
   restored database is checked;
3. processes a restore request, if one was deposited (below);
4. compares the application version, its build and the database's schema
   version with the latest backup; when one differs, or when there is no
   backup yet, it takes a `startup` backup of the database exactly as the
   previous version left it. A restart with the same image and the same
   schema takes none (about 1 ms);
5. applies the pending migrations. If step 4 failed while migrations are
   pending, the service refuses to migrate, logs
   `refusing to migrate without a backup` and exits: the database stays as
   it was, the service never becomes healthy. Without a pending migration,
   a failed backup is logged as an error and the service starts;
6. removes old backups (retention, below).

Each step writes one line to the console (`[Astro Portal] info
backup.startup: Startup backup … taken in 96 ms …`), copied into
Administration → Logs once the server is up. The server only listens once
all six steps are done. Measured on a development machine, a startup
backup of a 36 MB database costs about 0.1 s (snapshot, quick check,
SHA-256); a network file system is slower.

### On demand

`GET /api/admin/backups` lists the backups, newest first, with their state —
`valid`, `invalid` (a directory whose content does not add up, with the
reason) or `incomplete` (an unfinished `.partial-…` directory) — and the
restore requests seen in the backup directory. `POST /api/admin/backups`
takes an `on-demand` backup now; `{"keep": true}` in the body marks it to
keep. Both follow the rule of the other administration routes (the owner's
session, and the CSRF token for the POST; the address rule when
authentication is off). There is no administration screen for them yet:
open the URL signed in to list, and from the browser console of a signed-in
page (the CSRF cookie is `__Host-astro_portal_csrf` when the cookies are
`Secure`, `astro_portal_csrf` over plain http):

```js
await fetch("/api/admin/backups", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-astro-csrf": document.cookie.match(
      /(?:^|; )(?:__Host-)?astro_portal_csrf=([^;]+)/,
    )[1],
  },
  body: JSON.stringify({ keep: true }),
}).then((response) => response.json());
```

No route serves the content of a backup: it leaves the service only through
the storage, with the operator's own credentials.

### Retention

After each backup, the service keeps:

- the 10 latest `startup` backups and the 10 latest `on-demand` ones;
- the newest backup of each of the last 7 days (UTC);
- the newest valid backup, always, however old;
- every backup marked to keep: `keep: true` (on-demand request), every
  `pre-restore` backup, and any backup directory containing a file named
  `keep` (drop an empty one there by hand);
- anything it did not make itself (script backups, invalid directories).

A `.partial-…` directory older than an hour is removed.

With `ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS`, nothing above outlives that age:
every directory of the backup directory older than it is removed, marked to
keep or not, the newest valid one included. So that the service is never
left without a backup, it then takes a `scheduled` backup whenever the
newest one is a day old, at start and every hour, and applies the
retention every hour too.

### Restoring from a backup

Without a shell, a restore is asked for with a file: write
`restore-request.json` in the backup directory, then restart the service.

```json
{
  "backupId": "2026-09-29T02-00-00-000Z-v1.0.1-s28",
  "requestId": "restore-2026-09-29-1"
}
```

`requestId` is optional; give each request a new one: a request whose
`requestId` was already processed is refused. At start, the service:

1. renames the request `restore-request.<time>.processing.json` before
   anything else, so it can never run twice;
2. verifies the backup: identifier, `backup-info.json`, the snapshot's size
   and SHA-256, SQLite's full `integrity_check`, row counts and schema
   version;
3. backs up the current database first (`pre-restore`, always kept);
4. writes the snapshot over the database through SQLite's backup API (one
   transaction: interrupted, the database is unchanged), then verifies it,
   and puts the previous state back if it does not verify;
5. renames the request `….done.json` (with the pre-restore backup's
   identifier inside) or `….refused.json` (with the reason), then starts —
   the usual startup backup and migrations follow.

A refused request (unknown backup, corrupted snapshot, repeated
`requestId`…) leaves the database untouched; the service starts on it. A
`….processing.json` found at start means the process stopped mid-restore:
it is renamed `….interrupted.json`, reported in the log, never replayed.
