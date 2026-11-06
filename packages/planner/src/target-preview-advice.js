// The advice of « Prévisualiser »: the card « Idéal avec votre matériel »
// under the visual verdict —
// the best pair (eyepiece, filter) of `visualBestPair`, its status and
// « Essayer », which puts the pair in the preview's equipment — and, in
// photo, the three lines of `photoAdvice`: the filter, the ideal frame (a
// range of focal lengths) and the focal ratio. Pure: the web block
// (`TargetPreviewBlock.js`) and the mobile client read the same words from
// the same rules (fixtures `target-preview-ideal` and
// `target-preview-photo-advice`).
import { message } from "portal/i18n.js";
import { localeTypography } from "portal/locales.js";
import { filterFamily, filterMoonIlluminationPercent } from "./filters.js";
import { filterFamilyName } from "./filters-section.js";
import { photoAdvice, photoAdviceRule } from "./photo-advice.js";
import {
  visualFilterFamiliesByGain,
  visualFilterGain,
} from "./visual-model.js";
import { fill } from "./wind-section.js";

const nbsp = " ";

// The numbers of the advice, written by one rule on both sides (the app's
// `NumberFormat` and the browser's `Intl` differ on the grouping): at most
// `digits` decimals, the language's decimal separator, thousands grouped
// (« 1 200 mm », « 1,200 mm »; Spanish, Italian and European Portuguese
// group from five digits). The separators come from the locale registry's
// typography; the app's European Portuguese (`pt-PT`, not a registry locale:
// the registry's Portuguese is Brazil's) groups with a no-break space.
const europeanPortuguese = { groupSeparator: nbsp, groupFrom: "fiveDigits" };

export function targetPreviewAdviceNumber(value, locale, digits = 1) {
  const tag = String(locale || "en").replace("_", "-");
  const typography = localeTypography(tag);
  const { groupSeparator, groupFrom } =
    tag === "pt-PT" ? europeanPortuguese : typography;
  const factor = 10 ** digits;
  const rounded = Math.round(Number(value) * factor) / factor;
  const [whole, fraction = ""] = Math.abs(rounded).toFixed(digits).split(".");
  const grouped =
    whole.length < (groupFrom === "fiveDigits" ? 5 : 4)
      ? whole
      : whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  const trimmed = fraction.replace(/0+$/, "");
  return `${rounded < 0 ? "-" : ""}${grouped}${
    trimmed ? `${typography.decimalSeparator}${trimmed}` : ""
  }`;
}

const decimal = targetPreviewAdviceNumber;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const capitalized = (text) =>
  text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;

const familyName = (locale, family) =>
  filterFamilyName(locale, family) || String(family ?? "");

/**
 * The card « Idéal » of the best pair (`targetPreviewVisibility`'s `best`
 * and `advice`), `null` when the choice is already the best (`chosen`) or
 * nothing is known. `eyepieceName` names the eyepiece chosen (the pair that
 * keeps it says it). `{ label, line, detail, status, generic, missingFilterName, trial }`:
 * - `label`: « Idéal avec votre matériel », or « Idéal pour cette cible »
 *   when the pair holds a generic profile (« pas dans votre matériel ») or
 *   nothing shows the target;
 * - `line`: « Plössl 32 mm + OIII · visible », « Plössl 32 mm + un OIII ·
 *   visible » (a generic filter), « Un oculaire de 32 mm + un OIII · visible »;
 *   nothing shows it: « Aucun oculaire ni filtre ne la rend visible sous ce
 *   ciel. »;
 * - `detail`: what is not in « Mon matériel », or `null`;
 * - `trial`: what « Essayer » puts in the preview's equipment
 *   (`targetPreviewTrialEquipment`), `null` when both pieces of the pair are
 *   generic profiles (nothing of « Mon matériel » to try).
 */
