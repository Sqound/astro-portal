# Planner contexts

The planner uses a shared date and observing place, followed by named plan tabs.
Each tab owns its observing mode, equipment, multiple filters, constraints,
target browsing preferences, targets and intervals. Place/date remains the shared
night context. The stages read in the order of use: 1 Place and date, which holds the
night's astronomical and weather forecast; 2 Equipment (including the imaging/visual
mode); 3 Constraints; 4 Choose targets, which opens on the count of suitable targets
and « Suggest the best targets »; then Arrange the night (stage 5, until it becomes a
panel). The plan tabs follow stage 1.

## Persistence and migration

`planner-state.js` defines portable schema version 2. `nights[]` own frozen place
snapshots; each `plans[]` entry refers to a `nightId` and contains all its settings.
The flat plan collection and top-level active-setting projection preserve existing
export and component interfaces. A place includes an identifier, version, name,
coordinates, IANA time zone and horizon. Editing a saved place does not rewrite
historical nights. Removing it from the library does not delete their snapshots.

Guests keep their plans in browser storage, with a `:before-v2` copy on migration.
Authenticated users retain tenant-scoped SQLite persistence. SQL migration 14 adds
plan settings and tenant night contexts without replacing existing target rows.
Authenticated saves are serialized. Malformed documents and writes from stale
pre-upgrade clients are rejected before mutation. Import retains existing plans.

Legacy settings that were not recorded are marked for review. Missing historical
locations are not inferred from the current location; unlocated horizon profiles
are retained for explicit association. Changed constraints never silently remove
saved targets or intervals: incompatible targets retain their curve and a reason.

The catalogue stores right ascension in hours; the planner and map use J2000
degrees. Conversion occurs at the catalogue API adapter. A legacy snapshot is
repaired only when its two coordinates match the same catalogue object's old
hour-based representation. Its original value is retained, and the plan is flagged
for review. User-defined framing centres are never converted or moved.

## Maps, framing and filters

List/Map and Absolute/Horizon are separate choices. Absolute mode has no clock
control: its J2000 canvas remains independent of the observation time. It retains
layers, zoom, telescope field, centring, exact free framing and equipment snapshots.
Horizon mode retains its clock, linear/circular projections, rotation and labels.
The location editor draws obstacles without astronomical targets because no plan
configuration is available at that stage.

Plan tabs and mode controls use the same camera/eye symbols; List/Map and
Absolute/Horizon each keep a separate, meaningful icon pair. The visible-target
count stays on the same row as List/Map. Until a date and usable observing place are available, the
active plan shows a prominent prerequisite notice instead of failing silently.
Target descriptions are rendered in a page-level layer so they remain above
cards and maps; on a narrow viewport this becomes a dismissible full-screen panel.

Multiple selected filters are alternatives, not an intersection. With equipment
restriction enabled, a target compatible with any selected filter remains eligible;
no selected filter means no filter restriction. Unknown compatibility is not treated
as incompatibility. Explicit observing-guide filter families take priority. Where
missing, the UI identifies object-type-derived compatibility as indicative rather
than pretending that an editorial recommendation exists. Per-filter Moon thresholds
are evaluated using compatible filters, independent of their selection order.
Advanced mount constraints are evaluated for every sampled target position. When
zenith avoidance is enabled, the Horizon map draws its altitude limit in orange
and greys targets that are inside the excluded zenith area at the displayed time.
The same evaluator applies the zenith and cable-sector exclusions to recommendation
windows, so the map is a rendering of the calculation rather than a separate rule.

## Geographic services

Leaflet displays interactive OpenStreetMap tiles with attribution. Address search
and optional reverse geocoding use Photon through `/api/planner-location`, only on
explicit search or position selection. Searches are bounded, cached briefly in
memory and serialized. `ASTRO_PORTAL_GEOCODER_URL` can point to a self-hosted Photon
instance. Address queries and reverse-geocoded coordinates are sent to that service;
map tiles disclose the viewed area to the tile provider. Time zones are resolved
locally using `geo-tz`, not the computer's zone or a fixed UTC offset. GPS permission
is optional: map clicks and manual coordinates remain available. A geocoder outage
does not prevent saving valid coordinates. Third-party availability is not guaranteed.

