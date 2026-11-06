/*
 * The distance kernel that turns a map of upward radiance into a map of
 * artificial skyglow. Preparation-time only: the propagated field is baked
 * into raster.bin, so the portal service never evaluates this file. It lives
 * beside prepare-sky-quality-raster.mjs, its
 * only caller, and beside the tests that pin its properties.
 *
 * ── Why a kernel at all ──────────────────────────────────────────────────
 * VIIRS measures the light leaving each cell upwards. The zenith brightness
 * an observer sees is scattered light from a wide area around the site, so
 * the two coincide only where the satellite happens to be looking at
 * scattered light rather than at lamps. The `average_masked` product makes
 * the difference impossible to ignore: it sets every cell in which no light
 * was detected to zero, so a valley 55 km from a six-million-inhabitant city
 * reads as a pristine sky. Summing the surroundings with a distance weight is
 * what removes that failure.
 *
 * ── The model ────────────────────────────────────────────────────────────
 * Duriscoe, D.M., Anderson, S.J., Luginbuhl, C.B. & Baugh, K.E., "A
 * simplified model of all-sky artificial sky glow derived from VIIRS
 * Day/Night band data", Journal of Quantitative Spectroscopy and Radiative
 * Transfer 214 (2018) 133-145, doi:10.1016/j.jqsrt.2018.04.028. Published
 * open access under CC BY 4.0; read in full from the copy NOAA hosts at
 * <https://repository.library.noaa.gov/view/noaa/21007>.
 *
 * Their equation (9), page 135, sums VIIRS Day/Night Band radiance over the
 * cells around a site, weighted by a power of the distance:
 *
 *     ALR = c · Σᵢ rᵢ dᵢ^(−α)
 *
 * with rᵢ the cell's upward radiance in nW/cm²/sr and dᵢ the distance from
 * the site to the cell centre in kilometres. The exponent is not constant:
 * equation (11), page 139, makes it grow with distance,
 *
 *     α = 2.3 (d/350)^0.28
 *
 * which the paper describes as running "from −0.45 at 1 km to −2.20 at
 * 300 km" (page 139) — the values 2.3·(1/350)^0.28 = 0.446 and
 * 2.3·(300/350)^0.28 = 2.203 reproduce exactly, which is what fixes the
 * ambiguous typesetting as a multiplication rather than a power of 2.3. A
 * variable exponent is what Garstang's radiative-transfer models predict:
 * Garstang, R.H., "Model for artificial night-sky illumination", PASP 98
 * (1986) 364, page 369, writes that for b = C P D^α "α becomes more negative
 * for increasing D", and his Table II and the curved-Earth Table 1 of
 * Garstang (1989), PASP 101, 306, page 314, tabulate α from −1.90 to −4.50.
 * Walker's single-city law, Walker, M.F., "The effects of urban lighting on
 * the brightness of the night sky", PASP 89 (1977) 405, section III, page
 * 407, where the observations "have been represented by a straight line
 * corresponding to I ∝ D^−2.5", is the constant-exponent special case; it was
 * measured at 45° altitude towards one city over 8–99 km, not at the zenith
 * and not over a whole region, so it is cited here as the historical origin
 * of the power law rather than as the law used.
 *
 * ── The one change made here, and why ────────────────────────────────────
 * Equation (11) was fitted to the ALL-SKY average luminance. This portal
 * reports a ZENITH figure (SQM, mag/arcsec²), and the same paper is explicit
 * that the two are not interchangeable: it measures ALR/ZLR at 1.58-3.27 in
 * the model and 2.0-6.0 in observations, "highest in the darkest locations"
 * (page 141), and says a separate zenith/distance relation "would have to be
 * derived". Zenith brightness falls off faster with distance than the all-sky
 * average, so the exponent has to be larger.
 *
 * The scale of the exponent is therefore refitted here — α = A (d/350)^0.28,
 * the same functional form, with A free — against measured ZENITH sky
 * brightness. A is baked into the raster, so the fit is a scan: rebuild the
 * raster at each A, then run
 * packages/portal/scripts/calibrate-sky-quality.mjs, which fits the read-time
 * luminance constant and reports the residual. Against the two openly
 * licensed measurement sets that script documents (491 sites: 108 National
 * Park Service all-sky camera measurements from 2019 onwards, public domain,
 * and 383 Globe at Night cells, CC BY 4.0), the residual is flat across
 * A = 3.5 to 4.4 at 0.716-0.721 mag RMS. A = 3.8 is taken from inside that
 * plateau, as the point where the professionally measured National Park
 * Service subset — the half of the data with real photometry behind it — has
 * no residual bias (-0.001 mag, against -0.15 at Duriscoe's own 2.3).
 *
 * The resulting exponent runs from 0.74 at 1 km to 3.64 at 300 km, inside the
 * range Garstang's models give: Table II of Garstang (1986), page 370, and
 * Table 1 of Garstang (1989), page 314, tabulate α from -1.90 for a town of
 * a thousand people to -4.50 for a city of three million with Earth curvature
 * included.
 *
 * Two independent checks, neither used to fit anything: the dense mobile SQM
 * survey of the Madrid region (Zenodo doi:10.5281/zenodo.51713, CC BY-NC, so
 * a check only and never an input) is matched to 0.03-0.06 mag in the 40-90
 * km ring that matters most to an observer looking for a dark site, and to
 * within 0.7 mag everywhere; and no point of a transect running 170 km out of
 * Madrid reads better than Bortle 4 within 100 km of the city.
 *
 * ── Truncation ───────────────────────────────────────────────────────────
 * 300 km, as in section 2.3, page 137, for the reasons the paper gives
 * there: Cinzano & Falchi's propagation library extends to 350 km, all-sky
 * camera data show light domes "readily visible from large cities up to
 * 300 km away", and Las Vegas seen from Great Basin National Park at 311 km
 * "contributes less than 2% of the natural background". Refitting at 150,
 * 200, 250, 300 and 350 km moves the calibration constant by less than 0.4%,
 * so nothing here depends on the exact cut.
 *
 * ── Near field ───────────────────────────────────────────────────────────
 * The paper does not discuss d → 0 for this kernel, and Bará, S. & Lima,
 * R.C., "Photons without borders: quantifying light pollution transfer
 * between territories", International Journal of Sustainable Lighting 20
 * (2018) 51-61, arXiv:1809.05376, note that the approximation "clearly
 * subestimates the actual value" at the origin and clamp it to its value at
 * 0.4 km, a choice they say is suggested by the pixel size.
 *
 * No clamp is needed here, for two reasons. The kernel is already bounded:
 * α → 0 as d → 0, so d^(−α) → 1, with a maximum of 1.797 at d ≈ 28 m — there
 * is no singularity to remove. And the caller does not sample the kernel at a
 * point: prepare-sky-quality-raster.mjs averages it over each source cell
 * (`skyQualityKernelCellAverage`) wherever the cell is close enough for the
 * kernel to vary across it, which is the correct quadrature of equation (9)'s
 * sum and is what makes a uniformly lit region propagate to exactly its own
 * radiance.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 * Equation (9) is a sum over cells, so its constant `c` is tied to the cell
 * size the authors used. Dividing instead by the kernel's own surface
 * integral removes that dependency and puts the field back into nW/cm²/sr: a
 * uniformly lit region propagates to exactly its own radiance, whatever the
 * resolution. The calibration constant that turns the propagated radiance
 * into a luminance therefore lives at read time, in
 * packages/portal/src/sky-quality.js, and can be changed without rebuilding
 * the raster.
 */

