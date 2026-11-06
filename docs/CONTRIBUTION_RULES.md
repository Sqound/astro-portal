# Contribution rules

Astro Portal can keep, with the observer's explicit consent, a few anonymised
values that help the project improve its own models. This page is the one set
of rules every such contribution follows. It starts with the project's own
**sky-brightness calibration set**; later contributions (session metrics and
confirmed diagnoses) extend these rules and never loosen them.

[Version française](fr/CONTRIBUTION_RULES.md)

## The rules, for every contribution

1. **Strictly opt-in.** Nothing is kept until the observer switches it on, in
   one place only: the section of their space. It is never asked in a pop-up,
   never during a task, and it is off by default.
2. **Anonymised before anything leaves the place that holds it.** A
   contribution never carries an observing place or its coordinates, a file
   path, a name, an address, a serial number, EXIF data, or an identifier of an
   account, a person or a device. Equipment is kept only as a class (focal
   length, pixel scale, mount type), and only when it matters.
3. **A closed list of fields.** Each kind of contribution names the whole of
   what it keeps (below); any other field is refused, and a second list of
   forbidden names (`FORBIDDEN_CONTRIBUTION_FIELDS`,
   `packages/portal/src/calibration/contribution-record.js`) is checked on
   every record and on every exported file.
4. **Revocable.** The observer can withdraw at any time: what has not been
   released yet is deleted at once. **A release already made cannot be
   recalled**, and the consent text says so before the switch is turned on.
5. **A clear licence, announced before the first release.** The released data
   is under **CC BY 4.0** (attribution, commercial use allowed, no share-alike;
   never a non-commercial or ODbL licence), written in every dataset card and
   named in the consent text; the export refuses a card that names another one.
6. **Reviewed, versioned releases.** Maintainers review every release before
   it is published. Each release has a version and a dataset card saying what
   it holds, how it was made and under which licence.
7. **Never from a private server.** A private server keeps its data to itself:
   it offers no consent and sends nothing anywhere. Contributions exist on the
   hosted service only.
8. **No reward, no ranking.** Nothing is shown to others: no leaderboard, no
   counter, no badge.

## The sky-brightness calibration set

What it is for: the sky-quality estimate turns a satellite radiance into a sky
brightness with a constant per region ([SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md)).
The values observers measure or enter are the best evidence there is to refit
those constants; with consent, the project keeps them, without any place, in a
set it owns — no third-party licence involved.

### The record (the whole of what is kept)

| Field           | What it is                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`          | `measured` (the night's value Astro Sync measured on the observer's own frames) or `entered` (the value typed in a place's form)                          |
| `sqm`           | The value, in mag/arcsec², to the hundredth                                                                                                               |
| `band`          | `camera` for a measured value, `sqm` for an entered one (a sky-meter reading); the two bands differ by a systematic offset, which is why the band is kept |
| `radianceLevel` | The sky-quality raster's own 256-level log encoding (0–255) of the cell the place falls in: never the raw radiance, never a coordinate                    |
| `region`        | The calibration region of the place (`japan`, …), `global` outside every region                                                                           |
| `year`          | The year of the night (measured) or of the entry (entered); never the month or the day                                                                    |
| `methodVersion` | The measuring method (`astro-sync-sky/1`), for a measured value; `null` for an entered one                                                                |

The record is built on the service from the stored value and the place, then
the place is forgotten. A radiance level and a region are coarse on purpose:
enough to refit a regional constant, never enough to find a place.

### How it is stored

- `calibration_contributions` holds the records and a random row key, and **no
  column that refers to a space, a person, a place or a device**.
- `calibration_ledger` links a space to its row keys. It is the only link, and
  it exists for two things: withdrawing, and replacing the row of a value the
  observer changed. It is never exported.
- The consent is kept per space, with its date.

### When a value is kept, replaced or deleted

- Switching the consent on keeps the values the space already holds (each
  night measured at a place, and each place's entered value).
- While it is on, a new or changed value is kept, and a changed one replaces
  its row; a value the observer removes (or whose place they delete) leaves the
  set.
- Switching it off stops new contributions; what is already kept stays until
  the observer withdraws it.
- « Retirer mes contributions » (withdraw) deletes the rows and the ledger of
  the space and switches the consent off. Deleting the space does the same.
- Backups hold the rows until they age out, as for the rest of the space.
- A value whose place has no sky-quality raster cell (no raster installed, a
  position outside it) is not kept.

### Releases

A release is a versioned file of the records (row keys and ledger excluded,
rows in a random order) with a dataset card. The licence is CC BY 4.0: the
card says it, a card that is missing or leaves the field empty gets it, and a
card that names another licence is refused. The export checks its own output
against the closed list of fields and the forbidden names before writing
anything. A maintainer reviews the file and the card before publishing them.
