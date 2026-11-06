/**
 * The gnomonic (TAN) projection between the sky and the pixels of an image
 * whose sky solution is known: the calculation the old portal ran on the
 * output of `wcsinfo` (`hygAnnotations`), without any subprocess. Pure.
 *
 * The conventions of `sky-solution.schema.json`:
 *
 * - pixels: `x` to the right, `y` downward, the image spanning `[0, width]`
 *   × `[0, height]` (the rows as a JPEG, PNG or TIFF stores them, and as an
 *   SVG overlay draws them); the field centre (`raDeg`, `decDeg`, J2000) is
 *   the image's centre `(width / 2, height / 2)`;
 * - `pixelScaleArcsec`: arc seconds per pixel of the solved image;
 * - `rotationDeg`: the position angle of the image's up direction (towards
 *   row 0), from celestial north towards east, `[0, 360)`; `0` is « north
 *   up »;
 * - `parity`: `normal` when east is to the left of north (the sky as seen,
 *   north up and east left at `rotationDeg` 0), `mirrored` when the image is
 *   flipped.
 */

const DEG = Math.PI / 180;

const wrap360 = (value) => ((value % 360) + 360) % 360;

/** The sky directions of the image's axes, in the tangent plane (ξ east, η north). */
function axes(solution) {
  const theta = solution.rotationDeg * DEG;
  const up = [Math.sin(theta), Math.cos(theta)];
  const right =
    solution.parity === "mirrored"
      ? [Math.cos(theta), -Math.sin(theta)]
      : [-Math.cos(theta), Math.sin(theta)];
  return { up, right };
}

/**
 * The standard coordinates (ξ, η) in degrees of a sky position about a
 * tangent point, or `null` for a position on the far side of the sky.
 */
export function standardCoordinates(centre, raDeg, decDeg) {
  const alpha = raDeg * DEG;
  const delta = decDeg * DEG;
  const alpha0 = centre.raDeg * DEG;
  const delta0 = centre.decDeg * DEG;
  const cosC =
    Math.sin(delta0) * Math.sin(delta) +
    Math.cos(delta0) * Math.cos(delta) * Math.cos(alpha - alpha0);
  if (!(cosC > 1e-9)) return null;
  return {
    xi: (Math.cos(delta) * Math.sin(alpha - alpha0)) / cosC / DEG,
    eta:
      (Math.cos(delta0) * Math.sin(delta) -
        Math.sin(delta0) * Math.cos(delta) * Math.cos(alpha - alpha0)) /
      cosC /
      DEG,
  };
}

/** The sky position of standard coordinates (ξ, η) in degrees about a tangent point. */
export function skyFromStandard(centre, xi, eta) {
  const x = xi * DEG;
  const y = eta * DEG;
  const delta0 = centre.decDeg * DEG;
  const rho = Math.hypot(x, y);
  if (rho === 0) return { raDeg: wrap360(centre.raDeg), decDeg: centre.decDeg };
  const c = Math.atan(rho);
  const decDeg =
    Math.asin(
      Math.cos(c) * Math.sin(delta0) +
        (y * Math.sin(c) * Math.cos(delta0)) / rho,
    ) / DEG;
  const raDeg =
    centre.raDeg +
    Math.atan2(
      x * Math.sin(c),
      rho * Math.cos(delta0) * Math.cos(c) - y * Math.sin(delta0) * Math.sin(c),
    ) /
      DEG;
  return { raDeg: wrap360(raDeg), decDeg };
}

/**
 * The pixel `{ x, y }` of a sky position in the solved image, or `null`
 * on the far side of the sky. `scale` (default 1) multiplies the result,
 * for a copy of the image of other dimensions and the same proportions.
 */
export function skyToPixel(solution, raDeg, decDeg, scale = 1) {
  const standard = standardCoordinates(solution, raDeg, decDeg);
  if (!standard) return null;
  const { up, right } = axes(solution);
  const degreesPerPixel = solution.pixelScaleArcsec / 3600;
  const alongUp = standard.xi * up[0] + standard.eta * up[1];
  const alongRight = standard.xi * right[0] + standard.eta * right[1];
  return {
    x: (solution.width / 2 + alongRight / degreesPerPixel) * scale,
    y: (solution.height / 2 - alongUp / degreesPerPixel) * scale,
  };
}

