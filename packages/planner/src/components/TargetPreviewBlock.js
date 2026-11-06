"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { skyPictureKindOf, skyPictureUrl } from "portal/sky-pictures.js";
import { targetImageVariant } from "portal/target-image-variants.js";
import { modifierChoices } from "../equipment-labels.js";
import { equipmentSelectionWithReturn } from "../equipment-return.js";
import {
  defaultEyepieceRender,
  eyepieceRenderFromVerdict,
  eyepieceView,
  eyepieceViewOrDefault,
  eyepieceViewSetting,
} from "../eyepiece-view.js";
import {
  cameraProfiles,
  fieldOfView,
  opticalModifiers,
  resolveEquipmentProfiles,
} from "../planner.js";
import { hipsPreviewUrl } from "../recommendations.js";
import { factsIsSolarSystem, factsTarget } from "../target-facts-model.js";
import {
  targetPreviewApplied,
  targetPreviewAvailable,
  targetPreviewBiggerText,
  targetPreviewDraftWith,
  targetPreviewEquipmentLines,
  targetPreviewMosaicText,
  targetPreviewOpeningMode,
  targetPreviewPhoto,
  targetPreviewPlanLine,
  targetPreviewProfileSets,
  targetPreviewReadPreferences,
  targetPreviewResolve,
  targetPreviewReverted,
  targetPreviewShown,
  targetPreviewSimulationTarget,
  targetPreviewSize,
  targetPreviewSkyPlaceLine,
  targetPreviewSkyScale,
  targetPreviewSkyState,
  targetPreviewSkyWord,
  targetPreviewSkyWords,
  targetPreviewUsable,
  targetPreviewVerdict,
  targetPreviewVisibility,
  targetPreviewVisualSky,
  targetPreviewWritePreferences,
} from "../target-preview.js";
import {
  targetPreviewIdeal,
  targetPreviewIdealBadge,
  targetPreviewIdealFilter,
  targetPreviewPosedFilters,
  targetPreviewPhotoAdvice,
  targetPreviewTrialEquipment,
} from "../target-preview-advice.js";
import { visualFilterAdviceText } from "../visual-filter-advice.js";
import { genericVisualFilters } from "../visual-pairs.js";
import {
  paintTargetPreviewPlanet,
  targetPreviewDiscCrop,
  targetPreviewIllustrationCrop,
  targetPreviewBodyKey,
  targetPreviewBodyShown,
  targetPreviewInstant,
  targetPreviewMoonPercent,
  targetPreviewPlanet,
  targetPreviewPlanetSizeText,
} from "../target-preview-planet.js";
import { clock, fill } from "../wind-section.js";
import {
  EyepieceViewImage,
  eyepieceViewCaption,
  eyepieceViewLabel,
} from "./EyepieceViewImage.js";
import { ObservationModeIcon } from "./ObservationModeIcon.js";
import { DefineEquipmentLink, EquipmentPicker } from "./EquipmentPicker.js";
import { BortleScale } from "./SkyBrightnessParts.js";

// « Prévisualiser » in "Statistiques de la cible" (TARGET-PREVIEW-02), between
// « Saison » and « Caractéristiques »: the target at its true size in the
// field — in visual the eyepiece's disc (`EyepieceViewImage`), in photo a
// survey wider than the sensor with the sensor's frame drawn to scale on it —
// the equipment in two lines and « Changer le matériel », which opens a
// second dialog where the choices make a draft that « Appliquer » keeps as
// **this browser's preference of the mode** (photo or visual), the same for
// every target; the cross changes nothing. Without a preference the section
// shows « Mon matériel » (the default configuration), else the example
// equipment. Nothing is written in the plan, its profile or the default
// configuration. The rules are `target-preview.js`. Free: no capability is
// read.
//
// The sky is the portal's own cutout (`GET /api/v1/sky-cutout`): DSS colour
// at the photo's field, DSS2 red at the eyepiece's true field passed through
// the eyepiece rule; the target's thumbnail stands in only when the cutout
// does not come. The Moon and the planets are drawn at their true size of
// the day on the sky around their place of the day
// (`target-preview-planet.js`); the Sun and the Earth have no section.

const frameColour = "#FF625C";
const outsideShade = "rgba(0, 0, 0, 0.45)";
const darkSky = "#05070a";

const offline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * What the figure shows while its picture is being made (TARGET-STATS-SKY-
 * PLACE-01): only the application's loading icon and « Vue en préparation… »,
 * over the sky's level (the disc) or the dark square (the photo). Never a
 * raw tile, a thumbnail or a frame; no time threshold: it goes the moment
 * the picture is ready.
 */
function TargetPreviewLoading({ locale, grey = null }) {
  return (
    <div
      className="planner-target-preview-loading"
      role="status"
      data-testid="preview-loading"
      style={
        grey === null
          ? undefined
          : { background: `rgb(${grey}, ${grey}, ${grey})` }
      }
    >
      <BrandLoader size={56} />
      <p>{message(locale, "targetPreviewPreparing")}</p>
    </div>
  );
}

function loadImage(src, onload, onerror) {
  const image = new Image();
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.onload = () => onload(image);
  image.onerror = onerror;
  image.src = src;
  return image;
}

// Where the body's disc is in its illustration: found in the pixels when the
// page may read them (a picture of the portal's), else the bundled
// illustrations' table, else the whole picture.
function illustrationCrop(image, url) {
  try {
    const side = 64;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, side, side);
    const found = targetPreviewDiscCrop(
      context.getImageData(0, 0, side, side).data,
      side,
      side,
      {
        naturalWidth: image.naturalWidth || image.width,
        naturalHeight: image.naturalHeight || image.height,
      },
    );
    if (found) return found;
  } catch {
    // Another origin: the canvas may not be read.
  }
  return targetPreviewIllustrationCrop(url);
}

