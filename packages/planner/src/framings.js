import { mosaicGrid } from "astro-core/mosaic-grid.js";
import { formatDeclination, formatRightAscension } from "portal/format.js";
import { mosaicField as renderedMosaicField } from "./mosaic-field.js";

// A mosaic framing stores the sky AREA it covers
// (`widthDegrees`/`heightDegrees`/`overlapPercent`), never a panel grid. The
// grid is always recomputed — once with the reference equipment (creation
// modal), once with the plan's own equipment (inside a plan) — by the same
// `mosaicGrid` used server-side.
//
// `mosaicRenderSettings` bridges that stored area to the pre-existing,
// columns/rows-based rendering pipeline (`mosaic-field.js` here, and the
// mosaic a shell draws over `PlannerNightSkyMap.js`) without touching either: it is only ever used to
// build the `mosaic` prop the map actually draws, never stored.
export function mosaicRenderSettings(surface, field) {
  if (!surface) return null;
  const fieldWidthDegrees = Number(field?.width);
  const fieldHeightDegrees = Number(field?.height);
  const { columns, rows } = mosaicGrid({
    widthDegrees: Number(surface.widthDegrees),
    heightDegrees: Number(surface.heightDegrees),
    overlapPercent: Number(surface.overlapPercent) || 0,
    fieldWidthDegrees,
    fieldHeightDegrees,
  });
  return {
    columns,
    rows,
    overlapPercent: Number(surface.overlapPercent) || 0,
    straighten: true,
  };
}

// The total sky area actually drawn for a mosaic framing with the given
// field — used only for display sizing (map marker, ASIAIR CSV), never
// stored (the stored `mosaic.widthDegrees`/`heightDegrees` is the
// requested area, which can differ slightly from the tiled area a discrete
// panel count produces).
export function mosaicDisplayField(surface, field) {
  const settings = mosaicRenderSettings(surface, field);
  return settings ? renderedMosaicField(field, settings) : null;
}

// The sky a saved framing's card shows, and nothing else (the preview never
// contains the red frame of the editor, and is not taken with the background
// image of the map).
//
// The preview is a survey picture centred on the framing
// (`framingPreviewUrl`, `surveys.js`), never a capture of the map: no frame,
// panel grid, target or reticle is inside it, and none is drawn on it. What is
// left to decide is the crop -- the card shows exactly the field the framing
// covers (the whole surface of a mosaic), turned by the framing's angle, in a
// box of that field's proportions.
//
// `framingPreviewView` gives that crop as ratios, as percentages of the box:
//   aspect        the box's width over its height: the field's, kept inside
//                 `framingPreviewAspectRange` so that a very long or very tall
//                 field does not make a card of its own. The picture then
//                 covers the box and the ends of the field are cut, the
//                 picture is never stretched;
//   widthRatio,
//   heightRatio   the picture's width and height as multiples of the box's,
//                 the picture centred in the box; both `null` when the
//                 picture's own coverage cannot be read off its address, and
//                 the picture then simply covers the box;
//   angleDegrees  the framing's angle, N.I.N.A.'s position angle (north
//                 towards east): the frame lies turned counter-clockwise by
//                 it on the north-up, east-left picture, so the picture is
//                 turned clockwise by it, which stands the frame upright.
export const framingPreviewAspectRange = Object.freeze({ min: 0.75, max: 2.5 });

