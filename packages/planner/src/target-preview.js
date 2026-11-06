// The model of « Prévisualiser » in "Statistiques de la cible"
// (`components/TargetPreviewBlock.js`, TARGET-PREVIEW-02, -05): which
// equipment the section shows (the browser's preference of the mode, else
// « Mon matériel » -- the default configuration --, else the example
// equipment of the first launch), whether it is the example, whether it can
// go back to « Mon matériel », the lines that name it (and the plan's), the
// sentences of a target larger than the field, and the photo's survey.
// Kept apart from the component so it is tested without rendering; the
// other front ends follow the same rules. Free: no capability is read.
import { message } from "portal/i18n.js";
import { planStartEquipment } from "portal/planner/default-configuration.js";
import {
  eyepieceProfiles,
  fieldOfView,
  firstLaunchPreselection,
  framing,
  resolveEquipment,
  resolveEquipmentProfiles,
  telescopeProfiles,
  visualSkySqm,
  visualSuitability,
} from "./planner.js";
import {
  eyepieceSolarSystemTarget,
  eyepieceSourceField,
  eyepieceViewTarget,
  targetPreviewFieldRatio,
  targetPreviewPhotoField,
} from "./eyepiece-view.js";
import {
  lightMapScaleBrightEndSqm,
  lightMapScaleDarkEndSqm,
  lightMapScaleSteps,
} from "./sky-scale.js";
import { targetArcminLabel } from "./target-facts-model.js";
import {
  genericVisualFilters,
  visualBestPair,
  visualBestPairText,
} from "./visual-pairs.js";
import {
  targetPreviewBodyKey,
  targetPreviewBodyShown,
} from "./target-preview-planet.js";

const nbsp = "\u00a0";

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** `"visual"` or `"imaging"`, as `resolveEquipment` reads a plan's mode. */
export function targetPreviewMode(mode) {
  return mode === "visual" ? "visual" : "imaging";
}

/**
 * The example equipment of a mode: the first launch's preselection
 * (`firstLaunchPreselection`: in photo the Seestar S50, in visual the Skymax
 * 127 with the 25 mm Plössl), as a plan's raw `equipment`. A profile the lists
 * no longer hold falls back on the first of the bundled list.
 */
export function targetPreviewSampleEquipment(mode) {
  const visual = targetPreviewMode(mode) === "visual";
  const preselection = visual
    ? firstLaunchPreselection.visual
    : firstLaunchPreselection.imaging;
  const telescope = preselection.telescope || telescopeProfiles[0];
  const eyepiece =
    firstLaunchPreselection.visual.eyepiece || eyepieceProfiles[0];
  return {
    mode: visual ? "visual" : "imaging",
    telescopeId: telescope?.id ?? null,
    eyepieceId: eyepiece?.id ?? null,
    eyepieceFocalLengthMm: Number(eyepiece?.focalLengthMm) || undefined,
    modifierId: "none",
    filterIds: [],
  };
}

/**
 * The profile sets the preview resolves with: the plan's (`profiles`), and,
 * for an id the equipment names that they do not hold (the example's Skymax
 * or Plössl for an owner whose lists are their own inventory), the bundled
 * profile, appended, so the equipment shown and the sheet's choices agree;
 * the same for a generic visual filter (`genericVisualFilters`).
 */
export function targetPreviewProfileSets(profiles, equipment) {
  const sets = profiles && typeof profiles === "object" ? profiles : {};
  const telescopes = sets.telescopes?.length
    ? sets.telescopes
    : telescopeProfiles;
  const eyepieces = sets.eyepieces?.length ? sets.eyepieces : eyepieceProfiles;
  const add = (list, bundled, id) => {
    if (!id || list.some((profile) => profile.id === id)) return list;
    const found = bundled.find((profile) => profile.id === id);
    return found ? [...list, found] : list;
  };
  // The generic filters « Essayer » may put in the preview (VISUAL-SIM-02b):
  // found by their id like the example's profiles.
  const filters = (equipment?.filterIds || []).reduce(
    (list, id) => add(list, genericVisualFilters, id),
    Array.isArray(sets.filters) ? sets.filters : [],
  );
  return {
    ...sets,
    telescopes: add(
      telescopes,
      [...(sets.commonTelescopes || []), ...telescopeProfiles],
      equipment?.telescopeId,
    ),
    eyepieces: add(eyepieces, eyepieceProfiles, equipment?.eyepieceId),
    filters,
  };
}

