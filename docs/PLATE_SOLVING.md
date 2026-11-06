# Local plate solving

The portal can solve an image with Astrometry.net, retain the WCS file, and
produce an interactive overlay. This feature is optional; every other page
works without the binaries or indexes.

## Dependencies

The following commands must be available in `PATH` or configured through
environment variables:

- `solve-field`;
- `wcsinfo`;
- `plot-constellations`.

The HYG v4.1 catalog adds star names and magnitudes. The server fetches its CSV
by itself at start when `ASTRO_PORTAL_HYG_CATALOG` is missing (SHA-256 checked;
`ASTRO_PORTAL_HYG_DOWNLOAD=off` stops it; `npm run install:hyg-catalog` does it
on demand). Without HYG, objects returned by Astrometry.net remain available,
but no star is added and the gallery's viewer says « Stars unavailable on this
server ».

HYG v4.1 is © David Nash (astronexus.com), licensed CC BY-SA 4.0
(<https://github.com/astronexus/HYG-Database>); the annotations built from it
are an adaptation under the same licence.

## Indexes

Astrometry.net uses indexes matched to the apparent size of stellar patterns.
Installing an arbitrary index range can make very wide or very narrow fields
fail. Keep indexes under `ASTRO_PORTAL_ASTROMETRY_INDEX_DIR` and adjust
`scaleLow` and `scaleHigh` per target when necessary.

## Per-target hints

```json
{
  "plateSolveHints": {
    "ra": 83.822,
    "dec": -5.391,
    "radius": 4,
    "scaleLow": 1,
    "scaleHigh": 4,
    "downsample": 2,
    "cpuLimit": 90
  }
}
```

RA and DEC are optional. Without them, solving is blind. `scaleLow` and
`scaleHigh` express the field width in degrees.

## Solve lifecycle

1. The API computes a stable target/version key.
2. `solve-field` writes results to `<runtime>/plate-solves/<key>/`.
3. `plot-constellations` supplies extended objects.
4. HYG stars are projected through the WCS transformation.
5. `annotations.json` is cached and reused.

After a failure, `status.json` and `solve.log` remain in that directory. An
explicit retry can be requested with `?retry=1` on the solve API.

Runtime files are reproducible and must not be committed to Git.