// What a preview address covers, in degrees: `fov` across its width, and the
// same scale down its height. `null` for an address that does not say.
export function framingPreviewCoverage(imageUrl) {
  let parameters;
  try {
    parameters = new URL(String(imageUrl)).searchParams;
  } catch {
    return null;
  }
  const fov = Number(parameters.get("fov"));
  const width = Number(parameters.get("width"));
  const height = Number(parameters.get("height"));
  if (
    !(fov > 0) ||
    !(width > 0) ||
    !(height > 0) ||
    !Number.isFinite(fov) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return null;
  return { width: fov, height: (fov * height) / width };
}

const isSize = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

// The field the card shows: the framing's own, or -- for a mosaic -- the whole
// area its panels tile (the picture was cut for that area: `useFraming`).
function framingPreviewField(framing) {
  const width = framing?.field?.width;
  const height = framing?.field?.height;
  if (!isSize(width) || !isSize(height)) return null;
  let shown = { width, height };
  const surface = framing.mosaic;
  if (
    typeof surface?.widthDegrees === "number" &&
    typeof surface?.heightDegrees === "number"
  ) {
    const display = mosaicDisplayField(surface, framing.field);
    if (display && isSize(display.width) && isSize(display.height))
      shown = display;
  }
  const angle = framing.angleDegrees;
  return {
    ...shown,
    angleDegrees:
      typeof angle === "number" && Number.isFinite(angle) ? angle : 0,
  };
}

export function framingPreviewView(target) {
  const shown = framingPreviewField(target?.framing);
  if (!shown) return null;
  const { min, max } = framingPreviewAspectRange;
  const aspect = Math.min(Math.max(shown.width / shown.height, min), max);
  const coverage = framingPreviewCoverage(
    target?.featured?.imageUrl || target?.framing?.previewImageUrl,
  );
  // The box is 1 high and `aspect` wide; the field is scaled to cover it.
  const scale = Math.max(aspect / shown.width, 1 / shown.height);
  return {
    aspect,
    angleDegrees: shown.angleDegrees,
    widthRatio: coverage ? (coverage.width * scale) / aspect : null,
    heightRatio: coverage ? coverage.height * scale : null,
  };
}

// The card's `<img>` style for a `framingPreviewView`: the picture is set in
// the middle of the box at its own size, turned clockwise by the framing's
// position angle (CSS `rotate()` turns clockwise), and the box clips what lies
// outside the field.
export function framingPreviewPictureStyle(view) {
  if (!view || view.widthRatio == null || view.heightRatio == null)
    return undefined;
  const percent = (ratio) => `${(ratio * 100).toFixed(3)}%`;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: percent(view.widthRatio),
    height: percent(view.heightRatio),
    minHeight: 0,
    maxWidth: "none",
    objectFit: "fill",
    transform: `translate(-50%, -50%)${
      view.angleDegrees ? ` rotate(${view.angleDegrees}deg)` : ""
    }`,
  };
}

// A framing's angle: N.I.N.A.'s position angle of
// the top of the frame, north towards east, brought into [0, 360). Anything
// that is not a finite number is 0°, the default of every rig.
export function normalizeFramingAngle(value) {
  const angle = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(angle)) return 0;
  // `+ 0`: a turn back to north is 0, never -0.
  return (((angle % 360) + 360) % 360) + 0;
}

// `packages/astro-contracts/schemas/api/framing.schema.json` payload: the only
// shape ever sent to `PUT /v1/framings/{id}`. `target` is exactly
// `savedFramingTarget`'s return value; `catalogueTargetId` is the id of the
// nearest recognised catalogue object, or `null` for a free-standing framing;
// `angleDegrees` is the draft's angle, 0° unless the frame was turned.
export function framingResourcePayload({ draft, id, name, savedAt }) {
  const target = savedFramingTarget({ draft, id, name, savedAt });
  if (!target) return null;
  return {
    target,
    catalogueTargetId: draft.matches?.[0]?.id || null,
    angleDegrees: normalizeFramingAngle(draft.angleDegrees),
  };
}

export function frozenPlanTarget(target) {
  const coordinate = target?.coordinate;
  if (
    !target?.id ||
    !Number.isFinite(Number(coordinate?.ra)) ||
    !Number.isFinite(Number(coordinate?.dec))
  )
    return null;
  // Retain the compact, portable information needed to identify and export a
  // suggestion without tying the saved plan to a later catalogue refresh.
  return {
    id: target.id,
    source: target.source,
    designation: target.designation,
    title: target.title,
    objects: Array.isArray(target.objects) ? [...target.objects] : [],
    coordinate: {
      ra: Number(coordinate.ra),
      dec: Number(coordinate.dec),
    },
    coordinateUnit: "degrees",
    catalogue: target.catalogue,
    apparentSizeArcmin: Array.isArray(target.apparentSizeArcmin)
      ? [...target.apparentSizeArcmin]
      : undefined,
    integratedMagnitude: target.integratedMagnitude,
    skyTarget: target.skyTarget ? { ...target.skyTarget } : undefined,
    tags: Array.isArray(target.tags) ? [...target.tags] : [],
    plannerSource: target.plannerSource,
    ...(target.framing
      ? {
          framing: structuredClone(target.framing),
          matchedTargets: structuredClone(target.matchedTargets || []),
          integrationReference: structuredClone(
            target.integrationReference || null,
          ),
          featured: structuredClone(target.featured || null),
        }
      : {}),
    // When the target being frozen is a saved framing (`libraryFramingTargets`
    // / `savedFramingTargets`, `PlannerPage.js`), its `framingId` is the plan
    // item's only link back to the independent framing resource -- lost here,
    // a framing added this way (`plannedPlanItem`, the generic "Add to plan"
    // path any catalogue/favourites/framings card goes through, also used to
    // "add an existing framing") would silently fall back to the legacy
    // tolerance (`isSavedFraming`'s `target.framing` check) and never again
    // show its lock state (lock icon, plan fiche) or count towards another
    // plan's own usage. Preserved whenever present, alongside the revision
    // and cached state a caller may have set together with it.
    ...(target.framingId
      ? {
          framingId: target.framingId,
          ...(target.framingRevision !== undefined
            ? { framingRevision: target.framingRevision }
            : {}),
          ...(target.framingState !== undefined
            ? { framingState: target.framingState }
            : {}),
        }
      : {}),
  };
}

