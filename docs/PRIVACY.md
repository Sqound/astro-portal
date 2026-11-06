# Privacy

Astrophotography files may disclose more than expected: observing locations,
EXIF GPS coordinates, dates and times, people's names, filesystem paths,
instrument identifiers, or links to external accounts.

## Before public exposure

1. Review every catalog JSON file.
2. Review EXIF metadata in published JPEG and TIFF files.
3. Check all text visible in screenshots.
4. Never publish `.env`, the runtime directory, or logs.
5. Test the URL from a device genuinely outside the LAN.

`ASTRO_PORTAL_REDACT_LOCATIONS=true` recursively removes fields named `lieu`,
`location`, `GPS`, or `coordonnées GPS` from the API and interface of the
operator's gallery; the sky quality (`skyQuality`, a Bortle class and an SQM
estimate, never a coordinate) stays. It does not modify the operator's source
files or remove their EXIF metadata: GPS embedded in a JPEG of that gallery,
published directly, remains available in the downloaded file.

The captures of a space are served otherwise. A capture made public, or
shown in a private gallery, is served from a **shared copy** written by the
service: a JPEG without EXIF, XMP or IPTC metadata (no GPS position, no place
name, no camera serial, no comment), its long side at 4096 px at most. The
copy is written before the capture becomes public; if it cannot be, the
capture stays private. The original is never modified and is served to its
owner alone. Only an image (JPEG, PNG, WebP, AVIF, TIFF) can be public; a
FITS, an XISF or a camera's raw file stays in its space. Nothing about the
place of a capture is published; its sky quality may be.

No command of this repository sends coordinates to a sky-quality provider. An
overlay of sky-quality estimates, where an installation keeps one, stores
estimates and provenance, never coordinates.

The estimated light pollution of a selected observing place is read by the
portal server from the sky-quality raster installed with it, at request time:
nothing is sent to an outside provider for it, and the answer is cached in
memory by place rounded to three decimal places. The result contains only a
modelled SQM/Bortle estimate and provenance. It is not an on-site sky
measurement. Nothing in this repository queries a WMS for it.

The observation planner can request a catalogue preview directly from the CDS
HiPS2FITS service when a target has no local portal image. This client-side
request sends that target's public sky coordinates and the visitor's IP address
to CDS; it does not send the observer's chosen location or stored private
catalogue data. Local capture previews always take precedence.

Weather requests are proxied by the portal server. Open-Meteo is queried first;
only if it fails does the server send the same coordinates, rounded to three
decimals, to MET Norway Locationforecast. The visitor's IP address is not sent
to either provider by the browser. Set `ASTRO_PORTAL_WEATHER_FALLBACK=disabled`
to prevent the second request. See the providers' own privacy and logging
policies before exposing a planner publicly.

Suggested places (viewpoints, campsites, parks, picnic areas, see
[PLACES.md](PLACES.md)) are read from OpenStreetMap through an Overpass
instance by the portal server, never by the device: the source sees the
server, not the observer. The search centre is rounded to 0.05° (about 5 km)
by the client and again by the server before any query; only that centre,
the radius, the place types and the language are sent. Answers are kept in
memory for 30 minutes and never written to disk; the distance to each place
is computed on the device, never by the server. A place added from a
suggestion stores only a link (`source`, `id`, `type`, `linkedAt`); its
details are read again when shown. Set `ASTRO_PORTAL_PLACES=off` to never
query the source.

The planner's maps (the observing-place form) load their base-map tiles
directly from a tile server, by the visitor's browser or phone, never through the portal server: that server sees the
visitor's IP address and the area being looked at (the tiles requested). By
default the tiles come from OpenStreetMap's standard tile server, drawn dark by
the display. When a build is given a CARTO basemaps key
(`NEXT_PUBLIC_CARTO_BASEMAP_KEY` for the web build), they come from CARTO's
"Dark Matter" basemap instead. The
credit of the base map (OpenStreetMap, and CARTO when used) is always shown on
the map. Nothing is requested before a map is opened, and no tile is stored by
the portal. See the tile provider's own privacy and usage policies before
exposing a planner publicly.

## Places, address search and what the service keeps