export function targetPreviewIdeal({
  best = null,
  advice = null,
  eyepieceName = "",
  locale,
}) {
  const key = advice?.key;
  if (!best || !key || key === "chosen") return null;
  if (key === "none")
    return {
      label: message(locale, "targetPreviewIdealTarget"),
      line: message(locale, "targetPreviewIdealNone"),
      detail: null,
      status: advice.status ?? null,
      generic: false,
      missingFilterName: null,
      trial: null,
    };
  const eyepiece = best.eyepiece || {};
  const filter = best.filter || null;
  const focal = positive(eyepiece.focalLengthMm);
  const focalText = focal === null ? "" : decimal(focal, locale);
  const eyepieceText = eyepiece.generic
    ? fill(message(locale, "targetPreviewIdealGenericEyepiece"), {
        focal: focalText,
      })
    : String(
        eyepiece.name ||
          eyepieceName ||
          (focal === null ? "" : `${focalText}${nbsp}mm`),
      );
  const filterText = filter
    ? filter.generic
      ? fill(message(locale, "targetPreviewIdealGenericFilter"), {
          filter: familyName(locale, filter.family),
        })
      : String(filter.name || familyName(locale, filter.family))
    : "";
  const pair =
    filterText && eyepieceText
      ? fill(message(locale, "targetPreviewIdealPair"), {
          eyepiece: eyepieceText,
          filter: filterText,
        })
      : eyepieceText || filterText;
  const status = best.status ?? advice.status ?? null;
  const statusText =
    status === "suitable"
      ? message(locale, "targetPreviewIdealVisible")
      : status === "difficult"
        ? message(locale, "targetPreviewIdealDifficult")
        : "";
  const line = capitalized(
    statusText
      ? fill(message(locale, "targetPreviewIdealLine"), {
          pair,
          status: statusText,
        })
      : pair,
  );
  const eyepieceChanged = key === "eyepiece" || key === "pair";
  const filterChanged = key === "filter" || key === "pair";
  const genericEyepiece = eyepieceChanged && eyepiece.generic === true;
  const genericFilter = filterChanged && filter?.generic === true;
  const detail =
    genericEyepiece && genericFilter
      ? message(locale, "targetPreviewIdealNeitherOwned")
      : genericEyepiece
        ? fill(message(locale, "targetPreviewIdealEyepieceNotOwned"), {
            focal: focalText,
          })
        : genericFilter
          ? fill(message(locale, "targetPreviewIdealFilterNotOwned"), {
              filter: familyName(locale, filter.family),
            })
          : null;
  // Nothing to try when the pair is only generic profiles (« ni l'un ni
  // l'autre »); one missing piece is tried.
  const tried = !(genericEyepiece && genericFilter);
  const trial = tried
    ? {
        eyepieceId: eyepieceChanged ? (eyepiece.id ?? null) : null,
        eyepieceFocalLengthMm: eyepieceChanged ? focal : null,
        // The filter of the pair; `null` keeps the equipment's own (a pair
        // that only changes the eyepiece keeps the filter chosen).
        filterIds: filter
          ? filterChanged && filter.id
            ? [String(filter.id)]
            : null
          : [],
      }
    : null;
  return {
    label: message(
      locale,
      genericEyepiece || genericFilter || best.generic === true
        ? "targetPreviewIdealTarget"
        : "targetPreviewIdealOwn",
    ),
    line,
    detail,
    status,
    generic: genericEyepiece || genericFilter,
    // The family of the filter « Mon matériel » lacks
    // (the phone's link under the card), never for an eyepiece.
    missingFilterName: genericFilter ? familyName(locale, filter.family) : null,
    trial,
  };
}

/**
 * The small badge under the disc's caption: « Filtre idéal : OIII » — the first family of
 * `visualFilterFamiliesByGain(target)`, the same source as the sheet's
 * advice — or « Filtre idéal : aucun » for a galaxy or a cluster (a filter
 * dims them). Always shown, nothing else: it depends on the target alone.
 * `{ family, text }`, `family` `null` for « aucun ».
 */
export function targetPreviewIdealFilter({ target, locale }) {
  const family = visualFilterFamiliesByGain(target)?.[0] ?? null;
  return {
    family,
    text: family
      ? fill(message(locale, "targetPreviewIdealFilter"), {
          filter: familyName(locale, family),
        })
      : message(locale, "targetPreviewIdealFilterNone"),
  };
}

/**
 * The filters a visual profile puts in front of the eyepiece, as
 * `visualProfileFilter` reads them: its `filterProfiles`, else its
 * `filters`, and the ids not resolved.
 */
export function targetPreviewPosedFilters(resolved) {
  return [
    ...(Array.isArray(resolved?.filterProfiles) &&
    resolved.filterProfiles.length
      ? resolved.filterProfiles
      : Array.isArray(resolved?.filters)
        ? resolved.filters
        : []),
    ...(Array.isArray(resolved?.unresolvedFilterIds)
      ? resolved.unresolvedFilterIds
      : []),
  ];
}

/**
 * The badge « ★ Idéal » at the end of the equipment line (VISUAL-SIM-03,
 * rule (c)): the verdict of the equipment shown (`status`) is `suitable`
 * and the filter posed (`filters`, see `targetPreviewPosedFilters`; none:
 * fine) does not dim the target — the best of them has a gain of zero or
 * more (the verdict itself takes a filter that dims the target off, so
 * its `filterFamily` cannot say it). Kept even when a generic filter would
 * do better: it judges the equipment shown, not the catalogue. `null`
 * without a verdict (no sky known) and in photo (the caller passes no
 * status). `{ text }`.
 */