export function isSavedFraming(item) {
  const target = item?.target;
  return Boolean(target?.plannerSource === "framing" || target?.framing);
}

// A plan item that references an independent framing resource (the current
// model). `isSavedFraming` above stays as the tolerance for the old shape
// (`target.framing` with no `framingId`), which is read but never written and
// never appears in the library.
export function isFramingReference(item) {
  return Boolean(item?.framingId || item?.target?.framingId);
}

// A plan's own fiche of a
// scheduled framing target. The indicative `referenceEquipment`, stored at
// `target.framing.equipment` (never a property the framing enforces, only
// a note).
export function framingReferenceEquipment(target) {
  const equipment = target?.framing?.equipment;
  return equipment && typeof equipment === "object" ? equipment : null;
}

// The mosaic shape -- a sky SURFACE (`widthDegrees`/`heightDegrees` plus
// `overlapPercent`), never a stored column/row count. `null` when `target`
// is not a mosaic framing, or still carries an older shape this reader
// tolerates as a no-op rather than guessing at an incomplete surface.
export function framingMosaicSurface(target) {
  const mosaic = target?.framing?.mosaic;
  if (!mosaic || typeof mosaic !== "object") return null;
  const hasSurface =
    Number.isFinite(Number(mosaic.widthDegrees)) &&
    Number.isFinite(Number(mosaic.heightDegrees)) &&
    Number.isFinite(Number(mosaic.overlapPercent));
  return hasSurface ? mosaic : null;
}

// Whether `target` is a mosaic framing in the surface shape -- the gate
// the fiche uses to choose between the recalculated-grid line and the
// plain equipment-mismatch warning (a framed M31 vs. a mosaic of IC 1396).
export function isSurfaceMosaicFraming(target) {
  return framingMosaicSurface(target) != null;
}

// The panel grid a mosaic framing recomputes with `planField` (the plan's
// own equipment field, in degrees, `{width, height}`) -- `null` when
// `target` is not a surface-shaped mosaic framing, or the plan's field is
// unknown. Reuses `mosaicRenderSettings` (already used to draw the map's
// own mosaic outline) rather than a second call into `mosaicGrid`.
export function framingPlanMosaicGrid(target, planField) {
  const surface = framingMosaicSurface(target);
  const fieldWidth = Number(planField?.width);
  const fieldHeight = Number(planField?.height);
  if (!surface || !Number.isFinite(fieldWidth) || !Number.isFinite(fieldHeight))
    return null;
  const settings = mosaicRenderSettings(surface, {
    width: fieldWidth,
    height: fieldHeight,
  });
  return settings ? { columns: settings.columns, rows: settings.rows } : null;
}

// Whether a *simple* (non-mosaic) framing target's plan equipment
// visibly differs from its indicative reference equipment. `false` when
// `target` is a surface-shaped mosaic (its grid recompute already accounts
// for a different telescope -- no separate warning)
// or when no reference equipment was recorded at all (nothing to compare
// against: "Matériel de référence : aucun").
export function framingPlanEquipmentDiffers(target, equipmentSelection) {
  if (isSurfaceMosaicFraming(target)) return false;
  const reference = framingReferenceEquipment(target);
  if (!reference) return false;
  if (reference.mode !== equipmentSelection?.mode) return true;
  const referenceTelescopeId = reference.telescope?.id || "";
  const planTelescopeId = equipmentSelection?.telescopeId || "";
  if (referenceTelescopeId !== planTelescopeId) return true;
  const visual = equipmentSelection?.mode === "visual";
  const referenceAccessory = visual ? reference.eyepiece : reference.camera;
  const planAccessoryId = visual
    ? equipmentSelection?.eyepieceId
    : equipmentSelection?.cameraId;
  return (referenceAccessory?.id || "") !== (planAccessoryId || "");
}

