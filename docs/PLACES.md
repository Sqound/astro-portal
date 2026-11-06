# Suggested places

Around a place of yours, the planner can suggest named **viewpoints,
campsites, parks and picnic areas** where you might observe, each with an
estimate of how dark its sky is. Adding one to your places makes it a place
of your own, like any other, with a link back to the place it came from so
its details (website, opening hours, access) stay one tap away.

The French version of this page is [fr/PLACES.md](fr/PLACES.md).

## Where to find them

- **On the phone**: « Planifier » → « Lieux » (« Mes lieux » and « Lieux
  suggérés »), and « Trouver un lieu idéal » in the sheet that chooses the place of a
  plan.
- **On the web**: the « Lieux » view of the planner (the fifth view, next to
  « Plans », « Cadrages » and « Catalogue »), and « Trouver un lieu idéal » in the
  sheet that opens from the « Lieu » field of stage 1 (a sheet at the bottom
  below 600 px, a dialog at the side above). « Itinéraire » and « Ouvrir le
  site » open in a new tab: the web has no maps application, and gives the
  directions page of OpenStreetMap.

## What is suggested

| Type        | What it is in OpenStreetMap                                                              |
| ----------- | ---------------------------------------------------------------------------------------- |
| Viewpoint   | `tourism=viewpoint`                                                                      |
| Campsite    | `tourism=camp_site`                                                                      |
| Park        | `leisure=park` (local extract); national parks/nature reserves in explicit Overpass mode |
| Picnic area | `tourism=picnic_site`                                                                    |

- Only places that have a **name**; a place drawn as an area is placed at its
  centre.
- Within 10, 30, 60 or 100 km of the centre you search around; at most 50
  places, the darkest first (to the hundredth of a magnitude, the figure the
  cards write), and among equal skies the nearest to the centre you searched
  around, so that a region where the raster reads the same everywhere keeps
  its nearest places, not the first by name. The service knows that centre
  only rounded to 5 km, as it always did.
- **Darkness** is the estimate of our own sky-quality raster (the one behind
  every Bortle and mag/arcsec² value of the planner, see
  [SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md)), precomputed during the extract build with the service’s same module. It is an estimate, never a measurement.
- **Distance** is the straight-line distance, measured by your device from
  your own reference place; the service never computes it. The drive time and
  the route are described [below](#drive-time-route-and-the-best-place-tonight).
- **Nothing is promised about access.** A suggestion is a named place, not an
  authorization: access, opening hours and safety at night are not verified,
  and the screens say so.

## Drive time, « Trajet » and the best place tonight

All of this is computed on your device and never calls a routing
service: there is no routing service and no key.

- **Drive time** is an **estimate**, and every screen says so. It is the
  straight-line distance × 1.3 (the road is longer than the crow flies), at
  50 km/h, rounded to 5 minutes: 18 km reads « ≈ 30 min », 100 km
  « ≈ 2 h 35 », anything under five minutes « moins de 5 min ». It shows on
  each suggestion (« Point de vue · 18 km · ≈ 30 min »), and as a line of the
  detail (« Trajet · ≈ 30 min en voiture · estimation »). It knows nothing of
  traffic, roads or weather: the exact route is the maps application's.
- **« Trajet »** (on each suggestion; « Itinéraire » in the detail, same
  action) opens the maps application at the place: Apple Plans on iOS, the
  `geo:` intent on Android, the directions page of OpenStreetMap in a new tab
  on the web. It says nothing about the duration.
- **« Meilleur cette nuit »**, the third « Trier par » choice, orders the
  suggestions by three facts, shown on every row, never as a score:
  tonight's **clouds** (the mean cloud cover over the astronomical night of
  the place you search around, 50 points: 50 × (100 − clouds) / 100), the
  **sky** (the estimated SQM on the 18 → 22 scale of the detail, 30 points)
  and the **drive** (20 × (1 − minutes / 156), 156 minutes being the estimate
  of the largest radius, 100 km; 20 points). A row reads « Nuages 12 % en
  moyenne cette nuit · Bortle 2 · ≈ 30 min en voiture ». Ties go to the nearer
  place. The forecasts are asked only when you choose the sort, five at a
  time, through the same weather read as « Cette nuit », and kept for the
  session. A place whose forecast cannot be read passes after the ranked ones
  (« Prévision indisponible ») and hides none of them; if none can be read the
  list stays in the « Ciel le plus sombre » order and says « Prévisions
  indisponibles. ». Offline the sort is disabled (« Hors ligne. »), and the
  suggestions kept from an earlier search keep their drive times.