The mobile application and the web planner ask the portal server about the
places the person chooses, signed in or not (a guest sends no bearer, or its
anonymous device identity; neither changes what is sent). On the hosted
service this server is Sqound's.

- **Coordinates.** `GET /v1/weather`, `/v1/weather/history`,
  `/v1/sky-quality`, `/v1/sky-quality/direction`, `/v1/places/resolve`,
  `/v1/places/climate-trend` and `/v1/places/suggested` carry the coordinates
  of the chosen place. The server rounds them before it looks anything up:
  0.001° for the forecast, the past weather and the sky quality, 0.01° for the
  sky by direction, 0.05° for the climate trend and the suggested places.
  `places/resolve` is the exception: it uses the coordinates as chosen, for the
  time zone (computed by the server), the elevation (Open-Meteo, only when the
  application has none) and the locality name (Photon, only after a GPS fix or
  a tap on the map, never after a choice among address results).
- **The phone's own position.** The Places screen reads the phone's position
  when it opens (the system permission is asked there if it was not yet) and
  takes it as the reference of its distances and of « Around ». That
  position itself then goes to `GET /v1/sky-quality` (rounded to 0.001° by the
  application, for the sky quality of the reference) and to
  `GET /v1/places/suggested` (rounded to 0.05°). The sky map's aim and the
  horizon in augmented reality read the position on the device to centre or
  orient the view; nothing is sent for that, apart from
  the base-map tiles of the area shown (below).
- **Target ranking.** The catalogue query that ranks the proposed targets for a
  night's place carries that place's latitude **rounded to the whole degree**,
  never a longitude (`GET /v1/targets` or its compact index).

- **Address search.** `GET /v1/places/search` carries the typed text (2 to 240
  characters) and the language. The server passes them to the geocoder, Photon
  by default (`https://photon.komoot.io/`, replaceable with
  `ASTRO_PORTAL_GEOCODER_URL`), which sees the server and the text, not the
  device. The search starts only when the person validates it, never while
  typing, and the server spaces its calls by 1.1 seconds.
- **What is kept.** None of these routes writes the coordinates or the text to
  the database, to the application log or to the console: the console lines of
  the weather (`weather.fetch`) count outcomes and name a provider, never a
  place. What persists is shared and tied to no space or device: the last
  forecast of a place rounded to 0.001° (`weather_forecasts`, 7 days, 1000
  places at most) and the weather trend of a place rounded to 0.05°
  (`place_climate_trends`, three years, 5000 places at most). In memory only,
  lost at restart: the sky-quality estimates, the geocoder answers (30
  minutes, keyed by the request, text included, 250 entries at most), the
  elevations (24 hours) and the suggested places (30 minutes).
- **Network address.** The in-memory limiters count requests per anonymous
  device and per network origin and hold no place. The platform that hosts the
  service receives the requests as any host does; this document does not
  describe its own logs.

## Souvenir images

« Garder une image » (the aiming screen) stacks the frames the aiming already
took into one image written under the application's own folder, on the device.
Without a space it stays there. Signed in to a space, each file goes through
the upload queue like a capture of « Mes captures ». It is added to the phone's
photo library only when the person turned on « Enregistrer dans la galerie
photo du téléphone » (Réglages, off by default) and the system granted the
right; the right is asked when the switch is turned on, never during a night.

## Offline packs

The mobile app downloads its offline packs (see
[OFFLINE_PACKS.md](OFFLINE_PACKS.md)) anonymously from `planastro.space`,
even when the app is configured against a private server. No personal data is
sent with those requests. The spoken reading (`read-aloud`) is static audio
generated once, by the operator, from the portal's own public texts: a file is
the same for everybody and its request carries nothing about the person.

## Uploaded captures

`POST /v1/uploads` stores a capture's original bytes unchanged,
outside the database, under `ASTRO_PORTAL_CAPTURES_DIR`. A capture is private
until its owner makes it public; its original bytes are served to its owner
alone, and the galleries serve only its shared copy without metadata (above).
After each upload the service writes a thumbnail (WebP, without metadata) and
runs the automatic check on the server itself, without any outside service;
neither ever blocks, hides or publishes a capture. A private server runs no
check: every capture counts as the sky, and its owner alone decides what is
public.
The stored file's path is derived only from the SHA-256 of its bytes, never
from the person's original filename, which is kept — bounded, sanitized —
only in the database record. Never publish `ASTRO_PORTAL_CAPTURES_DIR`
alongside the runtime directory or logs, for the same reason as the database
itself.