/** `resolveEquipment` of `equipment` in `mode`, with the preview's profile sets. */
export function targetPreviewResolve(equipment, mode, profiles) {
  const selection = { ...(equipment || {}), mode: targetPreviewMode(mode) };
  return resolveEquipment(
    selection,
    targetPreviewProfileSets(profiles, selection),
  );
}

/**
 * Whether a resolved equipment gives a preview in its mode: in visual a true
 * field and an aperture, in photo a sensor's field.
 */
export function targetPreviewUsable(resolved) {
  if (!resolved) return false;
  if (resolved.mode === "visual")
    return (
      positive(resolved.visualFieldDiameterDegrees) !== null &&
      positive(resolved.apertureMm) !== null
    );
  return fieldOfView(resolved) !== null;
}

const rounded = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : null;
};

// What an equipment gives in `mode`, not how it is written: a draft, the
// default configuration and a plan never carry the same raw keys (mount,
// wind tolerance, numbers as text or as numbers), so the signature is the line that names it, the telescope's
// aperture and (reduced) focal length, the eyepiece or the sensor, and the
// filters.
function equipmentSignature(equipment, profiles, mode) {
  if (!equipment || typeof equipment !== "object") return "";
  const shownMode = targetPreviewMode(mode ?? equipment.mode);
  const selection = { ...equipment, mode: shownMode };
  const resolved = targetPreviewResolve(selection, shownMode, profiles);
  const { name } = targetPreviewEquipmentLines({
    shown: { equipment: selection, resolved, mode: shownMode },
    profiles,
    locale: "en",
  });
  const filters = [
    ...(resolved.filterProfiles || []).map((filter) => filter.id),
    ...(resolved.unresolvedFilterIds || []),
  ].sort();
  return JSON.stringify([
    name,
    rounded(resolved.apertureMm),
    rounded(resolved.focalLengthMm),
    ...(shownMode === "visual"
      ? [
          rounded(resolved.eyepieceFocalLengthMm),
          rounded(resolved.apparentFieldDegrees),
        ]
      : [rounded(resolved.sensorWidthMm), rounded(resolved.sensorHeightMm)]),
    filters,
  ]);
}

/**
 * Whether two raw equipments give the same preview in `mode` (default: the
 * left one's): compared by what they resolve to, never by their raw keys.
 */
export function targetPreviewSameEquipment(left, right, profiles = null, mode) {
  return (
    equipmentSignature(left, profiles, mode) ===
    equipmentSignature(right, profiles, mode)
  );
}

/**
 * The browser's preference: the key of the local storage, and its shape
 * `{ visual: equipment, imaging: equipment }` -- one raw equipment per mode,
 * shared by every target's sheet, written only by « Appliquer ».
 */
export const targetPreviewPreferenceKey = "planastro.targetPreviewEquipment.v1";

/** The browser's local storage, or `null` (private window, no `window`). */
export function targetPreviewStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage || null : null;
  } catch {
    return null;
  }
}

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A stored value as preferences: only the two modes' plain equipments. */
export function targetPreviewNormalizePreferences(value) {
  const preferences = {};
  if (!isRecord(value)) return preferences;
  for (const mode of ["visual", "imaging"])
    if (isRecord(value[mode])) preferences[mode] = value[mode];
  return preferences;
}

