// The photo advice for a target (VISUAL-SIM-02a, stage 4): the filter, the
// focal length, the focal ratio and how the target fills the frame of the
// camera chosen.
//
// - The focal range: the longest focal length at which the target takes at
//   most `comfortableOccupancyPercent` of the frame (the « comfortable »
//   framing of `framing`), capped where the sampling reaches
//   `finestSamplingArcsec` per pixel (206.265 × pixel in µm / focal in mm);
//   the range runs from `rangeShare` of it to it.
// - The focal ratio: f/4–f/6 for an extended target, f/5–f/8 for a small
//   one (under `smallTargetArcmin`): f/4–f/6 is the guides' range, f/5–f/8 is
//   still an estimate (VISUAL-SIM-02 § 3.7).
// - The framing at the focal length chosen: `small` under `smallOccupancy`
//   percent, `fits` up to the comfortable share, `tight` up to
//   `tightOccupancyPercent`, `centre` beyond (one sees the centre).
// - The filter: the first imaging family of the target
//   (`recommendedFilterFamilies`): « double bande » for a colour camera on
//   an emission target, Hα and OIII for a mono one; none for a galaxy, a
//   cluster or a star.
// The equipment of « Mon matériel » comes first:
// the telescope chosen when its focal length is in the range, else the
// owner's telescope that is (`telescopes`); `generic` when none is.
import { fieldOfView, framing } from "./planner.js";
import { recommendedFilterFamilies } from "./filters.js";

export const photoAdviceRule = Object.freeze({
  comfortableOccupancyPercent: 68,
  tightOccupancyPercent: 98,
  smallOccupancyPercent: 15,
  finestSamplingArcsec: 0.5,
  rangeShare: 0.6,
  roundingMm: 10,
  smallTargetArcmin: 20,
  extendedFocalRatio: Object.freeze([4, 6]),
  smallFocalRatio: Object.freeze([5, 8]),
});

const DEG = Math.PI / 180;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

// The longest focal length (mm) at which `sizeArcmin` takes `share` of a
// sensor side of `sideMm`.
function focalForShare(sizeArcmin, sideMm, share) {
  const fieldDegrees = sizeArcmin / 60 / share;
  return sideMm / (2 * Math.tan((fieldDegrees / 2) * DEG));
}

/** How the target fills a frame of `occupancy` percent. */
export function photoFramingFit(occupancy) {
  const rule = photoAdviceRule;
  if (!Number.isFinite(occupancy)) return null;
  if (occupancy < rule.smallOccupancyPercent) return "small";
  if (occupancy <= rule.comfortableOccupancyPercent) return "fits";
  if (occupancy <= rule.tightOccupancyPercent) return "tight";
  return "centre";
}

/**
 * The advice for `target` with the imaging `profile` chosen
 * (`resolveEquipment`), the camera's `pixelSizeUm` and `sensorKind` (`mono`,
 * else colour) when known, and the owner's `telescopes` (profiles with a
 * focal length). `{ filterFamily, filterFamilies, focalRange, apertureRange,
 * framing, current, telescope, generic }`; `null` out of imaging mode.
 */
export function photoAdvice({
  target,
  profile,
  pixelSizeUm = null,
  sensorKind = null,
  telescopes = [],
} = {}) {
  if (!target || profile?.mode === "visual") return null;
  const rule = photoAdviceRule;
  const families = recommendedFilterFamilies(target, "imaging") || [];
  const lines = families.filter((family) => family !== "broadband");
  const filterFamilies = !lines.length
    ? []
    : sensorKind === "mono"
      ? lines.filter((family) => family === "ha" || family === "oiii")
      : lines.includes("dual")
        ? ["dual"]
        : lines.slice(0, 1);
  const size = framing(target, null).size;
  const major = Array.isArray(size) ? positive(size[0]) : null;
  const minor = Array.isArray(size) ? (positive(size[1]) ?? major) : null;
  const width = positive(profile?.sensorWidthMm);
  const height = positive(profile?.sensorHeightMm);
  const pixel = positive(pixelSizeUm);
  let focalRange = null;
  if (major && width && height) {
    const long = Math.max(major, minor);
    const short = Math.min(major, minor);
    const share = rule.comfortableOccupancyPercent / 100;
    const framed = Math.min(
      focalForShare(long, Math.max(width, height), share),
      focalForShare(short, Math.min(width, height), share),
    );
    const sampled = pixel
      ? (206.265 * pixel) / rule.finestSamplingArcsec
      : null;
    const maximum = sampled ? Math.min(framed, sampled) : framed;
    const round = (value) =>
      Math.round(value / rule.roundingMm) * rule.roundingMm;
    focalRange = {
      minimumMm: round(maximum * rule.rangeShare),
      maximumMm: round(maximum),
      sampled: sampled !== null && sampled < framed,
    };
  }
  const apertureRange = major
    ? [
        ...(major < rule.smallTargetArcmin
          ? rule.smallFocalRatio
          : rule.extendedFocalRatio),
      ]
    : null;
  const focal = positive(profile?.focalLengthMm);
  const aperture = positive(profile?.apertureMm);
  const fits = (value) =>
    focalRange !== null &&
    value !== null &&
    value >= focalRange.minimumMm &&
    value <= focalRange.maximumMm;
  const field = fieldOfView(profile);
  const occupancy = field ? framing(target, field).occupancy : null;
  const focalRatio = focal && aperture ? focal / aperture : null;
  const current = {
    focalLengthMm: focal,
    focalRatio,
    inFocalRange: fits(focal),
    inApertureRange:
      apertureRange !== null && focalRatio !== null
        ? focalRatio >= apertureRange[0] && focalRatio <= apertureRange[1]
        : null,
  };
  const own = current.inFocalRange
    ? null
    : (Array.isArray(telescopes) ? telescopes : [])
        .filter((telescope) => fits(positive(telescope?.focalLengthMm)))
        .sort((a, b) => Number(b.focalLengthMm) - Number(a.focalLengthMm))[0] ||
      null;
  return {
    filterFamily: filterFamilies[0] ?? null,
    filterFamilies,
    focalRange,
    apertureRange,
    framing:
      occupancy === null || !Number.isFinite(occupancy)
        ? null
        : { occupancy, fit: photoFramingFit(occupancy) },
    current,
    telescope: own
      ? {
          id: own.id ?? null,
          name: own.name ?? null,
          focalLengthMm: Number(own.focalLengthMm),
        }
      : null,
    generic: focalRange !== null && !current.inFocalRange && !own,
  };
}
