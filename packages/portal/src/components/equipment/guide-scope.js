/**
 * The guide scope's own fields in the form of « Mon espace » → « Matériel »,
 * the ones of the application's form: the tube it rides
 * on or « Sans tube », a guide scope or the main tube, its camera, Alpaca or
 * INDI, the alignment method, the default exposure, the binning and the gain.
 * All kept in the item's `planner.guideScope`; the last alignment and its
 * offset are the phone's: shown, never written, and kept as they come when the
 * form saves. The address, the port and the device of the camera's server
 * stay on the phone (a local network address has no place on the service):
 * the form neither shows nor writes them, and drops a `connection` it finds.
 */

export const GUIDE_SCOPE_TYPE = "guide-scope";
export const GUIDE_SCOPE_EXPOSURES = Object.freeze([1, 2, 3, 4, 5]);
export const GUIDE_SCOPE_DEFAULT_EXPOSURE = 2;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const positive = (value) => {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim().replace(",", "."))
        : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** The guide scope of [draft] as the form reads it (defaults for the rest). */
export function guideScopeOf(draft) {
  const raw = isObject(draft?.planner?.guideScope)
    ? draft.planner.guideScope
    : {};
  const camera = isObject(raw.camera) ? raw.camera : {};
  return {
    telescopeId: text(raw.telescopeId),
    placement: raw.placement === "main" ? "main" : "guide",
    camera: {
      name: camera.name ?? "",
      pixelSizeUm: camera.pixelSizeUm ?? "",
      widthPx: camera.widthPx ?? "",
      heightPx: camera.heightPx ?? "",
      sensor:
        camera.sensor === "mono" || camera.sensor === "colour"
          ? camera.sensor
          : "",
    },
    protocol: raw.protocol === "indi" ? "indi" : "alpaca",
    method: raw.method === "softwareOffset" ? "softwareOffset" : "rings",
    exposureSeconds: GUIDE_SCOPE_EXPOSURES.includes(Number(raw.exposureSeconds))
      ? Number(raw.exposureSeconds)
      : GUIDE_SCOPE_DEFAULT_EXPOSURE,
    binning: Number(raw.binning) === 2 ? 2 : 1,
    gain: raw.gain ?? "",
    lastAdjustment: isObject(raw.lastAdjustment) ? raw.lastAdjustment : null,
  };
}

/**
 * [draft] with [patch] merged into its guide scope (`camera` merges field by
 * field).
 */
export function withGuideScope(draft, patch) {
  const planner = isObject(draft?.planner) ? draft.planner : {};
  const current = isObject(planner.guideScope) ? planner.guideScope : {};
  const next = { ...current, ...patch };
  if (patch.camera)
    next.camera = {
      ...(isObject(current.camera) ? current.camera : {}),
      ...patch.camera,
    };
  return { ...draft, planner: { ...planner, guideScope: next } };
}

/**
 * The guide scope the form writes: what the application's `GuideScope.toJson`
 * writes (placement, camera, protocol, method, exposure, binning and the
 * optional rest), numbers as numbers, an empty field left out. The last
 * alignment is kept untouched; the other kinds leave `guideScope` out.
 */
export function guideScopeToSave(draft) {
  if (draft?.type !== GUIDE_SCOPE_TYPE) {
    if (!isObject(draft?.planner) || !("guideScope" in draft.planner))
      return draft;
    const planner = { ...draft.planner };
    delete planner.guideScope;
    return { ...draft, planner };
  }
  const planner = isObject(draft.planner) ? draft.planner : {};
  const kept = guideScopeOf(draft);
  const gain = Number(kept.gain);
  const camera = {
    ...(text(kept.camera.name) ? { name: text(kept.camera.name) } : {}),
    ...(positive(kept.camera.pixelSizeUm)
      ? { pixelSizeUm: positive(kept.camera.pixelSizeUm) }
      : {}),
    ...(positive(kept.camera.widthPx)
      ? { widthPx: Math.round(positive(kept.camera.widthPx)) }
      : {}),
    ...(positive(kept.camera.heightPx)
      ? { heightPx: Math.round(positive(kept.camera.heightPx)) }
      : {}),
    ...(kept.camera.sensor ? { sensor: kept.camera.sensor } : {}),
  };
  // What the form does not edit (the last alignment, a field a newer
  // application adds) comes back as it was read.
  const guideScope = {
    ...(isObject(planner.guideScope) ? planner.guideScope : {}),
    placement: kept.placement,
    camera,
    protocol: kept.protocol,
    method: kept.method,
    exposureSeconds: kept.exposureSeconds,
    binning: kept.binning,
  };
  for (const [key, value] of [
    ["telescopeId", kept.telescopeId],
    [
      "gain",
      kept.gain !== "" && Number.isFinite(gain) && gain >= 0
        ? Math.round(gain)
        : null,
    ],
  ]) {
    if (value) guideScope[key] = value;
    else if (value === 0) guideScope[key] = 0;
    else delete guideScope[key];
  }
  // The phone keeps the connection; it never goes to the service.
  delete guideScope.connection;
  return { ...draft, planner: { ...planner, guideScope } };
}

/** The tubes a guide scope can ride on: the active telescopes of the space. */
export function guideScopeTubes(equipment) {
  return (Array.isArray(equipment) ? equipment : []).filter(
    (item) =>
      item?.type === "telescope" &&
      !item.archivedAt &&
      item.planner?.kind !== "binoculars" &&
      item.planner?.kind !== "smartphone" &&
      item.isBinoculars !== true,
  );
}

/**
 * The field of the guide scope with its camera, as the application computes
 * it: degrees (width × height) and arc seconds per pixel; `null` without the
 * focal length, the pixel and the sensor.
 */
export function guideScopeField(focalLengthMm, camera) {
  const focal = positive(focalLengthMm);
  const pixel = positive(camera?.pixelSizeUm);
  const width = positive(camera?.widthPx);
  const height = positive(camera?.heightPx);
  if (!focal || !pixel || !width || !height) return null;
  const scale = (206.264806 * pixel) / focal;
  return {
    widthDegrees: (scale * Math.round(width)) / 3600,
    heightDegrees: (scale * Math.round(height)) / 3600,
    arcsecPerPixel: scale,
  };
}
