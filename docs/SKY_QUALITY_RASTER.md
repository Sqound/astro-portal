# Sky-quality raster

The planner's Bortle/SQM estimate is served from a raster this instance
prepares and hosts itself. There is no outbound request at request time and no
third-party map service. Without the raster installed, `/v1/sky-quality` and
`/api/planner-sky-quality` answer their existing unavailable state
(`503 sky_quality_unavailable` with `Retry-After`); the planner keeps working
and the panel shows its usual dash.

Each cell of the raster holds **the upward radiance of everything within
300 km of it, summed with a distance kernel** — not the radiance the satellite
measured over that cell. That is what lets a dark valley 55 km from a city
carry the city's glow. The service only samples the field and converts it; all
the modelling happens once, offline.

## Source data

VIIRS Nighttime Lights (VNL) annual composites, Earth Observation Group (EOG),
Payne Institute for Public Policy, Colorado School of Mines —
<https://eogdata.mines.edu/products/vnl/>.

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Product    | Annual VNL V2 (V2.2 at the time of writing), `average_masked` |
| Resolution | 15 arc-second, EPSG:4326                                      |
| Unit       | nW/cm²/sr                                                     |
| Coverage   | 180W/75N to 180E/65S (nothing above 75N or below 65S)         |
| Delivery   | one gzipped GeoTIFF per year                                  |
| Licence    | Creative Commons Attribution 4.0 International                |

`average_masked`, not `average`: the masked product has had background noise,
aurorae and fires removed, so it is a clean map of **emissions**, which is
exactly what a propagation model wants as input. The diffuse glow around
cities that the unmasked product shows is scattered light seen from above; it
is not calibrated as such, and using it would double-count the scattering this
pipeline models explicitly.

The "World Atlas 2015" (Falchi et al.) is **not** used, neither as input nor
as calibration: its licence is non-commercial and this instance must be able
to redistribute what it serves. Its published orders of magnitude are used
below only as a plausibility check.

### Attribution