export function targetPreviewIdealBadge({
  target,
  status = null,
  filters = [],
  locale,
}) {
  if (status !== "suitable") return null;
  if (
    filters.length &&
    Math.max(
      ...filters.map((filter) =>
        visualFilterGain(target, filterFamily(filter)),
      ),
    ) < 0
  )
    return null;
  return { text: message(locale, "targetPreviewIdealBadge") };
}

/**
 * The preview's raw equipment with the pair of « Essayer » (`trial` of
 * `targetPreviewIdeal`): its eyepiece (and the focal length of a zoom's
 * end), its filter. Nothing else changes; the equipment kept stays the
 * preview's (« Mon matériel » is never written).
 */
export function targetPreviewTrialEquipment(equipment, trial) {
  const next = { ...(equipment || {}) };
  if (!trial) return next;
  if (trial.eyepieceId) {
    next.eyepieceId = trial.eyepieceId;
    if (trial.eyepieceFocalLengthMm)
      next.eyepieceFocalLengthMm = trial.eyepieceFocalLengthMm;
    else delete next.eyepieceFocalLengthMm;
  }
  if (Array.isArray(trial.filterIds)) next.filterIds = [...trial.filterIds];
  return next;
}

const filterDetailKey = (families, sensorKind) =>
  !families.length
    ? "targetPreviewPhotoFilterNoneDetail"
    : families.includes("dual")
      ? "targetPreviewPhotoFilterDualDetail"
      : sensorKind === "mono"
        ? "targetPreviewPhotoFilterMonoDetail"
        : null;

const framingKey = {
  small: "targetPreviewPhotoFramingShare",
  fits: "targetPreviewPhotoFramingFits",
  tight: "targetPreviewPhotoFramingTight",
  centre: "targetPreviewPhotoFramingCentre",
};

/**
 * The sensor the ideal frame is computed for (PREVIEW-ADVICE-02): « le
 * capteur Seestar S50 (11,3 × 6,4 mm) » for a telescope with its camera built
 * in (`integratedCamera`) or an example camera, « votre ZWO ASI533MC Pro
 * (11,3 × 11,3 mm) » for the camera of « Mon matériel » (`cameraOwned`), « un
 * capteur de 11,3 × 6,4 mm » without a name.
 */
function sensorText({
  resolved,
  camera,
  telescopeName,
  integratedCamera,
  cameraOwned,
  locale,
}) {
  const size = fill(message(locale, "targetPreviewPhotoSensorSize"), {
    width: decimal(resolved.sensorWidthMm, locale, 1),
    height: decimal(resolved.sensorHeightMm, locale, 1),
  });
  const telescope = String(telescopeName ?? "").trim();
  const cameraName = String(camera?.name ?? "").trim();
  const name = integratedCamera && telescope ? telescope : cameraName;
  if (!name)
    return fill(message(locale, "targetPreviewPhotoSensorUnnamed"), { size });
  return fill(
    message(
      locale,
      cameraOwned && !integratedCamera
        ? "targetPreviewPhotoSensorOwn"
        : "targetPreviewPhotoSensorNamed",
    ),
    { name, size },
  );
}

/**
 * The three lines of the photo tab from `photoAdvice`
 * for `target` with the imaging equipment `resolved`, the `camera`'s
 * `pixelSizeUm` and `sensorKind`, and the owner's `telescopes` (« Mon
 * matériel » first). `{ filter, focal, aperture }`, each `{ title, detail }`
 * (`focal.fits`: the focal length chosen is in the range, the line is a
 * confirmation), `focal` and `aperture` `null` without a size; `null` out of
 * photo.
 * - filter: « Filtre conseillé : double bande », or « Filtre : aucun
 *   conseillé » (a galaxy, a cluster, a star), never left out; with a filter
 *   advised and the Moon of the night (`moonIlluminationPercent`) above the
 *   threshold of the filter advice, `moon`: « Lune à 62 % : le filtre double
 *   bande compte » — never a word on the Bortle class;
 * - focal: « Cadre idéal pour le capteur Seestar S50 (11,3 × 6,4 mm) : focale
 *   140–230 mm » (the sensor the range is computed for), and how the target fills the
 *   frame with the instrument chosen (`telescopeName`, its focal length and
 *   its aperture: « Avec Newton (focale 1 200 mm, ouverture 250 mm), vous
 *   voyez le centre. »), the owner's telescope that has it, the sampling's
 *   cap;
 * - aperture: « Rapport focal : f/4 à f/6 » and the ratio of the telescope.
 */