/** The preferences stored in `storage`; `{}` when none or unreadable. */
export function targetPreviewReadPreferences(storage = targetPreviewStorage()) {
  try {
    const raw = storage?.getItem(targetPreviewPreferenceKey);
    return raw ? targetPreviewNormalizePreferences(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Stores `preferences` (an empty set removes the key); `false` when it fails. */
export function targetPreviewWritePreferences(
  preferences,
  storage = targetPreviewStorage(),
) {
  try {
    if (!storage) return false;
    const kept = targetPreviewNormalizePreferences(preferences);
    if (Object.keys(kept).length === 0)
      storage.removeItem(targetPreviewPreferenceKey);
    else storage.setItem(targetPreviewPreferenceKey, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

/**
 * « Mon matériel »: the default configuration's equipment in `mode`
 * (`planStartEquipment`, the mode forced), or `null` without a configuration
 * or when it gives no preview in that mode.
 */
export function targetPreviewMine({ configuration, mode, profiles = null }) {
  if (!isRecord(configuration)) return null;
  const shownMode = targetPreviewMode(mode);
  const equipment = {
    ...planStartEquipment({}, configuration),
    mode: shownMode,
  };
  return targetPreviewUsable(
    targetPreviewResolve(equipment, shownMode, profiles),
  )
    ? equipment
    : null;
}

/**
 * The mode the section opens in: the plan's, else the default
 * configuration's, else `fallback` (the planner's own mode).
 */
export function targetPreviewOpeningMode({
  planEquipment = null,
  configuration = null,
  fallback = "imaging",
}) {
  if (isRecord(planEquipment)) return targetPreviewMode(planEquipment.mode);
  if (isRecord(configuration))
    return targetPreviewMode(planStartEquipment({}, configuration).mode);
  return targetPreviewMode(fallback);
}

/**
 * What the section shows in `mode`. `preference` is the browser's equipment
 * of the mode (or `null`), `configuration` the default configuration (or
 * `null`). `{ mode, equipment, resolved, source, mine, sample, canRevert }`:
 * `source` is `"preference"` (it gives a preview in this mode), `"mine"`
 * (« Mon matériel » gives one) or `"sample"` (the example equipment);
 * `mine` is « Mon matériel » in this mode (or `null`); `canRevert` says the
 * link « Reprendre mon matériel » (the preference differs from « Mon
 * matériel », which exists); `sample` the label « Matériel d'exemple ».
 */
export function targetPreviewShown({
  preference = null,
  configuration = null,
  mode,
  profiles = null,
}) {
  const shownMode = targetPreviewMode(mode);
  const resolve = (equipment) =>
    targetPreviewResolve(equipment, shownMode, profiles);
  const mine = targetPreviewMine({
    configuration,
    mode: shownMode,
    profiles,
  });
  const result = (equipment, source) => ({
    mode: shownMode,
    equipment,
    resolved: resolve(equipment),
    source,
    mine,
    sample: source === "sample",
    canRevert:
      source === "preference" &&
      mine !== null &&
      !targetPreviewSameEquipment(equipment, mine, profiles, shownMode),
  });
  if (isRecord(preference)) {
    const equipment = { ...preference, mode: shownMode };
    if (targetPreviewUsable(resolve(equipment)))
      return result(equipment, "preference");
  }
  if (mine) return result(mine, "mine");
  return result(targetPreviewSampleEquipment(shownMode), "sample");
}

/**
 * The sheet's draft after one choice: a copy of the equipment it shows with
 * `key` set to `value`. Nothing is applied until « Appliquer ».
 */
export function targetPreviewDraftWith(shownEquipment, key, value) {
  return { ...(shownEquipment || {}), [key]: value };
}

/**
 * The preferences after « Appliquer » on `draft` in `mode`: the draft is the
 * mode's preference, unless it is « Mon matériel » itself (`mine`), which
 * removes the mode's preference. A new object; the other mode is kept.
 */
export function targetPreviewApplied({
  preferences,
  mode,
  draft,
  mine,
  profiles = null,
}) {
  const shownMode = targetPreviewMode(mode);
  const next = { ...targetPreviewNormalizePreferences(preferences) };
  if (mine && targetPreviewSameEquipment(draft, mine, profiles, shownMode))
    delete next[shownMode];
  else next[shownMode] = { ...draft, mode: shownMode };
  return next;
}

/** The preferences without the mode's: « Reprendre mon matériel ». */
export function targetPreviewReverted({ preferences, mode }) {
  const next = { ...targetPreviewNormalizePreferences(preferences) };
  delete next[targetPreviewMode(mode)];
  return next;
}

/**
 * « Le plan utilise {equipment} » -- for a target of a plan: the plan's
 * equipment (`planEquipment`, raw) named as the equipment line names it, when
 * it gives a preview in the mode shown and differs from what is shown;
 * otherwise `null` (no plan, nothing to say, or the same).
 */
export function targetPreviewPlanLine({
  planEquipment = null,
  shown,
  profiles = null,
  locale,
}) {
  if (!isRecord(planEquipment)) return null;
  const equipment = { ...planEquipment, mode: shown.mode };
  const resolved = targetPreviewResolve(equipment, shown.mode, profiles);
  if (!targetPreviewUsable(resolved)) return null;
  if (
    targetPreviewSameEquipment(equipment, shown.equipment, profiles, shown.mode)
  )
    return null;
  const { name } = targetPreviewEquipmentLines({
    shown: { equipment, resolved, mode: shown.mode },
    profiles,
    locale,
  });
  return name
    ? fill(message(locale, "targetPreviewPlanUses"), { equipment: name })
    : null;
}

const decimalOne = (value, locale) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

const decimalUpTo = (value, locale, digits) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    value,
  );

/**
 * The two lines under the picture: `name`, `{telescope} · {eyepiece}` in
 * visual, `{telescope} · {camera}` in photo (a connected telescope alone:
 * its camera is built in), then the filters chosen (« · UHC »), and `readout`, in visual
 * `{magnification}× · {pupil} mm · {field}°` with one decimal and the
 * language's decimal separator, in photo « Cadre un champ de … » (two
 * decimals at most); `readout` is `null` while a value is missing.
 */
export function targetPreviewEquipmentLines({ shown, profiles, locale }) {
  const { equipment, resolved, mode } = shown;
  const sets = targetPreviewProfileSets(profiles, equipment);
  const { telescope, camera } = resolveEquipmentProfiles(equipment, sets);
  // Nothing chosen is no name: the line names what is chosen only.
  const telescopeName = String(telescope?.name ?? "");
  let second = "";
  if (mode === "visual") {
    const eyepieces = sets.eyepieces?.length ? sets.eyepieces : [];
    const eyepiece = eyepieces.find(
      (profile) => profile.id === equipment.eyepieceId,
    );
    second = String(eyepiece?.name ?? "");
  } else if (!telescope?.integratedCamera) {
    second = String(camera?.name ?? "");
  }
  // The filters chosen close the line (VISUAL-SIM-02, « … · UHC »).
  const filters = (resolved?.filterProfiles || [])
    .map((filter) => String(filter?.name ?? "").trim())
    .filter(Boolean);
  const name = [telescopeName, second, ...filters].filter(Boolean).join(" · ");
  let readout = null;
  if (mode === "visual") {
    const magnification = positive(resolved.magnification);
    const pupil = positive(resolved.exitPupilMm);
    const field = positive(resolved.visualFieldDiameterDegrees);
    if (magnification !== null && pupil !== null && field !== null)
      readout = `${decimalOne(magnification, locale)}× · ${decimalOne(
        pupil,
        locale,
      )}${nbsp}mm · ${decimalOne(field, locale)}°`;
  } else {
    const field = fieldOfView(resolved);
    if (field)
      readout = fill(message(locale, "targetPreviewImagingField"), {
        width: decimalUpTo(field.width, locale, 2),
        height: decimalUpTo(field.height, locale, 2),
      });
  }
  return { name, readout };
}

/** The target's apparent size in arcmin as the rule reads it, or `null`. */
export function targetPreviewSize(target) {
  const size = eyepieceViewTarget(target)?.apparentSizeArcmin;
  return Array.isArray(size) && size.some((value) => positive(value) !== null)
    ? size
    : null;
}

function targetName(target) {
  return String(
    target?.designation || target?.title || target?.objects?.[0] || "",
  );
}

function sizeText(size, locale) {
  return fill(message(locale, "targetScoreSizeApprox"), {
    size: targetArcminLabel(size, locale),
  });
}

/**
 * « M31 (≈ 178 × 63′) est 2,4× plus grande que le champ : on en voit le
 * centre. » for a target larger than the eyepiece's true field, else `null`.
 */
export function targetPreviewBiggerText({ target, resolved, locale }) {
  const size = targetPreviewSize(target);
  const ratio = targetPreviewFieldRatio(
    size,
    resolved?.visualFieldDiameterDegrees,
  );
  if (ratio === null) return null;
  return fill(message(locale, "targetPreviewBiggerVisual"), {
    target: targetName(target),
    size: sizeText(size, locale),
    ratio: decimalUpTo(ratio, locale, 1),
  });
}

/**
 * The existing sentence « … dépasse la largeur du champ de … : mosaïque
 * nécessaire. » when the target overflows the sensor's frame
 * (`framing(...).fit === "mosaic"`), else `null`.
 */
export function targetPreviewMosaicText({ target, resolved, locale }) {
  const size = targetPreviewSize(target);
  const field = fieldOfView(resolved);
  if (!size || !field) return null;
  const fit = framing({ apparentSizeArcmin: size }, field);
  if (fit.fit !== "mosaic") return null;
  const major = Number(size[0]) || 0;
  const minor = Number(size[1]) || major;
  const dimension =
    minor / 60 / field.height > major / 60 / field.width ? "height" : "width";
  return fill(message(locale, "targetScoreFieldMosaic"), {
    target: targetName(target),
    size: sizeText(size, locale),
    dimension: message(
      locale,
      dimension === "height"
        ? "targetScoreFieldHeight"
        : "targetScoreFieldWidth",
    ),
    field: `${decimalUpTo(field.width, locale, 1)}°${nbsp}×${nbsp}${decimalUpTo(
      field.height,
      locale,
      1,
    )}°`,
  });
}

/** The portal's sky cutout (`GET /api/v1/sky-cutout`) and its bounds. */
export const targetPreviewCutoutPath = "/api/v1/sky-cutout";
const cutoutField = { minimum: 0.02, maximum: 20 };

/**
 * The address of the portal's cutout of `survey` (`dss-colour` or
 * `dss2-red`) around `coordinate` (degrees), `fovDegrees` on a side: TAN,
 * north up and east left, the tiles' own pixels. `null` without a
 * coordinate or a field.
 */
export function targetPreviewCutoutUrl({ survey, coordinate, fovDegrees }) {
  const ra = Number(coordinate?.ra);
  const dec = Number(coordinate?.dec);
  const field = positive(fovDegrees);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || field === null)
    return null;
  const parameters = new URLSearchParams({
    survey,
    ra: (((ra % 360) + 360) % 360).toFixed(5),
    dec: Math.max(-90, Math.min(90, dec)).toFixed(5),
    fov: String(
      Number(
        Math.min(
          cutoutField.maximum,
          Math.max(cutoutField.minimum, field),
        ).toPrecision(3),
      ),
    ),
  });
  return `${targetPreviewCutoutPath}?${parameters}`;
}

/**
 * The photo's picture: the portal's `dss-colour` cutout around `coordinate`
 * (degrees) at `targetPreviewPhotoField`'s field (`url`, `fovDegrees`), the
 * sensor's frame as shares of the square's side (`frameWidth`,
 * `frameHeight`), and the side the target's thumbnail takes in it when it
 * stands in for a cutout that did not come (`thumbnailShare`: its own field
 * over the cutout's). `null` without a field.
 */
export function targetPreviewPhoto({ target, coordinate, resolved }) {
  const field = fieldOfView(resolved);
  const photo = targetPreviewPhotoField(field, targetPreviewSize(target));
  if (!photo) return null;
  const url = targetPreviewCutoutUrl({
    survey: "dss-colour",
    coordinate,
    fovDegrees: photo.fovDegrees,
  });
  const sourceField = eyepieceSourceField(eyepieceViewTarget(target) || {});
  return {
    ...photo,
    url,
    thumbnailShare: sourceField / photo.fovDegrees,
  };
}

/**
 * The target as the preview's disc reads it: without its authorised visual
 * reference (`visualThumbnailUrl`, a sketch drawn at someone else's
 * eyepiece), so the rule simulates the view of the equipment shown, with the
 * field image at its true field, instead of laying the same sketch in the
 * disc whatever the eyepiece. The generated visual preview, else the photo,
 * stands in as the thumbnail.
 */
export function targetPreviewSimulationTarget(target) {
  if (!target || typeof target !== "object") return target;
  const { visualThumbnailUrl: _reference, ...rest } = target;
  const knowledge = target.knowledge;
  if (!knowledge || typeof knowledge !== "object") return rest;
  const { visualThumbnailUrl: _known, ...knowledgeRest } = knowledge;
  return { ...rest, knowledge: knowledgeRest };
}

/**
 * The visual disc's sky: the portal's `dss2-red` cutout around `coordinate`
 * at the eyepiece's true field, covering the whole disc (`discFieldRatio`
 * 1), as `EyepieceViewImage` reads a field image. `null` without a
 * coordinate or a true field.
 */
export function targetPreviewVisualSky({ coordinate, resolved }) {
  const fieldDegrees = positive(resolved?.visualFieldDiameterDegrees);
  const path = targetPreviewCutoutUrl({
    survey: "dss2-red",
    coordinate,
    fovDegrees: fieldDegrees,
  });
  return path ? { fieldDegrees, discFieldRatio: 1, path } : null;
}

/**
 * Whether the section exists for a target: for every target but the Sun and
 * the Earth (never a preview of the Sun in an instrument); a body of the
 * solar system the preview does not know has none either.
 */
export function targetPreviewAvailable(target, solarSystem = false) {
  if (!target) return false;
  if (!solarSystem && !eyepieceSolarSystemTarget(target)) return true;
  return targetPreviewBodyShown(targetPreviewBodyKey(target));
}

// ## The sky of the preview
//
// The preview says whose sky it is drawn under: the place's, as the place
// retains it (measured, else typed, else the model's), or one a person forced
// in « Ciel de l'aperçu » for this dialog only. The forcing is a Bortle class;
// its SQM is the class's typical value (`visualSkySqm`).

const bortleClassOf = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
};

/** The typical SQM of a Bortle class (`sqmByBortle`), or `null`. */
export function targetPreviewTypicalSqm(bortleClass) {
  const bortle = bortleClassOf(bortleClass);
  return bortle === null ? null : visualSkySqm({ bortleClass: bortle });
}

/**
 * What the preview's sky is. `choice` is the place's `placeSkyBrightness`
 * choice (`{ source, shown: { sqm, bortleClass } }`; `sky`, the shown value
 * alone, is an older caller's and is taken as the model's), `forcedBortle`
 * the class forced here (`null`: the place's; the place's own class is no
 * forcing), `loading` whether the place's values are still being read.
 * `place` is the value retained, `forced` the forced one, `used` what the
 * disc, the limit and the verdict read (`{ sqm, bortleClass }`) or `null`.
 */
export function targetPreviewSkyState({
  choice = null,
  sky = null,
  forcedBortle = null,
  loading = false,
}) {
  const shown = choice?.shown ?? sky ?? null;
  const placeClass = bortleClassOf(shown?.bortleClass);
  const sqm = Number(shown?.sqm);
  const place =
    placeClass === null
      ? null
      : {
          bortleClass: placeClass,
          sqm: Number.isFinite(sqm) && shown?.sqm !== null ? sqm : null,
          source:
            choice?.source === "measured" || choice?.source === "entered"
              ? choice.source
              : "model",
        };
  const forcedClass = bortleClassOf(forcedBortle);
  const forced =
    forcedClass === null || forcedClass === place?.bortleClass
      ? null
      : { bortleClass: forcedClass, sqm: targetPreviewTypicalSqm(forcedClass) };
  const used = forced ?? place;
  return {
    loading: Boolean(loading),
    place,
    forced,
    used: used ? { sqm: used.sqm, bortleClass: used.bortleClass } : null,
  };
}

/** « Bortle 4 (SQM 21,3) », or « Bortle 4 » without an SQM. */
export function targetPreviewSkyValueText(locale, value) {
  if (!value) return "";
  return Number.isFinite(value.sqm)
    ? fill(message(locale, "targetPreviewSkyValue"), {
        bortle: value.bortleClass,
        sqm: decimalOne(value.sqm, locale),
      })
    : fill(message(locale, "targetPreviewSkyBortle"), {
        bortle: value.bortleClass,
      });
}

const bortleText = (locale, bortle) =>
  fill(message(locale, "targetPreviewSkyBortle"), { bortle });

const sourceWord = (source) =>
  source === "measured"
    ? "Measured"
    : source === "entered"
      ? "Entered"
      : "Estimated";

/**
 * The words of the tile and of the message under the tiles. `tile`: `{ tone:
 * "place" | "forced" | "unknown", value, title }`; `message`: `{ tone, from,
 * how, title, detail, action }` — « Vue depuis Col des Mélèzes » and « Ciel
 * de Bortle 4 (SQM 21,3) · valeur saisie pour ce lieu »; forced, « Valeur
 * forcée : ne correspond pas au lieu » and its detail; no value, « Ciel
 * inconnu : … ». `action` is `{ kind: "revert" | "choose", label }` or
 * `null`.
 */
export function targetPreviewSkyWords(state, { locale, placeName = "" }) {
  const name = String(placeName ?? "").trim();
  const from = name
    ? fill(message(locale, "targetPreviewSkyFrom"), { place: name })
    : null;
  const { place, forced } = state;
  if (forced) {
    const forcedValue = targetPreviewSkyValueText(locale, forced);
    return {
      tile: {
        tone: "forced",
        value: bortleText(locale, forced.bortleClass),
        title: message(locale, "targetPreviewSkyTileForced"),
      },
      message: {
        tone: "forced",
        from: null,
        how: null,
        title: message(locale, "targetPreviewSkyForcedTitle"),
        detail: place
          ? fill(message(locale, "targetPreviewSkyForcedDetail"), {
              forced: forcedValue,
              place: name,
              placeBortle: bortleText(locale, place.bortleClass),
            })
          : fill(message(locale, "targetPreviewSkyForcedDetailUnknown"), {
              forced: forcedValue,
              place: name,
            }),
        action: {
          kind: "revert",
          label: message(locale, "targetPreviewSkyRevert"),
        },
      },
    };
  }
  if (!place)
    return {
      tile: {
        tone: "unknown",
        value: message(locale, "targetPreviewSkyUnknown"),
        title: message(locale, "targetPreviewSkyTileTitle"),
      },
      message: {
        tone: "unknown",
        from,
        how: message(locale, "targetPreviewSkyUnknownMessage"),
        title: null,
        detail: null,
        action: {
          kind: "choose",
          label: message(locale, "targetPreviewSkyChoose"),
        },
      },
    };
  return {
    tile: {
      tone: "place",
      value: bortleText(locale, place.bortleClass),
      title: message(locale, "targetPreviewSkyTileTitle"),
    },
    message: {
      tone: "place",
      from,
      how: fill(
        message(locale, `targetPreviewSkyHow${sourceWord(place.source)}`),
        {
          value: targetPreviewSkyValueText(locale, place),
        },
      ),
      title: null,
      detail: null,
      action: null,
    },
  };
}

/**
 * The target as the verdict reads it: what the disc shows of it
 * (`eyepieceViewTarget`: the magnitude and the size of the field it fills).
 */
const verdictTarget = (target) => {
  const seen = eyepieceViewTarget(target);
  return {
    ...target,
    integratedMagnitude: seen?.integratedMagnitude ?? null,
    apparentSizeArcmin: seen?.apparentSizeArcmin ?? null,
  };
};

/**
 * The visual verdict of the equipment shown under `sky` (`visualSuitability`,
 * the very evaluation of `targetPreviewVisibility` and of the suggestions):
 * what the badge « Idéal » and the disc's render (`eyepieceRenderFromVerdict`)
 * read. `null` out of visual mode, without a sky, for a planet.
 */
export function targetPreviewVerdict({ target, resolved, sky }) {
  if (!target || !sky || resolved?.mode !== "visual") return null;
  const verdict = visualSuitability(
    verdictTarget(target),
    resolved,
    undefined,
    sky,
  );
  return verdict.reason === "planet" ? null : verdict;
}

/**
 * The notice under the disc (visual, never a planet, only under a known
 * sky): `{ status: "difficult" | "unlikely", title, limit, best, advice,
 * adviceText }` from `visualBestPair` for the target, the visual equipment
 * (`resolved`), the eyepieces and filters of « Mon matériel »
 * (`inventory`: `{ eyepieces, filters }`) and `sky` — the very evaluation of
 * the suggestions (`visualCardVerdict`) — or `null` when the target is fine
 * or the sky unknown. `status` is the one of the pair chosen; `best` the best
 * pair and `advice` what to change (`visualBestPair`), `adviceText` its line
 * (« Visible au 32 mm »). `forced` says « … sous ce ciel forcé ».
 */
export function targetPreviewVisibility({
  target,
  resolved,
  sky,
  forced = false,
  locale,
  inventory = null,
}) {
  if (!target || !sky || resolved?.mode !== "visual") return null;
  const pairs = visualBestPair({
    target: verdictTarget(target),
    profile: resolved,
    eyepieces: inventory?.eyepieces || [],
    filters: inventory?.filters || [],
    sky,
  });
  const verdict = pairs?.chosen;
  if (verdict?.status !== "difficult" && verdict?.status !== "unlikely")
    return null;
  const limit = Number(verdict.magnitudeLimit);
  return {
    best: pairs.best,
    advice: pairs.advice,
    adviceText: visualBestPairText(locale, pairs.advice),
    status: verdict.status,
    title: message(
      locale,
      verdict.status === "difficult"
        ? "targetPreviewVisibilityDifficult"
        : "targetPreviewVisibilityUnlikely",
    ),
    limit: Number.isFinite(limit)
      ? fill(
          message(
            locale,
            forced
              ? "targetPreviewVisibilityLimitForced"
              : "targetPreviewVisibilityLimit",
          ),
          { magnitude: decimalOne(limit, locale) },
        )
      : null,
  };
}

/**
 * The nine steps of « Ciel de l'aperçu » as `BortleScale` draws them: the
 * class chosen ringed, « Bortle 7 · 18,7 » above it (`here`), the ends of
 * the scale. `bortle` is `null` before a choice.
 */
export function targetPreviewSkyScale({ locale, bortle = null }) {
  const chosen = bortleClassOf(bortle);
  const sqmText = (value) => decimalOne(value, locale);
  return {
    label:
      chosen === null
        ? message(locale, "bortleScaleTitle")
        : fill(message(locale, "bortleScaleLabelHere"), { bortle: chosen }),
    here:
      chosen === null
        ? ""
        : fill(message(locale, "targetPreviewSkyPointer"), {
            bortle: chosen,
            sqm: sqmText(targetPreviewTypicalSqm(chosen)),
          }),
    darkEnd: fill(message(locale, "bortleScaleDarkEnd"), {
      value: sqmText(lightMapScaleDarkEndSqm),
    }),
    brightEnd: fill(message(locale, "bortleScaleBrightEnd"), {
      value: sqmText(lightMapScaleBrightEndSqm),
    }),
    steps: lightMapScaleSteps().map((step) => ({
      bortle: step.bortle,
      colour: step.colour,
      here: step.bortle === chosen,
      labelled: step.bortle % 2 === 1 || step.bortle === chosen,
    })),
  };
}

/** The word of a class under the scale (« Ciel périurbain dense »), or `null`. */
export function targetPreviewSkyWord(locale, bortle) {
  const chosen = bortleClassOf(bortle);
  return chosen === null
    ? null
    : message(locale, `tonightBortleShort${chosen}`);
}

/**
 * The line of the sheet that says what the place holds: « Valeur du lieu :
 * Bortle 4 (SQM 21,3), saisie · Col des Mélèzes », or that it holds nothing.
 */
export function targetPreviewSkyPlaceLine(state, { locale, placeName = "" }) {
  const name = String(placeName ?? "").trim();
  const text = state.place
    ? fill(
        message(
          locale,
          `targetPreviewSkySheetPlace${sourceWord(state.place.source)}`,
        ),
        { value: targetPreviewSkyValueText(locale, state.place), place: name },
      )
    : fill(message(locale, "targetPreviewSkySheetPlaceUnknown"), {
        place: name,
      });
  return name ? text : text.replace(/\s*·\s*$/, "");
}