// α = exponentScale · (d / referenceKm) ^ exponentShape
export const skyQualityKernelExponentScale = 3.8;
export const skyQualityKernelExponentShape = 0.28;
export const skyQualityKernelReferenceKm = 350;
export const skyQualityKernelRadiusKm = 300;

// Splitting the kernel is a computational device, not part of the model:
// K = K_near + K_far with a C¹ ramp, so the compact near part can be applied
// at full resolution from the lit cells only and the smooth far part on a
// coarser grid. `skyQualityKernelBlend` is a cubic smoothstep, so K_far is
// identically zero below `innerKm` and has a zero derivative there:
// quantising a source — or the observer — onto the coarse grid cannot move it
// across a steep part of the kernel. K_near + K_far === K at every distance.
export const skyQualityKernelSplit = { innerKm: 30, outerKm: 66 };

export function skyQualityKernel(distanceKm) {
  if (!(distanceKm >= 0) || distanceKm > skyQualityKernelRadiusKm) return 0;
  if (distanceKm === 0) return 1;
  const exponent =
    skyQualityKernelExponentScale *
    (distanceKm / skyQualityKernelReferenceKm) ** skyQualityKernelExponentShape;
  return distanceKm ** -exponent;
}

export function skyQualityKernelBlend(distanceKm) {
  const { innerKm, outerKm } = skyQualityKernelSplit;
  if (distanceKm <= innerKm) return 0;
  if (distanceKm >= outerKm) return 1;
  const t = (distanceKm - innerKm) / (outerKm - innerKm);
  return t * t * (3 - 2 * t);
}

