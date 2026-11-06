const difficultyLevels = new Set([
  "easy",
  "moderate",
  "difficult",
  "challenging",
]);
const apertureSteps = [50, 80, 120, 200, 300, 400];

function finite(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function maximumApparentSize(target) {
  const values = Array.isArray(target?.apparentSizeArcmin)
    ? target.apparentSizeArcmin.map(finite).filter((value) => value > 0)
    : [];
  return values.length ? Math.max(...values) : null;
}

function estimatedSurfaceBrightness(target, magnitude, size) {
  const published = finite(target?.surfaceBrightness);
  if (published !== null) return published;
  const dimensions = Array.isArray(target?.apparentSizeArcmin)
    ? target.apparentSizeArcmin.map(finite)
    : [];
  const [major, minor = major] = dimensions;
  if (!(magnitude !== null && major > 0 && minor > 0)) return null;
  // Approximate mean mag/arcsec² from integrated magnitude and an elliptical
  // apparent area. It is only a starting point for the visual guide.
  return magnitude + 2.5 * Math.log10(Math.PI * major * minor * 900);
}

function focalRangeForSize(size) {
  if (!(size > 0)) return { minimumMm: 600, maximumMm: 1200 };
  if (size >= 120) return { minimumMm: 200, maximumMm: 400 };
  if (size >= 70) return { minimumMm: 250, maximumMm: 500 };
  if (size >= 35) return { minimumMm: 400, maximumMm: 700 };
  if (size >= 18) return { minimumMm: 550, maximumMm: 900 };
  if (size >= 10) return { minimumMm: 700, maximumMm: 1200 };
  if (size >= 5) return { minimumMm: 900, maximumMm: 1600 };
  if (size >= 2) return { minimumMm: 1200, maximumMm: 2200 };
  return { minimumMm: 1600, maximumMm: 3000 };
}

function visualApertureFor(target, magnitude, surfaceBrightness, size) {
  let difficulty = 0;
  if (magnitude === null) difficulty += 2;
  else difficulty += Math.max(0, magnitude - 4) * 0.65;
  if (surfaceBrightness === null) difficulty += 1;
  else difficulty += Math.max(0, surfaceBrightness - 20) * 0.85;
  if (size !== null && size < 3) difficulty += 0.8;
  if (size !== null && size > 90) difficulty += 0.7;
  if (/galaxie|réflexion|sombre/i.test(target?.typeKey || "")) difficulty += 1;
  if (/amas ouvert|amas globulaire/i.test(target?.typeKey || ""))
    difficulty -= 0.8;
  // A large, genuinely bright object can be detected at low magnification
  // despite a modest mean surface brightness (for example M31).
  if (size >= 60 && magnitude !== null && magnitude <= 6)
    difficulty = Math.min(difficulty, 1.2);
  const targetAperture =
    difficulty <= 1
      ? 50
      : difficulty <= 2.5
        ? 80
        : difficulty <= 4.5
          ? 120
          : difficulty <= 6.5
            ? 200
            : difficulty <= 8.5
              ? 300
              : 400;
  return apertureSteps.find((step) => step >= targetAperture) || 400;
}

function difficultyForAperture(aperture) {
  if (aperture <= 80) return "easy";
  if (aperture <= 120) return "moderate";
  if (aperture <= 200) return "difficult";
  return "challenging";
}

function manualGuide(target) {
  const guide = target?.editorial?.observingGuide;
  return guide && typeof guide === "object" ? guide : {};
}

function boundedInteger(value, minimum, maximum) {
  const numeric = finite(value);
  if (numeric === null) return null;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

// This intentionally stays an indicative guide for the targets of the two
// editorial selections (Essentielles and Étendues, disjoint lists). The
// planner's field-of-view and visual-suitability calculations remain the
// precise, equipment- and site-aware source at planning time.
export function observingGuideFor(target) {
  if (!target?.isBest && !target?.isExtended) return null;
  const size = maximumApparentSize(target);
  const magnitude = finite(target.magnitude ?? target.integratedMagnitude);
  const surfaceBrightness = estimatedSurfaceBrightness(target, magnitude, size);
  const derivedFocal = focalRangeForSize(size);
  const derivedAperture = visualApertureFor(
    target,
    magnitude,
    surfaceBrightness,
    size,
  );
  const manual = manualGuide(target);
  let minimumMm =
    boundedInteger(manual.focalLengthMinimumMm, 100, 5000) ||
    derivedFocal.minimumMm;
  let maximumMm =
    boundedInteger(manual.focalLengthMaximumMm, 100, 5000) ||
    derivedFocal.maximumMm;
  if (minimumMm > maximumMm) [minimumMm, maximumMm] = [maximumMm, minimumMm];
  const visualMinimumApertureMm =
    boundedInteger(manual.visualMinimumApertureMm, 50, 400) || derivedAperture;
  const visualDifficulty = difficultyLevels.has(manual.visualDifficulty)
    ? manual.visualDifficulty
    : difficultyForAperture(visualMinimumApertureMm);
  const hasManualOverride = [
    manual.focalLengthMinimumMm,
    manual.focalLengthMaximumMm,
    manual.visualMinimumApertureMm,
    manual.visualDifficulty,
  ].some((value) => value !== null && value !== undefined && value !== "");
  return {
    focalLengthMinimumMm: minimumMm,
    focalLengthMaximumMm: maximumMm,
    visualMinimumApertureMm,
    visualDifficulty,
    skyCondition: "dark-sky",
    confidence:
      magnitude !== null && surfaceBrightness !== null
        ? "estimated"
        : "limited-data",
    source: hasManualOverride ? "manual" : "derived",
  };
}