/** The sky position of a pixel of the solved image. */
export function pixelToSky(solution, x, y) {
  const { up, right } = axes(solution);
  const degreesPerPixel = solution.pixelScaleArcsec / 3600;
  const alongRight = (x - solution.width / 2) * degreesPerPixel;
  const alongUp = (solution.height / 2 - y) * degreesPerPixel;
  return skyFromStandard(
    solution,
    alongRight * right[0] + alongUp * up[0],
    alongRight * right[1] + alongUp * up[1],
  );
}

/**
 * The angular radius in degrees of the circle that holds the whole field
 * (from its centre to a corner), for a coarse selection of the catalogue.
 */
export function fieldRadiusDeg(solution) {
  const corner = pixelToSky(solution, 0, 0);
  const a = solution.decDeg * DEG;
  const b = corner.decDeg * DEG;
  const cosine =
    Math.sin(a) * Math.sin(b) +
    Math.cos(a) * Math.cos(b) * Math.cos((corner.raDeg - solution.raDeg) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG;
}

/**
 * The fields of a sky solution (`sky-solution.schema.json`, without
 * `schemaVersion`, `source`, `solverVersion` and `solvedAt`) from a TAN WCS
 * as FITS writes it — `CRVAL1/2` (degrees), `CRPIX1/2` (1-based, a pixel's
 * centre at a whole number) and the `CD` matrix (degrees per pixel) — in the
 * pixel axes above (`y` downward: the rows as an image file stores them; a
 * FITS whose rows go up is flipped by the caller, `CD1_2` and `CD2_2`
 * negated and `CRPIX2` taken from the other end). SIP distortion is
 * ignored. The centre is the image's own, wherever the reference pixel
 * is. `null` for a singular matrix.
 */
export function skySolutionFromTanWcs({
  crval1,
  crval2,
  crpix1,
  crpix2,
  cd11,
  cd12,
  cd21,
  cd22,
  width,
  height,
}) {
  const determinant = cd11 * cd22 - cd12 * cd21;
  if (
    ![crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22].every(
      Number.isFinite,
    ) ||
    !determinant ||
    !(width > 0 && height > 0)
  )
    return null;
  const reference = { raDeg: crval1, decDeg: crval2 };
  // The sky position of a FITS pixel (1-based) by the WCS itself.
  const skyAt = (x, y) =>
    skyFromStandard(
      reference,
      cd11 * (x - crpix1) + cd12 * (y - crpix2),
      cd21 * (x - crpix1) + cd22 * (y - crpix2),
    );
  const cx = (width + 1) / 2;
  const cy = (height + 1) / 2;
  const centre = skyAt(cx, cy);
  // The matrix at the image's centre, about the centre as tangent point
  // (central differences): the orientation of north there, not at the
  // reference pixel, so that the whole field agrees with the WCS.
  const step = 8;
  const local = (from, to) => {
    const a = standardCoordinates(centre, from.raDeg, from.decDeg);
    const b = standardCoordinates(centre, to.raDeg, to.decDeg);
    return [(b.xi - a.xi) / (2 * step), (b.eta - a.eta) / (2 * step)];
  };
  const [c11, c21] = local(skyAt(cx - step, cy), skyAt(cx + step, cy));
  const [c12, c22] = local(skyAt(cx, cy - step), skyAt(cx, cy + step));
  const localDeterminant = c11 * c22 - c12 * c21;
  const degreesPerPixel = Math.sqrt(Math.abs(localDeterminant));
  const rotationDeg = wrap360(Math.atan2(-c12, -c22) / DEG);
  return {
    raDeg: centre.raDeg,
    decDeg: centre.decDeg,
    pixelScaleArcsec: degreesPerPixel * 3600,
    rotationDeg: rotationDeg >= 360 ? 0 : rotationDeg,
    fieldWidthDeg: width * degreesPerPixel,
    fieldHeightDeg: height * degreesPerPixel,
    parity: localDeterminant > 0 ? "normal" : "mirrored",
    width,
    height,
  };
}