Existing authentication, media storage, release hosting and private data paths are
unchanged. Back up SQLite before deploying the additive database migration.

## Place and horizon interactions

One place selector is used for the night. A matching saved context on the selected
date can be reopened from it; historical contexts remain available through saved
plans. Separate buttons open a read-only horizon preview or the place editor.
The editor starts with a circular view. Reset means zero obstruction everywhere;
newly saved horizon profiles are always applied, with no extra activation checkbox
or confirmation step. Historical snapshots are retained unchanged.

At the save step, the destination comes before the editable place name. Replacing
a place more than 10 km from the draft position shows a geographic-distance warning.
The warning does not prevent deliberately updating a moved observing site.

The planning horizon map displays a compact current time at the top-left of the
map. Horizontal
pointer gestures move earlier/later through the night; vertical gestures remain
available for page scrolling. The ordinary time slider remains available for
keyboard users. Interval legends follow the actions, below the time axis. Moon
altitude is identified by a blue crescent at the curve endpoint; Moon-separation
colours use pastel rose, peach and mint rather than the interface's amber fill.
The overview uses one Moon curve across all target bands. Opening one target keeps
every band visible and moves the Moon curve into the detailed editor. When an
interval already overlaps another target, moving its start shifts the whole
interval and preserves its duration. Map previews keep explicit small add/remove
controls. Absolute and Horizon previews use the same compact add/remove action in
the detail area; neither turns the full preview image into an accidental action
surface.

## Weather requests

`/api/planner-weather` shares a bounded location forecast between the calendar and
the selected night. Equipment and constraint edits do not refetch weather. The
server deduplicates in-flight requests and caches Open-Meteo results for 20
minutes (64 locations maximum). If Open-Meteo fails, the server requests MET
Norway Locationforecast and respects its `Expires` and `Last-Modified` caching
headers, with a 30-minute minimum. On failure of both providers, an existing
forecast no older than three hours may be shown with its retrieval time and an
explicit stale-data warning. Without such a forecast, the interface names both
failed providers, keeps planning available and offers a retry. Provider 429
responses honour `Retry-After`, and transient failures have a retry cooldown.
Missing observations are not converted into zero cloud cover, humidity,
visibility or precipitation probability. The night score is reweighted over
the measurements actually present.
The hourly strip distinguishes cloud cover, rain probability, humidity, wind
and visibility with separate icons. Humidity and rain probability are therefore
never represented by the same drop symbol.

A future night beyond the current forecast window shows a dedicated informational
notice rather than a provider-error state. It explains that weather will appear
automatically as the date approaches while astronomical calculations remain
available. Past dates do not receive this future-date notice.

The public providers are externally rate limited and have no uptime guarantee;
local caching cannot remove a quota already reached upstream. See the
[Open-Meteo API documentation](https://open-meteo.com/en/docs), its
[service limits](https://open-meteo.com/en/pricing), and the MET Norway
[Locationforecast documentation](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
and [licence](https://docs.api.met.no/doc/License.html). The interface identifies
when MET Norway is active and credits its adapted CC BY 4.0 data. It also warns
that unavailable fallback indicators are represented by a dash.

## Light-pollution estimate

`/api/planner-sky-quality` samples the configured LightPollutionMap-compatible
WMS once per observing place rounded to three decimals. The initial astronomical
forecast summary displays its Bortle equivalent and modelled SQM beside the
astronomical-night and Moon-illumination values. Concurrent requests are shared;
the annual-model result is cached for 30 days and an existing estimate may be
used as a fallback for up to 370 days. The response never contains coordinates.
This value is a VIIRS-derived planning estimate, not an on-site SQM reading.