export function targetPreviewPhotoAdvice({
  target,
  resolved,
  camera = null,
  telescopes = [],
  moonIlluminationPercent = null,
  telescopeName = "",
  integratedCamera = false,
  cameraOwned = false,
  locale,
}) {
  if (!target || !resolved || resolved.mode === "visual") return null;
  const sensorKind = camera?.sensorKind ?? null;
  const advice = photoAdvice({
    target,
    profile: resolved,
    pixelSizeUm: camera?.pixelSizeUm ?? null,
    sensorKind,
    telescopes,
  });
  if (!advice) return null;
  const families = advice.filterFamilies || [];
  const detailKey = filterDetailKey(families, sensorKind);
  const filter = {
    title: families.length
      ? fill(message(locale, "targetPreviewPhotoFilter"), {
          filter: families
            .map((family) => familyName(locale, family))
            .join(" / "),
        })
      : message(locale, "targetPreviewPhotoFilterNone"),
    detail: detailKey ? message(locale, detailKey) : null,
    moon:
      families.length &&
      Number.isFinite(moonIlluminationPercent) &&
      moonIlluminationPercent > filterMoonIlluminationPercent
        ? fill(message(locale, "targetPreviewPhotoMoon"), {
            percent: decimal(moonIlluminationPercent, locale, 0),
            filter: families
              .map((family) => familyName(locale, family))
              .join(" / "),
          })
        : null,
  };
  const range = advice.focalRange;
  const current = advice.current || {};
  const focalChosen = positive(current.focalLengthMm);
  let focal = null;
  if (range) {
    const bounds = {
      minimum: decimal(range.minimumMm, locale, 0),
      maximum: decimal(range.maximumMm, locale, 0),
    };
    const fits = current.inFocalRange === true;
    const sensor = sensorText({
      resolved,
      camera,
      telescopeName,
      integratedCamera,
      cameraOwned,
      locale,
    });
    const sentences = [];
    const fit = advice.framing?.fit;
    if (focalChosen !== null && framingKey[fit]) {
      // The sentence names the instrument, its focal length and its
      // aperture: never a bare « 250 mm ».
      const aperture = positive(resolved.apertureMm);
      const focalText = decimal(focalChosen, locale, 0);
      const name = String(telescopeName ?? "").trim();
      const telescope =
        name || message(locale, "targetPreviewPhotoInstrumentYours");
      const instrument =
        aperture === null
          ? fill(message(locale, "targetPreviewPhotoInstrumentNoAperture"), {
              telescope,
              focal: focalText,
            })
          : fill(message(locale, "targetPreviewPhotoInstrument"), {
              telescope,
              focal: focalText,
              aperture: decimal(aperture, locale, 0),
            });
      sentences.push(
        fill(message(locale, framingKey[fit]), {
          instrument,
          percent: decimal(advice.framing.occupancy, locale, 0),
        }),
      );
    }
    if (!fits && advice.telescope)
      sentences.push(
        fill(message(locale, "targetPreviewPhotoOwnTelescope"), {
          telescope: String(advice.telescope.name ?? ""),
          focal: decimal(advice.telescope.focalLengthMm, locale, 0),
        }),
      );
    else if (!fits && advice.generic)
      sentences.push(
        fill(message(locale, "targetPreviewPhotoNoTelescope"), bounds),
      );
    if (range.sampled)
      sentences.push(
        fill(message(locale, "targetPreviewPhotoSampled"), {
          maximum: bounds.maximum,
        }),
      );
    focal = {
      title: fits
        ? fill(message(locale, "targetPreviewPhotoFocalFits"), {
            ...bounds,
            sensor,
            focal: decimal(focalChosen, locale, 0),
          })
        : fill(message(locale, "targetPreviewPhotoFocal"), {
            ...bounds,
            sensor,
          }),
      detail: sentences.length ? sentences.join(" ") : null,
      fits,
    };
  }
  let aperture = null;
  if (Array.isArray(advice.apertureRange)) {
    const [minimum, maximum] = advice.apertureRange;
    const small =
      minimum === photoAdviceRule.smallFocalRatio[0] &&
      maximum === photoAdviceRule.smallFocalRatio[1];
    const ratio = positive(current.focalRatio);
    const sentences = [
      message(
        locale,
        small
          ? "targetPreviewPhotoApertureSmall"
          : "targetPreviewPhotoApertureExtended",
      ),
    ];
    if (ratio !== null)
      sentences.push(
        fill(
          message(
            locale,
            current.inApertureRange
              ? "targetPreviewPhotoApertureYoursFits"
              : "targetPreviewPhotoApertureYours",
          ),
          { ratio: decimal(ratio, locale) },
        ),
      );
    aperture = {
      title: fill(message(locale, "targetPreviewPhotoAperture"), {
        minimum: decimal(minimum, locale),
        maximum: decimal(maximum, locale),
      }),
      detail: sentences.join(" "),
    };
  }
  return { filter, focal, aperture };
}