// The small, dimmed lock icon shown next to a framing target's name everywhere
// a plan's target list appears (plan cards, the planner's own target list,
// "Cibles de la soirée"). A `shared` framing has no lock here — only
// `locked`/`archived` do.
export function framingTargetIsLocked(target) {
  const state = target?.framingState;
  return state === "locked" || state === "archived";
}

export function savedPlanFramings(plans = []) {
  return plans
    .flatMap((plan) =>
      (plan.items || [])
        .filter(isSavedFraming)
        .map((item) => ({ plan, item, target: item.target })),
    )
    .sort((left, right) => {
      const leftDate = left.target?.framing?.savedAt || left.plan.date || "";
      const rightDate = right.target?.framing?.savedAt || right.plan.date || "";
      return rightDate.localeCompare(leftDate);
    });
}

// The naming dialog's draft, assembled from the live map: the frozen J2000
// centre, the known objects inside the displayed instrument field (nearest
// first), the generated preview image and the optional mosaic definition.
// Extracted from `useFraming` (`components/PlannerNightSkyMap.js`) so the
// same draft can be produced without a rendering engine.
export function framingDraft({
  center,
  field,
  matches = [],
  mosaic = null,
  previewImageUrl = null,
  angleDegrees = 0,
} = {}) {
  if (
    !Number.isFinite(Number(center?.ra)) ||
    !Number.isFinite(Number(center?.dec))
  )
    return null;
  const ordered = matches
    .filter((target) => target?.id)
    .map((target) => ({
      id: target.id,
      source: target.source,
      designation: target.designation,
      title: target.title,
      coordinate: target.coordinate
        ? {
            ra: Number(target.coordinate.ra),
            dec: Number(target.coordinate.dec),
          }
        : null,
      catalogue: target.catalogue,
      apparentSizeArcmin: Array.isArray(target.apparentSizeArcmin)
        ? [...target.apparentSizeArcmin]
        : [],
      integratedMagnitude: target.integratedMagnitude,
      skyTarget: target.skyTarget ? { ...target.skyTarget } : null,
      tags: Array.isArray(target.tags) ? [...target.tags] : [],
    }));
  const objects = ordered
    .map((target) => target.designation || target.title)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  return {
    center: { ra: Number(center.ra), dec: Number(center.dec) },
    objects,
    matches: ordered,
    previewImageUrl: previewImageUrl || null,
    field: {
      width: Number(field?.width),
      height: Number(field?.height),
      shape: field?.shape === "circle" ? "circle" : "rectangle",
    },
    ...(mosaic ? { mosaic } : {}),
    // The frame's position angle, carried only when it is turned -- a 0°
    // draft keeps the shape it always had.
    ...(normalizeFramingAngle(angleDegrees)
      ? { angleDegrees: normalizeFramingAngle(angleDegrees) }
      : {}),
  };
}

// The name proposed when the dialog opens: the first of the known objects under
// the frame -- the list is already ranked, the target a search put forward
// first -- else the coordinates of the centre in the format the app writes them
// everywhere ("0h 42m 44s · +41° 16′ 09″"), and only without even a centre the
// localized fallback label. The generic word is never proposed for a framing
// that has a place in the sky.
//
// It used to join every object under the frame with hyphens ("M31-M32-M110"),
// which is a name nobody would have typed.
export function framingDraftName(draft, fallbackLabel) {
  const objects = Array.isArray(draft?.objects) ? draft.objects : [];
  const first = objects.find(Boolean);
  if (first) return first;
  const center = draft?.center;
  const known = (value) => value != null && Number.isFinite(Number(value));
  if (known(center?.ra) && known(center?.dec))
    return `${formatRightAscension(Number(center.ra))} · ${formatDeclination(Number(center.dec))}`;
  return fallbackLabel;
}