export function skyQualityKernelNear(distanceKm) {
  if (distanceKm >= skyQualityKernelSplit.outerKm) return 0;
  return skyQualityKernel(distanceKm) * (1 - skyQualityKernelBlend(distanceKm));
}

export function skyQualityKernelFar(distanceKm) {
  if (distanceKm <= skyQualityKernelSplit.innerKm) return 0;
  return skyQualityKernel(distanceKm) * skyQualityKernelBlend(distanceKm);
}

/**
 * The kernel averaged over one source cell, rather than sampled at its
 * centre. `eastWestKm` / `northSouthKm` locate the cell's centre relative to
 * the observer and `widthKm` / `heightKm` are its extent; the average is a
 * `samples` × `samples` midpoint rule over the cell. Close in, the kernel
 * varies by a factor of two across a single cell and the centre value is the
 * wrong weight for it; far out the two agree to better than a part in a
 * thousand, so the caller only pays for this where it matters.
 */
export function skyQualityKernelCellAverage(
  weightOf,
  eastWestKm,
  northSouthKm,
  widthKm,
  heightKm,
  samples = 5,
) {
  let total = 0;
  for (let row = 0; row < samples; row += 1) {
    const y = northSouthKm + ((row + 0.5) / samples - 0.5) * heightKm;
    for (let column = 0; column < samples; column += 1) {
      const x = eastWestKm + ((column + 0.5) / samples - 0.5) * widthKm;
      total += weightOf(Math.sqrt(x * x + y * y));
    }
  }
  return total / (samples * samples);
}

/**
 * ∫₀^radius 2πd K(d) dd, in km², by Simpson's rule. Dividing the weighted sum
 * by this is what keeps the propagated field in nW/cm²/sr. The integrand is
 * smooth and the interval finite, so a fixed step suffices and the result is
 * reproducible to the last bit across runs.
 */
export function skyQualityKernelNormalisation(steps = 600000) {
  const step = skyQualityKernelRadiusKm / steps;
  const at = (distance) => 2 * Math.PI * distance * skyQualityKernel(distance);
  let total = at(0) + at(skyQualityKernelRadiusKm);
  for (let index = 1; index < steps; index += 1)
    total += (index % 2 ? 4 : 2) * at(index * step);
  return (total * step) / 3;
}

export const skyQualityKernelParameters = {
  citation:
    "Duriscoe, D.M., Anderson, S.J., Luginbuhl, C.B. & Baugh, K.E. (2018). " +
    "A simplified model of all-sky artificial sky glow derived from VIIRS " +
    "Day/Night band data. Journal of Quantitative Spectroscopy and " +
    "Radiative Transfer 214, 133-145. doi:10.1016/j.jqsrt.2018.04.028 " +
    "(CC BY 4.0), equations (9) and (11), with the exponent scale refitted " +
    "against measured zenith sky brightness because the published value is " +
    "for the all-sky average; see packages/portal/scripts/calibrate-sky-quality.mjs.",
  exponent: "alpha(d) = exponentScale * (d / referenceKm) ** exponentShape",
  exponentScale: skyQualityKernelExponentScale,
  exponentShape: skyQualityKernelExponentShape,
  form: "K(d) = d ** -alpha(d), K(0) = 1, truncated at radiusKm",
  radiusKm: skyQualityKernelRadiusKm,
  referenceKm: skyQualityKernelReferenceKm,
  unit: "the sum is divided by the kernel's surface integral, so the field stays in nW/cm2/sr",
};