## Measured sky background

Astro Sync measures a night's sky background on your own frames, on your
computer (see [PLACES.md](PLACES.md), « The sky you measured »). The frames
are only read, never sent. `POST /v1/place-sky-measures` receives one number
per night — the median in mag/arcsec², how many frames it is the median of,
the method version and the median time — with the session it belongs to and
the frames' position; any other field is refused. The position only serves
to find which of your places the night belongs to (within 500 m) and is
never stored; the value is kept with that place and erased with your space.
The reference star list it needs (Tycho-2, about 25 MB) is downloaded once from
the CDS (VizieR), only when you press the button under the text that names it;
no file of yours goes with that request.

## The project's calibration set

On the hosted service, and only if you switch it on in the section
« Calibration du ciel » of your space (off by default), the project keeps an
anonymised record of each sky-background value your space holds — measured
or entered — to refine its sky-quality estimate: the value, its band, the
sky-quality raster's level at the place, the calibration region, the year and
the method version; never the place, its coordinates, its name, your address
or an identifier of your space or devices. Only a separate ledger links your
space to its records, so that « Retirer mes contributions » and the deletion
of your space can erase them; the published set is released under CC BY 4.0
(attribution, commercial use allowed), and a release already published cannot
be recalled. A private server never contributes. The rules:
[CONTRIBUTION_RULES.md](CONTRIBUTION_RULES.md).

## Which build a device runs

The mobile application and Astro Sync send, on every request to their portal
and to no one else, the name of their build and of the system they run on
(`X-PlanAstro-Client: planastro-ios/1.0.4+126 (iOS 18.1)`, `api/v1.md`,
« Client identity »). The service keeps the version and the system a device
last named, on that device's row, with the time it was last seen; it goes
with the device. The header holds no identifier, no model and no language.

Towards the hosted service only, the mobile application also says how many
store purchases and how many device incidents wait on the phone to be sent:
two numbers, never their content, at most once an hour and only when one of
them changed (`X-PlanAstro-Client-State`). The service keeps the last two
numbers of each device, with the device, and adds them up for its operators
over the devices seen in the last seven days; they go with the device.

## The service's announcements

The hosted service may show a message to the people of the application and
of the hosted web portal (a flaw to fix by an update, a new feature).
To ask for them, the application and the portal send their platform, their
version and the language of their interface, and nothing else; no account is
needed. A private server has none and is never asked.

What is kept of « J'ai lu » (or of the ✕ of an announcement « info »):

- **on the phone or in the browser**: the identifier of the announcement, so
  that it is not shown again there;
- **by the service**: a counter per announcement, platform, version (without
  the build) and language — numbers, never an identifier of the device, of
  the installation or of the person. The administration reads readings, not
  persons: a phone installed again counts twice;
- **in the space, when the device or the browser is signed in to one**: one
  row (the space, the announcement, read or dismissed, the date), so that its
  other devices do not show it again. It is erased with the space.

The link of an announcement can only lead to the project's site
(`https://planastro.space/…`), and opening it is not counted.

## The closed beta's listening

Towards the hosted service only. The questionnaire of the closed beta may
play, in the tester's language, a few short clips of the spoken reading (the
same ones for everyone; they carry no data of the tester and are public in
reading). The tester may say of each clip whether it sounds right and, if it
does not, what sounds wrong (280 characters at most). Those answers are data
of the beta's programme, kept with the questionnaire's five answers and the
address of the accepted tester, shown to the project's administration without
the address (per language and clip, with the explanations) and exported as a
file that feeds the table of pronunciations. They are erased with the other
answers of the beta, thirty days after its end at the latest, or on request.
The clips themselves are deposited for the beta and removed after it.

## The application's diagnostics