// The choices the naming dialog offers under the frame: the draft's matches,
// in their order (the target a search put forward first, then by nearness and
// fame -- see `framing-targets.js`), one per distinct name. `name` is what a
// touch puts in the field (the target's designation, the same the ASIAIR list
// and the library show); `detail` is what to recognise it by (its common name,
// else its kind).
export function framingNameSuggestions(draft) {
  const seen = new Set();
  const suggestions = [];
  for (const target of Array.isArray(draft?.matches) ? draft.matches : []) {
    const designation = String(target?.designation ?? "").trim();
    const title = String(target?.title ?? "").trim();
    const name = designation || title;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const kind = String(target?.skyTarget?.type ?? "").trim();
    suggestions.push({
      name,
      detail: title && title !== name ? title : kind,
      target,
    });
  }
  return suggestions;
}

// The target written into the plan when the framing dialog is confirmed.
// Extracted from `addFraming` (`components/PlannerPage.js`); the schedule
// window it is stored with stays with the caller, which needs the night.
export function savedFramingTarget({
  draft,
  id,
  name,
  savedAt,
  framingLabel = "Framing",
} = {}) {
  const center = draft?.center;
  if (
    !id ||
    !Number.isFinite(Number(center?.ra)) ||
    !Number.isFinite(Number(center?.dec))
  )
    return null;
  const matchedTargets = (Array.isArray(draft.matches) ? draft.matches : [])
    .filter(
      (candidate) =>
        candidate?.id &&
        Number.isFinite(Number(candidate.coordinate?.ra)) &&
        Number.isFinite(Number(candidate.coordinate?.dec)),
    )
    .map((candidate) => structuredClone(candidate));
  const integrationReference = matchedTargets[0]
    ? {
        source: matchedTargets[0].source,
        integratedMagnitude: matchedTargets[0].integratedMagnitude,
        apparentSizeArcmin: Array.isArray(matchedTargets[0].apparentSizeArcmin)
          ? [...matchedTargets[0].apparentSizeArcmin]
          : [],
        skyTarget: matchedTargets[0].skyTarget
          ? { ...matchedTargets[0].skyTarget }
          : null,
        tags: Array.isArray(matchedTargets[0].tags)
          ? [...matchedTargets[0].tags]
          : [],
      }
    : null;
  const mosaic = draft.mosaic || null;
  // A mosaic framing's own `mosaic` no longer carries a rendered `field`
  // (only `widthDegrees`/`heightDegrees`/`overlapPercent`), so this falls
  // through to `draft.field` for a framing built the new way; an old-shape
  // `mosaic.field` still sizes the marker.
  const displayField = mosaic?.field || draft.field;
  const fieldWidth = Number(displayField?.width);
  const fieldHeight = Number(displayField?.height);
  const fieldSize =
    fieldWidth > 0 && fieldHeight > 0
      ? [fieldWidth * 60, fieldHeight * 60]
      : [1, 1];
  const coordinate = {
    ra: Number(Number(center.ra).toFixed(7)),
    dec: Number(Number(center.dec).toFixed(7)),
  };
  return {
    id,
    // Keep a unique internal source while the human-facing designation is
    // exactly the name selected in the modal and in the ASIAIR CSV.
    source: `framing:${id}`,
    designation: name,
    title: name,
    objects: Array.isArray(draft.objects) ? [...draft.objects] : [],
    coordinate,
    catalogue: integrationReference
      ? matchedTargets[0].catalogue || framingLabel
      : framingLabel,
    skyTarget: integrationReference?.skyTarget || {
      type: framingLabel,
      typeKey: "framing",
    },
    apparentSizeArcmin: fieldSize,
    integrationReference,
    matchedTargets,
    featured: draft.previewImageUrl
      ? { imageUrl: draft.previewImageUrl }
      : undefined,
    plannerSource: "framing",
    framing: {
      center: coordinate,
      field: draft.field,
      ...(mosaic ? { mosaic } : {}),
      objects: Array.isArray(draft.objects) ? [...draft.objects] : [],
      matchedTargets,
      previewImageUrl: draft.previewImageUrl || null,
      savedAt,
      // The position angle, mirrored here only when the frame is
      // turned (what the preview, the targets under the frame and the
      // exports read).
      ...(normalizeFramingAngle(draft.angleDegrees)
        ? { angleDegrees: normalizeFramingAngle(draft.angleDegrees) }
        : {}),
    },
  };
}
