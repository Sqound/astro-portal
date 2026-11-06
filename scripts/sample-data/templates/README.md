# Astro Portal sample data

Records of a few observing nights, made with one small telescope, that give
an Astro Portal its demonstration data: sessions and their field journal,
debriefing supplements, analyses, captures, equipment, plans and framings.
The processed images they refer to travel separately, in a pack
of images (see below).

- Format: `{{FORMAT}}`, version {{FORMAT_VERSION}}, produced on {{CREATED_AT}}.
- Content: {{SESSION_COUNT}} session(s), {{IMAGE_COUNT}} image(s), image pack version {{PACK_VERSION}}.

## Licence and attribution

The records and the images are published under the
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
licence (the text is in `LICENSE`). The code of Astro Portal is under another
licence (AGPL-3.0); a software licence does not suit images and journals.

Attribution: **{{ATTRIBUTION}}**

## Install

Into a portal that is set up (it has its owner: the account made at the first
sign-in) and holds no data yet — a private portal is the space of one person,
and the records go into that space. The command finds it by itself and never
creates an account:

```bash
node scripts/sample-data/install.mjs --database <database of the portal> --images-dir <folder of the portal images>
```

The command reads the manifest of the image pack, shows its version, its size
and its SHA-256, asks for your confirmation, downloads the pack, checks its
SHA-256 before extracting anything, then writes the records. With
`--pack <archive>` it uses a local archive; with `--records-only` it writes
the records alone. It refuses a portal that is not set up yet (set it up
first), a portal with several spaces, and a portal that already holds data.

## The place is not the place of the shots

Every place of the records is one and the same: **Alpes-Maritimes (France)**,
at 43.9 N, 7.1 E, elevation 500 m — the centre of the department, rounded to a
tenth of a degree. It is not where the images were made. Horizon profiles are
left out. Times are in UTC and pointings are real, so the site can only be
guessed to within a few hundred kilometres.

## What was removed

Every other place, coordinate, horizon, path, e-mail address, device and
identifier; the metadata blocks of every image (EXIF, XMP, IPTC, text chunks,
thumbnails, trailing data), whose pixels are copied byte for byte; the names
of files. The identifiers are renumbered. `node scripts/sample-data/verify.mjs`
checks all of it again, independently, on these files.
