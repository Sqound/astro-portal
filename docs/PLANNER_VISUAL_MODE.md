# Planner visual mode and framing imagery

The observation planner has two presentation modes:

- **Photo** prepares an imaging session and presents photographic target
  imagery.
- **Visual** prepares an eyepiece session. It presents an available visual
  reference; otherwise it deliberately keeps the photographic reference rather
  than leaving a blank card.

Visual mode is an observing aid. A survey or sketch can show an object's
structure and orientation, but cannot predict its eyepiece appearance. That
appearance still depends on aperture, exit pupil, sky brightness,
transparency, filter, magnification and the observer.

## Target-image variants

Target-library image data remains private runtime content. Photographic and
visual assets are intentionally separate:

| Variant            | Manifest                     | Asset route                                    | Purpose                                            |
| ------------------ | ---------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Selected photo     | `curated-photo-images.json`  | `/target-library-curated-images/<file>`        | Rights-tracked, high-quality editorial photograph  |
| DSS photo fallback | `images.json`                | `/target-library-images/<file>`                | Full-catalogue photographic coverage               |
| Visual reference   | `visual-images.json`         | `/target-library-visual-images/<file>`         | Optional, rights-tracked eyepiece sketch/reference |
| Visual preview     | `visual-preview-images.json` | `/target-library-visual-preview-images/<file>` | Generated muted grayscale DSS preview              |

The target-library API exposes the resolved `photoThumbnailUrl`,
`visualThumbnailUrl` and `visualPreviewThumbnailUrl`, together with
`dssThumbnailUrl` and `premiumThumbnailUrl` for administrative comparison.
The active visual credit follows the same precedence. The legacy `thumbnailUrl`
remains the resolved photographic URL for existing callers.

| Planner mode | Registered images               | Result                               |
| ------------ | ------------------------------- | ------------------------------------ |
| Photo        | Selected photo                  | Selected photographic image          |
| Photo        | No selected photo               | DSS photographic fallback            |
| Visual       | Authorised visual reference     | Reference and its image-level credit |
| Visual       | No reference, preview available | Generated muted preview              |
| Visual       | No visual asset                 | Selected photo, then DSS fallback    |

This selection rule applies to recommended target cards, catalogue cards,
selected-target map previews, and schedule cards. Catalogue thumbnail
enlargement uses the same resolved image as its normal thumbnail.

Every manifest entry may include a short `credit`, source and licence details.
The credit is overlaid on a thumbnail when supplied; the catalogue also shows
manifest-level attribution. A visual asset must retain its source and licence.
The full-catalogue visual preview layer is created from the existing local DSS
images. It produces grayscale images at 58% brightness and −15% contrast, and
records that processing in the private manifest. It is an observing-oriented simulation, not an eyepiece
sketch. Do not add third-party sketches or photographs unless their rights
explicitly permit this use.

### Prepared reference records

An administrator can prepare a visual-reference record before its local asset
is available. Its target editor then retains the expected filename, source,
credit and licence trail, without affecting visual mode. A prepared third-party
file uses its catalogue designation: `Messier-79-sketch-s.jpg` for M79 and
`NGC40-sketch-s.jpg` for NGC 40. The service checks the private
`visual-images/` directory before exposing a visual image. Until that exact
file exists, the catalogue uses the normal visual-preview/photo fallback and
never renders a broken thumbnail.

#### Reference-record contract

A prepared record is metadata, not evidence of a licence or a downloaded
asset. The editor keeps these values alongside the target:

| Field                    | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `file`                   | Exact expected local filename.                                                         |
| `source` / `sourceUrl`   | Named source and its object page.                                                      |
| `assetUrl`               | Original asset or source page when no direct asset URL is recorded.                    |
| `credit`                 | Credit displayed with an active visual reference.                                      |
| `license` / `licenseUrl` | Reuse status and its authoritative terms.                                              |
| `availability`           | Editorial state such as `awaiting-file`; it is informative and is not a licence grant. |

The supported prepared filenames are deliberately restrictive and contain no
path separators:

| Catalogue | Filename example          |
| --------- | ------------------------- |
| Messier   | `Messier-79-sketch-s.jpg` |
| NGC       | `NGC40-sketch-s.jpg`      |
| IC        | `IC418-sketch-s.jpg`      |
| Barnard   | `Barnard-33-sketch-s.jpg` |