## From where

The default source is a **local, worldwide OpenStreetMap extract** built from a
dated Planet file. Searches and known-place details make no
Overpass request. Named viewpoints, campsites, picnic sites and parks are kept
at their geometry centroid (holes and longitude wrapping included), with
estimated Bortle ≤ 7. Unknown estimates are counted and excluded. The same OSM
object is deduplicated across regions first; after the darkness and name
filters, places within 100 m are merged with viewpoint > campsite > picnic >
park priority, then binary OSM-reference order for ties. The boundary is inclusive.
The thresholds are builder options. Names use exact locale, language, then
original `name`; Chinese scripts use `name:zh-Hans` / `name:zh-Hant`, then
`name:zh`. Portuguese uses `name:pt-BR`, then `name:pt` when present.

The builder reads the darkness of every place from the installed service raster
and refuses one that is not **propagated** (its manifest has no `propagation`):
such a raster carries no glow of the cities and reads zero light in the
mountains, so a whole region would come out at the dark end of the scale, every
place alike (Bortle 1, 22,00).

The extract carries source date, licence, stage counts and raster provenance.
It is runtime data outside source code and client bundles. Its details are the
contributors’ original website, description (one sentence, shown as the
source writes it and never translated), hours, access, fee and elevation. Explicit
`ASTRO_PORTAL_PLACES=overpass` retains the older online source with its 30 s
attempt and one default-mirror retry. A missing local database gives 503
`places_unavailable`, reason `source`; it never silently switches to Overpass.

## What the service sees and keeps

- **Your device never talks to OpenStreetMap.** It asks the service, which
  reads the local extract. Only explicit Overpass mode asks the remote source, with the service’s address and User-Agent, never yours.
- **The search centre is rounded** to 0.05° (about 5 km) by your device
  before it is sent, and again by the service before any query. The service
  receives that rounded centre, the radius, the types and your language —
  no account is needed, no position of yours is stored, and the service does
  not write the search to its logs (a reverse proxy in front of it may: see
  its own settings).
- **Searches are never written by the service.** Explicit Overpass mode keeps answers in memory for 30 minutes, 250 searches at most. The local extract contains public source data, never observer positions.
- On the phone, the results of your last searches stay readable offline for
  30 days at most, on that phone only, with their attribution.
- On the web, last results stay in device-only `localStorage` for at most 30 days and survive restart. Cache keys preserve rounded centre, radius, categories and locale. Offline results show their fetched date; an absent cache explicitly explains the need for a connection. Known details are read when shown. On mobile the existing 30-day cache also separates known-detail languages.

## The licence rules