« Envoyer les diagnostics de l’application », in the Réglages → « Données »
of the application, is **on by default for a fresh installation** (an
installation that already chose keeps its choice); the person turns it off
there, and then nothing more is sent and whatever waited on the phone is
erased. Nothing is shown at the first launch: the Réglages say, in one
sentence under the switch, what leaves the phone, with an « En savoir plus »
that opens the site's privacy page at its `#diagnostics` anchor
(`https://www.planastro.space/<lang>/privacy/#diagnostics`), where the whole
detail is written. The switch covers three things: the application's errors,
the incidents of the connected devices, and the plate-solving probe. All of
it is **anonymous**, with or without an account.

**Errors of the application.** When the application meets an error (an
uncaught error, a failure of a smart telescope's client, a launch of an
execution refused or read back wrong), it sends the service one entry: the
screen and the route's path, the application's version and build, the
platform and the system's version, the raw hardware model (« iPhone17,1 »),
the language, the network state, the error's message and stack, and a
breadcrumb of the last navigations, actions and launch steps (the device's
model and the state read back). The entries are kept 30 days, tied to no
space (they are not erased with it: they expire by age).

**Incidents of the connected devices.** When a smart telescope (Seestar,
Vespera, DWARF) or a mount (LX200, ZWO AM over Wi-Fi or Bluetooth included,
SynScan, iOptron, NexStar, ASCOM Alpaca, INDI) refuses or fails a command
(pointing, stacking, scheduling, initialization, connection, Sync, GoTo,
movement, lost link, silence), the application sends the service one incident
by itself, as soon as it happens, with no action from the person. Without a
network the incidents wait on the phone (100 entries at most) and are sent
when the network returns. An incident holds: the device's type and family, its
model, its firmware and the version of the maker's application when the device
gives them; the kind of link (the telescope's own Wi-Fi, a network, Bluetooth),
never its name or its address; the command sent and its cleaned parameters; the
device's answer (code, raw text, delay or silence); the state before and after;
about sixty lines of exchanges with the device around the incident (the start of
the connection, the latest exchanges, the few seconds that follow); and, as for
an error, the version of the application and of the system, the phone's model
and the language. The incidents are kept **90 days**, then deleted.

**What never leaves.** Neither for an error nor for an incident: the e-mail
address; a place or its coordinates, even rounded; the site's altitude; the
height or the azimuth of a target; the place and time frames a mount receives;
a place's or a plan's name; a Wi-Fi network name, an IP or MAC address, a host
name; a serial number, a device, client or account identifier, a name given to
the device; a key, a password or a token (the Bluetooth token of a mount
included); any free text. The phone removes them before it queues the entry and
checks it again before sending, and the service checks every entry a third
time and refuses the whole batch at the first match.

**Anonymity and identifier.** Everything is sent under the **diagnostic
token** (a random number born at the installation, drawn again when the app is
reinstalled or its data erased, never derived from the device or the space),
and neither the space nor the device. Nothing on the service links a token to a
person except a feedback the person sends with it: the screen of a failure
shows « Signaler ce problème » alone, which opens a prefilled feedback carrying
the identifier (the first 8 characters of the token, also shown in Réglages ›
Données); it only serves to hand over that identifier and a word about what the
person was doing, and a feedback that carries the token is tied to the
incidents. The person can also hand the token over (Réglages → « Copier », or
the box « Joindre mon jeton de diagnostic » of the problem report, checked by
default). A phone without a space sends them too, to the service it uses,
under its anonymous identity. They are read by the administrator alone.

**Erasure.** On request: the person writes with the identifier and the
incidents of that identifier are erased. With the space: the incidents tied to
the person's feedbacks are erased when the space is.

**A private server.** It receives them only when its operator says so
(`ASTRO_PORTAL_APP_LOGS=accept`); the application asks first. Sqound receives
none of them.

With the same switch, the application's own plate solving (the aiming screen,
the polar alignment, the pointing aid) sends one entry per capture, with its
source: the capture's figures (lens, exposure, ISO, focus, alignment, the
solver's verdict) and its technical journal, never an image nor a position —
neither the place nor where the phone pointed — at most once a minute while
its verdict does not change.

## TIFF files

TIFF blocking relies on the presence of Cloudflare headers. It protects the
supported scenario of a Cloudflare tunnel connected to the bundled server. For
another public proxy, configure the proxy to block `/download/` and
`/api/admin/`, or adapt `isExternalRequest` to that proxy's trusted headers.