The image route accepts only these names (plus the legacy generated
`visual-openngc-*` and `visual-barnard-*` names), then still confines reads to
the private visual-image directory.

#### Deep Sky Watch references

The Deep Sky Watch references are prepared from the public Deep Sky Watch
index: its target designations are matched to the local catalogue, and only
reference metadata is written into the private target database. No image is
requested, downloaded, transformed, or copied. At preparation time the record
states that the work is copyrighted, attributes Michael Vlasov /
DeepSkyWatch.com, and records that written permission is required.

The static export carries only the catalogue metadata; it never packages an
image file. Preparing again is idempotent for the same source and does not
replace a different existing visual reference.

#### Activation and verification

Only after written permission covers the intended use, put the unmodified or
permitted derivative in the private `target-library/visual-images/` directory
under the exact `file` value stored in the target record. A directory change is
part of the catalogue cache revision, so the reference activates automatically
without a source-code change or a database rewrite.

Verify both states on the served release:

1. Before the file exists, the target retains its visual-reference fields in
   admin, but `visualThumbnailUrl` is `null` and the visual-preview/photo
   fallback appears.
2. After the correctly named permitted file exists, `visualThumbnailUrl` uses
   `/target-library-visual-images/<file>` and the image-level credit appears.
3. Confirm the source page, credit and licence shown in the target editor match
   the permission or licence actually obtained.

The initial selected-photo collection uses the NSF NOIRLab public archive. Its
import retrieves only the checked-in editorial selection, copies a
publication-quality local derivative, and records the source page, full credit
line, asset URL and CC BY 4.0 licence in the private manifest. It never
overwrites the DSS directory.

## Framing previews

Choosing **Use this framing** saves the exact J2000 centre and selected
equipment field. It also records a generated HiPS preview so a saved framing is
recognisable in the **Framings** tab and later in a plan.

| Planner mode at creation | HiPS source used for the saved preview |
| ------------------------ | -------------------------------------- |
| Photo                    | `CDS/P/DSS2/color`                     |
| Visual                   | `CDS/P/DSS2/red`                       |

A saved framing therefore keeps the preview with which it was created.
Changing modes later does not rewrite saved framing data or replace its image.

## Embedded Stellarium map

The interactive map uses a wide orientation survey first, then swaps to a
high-detail survey once the field is **18° or narrower**:

| Map state                   | Photo mode             | Visual mode            |
| --------------------------- | ---------------------- | ---------------------- |
| Wide orientation            | CTA-FRAM colour survey | CTA-FRAM colour survey |
| Detailed background (≤ 18°) | DSS colour             | DSS2 red monochrome    |

The detailed visual layer is the monochrome DSS2 red HiPS survey, not a CSS
filter applied to the complete canvas. Marker rings, the equipment field,
controls, constellation layers and coordinate grid stay legible and behave
normally. The map credit changes with the selected survey. The registry entry
for [DSS2 Red](https://alasky.cds.unistra.fr/MocServer/query?ID=CDS%2FP%2FDSS2%2Fred&fmt=html&get=record)
records its provenance and data-use terms.

## Touch and mobile gesture contract

The browser viewport is natively kept at scale 1. The document permits normal
scrolling but does not offer browser pinch zoom. This is declared through
viewport metadata and `touch-action`, not through a global JavaScript gesture
listener.

The map is the intentional local exception:

- its complete shell, including overlays and controls, owns touch gestures;
- a pinch inside that shell changes only the Stellarium field of view;
- a pinch must never be handed to the browser as page zoom;
- reset returns the map to its normal field without changing target selection.

Keep `touch-action: none` on the map shell when changing markup or z-index
layers. Applying it only to the canvas is insufficient: a gesture beginning on
a control or overlay could otherwise be interpreted by the browser.

## Verification checklist

Verify all of the following on the served release after a change:

1. Photo mode shows a photographic target image.
2. Visual mode chooses a registered visual image, then falls back to photo.
3. A visual framing has a monochrome DSS2-red preview; a photo framing remains
   colour.
4. At 18° or below, the map credit and raster layer switch with planner mode
   while overlays remain visible.
5. At a real mobile viewport, pinch inside the map changes map scale only;
   pinch outside it never enlarges the page. Test gestures near map controls as
   well as in empty sky.