OpenStreetMap data is © OpenStreetMap contributors, under the
[Open Database Licence](https://www.openstreetmap.org/copyright) (ODbL).
Astro Portal applies these rules:

1. Every suggested-place screen shows **© OpenStreetMap contributors (ODbL)**,
   linked to the official copyright page. The API attribution object stays unchanged.
2. No real OSM records are committed or bundled; tests/captures are fictitious.
3. The filtered SQLite is a **Derivative Database**, offered under ODbL 1.0.
   Anyone can obtain the complete active database, free and without an account,
   at **`GET /api/v1/places/extract`** on the same service. Suggested and known
   responses advertise this URL in their `Link` header. The download contains
   only public extract tables, licence URI, attribution and provenance, never
   the observer database.
4. [ODbL sections 4.2–4.6](https://opendatacommons.org/licenses/odbl/1-0/)
   require notices, share alike and an offer of the database or all alterations
   including additional contents. Publishing the builder alone is insufficient.
5. Darkness values are an enrichment derived from the installed EOG VNL raster,
   not a redistribution of its raster cells. Metadata retains the exact EOG
   notice, checksum/year, the fact that the raster is propagated (the glow of
   the cities included), the adaptation and the
   [EOG CC BY 4.0 licence](https://eogdata.mines.edu/files/EOG_products_CC_License.pdf).
   Database rights are ODbL; additional content notices remain applicable under
   CC BY 4.0. Do not use the non-commercial World Atlas or redistribute private
   raster inputs. See [SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md).
6. Adding a suggestion copies only its name/position into your personal place
   and its OSM link; it never publishes your personal place or your plans.

## The sky you measured

The darkness of a place's sky is otherwise an **estimate**, made from
satellite data. Astro Sync can measure it on your own frames instead,
on your computer:

- open the **Analysis** screen, choose the folder of one night and press
  « Mesurer le fond de ciel » (« Measure the sky background »), or run
  `astro-sync sky --folder <night>` (see the [Astro Sync repository](https://github.com/sqound/astro-sync));
- only **solved** frames count: a frame needs an astrometric solution in its
  header (a `TAN` WCS, written by a plate solver). An unsolved frame says
  « pose non résolue » and gives nothing; Astro Sync never solves a frame
  itself;
- a frame counts when the sky is dark enough to compare with the zenith the
  estimate describes: the Sun more than 18° below the horizon, the Moon below
  it, the target more than 40° high, a broadband filter (none, luminance,
  clear, UV/IR cut, green or V);
- the background is read from the pixels with the stars masked, and turned
  into mag/arcsec² with a zero point measured on the same frame, from the
  stars of a reference list found on it (Tycho-2, ESA, via the CDS VizieR
  I/259, about 25 MB; Astro Sync downloads it once, when you agree to it under
  a text that names it, and keeps it on your computer); the sensor's offset comes from the header, or from a dark or a bias of the
  same folder — never guessed;
- the night's value is the median of the frames kept.

« Envoyer la valeur de la nuit » (« Send the night's value ») then sends
**that one number** — with how many frames it is the median of, the method
version and the median time — to your space, free. The images never leave
your computer. The service files it under your place within 500 m of the
frames (or the place of the session's plan) and the night; a later value for
the same place and night replaces it. If none of your places is within 500 m,
nothing is stored: add the place, then send it again. The planner's screens
do not show the measured value yet.

## Settings

| Setting                   | Value                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_PLACES`     | Default/unset or `osm-extract`: local database; `overpass`: explicit remote source; `off`: 503 with reason `disabled`. |
| `ASTRO_PORTAL_PLACES_DB`  | Absolute runtime path to `places-osm.sqlite`. Required for local mode.                                                 |
| `ASTRO_PORTAL_PLACES_URL` | The Overpass instance to query (default `https://overpass-api.de/api/interpreter`).                                    |

A self-hosted portal reads its configured extract, explicitly selects Overpass, or switches suggestions off (see [SELF_HOSTING.md](SELF_HOSTING.md)).

## For developers

`GET /v1/places/suggested` and `GET /v1/places/known` are described in
[`packages/astro-contracts/schemas/api/v1.md`](../packages/astro-contracts/schemas/api/v1.md)
(« Suggested places ») with their schemas `places-suggested.schema.json` and
`place-known.schema.json`. The code is `packages/portal/src/places/`; the
link is normalised by `normalizeKnownPlaceLink` in
`packages/portal/src/planner/state.js`.

`POST` and `GET /v1/place-sky-measures` (the measured sky background) are
described in the same file (« Measured sky background ») with their schema
`place-sky-measure.schema.json`; the store is
`packages/portal/src/persistence/place-sky-measure-repository.js` (table
`place_sky_measures`), the measure `astro-sync-core`'s `analysis::sky`,
`analysis::photometry` and `analysis::sky_night`.
