# Features

## Gallery

The home page is the public gallery: the public captures of every space,
newest night first, one card per capture — its thumbnail, generic tag and
telescope, target, integration when known, the month of the night (never the
day nor the place) and the space's « Nom public » as signature. Generic tag
filters, search, reversed sort and the sky map; `/{locale}/gallery/<capture>`
opens one capture with its target, acquisition (sky quality, month of the
night), equipment and links.

With `ASTRO_PORTAL_GALLERY_SOURCE=files`, the home page is instead the
operator's file gallery, described below.

### The file gallery

The server associates detected files with JSON records and builds one card per
target. Each card shows the selected gallery reference, distinct session count,
object type, telescope or instrument, integration time, date, location when
published, and tags.

Tags come entirely from metadata; no brand or hardware setup is hard-coded.
Search is accent-insensitive and covers the title and astronomical identifiers.
Chronological sorting can be reversed between newest-first and oldest-first.

## Shareable target page

`/image/<target>/<version>` opens the selected target and version directly and
survives a reload. Returning to the gallery restores the previous scroll
position. Arrows, the selector, and carousel position dots remain synchronized.
The sky map, when available, is always placed last.

The information panel includes:

- object, type, constellation, and J2000 coordinates;
- field of view, scale, and orientation when a WCS solution exists;
- acquisition details and calculated Moon illumination;
- exposure count and total integration by filter;
- render, color curve, pipeline, and processing tools;
- equipment;
- general and technical descriptions;
- related links, including Stellarium Web.

## Variants and progressions

Variants may independently describe the render family, color curve, and
processing profile. The portal includes natural and Vespera-style render groups
but also accepts arbitrary metadata-defined labels.

Files under `progression/` become progression steps. Their metadata can specify
the step, period, filter, and integration. Looping playback offers three
intervals and identifies the current step in a banner above the image.

## Plate solving

Plate solving is optional. When Astrometry.net commands and suitable indexes
are installed, solving runs in the background and is cached in the runtime
directory. Extended objects receive a circle; stars use only a leader line and
label. Magnitude thresholds range from 3.5 to 10, with an option to display
every available HYG star: the viewer asks the server for the batch of the
chosen threshold, and stars known by a number only are drawn as unlabelled
points beyond magnitude 8.5.

Leader lines and labels scale with the rendered image and remain inside the
frame on both desktop and mobile.

## Observation planner

The planner combines a date, known location, and equipment profile with target
recommendations, altitude curves, editable time slots, and a short-range
astronomy-weather summary. Its plan cards provide compact, labelled actions for
calendar export, weather, printing, sharing, and export; the target control
opens the selected object in Stellarium Web.

Its **Catalogue** tab is a local, searchable deep-sky library. It is imported
from [OpenNGC](https://github.com/mattiaverga/OpenNGC) and kept in the private
runtime directory rather than queried during use. The selected planner targets
and captured objects reuse its short, localized educational context; a compact
help control exposes that context without replacing the image-specific notes.
The catalogue displays its OpenNGC CC BY-SA 4.0 attribution in the interface.
Its private administration section stores the complete local source catalogue
in SQLite and exposes editable target records, including independent DSS,
premium-photo and visual-image metadata. It begins with editable
**Essentials** and **Extended** target memberships, two disjoint lists, each
target with its modes (visual, photo; `sky-data/target-selection.json`).
Its **Initialization** administration section exports the editable domain data
as a private JSON package, so another instance can be seeded without copying
its SQLite database or media bytes. See [Initialization data package](STATIC_DATA.md).

The planner's **Photo** and **Visual** modes resolve target images separately:
visual references are optional and fall back to the photographic image. Visual
mode also uses a monochrome detailed DSS2-red background for close Stellarium
framing and saves matching monochrome framing previews. Credits stay attached
to their image variant. See [Planner visual mode and framing imagery](PLANNER_VISUAL_MODE.md)
for the source contract, mobile gesture behaviour and verification checklist.
An initial set of 22 iconic targets receives a local, rights-tracked NOIRLab
photograph; every other target keeps the DSS photographic fallback.

When the private sign-in is enabled, the planner begins with an explicit
choice: continue as a guest or sign in. Guest plans remain in this browser's
local storage. Signed-in plans belong to the personal organization and are
saved automatically on the server; the save indicator does not move the editor
layout. When a browser that holds guest plans signs in, an empty server takes
them, a server that already holds plans asks first, and what is taken leaves
the browser's store; retrying never duplicates a plan.

Each plan retains a local undo/redo history for edits to its title, items,
location, equipment, and altitude preference. These controls restore both the
plan and its editing context. They are intentionally local editing controls,
not a replacement for the authenticated server copy or a database history.

Export of one's data: from the application's settings and the web account
page, « Exporter mes données » writes `planastro-export-<date>.zip` — one JSON
per ticked box (plans, places and horizons, equipment, framings, journal and
debriefings, measured sky background) and a README with the format version —
which a private portal can load. Free; the gallery's images stay in the space.

## Responsive behavior

On large screens the panel sits on the right and collapses sideways. Below
850 px it moves under the image and collapses downward. Each region manages its
own scrolling to avoid unwanted document scrolling. The image caption remains
visible while the panel is collapsed.

## Administration

The `/admin` page can select detected files, define the target, objects, tags,
descriptions, and primary relationships, and edit advanced JSON blocks. Writes
are atomic and limited to the metadata directory. Server-side access control
uses the actual TCP address passed by the bundled Node server.