EOG's licence document
(<https://eogdata.mines.edu/files/EOG_products_CC_License.pdf>, Exhibit 1)
requires this notice verbatim on every product derived from its data:

> This product was made utilizing (name the appropriate EOG data product) data
> produced by the Earth Observation Group, Payne Institute for Public Policy,
> Colorado School of Mines.

and, where space does not allow it, the short credit line:

> Source: EOG, Colorado School of Mines.

Both are written into the generated `manifest.json`, and the long form is shown
in the planner's sky-quality tooltip on the web and in the info sheet of the
apps. Exhibit 2 asks publications to cite Elvidge, C.D., Zhizhin, M., Ghosh,
T., Hsu, F.-C., Taneja, J. (2021), "Annual time series of global VIIRS
nighttime lights derived from monthly averages: 2012 to 2019", _Remote Sensing_
13(5), 922, doi:10.3390/rs13050922.

## Getting the composite

Downloading is behind an OpenID Connect login (Keycloak, realm `eog`):
requesting `https://eogdata.mines.edu/nighttime_light/annual/v22/<year>/`
without a session redirects to `https://eogauth.mines.edu/…/auth`.

- A **free account** with a verified e-mail gives browser access. Sign in, open
  the year's directory, and download the `…average_masked…tif.gz` file. This is
  the supported route.
- **Programmatic** access needs a paid subscription: EOG's registration page
  states "Effective June 1 2026 EOG is limiting programmatic access via OpenID
  Client to paid subscribers." Subscribers receive a `client_id` /
  `client_secret` and fetch a five-minute bearer token with an OAuth2 password
  grant against
  `https://eogauth.mines.edu/realms/eog/protocol/openid-connect/token`.

`npm run prepare:sky-quality-raster -- --download --url <file url>` implements
that token flow, reading `ASTRO_PORTAL_EOG_CLIENT_ID`,
`ASTRO_PORTAL_EOG_CLIENT_SECRET`, `ASTRO_PORTAL_EOG_USERNAME`,
`ASTRO_PORTAL_EOG_PASSWORD` (or a ready-made `ASTRO_PORTAL_EOG_TOKEN`) from the
environment. **It has never been run against the real service** — no account
exists here — so treat it as unverified. Never commit these values.

## Preparing the raster

```bash
npm run prepare:sky-quality-raster -- \
  --input /path/to/VNL_npp_2025_…average_masked.dat.tif.gz \
  --static-data-dir /path/to/static-data \
  --work-dir /path/to/scratch \
  --year 2025 --version v2.2 --product average_masked --arcminutes 2
```

A `.gz` input is expanded first because the GeoTIFF directory sits at the end
of the file and the reader needs random access. The expanded 2025 composite is
**11.6 GB**, so `--work-dir` must point at a volume with room to spare; the
intermediate is deleted when the run ends. The composite itself is read strip
by strip and never held in memory whole.

The run has two stages:

1. **Resample.** Area-weighted mean of the source cells falling in each output
   cell. The weighting is exact rather than a nearest-cell assignment, because
   the two grids are not nested: the VNL tiepoint ties the _centre_ of its
   first cell to 180W/75N, so its cells sit half a 15″ cell off the whole-degree
   grid and one source cell can straddle an output boundary. Columns wrap,
   which folds the composite's duplicated 180° column back onto the first.
   The result is cached in `--work-dir` as raw float32
   (`sky-quality-mean-<arcminutes>min.f32`, 233 MB at 2′) with a sidecar
   recording which composite and which geometry produced it. Iterating on the
   kernel therefore never re-reads the 11.6 GB file. `--mean-cache=off`
   disables it; `--cache-only` stops after this stage.
2. **Propagate.** Every lit cell spreads its light over its surroundings with
   the kernel below. See "The propagation model".

The script writes, atomically:

```text
<static-data>/sky-quality/
├── manifest.json
└── raster.bin
```

`manifest.json` records the source year, product and VNL version, the
generation date, the grid geometry, the encoding constants, the kernel
parameters and their citation, a SHA-256 of `raster.bin`, and the EOG
attribution text. Re-running against the same input produces byte-identical
output and the same checksum: the scatter walks rows, then columns, then each
row's offset table in a fixed order, so every sum is accumulated in the same
sequence on every run.

Point the portal at it with `ASTRO_PORTAL_STATIC_DATA_DIR` (the raster is read
from `<static-data>/sky-quality/`), or override that one directory with
`ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR`.

### Measured, 2025 V2.2 `average_masked`, macOS host

|                        | 2 arc-minutes           | 5 arc-minutes         |
| ---------------------- | ----------------------- | --------------------- |
| Grid                   | 10800 × 5400            | 4320 × 2160           |
| `raster.bin`           | 58 320 000 B (55.6 MiB) | 9 331 200 B (8.9 MiB) |
| `raster.bin` gzip -9   | 7 183 738 B (6.9 MiB)   | 1 428 355 B (1.4 MiB) |
| Lit source cells       | 3 023 367 (5.2%)        | 747 341 (8.0%)        |
| Populated output cells | 12 051 062 (20.7%)      | 1 946 546 (20.9%)     |
| Peak propagated cell   | 1091 nW/cm²/sr          | 603 nW/cm²/sr         |
| Whole run, cold        | 25 s, 1.04 GiB peak RSS | 15 s, 473 MiB         |
| of which propagation   | 7 s                     | 3 s                   |
| Whole run, warm cache  | 7.3 s, 887 MiB          | 3.4 s, 447 MiB        |

The 5′ grid remains available for a host where 58 MB resident is not
affordable, and nothing but the `--arcminutes` value changes — the service and
the manifest read the geometry from the manifest. The offline pack does not
ship the 2′ raster itself; it ships a further-reduced 6′ variant, below.

## Offline pack variant

See [OFFLINE_PACKS.md](OFFLINE_PACKS.md) for the manifest-level view of this
component (`sky-quality`, `kind: "file-set"`), its licence and attribution
requirements.

The offline pack needs the Bortle/SQM estimate to work with no network from
the very first launch, but the full 2′ raster (55.6 MiB, 6.9 MiB gzipped) is
too big for a pack that has to stay small. The pack instead ships a **6′**
variant — 0.1°, **10800 × 5400 → 3600 × 1800 = exactly 6 480 000 bytes**, a
clean 3 × 3 block reduction of the 2′ grid — small enough to sit in the
automatic first-launch download alongside the compact catalogue index and the
DSS order 0–2 tiles.

**Derivation.** Each 6′ cell averages the exact 3 × 3 block of 2′ cells
underneath it, over their **decoded radiances** (never the 8-bit levels: the
mean of two log-scaled bytes is not the log of their mean radiance),
area-weighted by the same `sin(φ_north) − sin(φ_south)` rule the resampling
above uses — a block's three rows do not all carry the same weight, but every
column of one row does. The result is re-encoded with **the source raster's
own encoding constants**, read from its manifest at derivation time rather
than assumed: a future revision that changes `offset`/`maximum`/`levels`
cannot silently desynchronize the pack from the raster it was derived from.
The single implementation is `deriveSkyQualityPackGrid`
(`packages/portal/src/sky-quality.js`), called by exactly two places:

- **`--pack-arcminutes`** (default `6`, `0` skips it) on
  `prepare-sky-quality-raster.mjs` itself, producing the pack variant
  alongside the base raster at preparation time;
- **lazily, memoized on disk**, by `ensureSkyQualityPackRaster`
  (`packages/portal/src/planner/sky-quality.server.js`), the first time a
  portal that never ran the flag is actually asked for one — and again
  whenever the installed source raster's own `checksum` changes, detected by
  comparing it against the pack manifest's `derivedFrom.checksum`. A request
  that changes nothing never re-derives: only `manifest.json` (a few
  hundred bytes) is re-read to check freshness. Measured on a synthetic
  10800 × 5400 grid (this repository ships no real raster): **≈80–90 ms**
  and **+9 MB RSS** when the source is mostly dark (as the real composite is,
  ~21% populated), rising to **≈700 ms** in the unrealistic worst case where
  every source cell is lit — safely inside a single request.

Both paths write to `<static-data>/sky-quality/pack/`:

```text
<static-data>/sky-quality/pack/
├── raster.bin       3 600 × 1 800 bytes
├── raster.bin.gz    gzip -9, precomputed
└── manifest.json
```

written atomically and in that order — `raster.bin`, then its `.gz`, then
`manifest.json` last, so a reader that observes the manifest can assume both
binaries are already fully in place. If `<static-data>` is read-only, or the
write otherwise fails, the derivation logs one warning and gives up: the
`sky-quality` component is simply absent from `GET /v1/offline-pack`, never a
`500`.

**`pack/manifest.json`** is the SAME shape as the service raster's own
manifest above — `grid`, `encoding`, `attribution`, `license`, `year`,
`checksum`, … — so a reader of the service raster's manifest reads it with
**no change**: it only needs `grid.{width,height,cellSizeDegrees,north,west}`
and top-level `attribution`/`year`, none of which are hard-coded to any
particular resolution. One field is new: `derivedFrom` (`{checksum,
cellSizeDegrees, width, height}` of the SOURCE raster it was built from),
which only the derivation itself reads, to decide whether to re-derive.

**Routes.** `GET /v1/offline-pack/sky-quality/manifest.json` and
`GET /v1/offline-pack/sky-quality/raster.bin`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`) serve exactly
those two file names — anything else is a `404` in the standard v1 error
envelope — with guest access, like the manifest route itself. Both stream
from disk. `raster.bin`'s `ETag` is `"sha256-<hex>"` of the **uncompressed**
bytes (identical to the `sky-quality` component's own `revision` and
`files[].checksum` in `GET /v1/offline-pack`), honoured by `If-None-Match`
with a `304`; it is served `Content-Encoding: gzip` from the precomputed
`raster.bin.gz` when the client's `Accept-Encoding` allows it (`Vary:
Accept-Encoding` always set), identity otherwise — falling back to identity
gracefully if a `.gz` sibling is ever missing (e.g. a pack hand-installed
without one).

## Encoding

Each cell is one byte on a log scale, with `offset = 0.01 nW/cm²/sr`,
`maximum = 2000 nW/cm²/sr`, `levels = 256` and
`scale = log10(1 + maximum / offset)`:

```text
encode(R) = round(255 * log10(1 + R / offset) / scale)
decode(L) = offset * (10 ** (L * scale / 255) - 1)
```

`decode(0)` is exactly 0, `decode(255)` is exactly `maximum`, and
`encode(decode(L)) === L` for every level. The step is a constant 0.0208 dex,
0.052 mag/arcsec² where the artificial component dominates — far below the
model's own uncertainty. `maximum` covers the **propagated** field: a raw cell
reaches 8191 nW/cm²/sr in the 2025 composite, but the kernel spreads that out
and the propagated peak is 1091. The script warns rather than clipping
silently if a cell ever exceeds `maximum`.

The single definition lives in `packages/portal/src/sky-quality.js`; the
shared fixtures (`sky-quality-encode`, `sky-quality-decode`,
`sky-quality-nearest`, `sky-quality-sample`, `sky-quality-radiance`) pin it.

## The propagation model

VIIRS measures the light leaving each cell **upwards**. The zenith brightness
an observer sees is scattered light from a wide area around the site. The two
coincide only where the satellite happens to be looking at scattered light
rather than at lamps, and `average_masked` makes that impossible to paper
over: it sets every cell in which no light was detected to zero, so without a
kernel a valley 55 km out of Madrid reads as a pristine sky. Summing the
surroundings with a distance weight is what removes that failure, and it is
the case an astrophotographer actually cares about.

### Kernel

Duriscoe, D. M., Anderson, S. J., Luginbuhl, C. B. & Baugh, K. E., "A
simplified model of all-sky artificial sky glow derived from VIIRS Day/Night
band data", _Journal of Quantitative Spectroscopy and Radiative Transfer_ 214
(2018) 133–145, doi:10.1016/j.jqsrt.2018.04.028. Published open access under
CC BY 4.0; read in full from the copy NOAA hosts at
<https://repository.library.noaa.gov/view/noaa/21007>.

Their equation (9), page 135, sums Day/Night Band radiance over the cells
around a site with a power-of-distance weight, and equation (11), page 139,
makes the exponent grow with distance:

```text
ALR = c · Σ rᵢ dᵢ^(−α)          α = 2.3 (d/350)^0.28        (d in km)
```

The paper describes that exponent as running "from −0.45 at 1 km to −2.20 at
300 km" (page 139), which is what fixes the ambiguously typeset `2.3(…)` as a
multiplication: 2.3·(1/350)^0.28 = 0.446 and 2.3·(300/350)^0.28 = 2.203
reproduce those endpoints exactly. A variable exponent is what Garstang's
radiative-transfer models predict — Garstang, R. H., "Model for artificial
night-sky illumination", _PASP_ 98 (1986) 364, page 369, states that for
`b = C P D^α`, "α becomes more negative for increasing D", and his Table II
and the curved-Earth Table 1 of Garstang (1989), _PASP_ 101, 306, page 314,
tabulate α from −1.90 to −4.50. Walker's single-city law — Walker, M. F., "The
effects of urban lighting on the brightness of the night sky", _PASP_ 89
(1977) 405, section III, page 407, where the observations "have been
represented by a straight line corresponding to I ∝ D^−2.5" — is the
constant-exponent special case. It is cited here as the origin of the power
law, not as the law used: it was measured at 45° altitude towards one city
over 8–99 km, and Walker never writes the population-and-distance form that is
usually attributed to him.

**One change is made.** Equation (11) was fitted to the ALL-SKY average
luminance, and this portal reports a ZENITH figure. The same paper is explicit
that the two are not interchangeable: it measures ALR/ZLR at 1.58–3.27 in the
model and 2.0–6.0 in observations, "highest in the darkest locations" (page
141), and says a separate zenith/distance relation "would have to be derived".
Zenith brightness falls off faster, so the scale of the exponent is refitted
here against measured **zenith** sky brightness:

```text
K(d) = d^(−α(d)),   α(d) = 3.8 (d/350)^0.28,   K(0) = 1,   d ≤ 300 km
```

The effective exponent runs from 0.74 at 1 km to 3.64 at 300 km, inside
Garstang's tabulated range. Truncation is Duriscoe's 300 km (section 2.3, page
137), for the reasons given there: Cinzano & Falchi's propagation library
extends to 350 km, all-sky camera data show light domes "readily visible from
large cities up to 300 km away", and Las Vegas seen from Great Basin National
Park at 311 km "contributes less than 2% of the natural background". Refitting
at 150, 200, 250, 300 and 350 km moves the calibration constant by under 0.4%,
so nothing depends on the exact cut.

**Near field.** The kernel is already bounded — α → 0 as d → 0, so d^(−α) → 1,
with a maximum of 1.797 at d ≈ 28 m — and there is no singularity to remove.
Bará, S. & Lima, R. C., "Photons without borders", _International Journal of
Sustainable Lighting_ 20 (2018) 51–61, arXiv:1809.05376, clamp the origin to
the kernel's value at 0.4 km, "suggested by the pixel size". No clamp is used
here because the preparation script does not sample the kernel at a point: it
**averages it over each source cell** wherever the cell is close enough for
the kernel to vary across it (within four cells). That is the correct
quadrature of equation (9)'s sum, and it is what makes a uniformly lit region
propagate to exactly its own radiance — a property the test suite checks.

**Units.** Equation (9) is a sum over cells, so its constant is tied to the
cell size the authors used. Dividing instead by the kernel's own surface
integral removes that dependency and keeps the field in nW/cm²/sr at any
resolution. The calibration constant that turns the propagated radiance into a
luminance therefore lives at read time and can be changed without rebuilding
the raster.

### How it is computed

A direct convolution at 2′ out to 300 km is about 3 × 10¹⁰ products. Instead
the kernel is split in two with a C¹ cubic ramp between 30 and 66 km,
`K = K_near + K_far` exactly: the compact near half is scattered from the
5.2% of cells that are lit, at full resolution, and the smooth far half from a
6′ flux grid whose cells nest exactly inside the output cells. Because `K_far`
is identically zero below the ramp's inner edge **and** has a zero derivative
there, quantising a source — or the observer — onto the coarse grid cannot
move it across a steep part of the kernel.

Checked against an exact per-cell convolution over the real 2025 grid at the
control points and along the transect below, the split agrees to within 2.4%
(0.026 mag) everywhere except cells whose propagated value is near the
encoding floor, where the 8-bit step dominates and the sky brightness is 22.00
either way.

## Radiance to sky brightness

Artificial zenith luminance is linear in the light reaching the observer, so a
single constant converts the propagated radiance:

```text
B_artificial [mcd/m²] = 0.2990 × propagated radiance [nW/cm²/sr]
SQM = −2.5 log10((B_artificial + 0.171168465) / 1.08e8)
```

The 22.0 mag/arcsec² natural background (0.171168465 mcd/m²) and the 1.08 × 10⁸
mcd/m² zero point are unchanged, and the result goes into the unchanged
`bortleFromSqm` table.

### Which natural background, and why 22.0

Two conventions are in circulation. Falchi et al. (2016) "chose 22.0
mag/arcsec², corresponding to 174 μcd/m²"; the National Park Service uses
171 μcd/m², which is 22.02 mag/arcsec² on the same zero point — the same
convention to within 0.02 mag. Zamorano et al. (2016) take 21.8 instead. This
pipeline keeps **22.0**, because it is the convention of both sources it
calibrates against and cites, and because it is the value the portal already
used everywhere else.

It is a convention, not a measurement. The real natural zenith sky varies by
0.3–0.4 mag over the solar cycle (Patat 2008 gives V = 21.71 ± 0.24 at Paranal
as a cycle average and 21.99 at solar minimum), so 22.00 is the model's floor
rather than a claim about any particular night. Nothing in this pipeline can
report a sky darker than 22.00.

### Calibration

`packages/portal/scripts/calibrate-sky-quality.mjs` fits that constant and
prints the residuals. It uses two sources, both redistributable without a
non-commercial or share-alike restriction. **Neither is committed to this
repository**: the script takes them with `--input`, or fetches them with
`--download`.

| Source                                                      | What                                                                                         | Licence                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| National Park Service Night Skies Program, `nsdmap.geojson` | 656 all-sky V-band CCD measurements; `ZENITH_ART` is the artificial zenith luminance, µcd/m² | Public domain (US Government work) |
| Globe at Night, NSF NOIRLab, `GaN<year>.csv`                | citizen-science zenith SQM readings, worldwide                                               | CC BY 4.0                          |

The fit minimises the RMS residual **in magnitudes of total sky brightness**,
not in luminance: near the natural floor a tenth of a magnitude is a large
fraction of the artificial part, and a luminance fit would let the darkest
sites dominate.

Globe at Night is noisy, so it is filtered hard and then aggregated: clear
skies only; readings outside 16.0–22.3 mag/arcsec² discarded (the raw
distribution piles up on 10.0 and 23.0, the ends of the form's own range, and
the measured zenith of the worst city cores is around 17); one median per
raster cell; at least three independent readings per cell; and cells whose
readings disagree by more than 1.5 mag between the 16th and 84th percentile
dropped entirely. `--from-year` defaults to 2019, because street lighting has
changed enough over a decade that a 2013 reading no longer describes the same
place as a 2025 composite.

Result, against the 2′ raster built from the 2025 annual composite, with
measurements from 2019 to 2025:

|                       |   sites | fitted constant | RMS residual |
| --------------------- | ------: | --------------: | -----------: |
| National Park Service |     104 |          0.2012 |     0.35 mag |
| Globe at Night        |     382 |          0.3064 |     0.79 mag |
| **Both, as shipped**  | **486** |      **0.2990** | **0.73 mag** |

The exponent scale of the kernel is baked into the raster, so it cannot be
fitted at read time. It was chosen by a scan: rebuild the raster at each
value, rerun the calibration, compare. The objective is flat from 3.5 to 4.4
(0.716–0.721 mag); **3.8** is taken from inside that plateau, as the value at
which the National Park Service subset — the half of the data with real
photometry behind it — has no residual bias (−0.001 mag, against −0.15 mag at
Duriscoe's own 2.3).

Deliberately **not** used, for licence reasons, as input or as calibration:
the World Atlas measurement supplement (CC BY-NC and not publicly
downloadable), the UCM mobile SQM survey of Madrid
(doi:10.5281/zenodo.51713, CC BY-NC) and the TESS/STARS4ALL archive (ODbL,
share-alike). MySkyAtNight publishes no licence at all.

### A third source: Japan, not used for the global constant, used for its own region

Both sources above sit in dry air, which is a blind spot the model admitted
to for a while. `--input-japan <file>` reads a humid-climate check: the
環境省 (Ministry of the Environment) / 星空公団 campaign
「デジタルカメラによる夜空の明るさ調査」, run twice a year since 2018 —
a digital camera pointed at the zenith (35–50 mm, 30 s, f/5.6, ISO 800),
reduced against standard stars in the same frame, reported in mag/arcsec²,
with the campaign's own per-frame scatter indicator ばらつき. Its rows are
**never folded into the GLOBAL constant** (`--calibrate-with-japan` is the
explicit opt-in for that, still unused) but **are** what `--region japan`
fits — the `japan` entry of the regional calibration table below — by design.

The campaign is published twice, under two different sets of terms, and only
one of the two carries coordinates:

| Publication                                                                           | Coordinates | Terms                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境省 per-campaign result tables (PDF attachments to each 報道発表資料 on env.go.jp) | no          | 公共データ利用規約（第1.0版）/ PDL1.0, which is written to be compatible with CC BY 4.0; attribution required (出典：環境省 星空観察)               |
| 環境展望台 / 環境GIS star-watching map layer, 国立環境研究所                          | yes         | the institute's own site policy, which reserves reproduction: 「私的使用又は引用等著作権法上認められた行為を除き…引用、転載、複製等はお断りします」 |

So the openly licensed copy gives prefecture, municipality and a free-text
place name only, and the copy with positions is not openly licensed. **What
is shipped is a fitted constant and its provenance, never a measurement or a
position** — the campaign's own PDL1.0 result tables authorize that much on
their own.

Against the 2′ raster built from the 2025 composite, measurements 2019–2025,
ばらつき ≤ 0.2, aggregated to one median per raster cell with at least three
readings:

|                       | cells | fitted constant | RMS residual |
| --------------------- | ----: | --------------: | -----------: |
| Japan, all            |   215 |          0.8323 |     0.37 mag |
| Japan, summer (humid) |   175 |          0.7239 |     0.40 mag |
| Japan, winter (dry)   |   186 |          0.9161 |     0.39 mag |

The global constant of 0.2990 leaves **+0.75 mag** of bias on those 215
cells — the model reads that much darker than the sky measures — and the bias
runs with brightness: +0.88 in the cells measured below 19, +0.95 between 19
and 20.5, +0.62 between 20.5 and 21.3, +0.35 above 21.3. That is the shape of
an artificial luminance underestimated by a constant factor, which is why
refitting that one constant on Japanese data alone drops their RMS from 0.83
to 0.37 mag — this is the fit `skyQualityCalibrationRegions.japan` ships.

Two independent checks say this is a real regional effect rather than an
artefact of the camera method. First, Globe at Night's own SQM readings
inside Japan — a different instrument, different observers, already in the
global set — carry the same sign: refitting on just those readings, restricted
to the same `japan` polygon, gives ≈0.491 over 91 readings across 7 cells
(RMS 0.55 mag, bias +0.12 mag against that regional constant) —
`--region japan` without `--input-japan` reproduces this. Second, the same
breakdown applied to Globe at Night elsewhere lines up with climate rather
than with geography: the dry western United States refits to 0.25 and Iberia
to 0.29, while the humid south-eastern United States refits to 0.36 and
north-western Europe to 0.34. Japan is the extreme end of that gradient, not
a separate phenomenon.

**Band caveat, not corrected for.** This campaign reduces a camera frame
against standard stars, close to the V band, while the global constant is
fitted mostly on Globe at Night's SQM readings, a much broader band that
typically reads a few tenths of a magnitude darker than V under a
light-polluted sky. The Globe-at-Night-only regional value above (≈0.491) is
the "same band as the global constant" alternative this gap could resolve
to, once the V-to-SQM offset for this kind of sky is known; no colour
correction is applied to either number.

What is **not** confirmed is the seasonal half of the story. Within Japan the
humid summer campaign is the one the model fits _better_ (bias +0.65 against
+0.83 in winter), and the same cells measured in both seasons come out
0.18 ± 0.02 mag darker in summer than in winter. Whatever drives the
country-wide offset, it is not the seasonal swing in humidity.

The "ocean emits nothing" edge effect was tested too and mostly ruled out:
over 1392 sites the residual barely correlates with the kernel-weighted land
fraction within 300 km (r = 0.04). It is real but confined to a handful of
bright small-island and narrow-coastal sites — of the sites measured below
19, the fourteen with less than half their surroundings on land sit +2.59 mag
off, against +1.15 for the other 268.

None of this changes the GLOBAL constant, and it should not: fitting one
global constant over the shipped set plus Japan gives 0.3937, which would
improve the Japanese residual from 0.82 to 0.67 mag while pushing the rest of
the world from +0.09 to −0.09 mag of bias and from 0.707 to 0.740 RMS. Japan
would be 30% of the calibration set. What Japan gets instead is its own entry
in the regional table below, which changes nothing for any other position.

### Regional calibration

`skyQualityLuminancePerRadiance` is read directly only when a position is
unknown or falls in no region. `skyQualityCalibrationRegions` in
`packages/portal/src/sky-quality.js` is an ORDERED list of
`{ id, polygons, luminancePerRadiance, provenance }`: `sqmFromViirsRadiance`
takes an optional `(latitude, longitude)`, looks up
`skyQualityCalibrationAt(latitude, longitude)` — a plain even-odd /
ray-casting point-in-polygon test, no dependency — and uses the first matching region's constant, or the global one otherwise.
Every existing call site that never had a position is unaffected: no region
can match without one. `GET /v1/sky-quality` and `/api/planner-sky-quality`
report which calibration set answered in an additive `calibration` field,
`<version>/<region id>` (e.g. `2026-09/japan`, `2026-09/global`); see
`packages/astro-contracts/schemas/api/v1.md`.

The one entry today:

| id      | polygon(s)                                                                                                              | constant | provenance                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------- |
| `japan` | Hokkaidō–Yaeyama archipelago (17 vertices) + a small Ogasawara ring (4 vertices); excludes Korea, Russia, China, Taiwan |    0.832 | 環境省 星空観察 campaign, 2,799 filtered measurements → 215 cells, RMS 0.37 mag, bias +0.05 mag, 2019–2025 |

Both rings are drawn mostly over open water, with **no smoothing at the
edge** — Tokyo and Busan sit at the same radiance but read a different SQM,
by design (see the transect and control points below for what "different"
means in practice). This is a deliberate trade-off explained at the top of
this document's design: a country-sized hard edge a few kilometres offshore
bothers no one, and drawing a coastline-accurate boundary would cost dozens
more vertices for no measurable gain.

**Limits of the Japanese value, stated plainly**: 215 cells and 2,799
measurements is a solid sample for a single country, but it is one
instrument (a digital camera, V-band-like) reduced by one campaign, and the
band caveat above is real and unresolved — a client comparing this constant
against a pure-SQM reading elsewhere is comparing two different colour
bands, not a construction defect.

#### Borders between regions

When a second region touches the first (a land border, not Japan's sea
edge), the table follows one rule, checked by
`packages/portal/tests/sky-quality-region-borders.test.mjs` on every region
the table holds:

- **A hard edge on the administrative border, no blend.** A position on one
  side reads its region's constant, a position a few kilometres away on the
  other side reads the neighbour's (or the global one). The constants of the
  regions measured so far differ by a few hundredths (Globe at Night: 0.25 to
  0.36) against a residual of 0.4 mag or more, so the step at a border is
  smaller than the noise of the estimate; a blend would add arithmetic for no
  measurable gain.
- **A region is a few simple rings**, each a list of `[latitude, longitude]`
  closed implicitly (the first vertex is not repeated). The vertices follow
  the administrative border simplified to a few kilometres: it is the model's
  border, not the legal one.
- **Two regions that touch share the same border vertices**: the same
  coordinates, digit for digit, in both rings, so the border is one chain of
  edges walked in opposite directions. The test fails on edges that cross
  (overlap), on a vertex lying inside the other region's edge without being
  one of its vertices (a T-junction), on a vertex within 0.05° (about five
  kilometres) of the other region's edge without being on it (a sliver, which
  is a gap or an overlap), and on a ring inside another. Two regions apart by
  more than 0.05° are free of each other.
- **Table order still decides a tie**: first match wins, as today. It only
  matters for a point exactly on a shared edge or vertex.
- **At sea, the edge is drawn over open water**, as the Japan entry is; a
  coastline is never followed.
- **No merging.** A country whose parts differ is two regions only if each
  one passes the acceptance rule below; otherwise it keeps the global
  constant.

**Adding another region** follows the same steps that produced this one:

1. Get measurements under a licence compatible with this repository: CC0,
   CC BY, public domain, the Public Data License 1.0, an Open Government
   Licence, or — as for Japan — a written agreement to ship only a fitted
   constant and its provenance, never the underlying measurements or
   positions. **Never** anything non-commercial or share-alike, anything
   unlicensed, and never the STARS4ALL / TESS archive as an input (ODbL, a
   share-alike licence: it is for validation only, see below).
2. Put the campaign in the one shape `--input-region` reads, a CSV with two
   leading lines saying where it comes from:

   ```text
   # source: <who published it>
   # license: CC BY 4.0
   latitude,longitude,magnitude,date,scatter
   46.51,8.02,20.31,2023-07-14,0.08
   ```

   `magnitude` is the zenith sky brightness in mag/arcsec² (14.0 to 22.5
   kept), `date` an ISO date or a year (the year feeds `--from-year`),
   `scatter` is optional and drops rows above `--max-variation`. A file with
   no `# license:` line, or with a licence outside the list above, is
   refused with the reason. The file is read from disk and never committed.

3. Try the region before it is in the table, with a polygon file (the table's
   own rings, `{"polygons": [[[lat, lon], …]]}`), `--region <id>
--region-polygon <file> --input-region <file> --bootstrap 1000`. The fit
   uses exactly the same filters as the global fit (year window, one median
   per raster cell, at least three readings per cell); Globe at Night and the
   National Park Service set inside the polygon are fitted too and printed
   next to the campaign. `--validate-region <file>` compares the constants
   with a validation-only set (any licence) and fits nothing.
4. **The acceptance rule**, checked by that run (`assessRegionFit`): at least
   30 cells, a 95 % interval of the constant (cells resampled, 1000 draws)
   that excludes the global constant, and an RMS below the global constant's
   on the same cells. A region that fails any of the three is not added: its
   market keeps the global constant and the screens already say
   « estimation ». A region that passes with fewer than 100 cells ships with
   `provenance.note` saying it is a thin fit, and says so in this document.
5. Draw the polygon in `skyQualityCalibrationRegions` by the border rule
   above (a handful of vertices, shared with any neighbour, open water at
   sea), add the entry with the printed constant (three decimals) and its
   provenance, bump `skyQualityCalibrationVersion`, add cases on both sides of
   every border to `fixtures/spec/sky-quality-region.json` and regenerate the
   fixtures. If the source needs an attribution line, extend
   `skyQualityCalibrationCredit` in the web `i18n.js`.

### Regional calibration per market

The same study for the market of each interface language after the three
first ones. The only openly licensed worldwide source with positions is Globe
at Night (CC BY 4.0) with the National Park Service set (public domain), both
already in the global fit, and outside the United States and Europe they are
thin. Run on 2019 to 2025 against the 2025 composite, with the default
filters:

| Language | Market                                | Readings | Cells | Fitted | 95 % interval  | Verdict                                      |
| -------- | ------------------------------------- | -------: | ----: | -----: | -------------- | -------------------------------------------- |
| zh-Hans  | China mainland                        |       11 |     1 |      — | —              | no fit                                       |
| zh-Hant  | Taiwan, Hong Kong, Macao              |        3 |     0 |      — | —              | no fit                                       |
| de       | Germany, Austria, Switzerland         |      391 |    26 |  0.269 | 0.229 to 0.321 | interval contains 0.299, fewer than 30 cells |
| es       | Spain                                 |      427 |    10 |  0.369 | 0.232 to 0.585 | interval contains 0.299, 10 cells            |
| es       | Mexico (not the study's first market) |      184 |    10 |  0.325 | 0.139 to 0.645 | interval contains 0.299, 10 cells            |
| it       | Italy                                 |       42 |     2 |      — | —              | no fit                                       |
| pt-BR    | Brazil                                |       12 |     1 |      — | —              | no fit                                       |
| ru       | Russia                                |        2 |     0 |      — | —              | no fit                                       |

**No region was added**, and `skyQualityCalibrationVersion` was not bumped (a
bump only makes every cached estimate stale). Every one of these markets keeps
the global constant, and `fixtures/spec/sky-quality-region.json` pins it with
one case per market city. The reasons, stated plainly:

- _Too few readings_ for China, Taiwan, Italy, Brazil and Russia: zero to two
  cells with three clear-sky readings in six years of Globe at Night.
- _No separation from the global constant_ for the German-speaking market,
  Spain and Mexico: with 10 to 26 cells, the interval of the fitted constant
  contains 0.299 and the RMS gain is 0.00 to 0.03 mag. The German-speaking
  constant also moves with the data window (0.269 from 2019, 0.328 from
  2016, 0.375 from 2013, while the global constant fitted on the same window
  moves from 0.295 to 0.326), which is the mark of noise, not of a country.
  The earlier breakdown by climate in this document (Iberia 0.29, north-western Europe 0.34) is the same kind of figure on another data window: this run does not reproduce it as a stable regional difference.
- _Latin America_ does not make one region either: the 23 cells across
  Mexico, Chile, Argentina and Uruguay range from 0.33 to 0.82 by country.
- _Other open sources_ were looked at and are not usable as inputs: the
  STARS4ALL / TESS-W and EELabs measurements are served by a dashboard, with
  no bulk file carrying positions, under a data policy that is not stated as an
  attribution licence (validation only); a Tuscan CC BY night-sky dataset has
  station codes and no coordinates; a Galician CC0 sensor network is 14
  fixed sensors for one year, fewer cells than Globe at Night already
  gives. A national campaign comparable to Japan's, with terms that allow a
  fitted constant, was found for none of these markets.

What would change this: a national campaign under an acceptable licence in
the `--input-region` shape (a few dozen cells would be enough), or several
more Globe at Night years. The run is one command per candidate region, and
the verdict is printed.

## What it gives

### Transect out of Madrid

Eight points from Puerta del Sol along azimuth 315°, on the prepared 2′
raster. `node packages/portal/scripts/check-sky-quality-raster.mjs` reproduces
this table.

|  km | radiance |   SQM | Bortle | before (per-pixel model) |
| --: | -------: | ----: | -----: | ------------------------ |
|   0 |    43.00 | 17.30 |      8 | 16.71 / B9               |
|  20 |    11.74 | 18.67 |      7 | 19.42 / B6               |
|  35 |     9.83 | 18.85 |      7 | 17.70 / B8               |
|  45 |     4.88 | 19.55 |      5 | 19.63 / B5               |
|  55 |     1.69 | 20.51 |      4 | **22.00 / B1**           |
|  75 |     0.76 | 21.08 |      4 | 19.78 / B5               |
| 110 |     0.70 | 21.13 |      4 | 21.56 / B4               |
| 170 |     0.50 | 21.32 |      4 | 22.00 / B1               |

The profile now darkens monotonically all the way out, and **no point within
100 km of the city reads better than Bortle 4**. The old model's 22.00 at
55 km — a pristine sky 55 km from six million people — was the defect this
replaces; it happened because `average_masked` had zeroed that cell.

Against the only dense measured profile of that region — the UCM mobile SQM
survey, used here as a check and never as an input — the model agrees to
0.03–0.06 mag in the 40–90 km ring and to within 0.7 mag everywhere:

| distance  | measured median (2010–2014) | model (2025 composite) |
| --------- | --------------------------: | ---------------------: |
| 0–5 km    |                       17.52 |                  17.41 |
| 5–15 km   |                       18.15 |                  17.61 |
| 15–25 km  |                       19.08 |                  18.39 |
| 25–40 km  |                       19.67 |                  19.28 |
| 40–60 km  |                       20.40 |                  20.37 |
| 60–90 km  |                       20.90 |                  20.96 |
| 90–150 km |                       21.16 |                  21.46 |

The two are eleven years apart and Madrid converted to LED in between, so the
residual mixes model error with a real change on the ground.

### Control points

`measured` rows have a published ground measurement behind them; `indicative`
rows are orders of magnitude only.

| Place                           | kind       |   SQM | Bortle | expected  |
| ------------------------------- | ---------- | ----: | -----: | --------- |
| Madrid, Puerta del Sol          | measured   | 17.30 |      8 | 17.0–17.8 |
| Madrid, UCM observatory         | measured   | 17.45 |      8 | 18.2–18.6 |
| Rural Madrid region, ~60 km     | measured   | 20.76 |      4 | 21.0–21.5 |
| Pic du Midi de Bigorre          | measured   | 21.84 |      3 | 20.9–21.5 |
| Roque de los Muchachos          | measured   | 21.81 |      3 | 21.7–22.0 |
| Cerro Paranal                   | measured   | 22.00 |      1 | 21.7–22.0 |
| Paris, Notre-Dame               | indicative | 17.38 |      8 | 17.3–18.5 |
| New York, Manhattan             | indicative | 16.65 |      9 | 17.0–17.8 |
| Tokyo, Chiyoda                  | indicative | 16.98 |      9 | 17.0–17.8 |
| Paris suburb, ~20 km NE         | indicative | 18.20 |      8 | 18.5–19.5 |
| Sierra de Guadarrama, ~55 km NW | indicative | 20.52 |      4 | 20.3–21.3 |
| Cévennes / Mont Lozère          | indicative | 21.92 |      2 | 21.4–21.8 |
| Cherry Springs State Park       | indicative | 21.94 |      2 | 21.5–21.8 |
| Mid-Atlantic, open ocean        | indicative | 22.00 |      1 | 22.0      |
| Mauna Kea                       | indicative | 21.93 |      2 | —         |
| Kiruna, arctic mining town      | indicative | 18.47 |      7 | —         |

Sources for the measured rows: Zamorano et al. 2016, _JQSRT_ 181, 52
(arXiv:1512.06694) for Madrid centre and its rural surroundings; Robles et al.
2021, _Remote Sensing_ 13, 1511 for the UCM observatory; Charlier 2017, HAL
halshs-01620903 for the Pic du Midi (SQM-L, mean 21.26 over n = 33, range
20.92–21.52); Benn & Ellison 1998 for La Palma; Patat 2008 for Paranal.

One measured point misses by more than 0.5 mag: **the UCM observatory, 0.75 mag
too bright**. It sits 3.5 km from Puerta del Sol, which is less than one 2′
cell, so the model cannot resolve the ~1 mag gradient between them; it splits
the difference and matches the brighter of the two. That is a resolution
limit, not a calibration error.

## What the estimate does not model

- **Terrain screening.** A ridge between a city and the site blocks part of
  the glow, and nothing here knows about it. Sánchez de Miguel et al. (2020)
  report exactly this as an open gap: "the circled area in Fig. 13 shows a
  significant difference between our model of skyglow based on VIIRS and ISS
  data and the sky brightness reported by the World Atlas. We believe this is
  most likely due to the mountains blocking the light of Madrid, resulting in
  a darker sky beyond them". The Pic du Midi, 0.32 mag darker in the model
  than the measured mean, is a plausible instance in the opposite direction:
  a mountain-top site whose horizon the kernel treats as flat ground.
- **Observer altitude.** Air mass and the aerosol layer above a 2000 m site
  differ from those at sea level, and there is no elevation term anywhere in
  this pipeline.
- **Local atmosphere.** The GLOBAL constant cannot know the aerosol load. The
  calibration set is dominated by dry air (every National Park Service site is
  in the United States, most in the west), so a humid, hazier sky is likely to
  be somewhat brighter than the global constant says outside a region with its
  own entry. That is now measured rather than suspected: see "A third source:
  Japan, not used for the global constant, used for its own region" above,
  where the global constant reads 0.75 mag too dark against 215 Japanese
  cells and where the same breakdown of Globe at Night puts dry regions near
  0.25–0.29 and humid ones near 0.34–0.36 on the same constant — see
  "Regional calibration" above for how Japan's own entry addresses this for
  positions inside it.
- **Lamp spectrum, and the band.** The constant is fitted partly against
  V-band all-sky photometry and partly against SQM readings, which differ by
  roughly 0.5 (B−V) of the sky — and that colour depends on the lamps, which
  are changing fast. No colour correction is applied because applying a single
  one would be inventing a number.
- **Villages masked to zero.** `average_masked` removes cells where no light
  was detected. Isolated small settlements below that threshold contribute
  nothing, so the model slightly **under**-estimates brightness in otherwise
  empty countryside.
- **Resolution.** A 2′ cell is 3.7 km at the equator. Two places closer than
  that get the same answer, as the UCM observatory row above shows.

There is currently **no way for a user to enter their own measured SQM or
Bortle for a place**: the observing place carries a name, coordinates, time
zone, elevation and a horizon mask, and nothing else. An entered measurement
taking precedence over the estimate would be the cheapest real improvement for
a site the model gets wrong.

## Brightness by direction (estimate)

The raster answers one number per place: the brightness **at the zenith**.
`skyBrightnessByDirection` (`packages/portal/src/sky-quality-direction.js`)
estimates the rest of the sky from the same field, so that a light dome can be drawn on
the horizon map. It is **an estimate, not a measurement**, and every result
says so (`estimate: true`, `model: "line-of-sight-v1"`).

**Input.** `skyQualityWindow` (or `skyQualityWindowFromGrid` for an installed
grid, `loadSkyQualityWindow` on the server, `skyQualityWindowFromRaster` for
the offline pack's 6′ raster) cuts the raster's own cells within
150 km of the place, decoded to radiances. At 2′ that is about 100 × 84
cells; at 6′, about 35 × 30. Nothing else is read: no network, no terrain.

**Model.** Looking at altitude _h_ towards azimuth _A_, the line of sight
climbs through a scattering layer whose density falls off exponentially with
height (scale height _H_, `layerHeightKm`, default 5 km). At horizontal
distance _x_ it is at height `z = x·tan h + x²/(2R⊕)` above a ground point
_P_. The light scattered towards the observer there is taken proportional to
the zenith glow of _P_ — the raster value, which already sums every source
around _P_ — times the local density of the layer, dimmed by the layer
crossed on the way back:

```text
B(h, A) = K · Σ R(P(x_k, A)) · e^(−τ·q_k) · Δq_k  /  Σ_zenith e^(−τ·q_k) · Δq_k
```

where `q` counts the zenith columns of the layer crossed so far, 64 samples
spread evenly over the layer up to ten scale heights, _K_ the same regional
luminance-per-radiance constant as the zenith estimate. The natural 22.0
mag/arcsec² background is added once, unweighted. The mean crossing distance
is about `H / tan h` (28 km at 10°, 5 km at 45°), the first model written for
this feature; integrating along the whole line of sight instead of reading
one point at that distance keeps a nearby city brightest on the horizon rather
than in a ring at the one altitude whose crossing distance matches it.

**Path-length weighting, and its cap.** For a uniform field the ratio to the
zenith is `W(h) = (1 − e^(−τ·Q(h))) / (1 − e^(−τ))`, where `Q(h)` is the air
mass of the layer (≈ 1/sin h near the zenith, finite on the horizon thanks to
the curved Earth: ≈ 45 for H = 5 km). Near the zenith the artificial glow
grows like a plain air mass; towards the horizon the extinction term caps it
at `1/(1 − e^(−τ))`, because light scattered far along a long path is itself
dimmed on the way back. With the default zenith optical depth `τ = 0.15`
(`opticalDepth`, V band; documented range 0.15 for a clear, dry sky to 0.5
for a hazy one) a uniform glow reads at most 2.1 mag brighter on the horizon
than at the zenith. The same extinction makes a distant dome brightest a few
degrees above the horizon rather than on it, as all-sky photographs of
distant cities show.

**Rules.** At 90° the value is the
single-point estimate (same bilinear read, same conversion, same regional
calibration). An altitude below 2° is computed as 2°. Beyond
`maximumDistanceKm` (150 km) along the line of sight the value at that
distance is used; outside the window, the window's edge cell.

**Validation.** `packages/portal/scripts/validate-sky-direction.mjs` runs
it on reference points (`--sites`, coordinates rounded to 0.1°, no names) and
writes a table and one polar plot per point. On the 2025 2′ raster, with the
default parameters: the zenith equals the single-point estimate at every
point; from six rural or mountain points 36–58 km from an isolated large
city, the brightest azimuth at 10° falls within 15° of the bearing of the
city centre five times out of six (0°, 8°, 10°, 10°, 10° and 16°), and the
same five of six hold for every layer height from 3 to 8 km and every
optical depth from 0.15 to 0.5; two controls far from any light stay within
0.01 mag of their zenith. Against the National Park Service all-sky
photometry (`--nps`, 445 lit sites), the hemisphere-mean artificial
luminance correlates at r = 0.90 in log with the measured one, median ratio
0.86; the model's mean-to-zenith ratio (median 2.9 at τ = 0.25, 3.5 at the
default τ = 0.15) is lower than the measured one (4.0), so the estimate
probably makes the low sky somewhat too dark relative to the zenith.

**What it does not know.** Everything under "What the estimate does not
model" above, and in addition: terrain on the line of sight (a ridge between
a city and the observer hides nothing here), one layer height and one optical
depth for every place and every night, no natural brightening towards the
horizon (airglow, zodiacal light, extinction of the natural sky), no clouds
lighting up above a city. It says where the artificial glow comes from and
roughly how strong it is compared with the zenith; it does not replace an
all-sky measurement of the place.

### On the horizon map

The planner's horizon map can draw this estimate as a
layer: open « Calques » (Layers) beside « Positions | Trajet » and turn on
« Pollution lumineuse par direction » (light pollution by direction). The
layer is a translucent warm wash over the whole map, in both projections,
drawn under the horizon mask, the path and the targets, and labelled as an
**estimate**; the plot's spoken description says where it is strongest. The
scale is absolute, in mag/arcsec² (the unit of the Bortle value): a sky at
21.6 or darker is not tinted at all, then the tint grows warmer and stronger
up to 18.0 and brighter, which is why a dome rises from the horizon and
fades with altitude. It is display only: the ranking of the targets does not
read it. The layer is off by default; the plan remembers the switch
(`view.horizon.layers`), never the values it draws.

Where it is computed: a client that holds the offline pack's 6′ raster
computes it on the device, so it works with no network; otherwise it asks the
service, `GET /v1/sky-quality/direction`, which computes it from the installed
2′ raster (coordinates rounded to 0.01°). The web always asks the service. The
grid is kept per place and per raster checksum; it is derived data, never
synchronized and never written into a plan. Without the raster, and offline
without anything kept, the switch is disabled and says why.

## Fixture tile

`packages/astro-contracts/fixtures/sky-quality-tile.json` is a 4° × 4° cut of
the prepared raster (11W–7W, 37N–41N: a coastal metropolitan area next to open
Atlantic ocean, so the tile spans the whole encoded range), at the same
encoding, with its own bounds and provenance. The sampling tests read it
instead of the full raster, so they need neither network access nor an EOG
account. Regenerate it with the same `--fixture-tile-bounds` after a
raster rebuild.