// One frame of the photo: the dark sky, the cutout (or, when it did not
// come, the target's thumbnail at its own scale), the body of the solar
// system at its true size, the shade outside the sensor's frame and the
// frame itself.
function paintPhoto(canvas, layers, photo, planet) {
  const ratio = window.devicePixelRatio || 1;
  const side = Math.max(1, Math.round(canvas.clientWidth * ratio));
  if (canvas.width !== side) canvas.width = side;
  if (canvas.height !== side) canvas.height = side;
  const context = canvas.getContext("2d");
  context.globalAlpha = 1;
  context.fillStyle = darkSky;
  context.fillRect(0, 0, side, side);
  context.imageSmoothingQuality = "high";
  if (layers.survey) context.drawImage(layers.survey, 0, 0, side, side);
  else if (layers.thumbnail) {
    const share = Number.isFinite(photo.thumbnailShare)
      ? photo.thumbnailShare
      : 1;
    const thumbnailSide = side * share;
    const offset = (side - thumbnailSide) / 2;
    context.drawImage(
      layers.thumbnail,
      offset,
      offset,
      thumbnailSide,
      thumbnailSide,
    );
  }
  if (planet)
    paintTargetPreviewPlanet(context, {
      x: side / 2,
      y: side / 2,
      pixelsPerArcsec: side / (photo.fovDegrees * 3600),
      planet,
      image: layers.planet,
      crop: layers.planetCrop,
    });
  const width = side * photo.frameWidth;
  const height = side * photo.frameHeight;
  const x = (side - width) / 2;
  const y = (side - height) / 2;
  context.fillStyle = outsideShade;
  context.beginPath();
  context.rect(0, 0, side, side);
  context.rect(x, y, width, height);
  context.fill("evenodd");
  context.strokeStyle = frameColour;
  context.lineWidth = Math.max(1.5, 2 * ratio);
  context.strokeRect(x, y, width, height);
}

/**
 * The photo: a square canvas, the cutout at `photo.fovDegrees` with the
 * sensor's frame, on a dark sky while it loads; the thumbnail at scale only
 * when the cutout does not come. `planet` (`targetPreviewPlanet`) is drawn
 * at its true size with its illustration (`planetImageUrl`).
 */
