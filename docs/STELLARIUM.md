# Stellarium Web Engine

The interactive atlas ships a locally built copy of
[Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine),
licensed by its authors under GNU AGPL v3 or a commercial licence. Astro Portal
Core uses the GNU AGPL v3 option.

## Included material

`public/vendor/stellarium/` contains generated WebAssembly and JavaScript
files plus the required subset of upstream compact test sky data: stars to
magnitude 7, the Western sky-culture index and illustrations, deep-sky
objects, and the Milky Way survey.

The constellation illustrations of the Western sky culture are drawings by
Johan Meuris, under the [Free Art License](https://artlibre.org/licence/lal/en/);
the sky-culture texts and data are under CC BY-SA. The catalogue credits them
as « Constellation drawings: Johan Meuris (Stellarium), Free Art License »
wherever a constellation's picture is shown. The pictures of the bright stars
and of the constellations in `examples/sky-culture-images/` are renders of the
application's sky map made from that material (see the folder's CREDITS.md).

They were built from upstream revision
`e7201246bdf7289c50a3ec59e98f69f0f9383b05` using Emscripten 1.39.17 and
`make js-es6`. The WebAssembly module is the unmodified build output. The
JavaScript loader carries two local edits to its browser event plumbing, listed
below; no engine logic is touched.

| File                         | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `stellarium-web-engine.js`   | `fb75bc515f5c72a4a6479c7277d645c37943eea5f55b11f605fcf666b13f00eb` |
| `stellarium-web-engine.wasm` | `0cd895e2389af44b210787e629d61b3496db87b96f29333d7aff00428f47a443` |

### Local edits to `stellarium-web-engine.js`

Upstream's loader compares the canvas backing store against CSS pixels and
reads touch coordinates in page space, which both break on a Retina display
inside a scrolled page. The two edits are:

- the resize check compares `canvas.width`/`canvas.height` against the display
  size multiplied by the device pixel ratio, as the assignment just below it
  already does;
- `touchstart`/`touchmove`/`touchend` read `clientX`/`clientY` instead of
  `pageX`/`pageY`, so a scrolled page no longer offsets every touch.

Rebuilding from upstream therefore restores hash
`9fe46892a957406f3895f75a69dd04b14dc4f29d1e47b4e09584bd8250edcaf4`; reapply
both edits and record the new hash here.

## Rebuilding the vendor files

Clone exactly that revision of the upstream repository, prepare its documented
Emscripten and SCons environment, run `make js-es6` at its root, then copy
`build/stellarium-web-engine.js` and `build/stellarium-web-engine.wasm` into
`public/vendor/stellarium/`. Copy only `stars/`, `dso/`,
`surveys/milkyway/`, and the complete `skycultures/western/` directory from
`apps/test-skydata/` into its `skydata/` directory.

The upstream `emscripten/emsdk:1.39.17` Docker image is based on archived Debian
Buster. When using its legacy `Dockerfile.jsbuild`, replace its Debian package
mirrors with `archive.debian.org` and disable `Acquire::Check-Valid-Until` before
installing SCons. This only repairs the obsolete build image; it does not modify
Stellarium engine source or the distributed assets.

The complete corresponding source of the bundled engine is available at the
pinned [upstream revision](https://github.com/Stellarium/stellarium-web-engine/tree/e7201246bdf7289c50a3ec59e98f69f0f9383b05).

## Outbound target links

Planner and target-page links open the public Stellarium Web target route with
the target identifier and field of view. This is intentionally an ordinary web
link: a browser cannot reliably discover and launch a locally installed
Stellarium desktop application, and the desktop app does not provide a portable
web-link contract used by this project.

The public Stellarium Web link accepts target framing but does not expose a
supported URL parameter for forcing constellation lines, labels, or artwork.
Those display choices remain under the visitor's control in Stellarium Web. A
future controlled, embedded integration could set engine display properties;
the portal does not depend on a local Remote Control service or change a
visitor's Stellarium settings.

## Planner survey layers and framing

The embedded planner map is independent from outbound Stellarium Web links. It
starts with the wide CTA-FRAM colour survey and switches at a 18° field of view
to a detailed DSS background. Photo mode uses DSS colour; visual mode uses the
monochrome DSS2-red HiPS survey. The latter is a separate survey layer, not a
filter applied to the entire WebGL canvas, so constellation data and planner
overlays remain unchanged.

Saved framing previews use the matching HiPS source at the moment they are
created: DSS2 colour in photo mode and DSS2 red in visual mode. The full
contract for image variants, credits, mobile gestures and release verification
is in [Planner visual mode and framing imagery](PLANNER_VISUAL_MODE.md).

### The survey layer and the Bortle class

`src/modules/dss.c` scales the whole survey layer's opacity by
`(9 - core.bortle_index) / 6` and then drops the layer — without requesting a
single tile — once the result falls under `3/255`. Writing an observer's real
class into `core.bortle_index` therefore blanks the backdrop under a city sky,
and blanks it completely at class 9.

The map does not do that. It keeps `core.bortle_index` at the class the survey
layer is calibrated for and reproduces the class's star extinction through
`core.star_linear_scale`, which `src/core.c` combines with the index in a
single term. The survey is reference imagery for framing, so it
looks the same from every site; the star field still thins out with the class.

The layer is also faded out by `smoothstep(20°, 10°, fov)`: above a 20° field
of view no survey is drawn at all, and the wide backdrop the observer sees
there is the locally served Milky Way survey (`core.milkyway`).