function TargetPreviewPhotoCanvas({
  photo,
  thumbnailUrl,
  label,
  locale,
  onSurveyError,
  planet = null,
  planetImageUrl = null,
}) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("waiting");
  const key = `${photo.url}|${thumbnailUrl}|${photo.frameWidth}|${photo.frameHeight}|${photo.thumbnailShare}|${planet?.instant ?? ""}|${planetImageUrl ?? ""}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    const layers = {
      thumbnail: null,
      survey: null,
      planet: null,
      planetCrop: targetPreviewIllustrationCrop(planetImageUrl),
    };
    const paint = () => {
      if (!cancelled) paintPhoto(canvas, layers, photo, planet);
    };
    setState("waiting");
    paint();
    const failed = () => {
      if (cancelled) return;
      setState("failed");
      onSurveyError?.();
      if (thumbnailUrl)
        loadImage(
          thumbnailUrl,
          (image) => {
            if (cancelled) return;
            layers.thumbnail = image;
            setState("thumbnail");
            paint();
          },
          () => {
            if (!cancelled) setState("empty");
          },
        );
    };
    if (photo.url)
      loadImage(
        photo.url,
        (image) => {
          if (cancelled) return;
          layers.survey = image;
          setState("survey");
          paint();
        },
        failed,
      );
    else failed();
    if (planet && planetImageUrl)
      loadImage(
        planetImageUrl,
        (image) => {
          if (cancelled) return;
          layers.planet = image;
          layers.planetCrop = illustrationCrop(image, planetImageUrl);
          paint();
        },
        () => {},
      );
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(paint) : null;
    observer?.observe(canvas);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
    // The photo's numbers are in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The survey is awaited, or the thumbnail that stands in for the survey
  // that did not come: only the loading icon shows until the picture is made.
  const preparing = state === "waiting" || (state === "failed" && thumbnailUrl);
  return (
    <>
      <canvas
        ref={canvasRef}
        className="planner-target-preview-photo"
        role="img"
        aria-label={label}
        data-preview-photo={state}
        data-preview-fov={photo.fovDegrees}
        data-preview-frame={`${photo.frameWidth.toFixed(3)}×${photo.frameHeight.toFixed(3)}`}
      />
      {preparing ? <TargetPreviewLoading locale={locale} /> : null}
    </>
  );
}

/**
 * The body of the solar system over the eyepiece's disc: a transparent
 * canvas laid on it, the body at its true size in `fieldDegrees` (the disc's
 * diameter), clipped to the disc.
 */
function TargetPreviewPlanetOverlay({ planet, imageUrl, fieldDegrees }) {
  const canvasRef = useRef(null);
  const key = `${planet.instant}|${planet.key}|${imageUrl ?? ""}|${fieldDegrees}`;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let image = null;
    let crop = targetPreviewIllustrationCrop(imageUrl);
    const paint = () => {
      if (cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      const side = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, side, side);
      context.save();
      context.beginPath();
      context.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
      context.clip();
      paintTargetPreviewPlanet(context, {
        x: side / 2,
        y: side / 2,
        pixelsPerArcsec: side / (fieldDegrees * 3600),
        planet,
        image,
        crop,
      });
      context.restore();
    };
    paint();
    if (imageUrl)
      loadImage(
        imageUrl,
        (loaded) => {
          image = loaded;
          crop = illustrationCrop(loaded, imageUrl);
          paint();
        },
        () => {},
      );
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(paint) : null;
    observer?.observe(canvas);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
    // The body's numbers are in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <canvas
      ref={canvasRef}
      className="planner-target-preview-planet"
      aria-hidden="true"
      data-preview-planet={planet.key}
      data-preview-planet-diameter={planet.diameterArcsec.toFixed(2)}
    />
  );
}

/**
 * The lines of a body of the solar system: its size in the field
 * (`fieldDegrees`), its lit part when it has a phase, Jupiter's moons at the
 * instant drawn.
 */
function planetLines({ planet, name, fieldDegrees, locale, timeZone }) {
  if (!planet || !(fieldDegrees > 0)) return [];
  const lines = [
    fill(message(locale, "targetPreviewPlanetScale"), {
      body: name,
      size: targetPreviewPlanetSizeText(planet.diameterArcsec, locale),
      field: `${new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
      }).format(fieldDegrees)}°`,
    }),
  ];
  if (planet.phase)
    lines.push(
      fill(message(locale, "targetPreviewPlanetPhase"), {
        percent: new Intl.NumberFormat(locale, {
          style: "percent",
          maximumFractionDigits: 0,
        }).format(planet.phase.fraction),
      }),
    );
  if (planet.moons)
    lines.push(
      fill(message(locale, "targetPreviewPlanetMoons"), {
        time: clock(planet.instant, locale, timeZone),
      }),
    );
  return lines;
}

/**
 * The pickers of the sheet when the page hands none (`preview.pickers`): the
 * profile sets as one list without a heading, « Aucun » first for the
 * reducer.
 */
function sheetPickerProps(locale, sets, cameras, modifiers) {
  const lists = {
    telescope: sets.telescopes || [],
    eyepiece: sets.eyepieces || [],
    camera: cameras,
    modifier: modifierChoices(locale, modifiers).filter(
      (profile) => profile.id !== "none",
    ),
  };
  return (category, value) => ({
    locale,
    category,
    value: value ?? null,
    mine: [],
    defaults: lists[category],
    known: lists[category],
    defaultsLabelled: false,
    leading:
      category === "modifier"
        ? [{ id: "none", label: message(locale, "plannerModifierNone") }]
        : [],
  });
}

/**
 * The sheet « Matériel de l'aperçu »: the planner's equipment pickers
 * (`EquipmentPicker`: search, « Marque » and « Type », « Mon matériel »
 * first) on a draft, which « Appliquer » hands to `onApply`; the cross,
 * Escape and a click outside close it without changing anything.
 * `pickers` is the page's `{ props(category, value), define }` — the lists
 * of its own pickers and « Définir mon matériel », at the box's foot — and
 * the way back of that link: `returned` (`{ chosen }`, the pieces it brought
 * back), which the draft takes when the sheet opens or while it is open,
 * then `onReturnedUsed(returned)`.
 */
export function TargetPreviewSheet({
  locale,
  shown,
  profiles,
  pickers = null,
  onApply,
  onClose,
}) {
  const returned = pickers?.returned ?? null;
  const [draft, setDraft] = useState(() =>
    equipmentSelectionWithReturn(shown.equipment, returned?.chosen),
  );
  const onReturnedUsed = pickers?.onReturnedUsed;
  useEffect(() => {
    if (!returned) return;
    setDraft((current) =>
      equipmentSelectionWithReturn(current, returned.chosen),
    );
    onReturnedUsed?.(returned);
    // Each piece brought back is taken once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);
  const [noMatch, setNoMatch] = useState({});
  const sets = targetPreviewProfileSets(profiles, draft);
  const equipment = draft;
  const visual = shown.mode === "visual";
  const telescopes = sets.telescopes || [];
  const telescope = telescopes.find(
    (profile) => profile.id === equipment.telescopeId,
  );
  const connected = Boolean(telescope?.integratedCamera);
  const cameras = profiles?.cameras?.length ? profiles.cameras : cameraProfiles;
  const modifiers = profiles?.modifiers?.length
    ? profiles.modifiers
    : opticalModifiers;
  const pickerProps =
    pickers?.props ?? sheetPickerProps(locale, sets, cameras, modifiers);
  const define = pickers?.define ?? null;
  const reportNoMatch = useMemo(
    () =>
      Object.fromEntries(
        ["telescope", "camera", "eyepiece", "modifier"].map((category) => [
          category,
          (value) =>
            setNoMatch((current) =>
              Boolean(current[category]) === value
                ? current
                : { ...current, [category]: value },
            ),
        ]),
      ),
    [],
  );
  const pickerOf = (category, key) => {
    const props = pickerProps(
      category,
      key === "modifierId" ? (equipment.modifierId ?? "none") : equipment[key],
    );
    return (
      <div
        className="planner-equipment-choice planner-target-preview-choice"
        key={key}
      >
        <span>{equipmentFieldName(locale, category)}</span>
        <EquipmentPicker
          {...props}
          // The sheet keeps one « Définir mon matériel », at its foot.
          define={props.hiddenEmpty ? null : define}
          onNoMatchChange={reportNoMatch[category]}
          onChange={(value) =>
            setDraft(targetPreviewDraftWith(draft, key, value))
          }
        />
      </div>
    );
  };
  const resolved = targetPreviewResolve(draft, shown.mode, profiles);
  const lines = targetPreviewEquipmentLines({
    shown: { equipment: draft, resolved, mode: shown.mode },
    profiles,
    locale,
  });
  const anyNoMatch = Object.values(noMatch).some(Boolean);
  return (
    <WebDialog
      className="planner-target-preview-dialog"
      bodyClassName="planner-target-preview-sheet"
      closeLabel={message(locale, "targetScoreClose")}
      closeOnBackdrop
      title={message(locale, "targetPreviewSheetTitle")}
      onClose={onClose}
      footer={
        <>
          {define?.href && !anyNoMatch ? (
            <DefineEquipmentLink
              locale={locale}
              className="planner-target-preview-define"
              {...define}
            />
          ) : null}
          <button
            type="button"
            className="btn-primary"
            data-testid="preview-apply"
            // A draft without a field gives no preview to keep.
            disabled={!targetPreviewUsable(resolved)}
            onClick={() => onApply(draft)}
          >
            {message(locale, "targetPreviewApply")}
          </button>
        </>
      }
    >
      {pickerOf("telescope", "telescopeId")}
      {visual ? (
        pickerOf("eyepiece", "eyepieceId")
      ) : connected ? (
        <label className="planner-equipment-choice planner-target-preview-choice">
          <span>{message(locale, "plannerCamera")}</span>
          <select
            aria-label={message(locale, "plannerCamera")}
            disabled
            value="integrated"
          >
            <option value="integrated">
              {telescope.integratedCamera.name || telescope.name}
            </option>
          </select>
        </label>
      ) : (
        pickerOf("camera", "cameraId")
      )}
      {/* Behind a connected telescope the reducer is not applied. */}
      {connected ? null : pickerOf("modifier", "modifierId")}
      <TargetPreviewFilterChoice
        locale={locale}
        filters={sets.filters || []}
        visual={visual}
        value={draft.filterIds}
        onChange={(filterIds) =>
          setDraft(targetPreviewDraftWith(draft, "filterIds", filterIds))
        }
      />
      {lines.readout ? (
        <p
          className="planner-target-facts-muted"
          data-testid="preview-sheet-readout"
        >
          {lines.readout}
        </p>
      ) : null}
    </WebDialog>
  );
}

/**
 * The filter of the sheet: « Aucun »,
 * the filters of the planner's sets, and in visual the generic ones the app
 * proposes (« pas dans votre matériel »), which « Essayer » may have put in
 * the draft. One filter: the verdict reads the one in front of the eyepiece.
 */
function TargetPreviewFilterChoice({
  locale,
  filters,
  visual,
  value,
  onChange,
}) {
  const seen = new Set();
  const choices = [...filters, ...(visual ? genericVisualFilters : [])].filter(
    (filter) => {
      const id = String(filter?.id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    },
  );
  const chosen = Array.isArray(value) && value.length ? String(value[0]) : "";
  if (!choices.length && !chosen) return null;
  const label = message(locale, "targetPreviewFilter");
  return (
    <label className="planner-equipment-choice planner-target-preview-choice">
      <span>{label}</span>
      <select
        aria-label={label}
        data-testid="preview-sheet-filter"
        value={chosen}
        onChange={(event) =>
          onChange(event.target.value ? [event.target.value] : [])
        }
      >
        <option value="">{message(locale, "plannerFiltersNone")}</option>
        {choices.map((filter) => (
          <option key={filter.id} value={String(filter.id)}>
            {filter.generic
              ? `${filter.name} · ${message(locale, "visualPairNotOwned")}`
              : filter.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="planner-target-preview-icon is-gold"
    >
      <path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z" />
      <path d="M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

const photoAdviceIcons = {
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />,
  focal: <path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4" />,
  fits: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  aperture: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4l3 8M20 12l-8 3M12 20l-3-8M4 12l8-3" />
    </>
  ),
};

/**
 * « Idéal avec votre matériel »: a sober card under the
 * verdict — not a warning —, the best pair and its status, what is not in
 * « Mon matériel », and « Essayer » (a text button) when the pair holds a
 * piece of « Mon matériel » to try.
 */
function TargetPreviewIdealCard({ locale, ideal, onTry }) {
  return (
    <div
      className="planner-target-preview-ideal"
      data-testid="preview-ideal"
      data-ideal-generic={ideal.generic ? "true" : undefined}
    >
      <SparkleIcon />
      <div>
        <p className="planner-target-facts-muted">{ideal.label}</p>
        <p
          className="planner-target-preview-ideal-line"
          data-testid="preview-ideal-line"
        >
          {ideal.line}
        </p>
        {ideal.detail ? (
          <p
            className="planner-target-facts-muted"
            data-testid="preview-ideal-detail"
          >
            {ideal.detail}
          </p>
        ) : null}
      </div>
      {ideal.trial ? (
        <button
          type="button"
          className="btn-link planner-target-preview-ideal-try"
          data-testid="preview-ideal-try"
          onClick={onTry}
        >
          {message(locale, "targetPreviewIdealTry")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The three lines of the photo tab, each with its icon:
 * the filter, the ideal frame (a check when the focal length chosen is in
 * it) and the focal ratio.
 */
function TargetPreviewPhotoAdviceLines({ advice }) {
  const rows = [
    ["filter", advice.filter, "filter"],
    ["focal", advice.focal, advice.focal?.fits ? "fits" : "focal"],
    ["aperture", advice.aperture, "aperture"],
  ].filter(([, line]) => line);
  return (
    <div
      className="planner-target-preview-photo-advice"
      data-testid="preview-photo-advice"
    >
      {rows.map(([kind, line, icon]) => (
        <div
          className={`planner-target-preview-photo-advice-row is-${icon}`}
          data-testid={`preview-photo-${kind}`}
          key={kind}
        >
          <span className="planner-target-preview-photo-advice-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {photoAdviceIcons[icon]}
            </svg>
          </span>
          <div>
            <p className="planner-target-preview-photo-advice-title">
              {line.title}
            </p>
            {line.detail ? (
              <p className="planner-target-facts-muted">{line.detail}</p>
            ) : null}
            {line.moon ? (
              <p
                className="planner-target-facts-muted"
                data-testid="preview-photo-moon"
              >
                {line.moon}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="planner-target-preview-icon"
    >
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="planner-target-preview-icon"
    >
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

function TuneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="planner-target-preview-sky-tune"
    >
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

/**
 * The sky the disc is seen under (TARGET-STATS-SKY-PLACE-01, boards
 * TSP01-1 and -2): « Ciel du lieu » as one tile-shaped button (the web has
 * no grid of tiles), which opens « Ciel de l'aperçu », and the message under
 * it that says whose sky it is — « Vue depuis Col des Mélèzes », « Ciel de
 * Bortle 4 (SQM 21,3) · valeur saisie pour ce lieu » — or, forced, that it
 * is not the place's, with the way back; or, without a value, that the view
 * takes a dark sky, with « Choisir un ciel ». While the values are read the
 * tile holds the loading icon (never a value that changes under the eyes)
 * and the message waits.
 */
function TargetPreviewSkyBlock({ locale, state, words, onOpen, onRevert }) {
  const { tile, message: note } = words;
  return (
    <div
      className="planner-target-preview-sky"
      data-testid="preview-sky"
      data-sky={tile.tone}
      data-sky-loading={state.loading ? "true" : undefined}
    >
      <button
        type="button"
        className={`planner-target-preview-sky-tile is-${tile.tone}`}
        data-testid="preview-sky-tile"
        aria-haspopup="dialog"
        aria-busy={state.loading ? "true" : undefined}
        onClick={onOpen}
      >
        <span className="planner-target-preview-sky-value">
          {state.loading ? <BrandLoader size={22} /> : tile.value}
        </span>
        <span className="planner-target-preview-sky-title">{tile.title}</span>
        <TuneIcon />
      </button>
      {state.loading ? null : (
        <div
          className={`planner-target-preview-sky-message is-${note.tone}`}
          data-testid="preview-sky-message"
        >
          {note.tone === "forced" ? (
            <AlertIcon />
          ) : note.from ? (
            <PinIcon />
          ) : null}
          <div>
            {note.title ? (
              <p
                className="planner-target-preview-sky-lead"
                data-testid="preview-sky-title"
              >
                {note.title}
              </p>
            ) : null}
            {note.from ? (
              <p
                className="planner-target-preview-sky-lead"
                data-testid="preview-sky-from"
              >
                {note.from}
              </p>
            ) : null}
            {note.how ? (
              <p
                className="planner-target-facts-muted"
                data-testid="preview-sky-how"
              >
                {note.how}
              </p>
            ) : null}
            {note.detail ? (
              <p
                className="planner-target-preview-sky-detail"
                data-testid="preview-sky-detail"
              >
                {note.detail}
              </p>
            ) : null}
            {note.action ? (
              <button
                type="button"
                className="btn-link planner-target-preview-sky-action"
                data-testid={`preview-sky-${note.action.kind}`}
                onClick={note.action.kind === "revert" ? onRevert : onOpen}
              >
                {note.action.label}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * « Ciel de l'aperçu »: the scale of Bortle (nine steps, as the light map
 * draws it) as a control, the class chosen written above it with its typical
 * SQM and its word under it, and what the place holds. « Appliquer » forces
 * the class for this dialog; « Revenir à la valeur du lieu » gives the
 * place's back; the cross changes nothing. Nothing is written in the place.
 */
export function TargetPreviewSkySheet({
  locale,
  state,
  placeName = "",
  onApply,
  onRevert,
  onClose,
}) {
  const [draft, setDraft] = useState(
    state.forced?.bortleClass ?? state.place?.bortleClass ?? null,
  );
  const scale = targetPreviewSkyScale({ locale, bortle: draft });
  const word = targetPreviewSkyWord(locale, draft);
  return (
    <WebDialog
      className="planner-target-preview-dialog"
      bodyClassName="planner-target-preview-sheet"
      closeLabel={message(locale, "targetScoreClose")}
      closeOnBackdrop
      title={message(locale, "targetPreviewSkySheetTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-primary"
            data-testid="preview-sky-apply"
            disabled={draft === null}
            onClick={() => onApply(draft)}
          >
            {message(locale, "targetPreviewApply")}
          </button>
          <button
            type="button"
            className="btn-link"
            data-testid="preview-sky-sheet-revert"
            onClick={onRevert}
          >
            {message(locale, "targetPreviewSkyRevert")}
          </button>
        </>
      }
    >
      <p className="planner-target-facts-muted">
        {message(locale, "targetPreviewSkySheetIntro")}
      </p>
      <BortleScale scale={scale} onSelect={setDraft} valueText={scale.here} />
      {word ? (
        <p
          className="planner-target-preview-sky-word"
          data-testid="preview-sky-word"
        >
          {word}
        </p>
      ) : null}
      <p
        className="planner-target-facts-muted"
        data-testid="preview-sky-place-line"
      >
        {targetPreviewSkyPlaceLine(state, { locale, placeName })}
      </p>
    </WebDialog>
  );
}

const fieldNameKeys = {
  telescope: "plannerTelescope",
  eyepiece: "plannerEyepiece",
  camera: "plannerCamera",
  modifier: "plannerOpticalModifier",
};
const equipmentFieldName = (locale, category) =>
  message(locale, fieldNameKeys[category]);

/**
 * « Prévisualiser » of a constellation: its bare sky, whole (the stars alone,
 * in the frame of its picture), « Traits » laying its lines over them, the
 * field it spans (twice the radius of the circle that holds its lines) and
 * how it is seen. No equipment, no photo or visual mode: a constellation is
 * seen with the naked eye or binoculars.
 */
export function TargetPreviewConstellation({ locale, target }) {
  const [lines, setLines] = useState(false);
  const radius = Number(target?.constellationInfo?.linesRadiusDegrees);
  const field =
    Number.isFinite(radius) && radius > 0
      ? message(locale, "targetPreviewConstellationField").replace(
          "{size}",
          `≈\u00a0${Math.round(2 * radius)}°`,
        )
      : null;
  const nakedEye = message(locale, "targetPreviewConstellationNakedEye");
  return (
    <section
      className="planner-target-facts-section planner-target-preview is-constellation"
      aria-labelledby="target-facts-preview"
      data-testid="facts-preview"
      data-preview-mode="constellation"
    >
      <div className="planner-target-preview-heading">
        <h3 id="target-facts-preview">
          {message(locale, "targetPreviewTitle")}
        </h3>
      </div>
      <div className="planner-target-facts-panel planner-target-preview-panel">
        <div className="planner-target-preview-figure is-constellation">
          <img
            className="planner-target-preview-constellation"
            data-testid="preview-constellation"
            src={skyPictureUrl(target, lines ? "nakedLines" : "naked")}
            alt={nakedEye}
          />
          {/* A selector of one choice (the chip « Traits »), not a button of
              the four levels: off, a light frame and gold words; on, the
              chosen segment's look. */}
          <button
            type="button"
            className={`planner-target-preview-lines${lines ? " is-active" : ""}`}
            data-testid="preview-constellation-lines"
            aria-pressed={lines}
            onClick={() => setLines((value) => !value)}
          >
            {message(locale, "targetPreviewConstellationLines")}
          </button>
        </div>
        <div className="planner-target-preview-text">
          {field ? (
            <p
              className="planner-target-preview-equipment"
              data-testid="preview-constellation-field"
            >
              {field}
            </p>
          ) : null}
          <p
            className="planner-target-facts-muted"
            data-testid="preview-constellation-naked-eye"
          >
            {nakedEye}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The section. `preview` is `{ planEquipment, configuration, profiles, sky }`:
 * the raw equipment (`resolveEquipment`'s input) of the target's plan (only
 * when the target is a plan's, else `null`), the person's default
 * configuration (« Mon matériel », or `null`), the planner's profile sets and
 * the sky shown (`{ sqm, bortleClass }`) — without them, the example
 * equipment — and, from the planner, the lists of its pickers (`pickers`,
 * see `TargetPreviewSheet`) and the eyepieces and filters of « Mon matériel »
 * the visual verdict tries (`visualInventory`, `visualInventoryOf`).
 * `visualMode` is the mode the section opens in without a plan's
 * equipment or a configuration.
 * `date` (the night, `YYYY-MM-DD`) and `timeZone` place the instant a body
 * of the solar system is drawn at when the card has no best time.
 */
export function TargetPreviewBlock({
  locale,
  card,
  preview = null,
  visualMode = false,
  date = null,
  timeZone = null,
}) {
  const target = card?.target || null;
  const planEquipment = preview?.planEquipment || null;
  const configuration = preview?.configuration || null;
  const profiles = preview?.profiles || null;
  const [mode, setMode] = useState(() =>
    targetPreviewOpeningMode({
      planEquipment,
      configuration,
      fallback: visualMode ? "visual" : "imaging",
    }),
  );
  // The browser's preference of each mode, read when the section opens (so
  // the next target's dialog starts from the last « Appliquer »).
  const [preferences, setPreferences] = useState(() =>
    targetPreviewReadPreferences(),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  // The picture that did not come (the cutout), by address: offline, a line
  // says why the sky around the target is missing.
  const [failedImage, setFailedImage] = useState(null);
  // TARGET-STATS-SKY-PLACE-01: the sky the disc is seen under is the place's,
  // unless a class was forced in « Ciel de l'aperçu » — for this dialog only
  // (it is this block's state: gone with the dialog, kept across Photo |
  // Visuel and equipment changes, forgotten when the place changes).
  const skyPlaceName = preview?.skyPlaceName ?? "";
  const skyPlaceKey = preview?.skyPlaceKey ?? skyPlaceName;
  const [forcedSky, setForcedSky] = useState({ key: null, bortle: null });
  const forcedBortle = forcedSky.key === skyPlaceKey ? forcedSky.bortle : null;
  const [skySheetOpen, setSkySheetOpen] = useState(false);
  // The disc whose picture is final (`EyepieceViewImage`'s `onSettled`).
  const [settledDisc, setSettledDisc] = useState(null);
  const skyState = targetPreviewSkyState({
    choice: preview?.skyChoice ?? null,
    sky: preview?.sky ?? null,
    forcedBortle,
    loading: Boolean(preview?.skyLoading),
  });
  const shown = useMemo(
    () =>
      targetPreviewShown({
        preference: preferences[mode] ?? null,
        configuration,
        mode,
        profiles,
      }),
    [preferences, configuration, mode, profiles],
  );
  // "Now", when neither the card nor the night gives the instant: the
  // dialog's opening, so the drawing does not move from one render to the
  // next.
  const [openedAt] = useState(() => new Date());
  const solarSystem = factsIsSolarSystem(card);
  const bodyKey = solarSystem ? targetPreviewBodyKey(target) : null;
  const instant = targetPreviewBodyShown(bodyKey)
    ? targetPreviewInstant({
        card,
        date,
        timeZone,
        now: openedAt,
      }).toISOString()
    : null;
  // The body at one instant for the whole drawing.
  const planet = useMemo(
    () => (instant ? targetPreviewPlanet(bodyKey, instant) : null),
    [bodyKey, instant],
  );
  if (!targetPreviewAvailable(target, solarSystem)) return null;
  // A constellation is seen whole, with the naked eye or binoculars: its
  // bare sky, no equipment.
  if (skyPictureKindOf(target) === "constellation")
    return <TargetPreviewConstellation locale={locale} target={target} />;

  const visual = shown.mode === "visual";
  const lines = targetPreviewEquipmentLines({ shown, profiles, locale });
  const planLine = targetPreviewPlanLine({
    planEquipment,
    shown,
    profiles,
    locale,
  });
  const name = target?.title || target?.designation || "";
  const bodyName = target?.designation || target?.title || "";
  const coordinate = planet
    ? { ra: planet.ra, dec: planet.dec }
    : factsTarget(card)?.coordinate || null;
  const planetImageUrl = planet
    ? targetImageVariant(target, { visualMode: false }).url
    : null;
  let figure = null;
  let caption = null;
  let warning = null;
  let visibility = null;
  let ideal = null;
  let idealFilter = null;
  let idealBadge = null;
  let filterFallback = null;
  let photoAdvice = null;
  let failedKey = null;
  let bodyLines = [];
  // FRAMING-FROM-PREVIEW-01: « Créer un cadrage » (photo only, never a body
  // of the solar system): the editor opens on the target, at the square the
  // picture shows, with the equipment shown.
  let framingSeed = null;
  if (visual) {
    // Never the authorised sketch: the view of the equipment shown.
    const simulated = targetPreviewSimulationTarget(target);
    const image = targetImageVariant(simulated, {
      visualMode: true,
      fallback: hipsPreviewUrl(card),
    });
    const setting = eyepieceViewSetting(shown.resolved, skyState.used);
    // A body of the solar system: the place's sky, no target's light to
    // weigh (its disc is drawn over).
    const bodyView = planet
      ? setting
        ? {
            kind: "simulation",
            render: eyepieceView({ ...setting, target: {} })?.render,
          }
        : { kind: "default", render: defaultEyepieceRender() }
      : null;
    const base = bodyView?.render
      ? bodyView
      : eyepieceViewOrDefault(simulated, setting, {
          visualMode: true,
          imageSource: image.source,
        });
    // VISUAL-SIM-03: the visual verdict of the equipment shown under the sky
    // the disc is drawn under: the disc's render and the badge « Idéal » read
    // it; none without a known sky, nor for a planet.
    const verdict =
      planet || skyState.loading
        ? null
        : targetPreviewVerdict({
            target,
            resolved: shown.resolved,
            sky: skyState.used,
          });
    const visualSky = targetPreviewVisualSky({
      coordinate,
      resolved: shown.resolved,
    });
    const withSky = visualSky ? { ...base, fieldImage: visualSky } : base;
    // A disc of a known setting reads the verdict; the others (plans, Ce
    // soir, no sky known: no verdict) keep the render of the eyepiece rule.
    const view =
      verdict && withSky.kind !== "default"
        ? {
            ...withSky,
            render: eyepieceRenderFromVerdict(verdict, withSky.render),
          }
        : withSky;
    failedKey = view.fieldImage?.path || image.url || "visual";
    const drawn = view.kind !== "default";
    // The disc is final once its picture is made; until then (and while the
    // place's sky is still being read) only the loading icon shows.
    const discKey = `${image.url}|${failedKey}|${view.render.cutoff}|${view.render.gain}`;
    const discReady = !skyState.loading && settledDisc === discKey;
    figure = (
      <div className="planner-target-preview-figure is-visual">
        {skyState.loading ? null : (
          <EyepieceViewImage
            key={discKey}
            src={planet ? null : image.url}
            view={view}
            className="planner-target-preview-disc"
            label={drawn ? eyepieceViewLabel(locale, name) : name}
            fallback={<span className="planner-target-preview-empty" />}
            fieldFirst
            onError={() => setFailedImage(failedKey)}
            onFieldError={() => setFailedImage(failedKey)}
            onSettled={() => setSettledDisc(discKey)}
          />
        )}
        {planet && visualSky && discReady ? (
          <TargetPreviewPlanetOverlay
            planet={planet}
            imageUrl={planetImageUrl}
            fieldDegrees={visualSky.fieldDegrees}
          />
        ) : null}
        {discReady ? null : (
          <TargetPreviewLoading
            locale={locale}
            grey={
              Number.isFinite(view.render.skyFill) ? view.render.skyFill : null
            }
          />
        )}
      </div>
    );
    caption = eyepieceViewCaption(locale);
    // VISUAL-SIM-03: the small badge under the caption, always, for the
    // target alone (a planet has nothing to filter).
    idealFilter = planet ? null : targetPreviewIdealFilter({ target, locale });
    warning = planet
      ? null
      : targetPreviewBiggerText({
          target,
          resolved: shown.resolved,
          locale,
        });
    visibility =
      planet || skyState.loading
        ? null
        : targetPreviewVisibility({
            target,
            resolved: shown.resolved,
            sky: skyState.used,
            forced: Boolean(skyState.forced),
            locale,
            inventory: preview?.visualInventory || null,
          });
    // VS02-A: the best pair under the verdict; the filter the target needs,
    // said again under the equipment, only when no verdict can be given (the
    // sky is not known).
    ideal = visibility
      ? targetPreviewIdeal({
          best: visibility.best,
          advice: visibility.advice,
          eyepieceName:
            targetPreviewProfileSets(profiles, shown.equipment).eyepieces?.find(
              (profile) => profile.id === shown.equipment.eyepieceId,
            )?.name ?? "",
          locale,
        })
      : null;
    idealBadge = verdict
      ? targetPreviewIdealBadge({
          target,
          status: verdict.status,
          filters: targetPreviewPosedFilters(shown.resolved),
          locale,
        })
      : null;
    filterFallback =
      planet || skyState.loading || skyState.used
        ? null
        : visualFilterAdviceText(locale, target);
    bodyLines = planetLines({
      planet,
      name: bodyName,
      fieldDegrees: shown.resolved?.visualFieldDiameterDegrees,
      locale,
      timeZone,
    });
  } else {
    const photo = targetPreviewPhoto({
      target,
      coordinate,
      resolved: shown.resolved,
    });
    if (photo) {
      const thumbnail = planet
        ? null
        : targetImageVariant(target, {
            visualMode: false,
            fallback: hipsPreviewUrl(card),
          });
      failedKey = photo.url || "photo";
      figure = (
        <div className="planner-target-preview-figure is-photo">
          <TargetPreviewPhotoCanvas
            photo={photo}
            thumbnailUrl={thumbnail?.url ?? null}
            label={name}
            locale={locale}
            planet={planet}
            planetImageUrl={planetImageUrl}
            onSurveyError={() => setFailedImage(failedKey)}
          />
        </div>
      );
      caption = message(locale, "targetPreviewPhotoCaption");
      if (!planet && coordinate)
        framingSeed = {
          center: { ra: coordinate.ra, dec: coordinate.dec },
          fovDegrees: photo.fovDegrees,
          equipment: shown.equipment,
          defaultEquipment: shown.sample,
        };
      warning = planet
        ? null
        : targetPreviewMosaicText({
            target,
            resolved: shown.resolved,
            locale,
          });
      // VS02-C, D: the filter, the ideal frame and the focal ratio.
      const photoProfiles = resolveEquipmentProfiles(
        shown.equipment,
        targetPreviewProfileSets(profiles, shown.equipment),
      );
      photoAdvice = planet
        ? null
        : targetPreviewPhotoAdvice({
            target: {
              ...target,
              apparentSizeArcmin:
                targetPreviewSize(target) ?? target?.apparentSizeArcmin,
            },
            resolved: shown.resolved,
            camera: photoProfiles.camera,
            telescopeName: photoProfiles.telescope?.name ?? "",
            // PREVIEW-ADVICE-02: the ideal frame names the sensor it is for.
            integratedCamera: Boolean(
              photoProfiles.telescope?.integratedCamera,
            ),
            cameraOwned: !shown.sample,
            telescopes: preview?.visualInventory?.telescopes || [],
            // The Moon of the night, at the instant
            // the drawing is made for.
            moonIlluminationPercent: targetPreviewMoonPercent(
              targetPreviewInstant({ card, date, timeZone, now: openedAt }),
            ),
            locale,
          });
      bodyLines = planetLines({
        planet,
        name: bodyName,
        fieldDegrees: fieldOfView(shown.resolved)?.width,
        locale,
        timeZone,
      });
    } else {
      // An equipment without a sensor's field: nothing to frame.
      caption = message(locale, "plannerFramingNoFieldTitle");
    }
  }
  const offlineShown =
    failedKey !== null && failedImage === failedKey && offline();
  const keep = (next) => {
    targetPreviewWritePreferences(next);
    setPreferences(next);
  };
  const apply = (draft) => {
    keep(
      targetPreviewApplied({
        preferences,
        mode: shown.mode,
        draft,
        mine: shown.mine,
        profiles,
      }),
    );
    setSheetOpen(false);
  };
  return (
    <section
      className="planner-target-facts-section planner-target-preview"
      aria-labelledby="target-facts-preview"
      data-testid="facts-preview"
      data-preview-mode={shown.mode}
      data-preview-source={shown.source}
    >
      <div className="planner-target-preview-heading">
        <h3 id="target-facts-preview">
          {message(locale, "targetPreviewTitle")}
        </h3>
      </div>
      <div className="planner-target-facts-panel planner-target-preview-panel">
        <div
          className="planner-observation-mode planner-target-preview-mode"
          role="group"
          aria-label={message(locale, "plannerObservationMode")}
        >
          <button
            className={!visual ? "is-active" : ""}
            type="button"
            aria-pressed={!visual}
            onClick={() => setMode("imaging")}
          >
            <ObservationModeIcon mode="imaging" />
            {message(locale, "plannerImaging")}
          </button>
          <button
            className={visual ? "is-active" : ""}
            type="button"
            aria-pressed={visual}
            onClick={() => setMode("visual")}
          >
            <ObservationModeIcon mode="visual" />
            {message(locale, "plannerVisual")}
          </button>
        </div>
        {figure}
        <div className="planner-target-preview-text">
          {caption ? (
            <p className="planner-target-facts-muted">{caption}</p>
          ) : null}
          {idealFilter ? (
            <span
              className="planner-target-preview-pill"
              data-testid="preview-ideal-filter"
              data-filter-family={idealFilter.family ?? "none"}
            >
              {idealFilter.text}
            </span>
          ) : null}
          {bodyLines.map((line) => (
            <p
              className="planner-target-preview-planet-line"
              data-testid="preview-planet-line"
              key={line}
            >
              {line}
            </p>
          ))}
          {visibility ? (
            <div
              className="planner-target-preview-visibility"
              data-testid="preview-visibility"
              data-visibility={visibility.status}
            >
              <AlertIcon />
              <div>
                <p className="planner-target-preview-visibility-title">
                  {visibility.title}
                </p>
                {visibility.limit ? (
                  <p className="planner-target-facts-muted">
                    {visibility.limit}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {ideal ? (
            <TargetPreviewIdealCard
              locale={locale}
              ideal={ideal}
              onTry={() =>
                keep(
                  targetPreviewApplied({
                    preferences,
                    mode: shown.mode,
                    draft: targetPreviewTrialEquipment(
                      shown.equipment,
                      ideal.trial,
                    ),
                    mine: shown.mine,
                    profiles,
                  }),
                )
              }
            />
          ) : null}
          {warning ? (
            <p
              className="planner-target-preview-warning"
              data-testid="preview-warning"
            >
              {warning}
            </p>
          ) : null}
          {offlineShown ? (
            <p
              className="planner-target-preview-warning"
              data-testid="preview-offline"
            >
              {message(locale, "targetPreviewOffline")}
            </p>
          ) : null}
          {lines.name ? (
            <p
              className="planner-target-preview-equipment"
              data-testid="preview-equipment"
            >
              {lines.name}
              {idealBadge ? (
                <>
                  {" "}
                  <span
                    className="planner-target-preview-pill"
                    data-testid="preview-ideal-badge"
                  >
                    <SparkleIcon />
                    {idealBadge.text}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          {lines.readout ? (
            <p
              className="planner-target-facts-muted"
              data-testid="preview-readout"
            >
              {lines.readout}
            </p>
          ) : null}
          {filterFallback ? (
            <p
              className="planner-target-facts-muted"
              data-testid="preview-filter-advice"
            >
              {filterFallback}
            </p>
          ) : null}
          {photoAdvice ? (
            <TargetPreviewPhotoAdviceLines advice={photoAdvice} />
          ) : null}
          {visual ? (
            <TargetPreviewSkyBlock
              locale={locale}
              state={skyState}
              words={targetPreviewSkyWords(skyState, {
                locale,
                placeName: skyPlaceName,
              })}
              onOpen={() => setSkySheetOpen(true)}
              onRevert={() => setForcedSky({ key: skyPlaceKey, bortle: null })}
            />
          ) : null}
          {planLine ? (
            <p
              className="planner-target-facts-muted"
              data-testid="preview-plan-uses"
            >
              {planLine}
            </p>
          ) : null}
          {shown.canRevert ? (
            <button
              type="button"
              className="btn-link planner-target-preview-revert"
              onClick={() =>
                keep(targetPreviewReverted({ preferences, mode: shown.mode }))
              }
            >
              {message(locale, "targetPreviewRevert")}
            </button>
          ) : null}
          {shown.sample ? (
            <p className="planner-target-facts-muted">
              {message(locale, "targetPreviewSampleHint")}
            </p>
          ) : null}
        </div>
        <div className="planner-target-preview-actions">
          {framingSeed && typeof preview?.onCreateFraming === "function" ? (
            <button
              type="button"
              className="btn-secondary planner-target-preview-create"
              data-testid="preview-create-framing"
              onClick={() => preview.onCreateFraming(framingSeed)}
            >
              {message(locale, "targetPreviewCreateFraming")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-tertiary planner-target-preview-change"
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(true)}
          >
            {message(
              locale,
              shown.sample ? "targetPreviewChoose" : "targetPreviewChange",
            )}
          </button>
        </div>
      </div>
      {skySheetOpen ? (
        <TargetPreviewSkySheet
          locale={locale}
          state={skyState}
          placeName={skyPlaceName}
          onApply={(bortle) => {
            setForcedSky({ key: skyPlaceKey, bortle });
            setSkySheetOpen(false);
          }}
          onRevert={() => {
            setForcedSky({ key: skyPlaceKey, bortle: null });
            setSkySheetOpen(false);
          }}
          onClose={() => setSkySheetOpen(false)}
        />
      ) : null}
      {sheetOpen ? (
        <TargetPreviewSheet
          locale={locale}
          shown={shown}
          profiles={profiles}
          pickers={preview?.pickers ?? null}
          onApply={apply}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </section>
  );
}
