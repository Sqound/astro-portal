"use client";

import { useEffect, useState } from "react";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { message } from "portal/i18n.js";
import {
  EQUIPMENT_FIELDS,
  EQUIPMENT_FORM_KINDS,
  equipmentCopyFor,
} from "./equipment-copy.js";
import {
  attachedEquipmentIds,
  builtInFiltersFor,
  canLimitFilter,
  filterFieldsToSave,
  filterOfferedForAll,
  filtersAttachedTo,
  ownFiltersOnlyOf,
  withFilterEquipment,
  withFilterOfferedForAll,
  withOwnFiltersOnly,
} from "./filter-attachment.js";
import {
  equipmentToSave,
  integratedMountKind,
  isSmartTelescope,
  withIntegratedCamera,
  withIntegratedMount,
  withSmartTelescope,
} from "./smart-telescope.js";
import { FINDER_VALUES, finderOf, withFinder } from "./finder.js";
import {
  GUIDE_SCOPE_EXPOSURES,
  guideScopeField,
  guideScopeOf,
  guideScopeToSave,
  guideScopeTubes,
  withGuideScope,
} from "./guide-scope.js";
import {
  binocularsExitPupilMm,
  instrumentKindOf,
} from "portal/equipment/instrument-kind.js";

// EQUIPMENT-INSTRUMENTS-01: the fields of each kind of instrument (a
// telescope keeps the form's own; binoculars their magnification, objective
// and real field; a smartphone, made by the application, its focal length).
const INSTRUMENT_FIELDS = Object.freeze({
  binoculars: ["magnification", "apertureMm", "trueFieldDegrees"],
  smartphone: ["focalLengthMm", "focalRatio"],
});

// The draft with [kind] for an instrument: `planner.kind` and the binoculars
// mark (still written for the readers that predate the kind).
export function withInstrumentKind(draft, kind) {
  const planner = { ...(draft?.planner || {}) };
  if (kind === "binoculars" || kind === "smartphone") planner.kind = kind;
  else if (planner.kind === "binoculars" || planner.kind === "smartphone")
    delete planner.kind;
  return { ...draft, planner, isBinoculars: kind === "binoculars" };
}

// MERIDIAN-LIMIT-02a: a mount that can flip at the meridian (equatorial,
// hybrid, a kind not said -- never alt-az nor a tracker) carries the minutes it
// keeps tracking past it (`planner.meridianLimitMinutes`, 0 to 120; empty:
// not said, nothing is cut). The rule is `mountFlipsAtMeridian` of the
// planner; the portal does not import the planner.
function mountCarriesMeridianLimit(draft) {
  return (
    draft?.type === "mount" &&
    draft.planner?.kind !== "altaz" &&
    draft.planner?.kind !== "tracker"
  );
}

function mountToSave(draft) {
  if (draft?.type !== "mount") return draft;
  const planner = { ...(draft.planner || {}) };
  const raw = planner.meridianLimitMinutes;
  const number =
    raw === "" || raw === null || raw === undefined ? NaN : Number(raw);
  if (!mountCarriesMeridianLimit(draft) || !Number.isFinite(number)) {
    delete planner.meridianLimitMinutes;
  } else {
    planner.meridianLimitMinutes = Math.min(
      120,
      Math.max(0, Math.round(number)),
    );
  }
  return { ...draft, planner };
}

// What is saved of an instrument: a telescope keeps only its own fields'
// values among the binoculars' (and the reverse).
function instrumentToSave(draft) {
  if (draft?.type !== "telescope") return draft;
  const kind = instrumentKindOf(draft);
  const specifications = { ...(draft.specifications || {}) };
  if (kind === "telescope") {
    delete specifications.magnification;
    delete specifications.trueFieldDegrees;
    delete specifications.apparentFieldDegrees;
  }
  return {
    ...withInstrumentKind(draft, kind),
    specifications,
  };
}

const formatNumber = (locale, value, digits = 1) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    value,
  );

const blankEquipment = (type = "telescope") => ({
  type,
  name: "",
  manufacturer: "",
  model: "",
  specifications: {},
  planner: {},
  notes: "",
});

/**
 * The form of one item of equipment, once the administration's « Matériel »
 * form, unchanged in its fields: « Retour à l’inventaire », « Nouveau
 * matériel » or « Fiche matériel », its help line, Type, « Nom affiché »,
 * Fabricant, Modèle, the fields of the kind, « Cet instrument est une paire
 * de jumelles » (a telescope), « Notes privées », « Enregistrer le matériel
 * ». Used by « Mon espace » → « Matériel » and by the administration's
 * « Matériel par défaut »; `onSave(draft)` writes it and answers the saved
 * item, or throws with the words to show.
 */
export function EquipmentEditor({
  locale = "fr",
  selected,
  initialType = "telescope",
  equipment = [],
  onOpenItem = null,
  onAddFilter = null,
  onSave,
  onSaved = () => {},
  onClose,
}) {
  const text = equipmentCopyFor(locale);
  const draftOf = (item) => ({
    ...blankEquipment(initialType),
    ...item,
    specifications: item?.specifications || {},
    planner: item?.planner || {},
  });
  const [draft, setDraft] = useState(() => draftOf(selected));
  // « Télescope intelligent »: unticking hides the built-in sensor and mount
  // without erasing them; only the saved item leaves them out.
  const [smart, setSmart] = useState(() => isSmartTelescope(selected));
  // EQUIPMENT-INSTRUMENTS-01: a telescope, binoculars or a smartphone.
  const instrument =
    draft.type === "telescope" ? instrumentKindOf(draft) : "telescope";
  const phone = instrument === "smartphone";
  const [status, setStatus] = useState("");
  const select = (item) => {
    setDraft(draftOf(item));
    setSmart(isSmartTelescope(item));
    setStatus("");
  };
  useEffect(() => {
    if (selected) select(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, initialType]);
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updateSpecification = (key, value) =>
    setDraft((current) => ({
      ...current,
      specifications: { ...current.specifications, [key]: value },
    }));
  const save = async (event) => {
    event.preventDefault();
    setStatus(text.editor.saving);
    try {
      const saved = await onSave(
        filterFieldsToSave(
          guideScopeToSave(
            instrumentToSave(
              mountToSave(equipmentToSave(draft, smart || phone)),
            ),
          ),
        ),
      );
      select(saved);
      await onSaved(saved);
      setStatus(text.editor.saved);
    } catch (error) {
      setStatus(error?.message || text.editor.failed);
    }
  };
  // A guide scope's optics sit among its own fields, in the application's
  // order (`GuideScopeFields`).
  const fields =
    draft.type === "guide-scope"
      ? []
      : (draft.type === "telescope" && INSTRUMENT_FIELDS[instrument]) ||
        EQUIPMENT_FIELDS[draft.type] ||
        [];
  const phoneFacts = draft.planner?.phone || {};
  const pupil =
    instrument === "binoculars"
      ? binocularsExitPupilMm(
          draft.specifications?.apertureMm,
          draft.specifications?.magnification,
        )
      : null;
  return (
    <form
      className="admin-form admin-editor-form admin-equipment-editor"
      aria-label={draft.id ? text.editor.existing : text.editor.created}
      onSubmit={save}
    >
      <section>
        <button
          type="button"
          className="btn-link admin-back-link"
          onClick={onClose}
        >
          ← {text.editor.back}
        </button>
        <h2>{draft.id ? text.editor.existing : text.editor.created}</h2>
        <p className="admin-help">{text.editor.help}</p>
        <div className="admin-grid">
          <label className="admin-field">
            <span>{text.editor.type}</span>
            <select
              value={draft.type}
              onChange={(event) => update("type", event.target.value)}
            >
              {EQUIPMENT_FORM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {text.kind[kind]}
                </option>
              ))}
            </select>
          </label>
          {draft.type === "telescope" && (
            <label className="admin-field">
              <span>{text.editor.instrument.label}</span>
              <select
                data-testid="equipment-instrument-kind"
                value={instrument}
                disabled={phone}
                onChange={(event) =>
                  setDraft((current) =>
                    withInstrumentKind(current, event.target.value),
                  )
                }
              >
                <option value="telescope">
                  {text.editor.instrument.telescope}
                </option>
                <option value="binoculars">
                  {text.editor.instrument.binoculars}
                </option>
                {phone && (
                  <option value="smartphone">
                    {text.editor.instrument.smartphone}
                  </option>
                )}
              </select>
            </label>
          )}
          <label className="admin-field">
            <span>{text.editor.name}</span>
            <input
              required
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder={text.editor.placeholder}
            />
          </label>
          <label className="admin-field">
            <span>{text.editor.manufacturer}</span>
            <input
              value={draft.manufacturer}
              onChange={(event) => update("manufacturer", event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{text.editor.model}</span>
            <input
              value={draft.model}
              onChange={(event) => update("model", event.target.value)}
            />
          </label>
          {mountCarriesMeridianLimit(draft) && (
            <label className="admin-field admin-field-wide">
              <span>{message(locale, "mountMeridianLimitLabel")}</span>
              <input
                type="number"
                min="0"
                max="120"
                step="1"
                data-equipment-meridian-limit=""
                value={draft.planner?.meridianLimitMinutes ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    planner: {
                      ...current.planner,
                      meridianLimitMinutes: event.target.value,
                    },
                  }))
                }
              />
              <small className="admin-help">
                {message(locale, "mountMeridianLimitHelp")}
              </small>
            </label>
          )}
          {fields.map((key) => (
            <label className="admin-field" key={key}>
              <span>
                {phone && key === "focalRatio"
                  ? text.editor.instrument.fNumber
                  : text.fields[key]}
              </span>
              <input
                value={draft.specifications?.[key] ?? ""}
                onChange={(event) =>
                  updateSpecification(key, event.target.value)
                }
              />
            </label>
          ))}
          {instrument === "binoculars" && (
            <>
              <p
                className="admin-field"
                data-testid="equipment-binoculars-pupil"
              >
                <span>{text.editor.instrument.exitPupil}</span>
                <output>
                  {pupil ? `${formatNumber(locale, pupil)}\u00a0mm` : "—"}
                </output>
              </p>
              <p className="admin-help admin-field-wide">
                {text.editor.instrument.binocularsNote}
              </p>
            </>
          )}
          {phone && (
            <>
              <p className="admin-field" data-testid="equipment-phone-field">
                <span>{text.editor.instrument.phoneField}</span>
                <output>
                  {phoneFacts.fieldWidthDegrees && phoneFacts.fieldHeightDegrees
                    ? `${formatNumber(locale, phoneFacts.fieldWidthDegrees, 0)}° × ${formatNumber(locale, phoneFacts.fieldHeightDegrees, 0)}°`
                    : "—"}
                </output>
              </p>
              <p className="admin-field">
                <span>{text.editor.instrument.phoneImage}</span>
                <output>
                  {phoneFacts.imageWidth && phoneFacts.imageHeight
                    ? `${formatNumber(locale, phoneFacts.imageWidth, 0)} × ${formatNumber(locale, phoneFacts.imageHeight, 0)}\u00a0px`
                    : "—"}
                </output>
              </p>
              <p className="admin-field">
                <span>{text.editor.instrument.phoneExposure}</span>
                <output>
                  {phoneFacts.maxExposureSeconds > 0
                    ? phoneFacts.maxExposureSeconds < 1
                      ? `1/${Math.round(1 / phoneFacts.maxExposureSeconds)}\u00a0s`
                      : `${formatNumber(locale, phoneFacts.maxExposureSeconds)}\u00a0s`
                    : "—"}
                </output>
              </p>
              <p
                className="admin-help admin-field-wide"
                data-testid="equipment-phone-note"
              >
                {text.editor.instrument.phoneNote}
              </p>
            </>
          )}
          {draft.type === "guide-scope" && (
            <GuideScopeFields
              locale={locale}
              text={text}
              draft={draft}
              equipment={equipment}
              onChange={(patch) =>
                setDraft((current) => withGuideScope(current, patch))
              }
              onSpecification={updateSpecification}
            />
          )}
          {/* AXIS-CALIBRATION-FINDER-01 (AXF-3): « Chercheur », as in the
              application's form; a smart telescope has no axis calibration. */}
          {draft.type === "telescope" &&
            instrument === "telescope" &&
            !smart && (
              <FinderField
                text={text.editor.finder}
                value={finderOf(draft)}
                onChange={(value) =>
                  setDraft((current) => withFinder(current, value))
                }
              />
            )}
          {draft.type === "telescope" && instrument === "telescope" && (
            <SmartTelescopeFields
              text={text.editor.smart}
              draft={draft}
              smart={smart}
              onTick={(ticked) => {
                setSmart(ticked);
                if (ticked) setDraft((current) => withSmartTelescope(current));
              }}
              onCamera={(key, value) =>
                setDraft((current) => withIntegratedCamera(current, key, value))
              }
              onMount={(kind) =>
                setDraft((current) => withIntegratedMount(current, kind))
              }
            />
          )}
          {draft.type === "filter" && (
            <FilterOfferFields
              locale={locale}
              draft={draft}
              equipment={equipment}
              onOffer={(forAll) =>
                setDraft((current) => withFilterOfferedForAll(current, forAll))
              }
              onEquipment={(id, ticked) =>
                setDraft((current) => withFilterEquipment(current, id, ticked))
              }
            />
          )}
          {((draft.type === "telescope" && instrument === "telescope") ||
            draft.type === "camera") && (
            <EquipmentFiltersSection
              locale={locale}
              draft={draft}
              equipment={equipment}
              onOwnOnly={(value) =>
                setDraft((current) => withOwnFiltersOnly(current, value))
              }
              onOpenItem={onOpenItem}
              onAddFilter={onAddFilter}
            />
          )}
          <label className="admin-field admin-field-wide">
            <span>{text.editor.notes}</span>
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
        </div>
      </section>
      <footer className="admin-actions">
        <p role="status">{status}</p>
        <button className="btn-primary" type="submit">
          {text.editor.save}
        </button>
      </footer>
    </form>
  );
}

/**
 * The guide scope's fields, in the order of the application's form: « Caméra du télescope » (the server, then where the camera sits and the tube; the
 * address, port and device stay on the phone), « Optique et capteur »
 * (the form's optics, the camera, its pixel and sensor, the computed field),
 * « Méthode de réglage » (the two cards, the last alignment read-only, it
 * comes from the phone) and « Avancé » (exposure, binning, gain).
 */
function GuideScopeFields({
  locale,
  text,
  draft,
  equipment,
  onChange,
  onSpecification,
}) {
  const words = text.editor.guideScope;
  const guide = guideScopeOf(draft);
  const tubes = guideScopeTubes(equipment);
  const field = guideScopeField(draft.specifications?.focalLengthMm, {
    pixelSizeUm: guide.camera.pixelSizeUm,
    widthPx: guide.camera.widthPx,
    heightPx: guide.camera.heightPx,
  });
  const tenth = (value) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  const last = guide.lastAdjustment;
  const when = last?.at ? new Date(last.at) : null;
  const offset = last?.offset;
  const choice = (name, value, current, label, onPick, testId) => (
    <label key={value} className={current === value ? "is-active" : undefined}>
      <input
        type="radio"
        name={name}
        value={String(value)}
        checked={current === value}
        data-testid={testId}
        onChange={() => onPick(value)}
      />
      <span>{label}</span>
    </label>
  );
  const segments = (name, label, current, items, onPick) => (
    <fieldset className="admin-field-wide equipment-finder">
      <legend>{label}</legend>
      <div
        className="equipment-smart-mount equipment-finder-choice"
        data-choices={items.length}
        role="radiogroup"
        aria-label={label}
      >
        {items.map(([value, itemLabel]) =>
          choice(
            name,
            value,
            current,
            itemLabel,
            onPick,
            `guide-scope-${name}-${value}`,
          ),
        )}
      </div>
    </fieldset>
  );
  const input = (key, label, value, onInput, extra = {}) => (
    <label className="admin-field" key={key}>
      <span>{label}</span>
      <input
        data-testid={`guide-scope-${key}`}
        value={value}
        onChange={(event) => onInput(event.target.value)}
        {...extra}
      />
    </label>
  );
  const camera = (key) => (value) => onChange({ camera: { [key]: value } });
  return (
    <>
      <h3 className="admin-field-wide equipment-guide-title">
        {words.cameraSection}
      </h3>
      {segments(
        "protocol",
        words.server,
        guide.protocol,
        [
          ["alpaca", "Alpaca"],
          ["indi", "INDI"],
        ],
        (value) => onChange({ protocol: value }),
      )}
      {segments(
        "placement",
        words.placement,
        guide.placement,
        [
          ["guide", words.placementGuide],
          ["main", words.placementMain],
        ],
        (value) => onChange({ placement: value }),
      )}
      <label className="admin-field">
        <span>{words.telescope}</span>
        <select
          data-testid="guide-scope-telescope"
          value={guide.telescopeId}
          onChange={(event) => onChange({ telescopeId: event.target.value })}
        >
          {tubes.map((tube) => (
            <option key={tube.id} value={tube.id}>
              {tube.name}
            </option>
          ))}
          <option value="">{words.noTube}</option>
        </select>
      </label>
      <h3 className="admin-field-wide equipment-guide-title">
        {words.opticsSection}
      </h3>
      {EQUIPMENT_FIELDS["guide-scope"].map((key) => (
        <label className="admin-field" key={key}>
          <span>{text.fields[key]}</span>
          <input
            value={draft.specifications?.[key] ?? ""}
            onChange={(event) => onSpecification(key, event.target.value)}
          />
        </label>
      ))}
      {input("camera", words.cameraName, guide.camera.name, camera("name"), {
        placeholder: "ZWO ASI120MM Mini",
      })}
      {input(
        "pixel",
        words.pixel,
        guide.camera.pixelSizeUm,
        camera("pixelSizeUm"),
        { inputMode: "decimal" },
      )}
      {input(
        "width",
        words.sensorWidth,
        guide.camera.widthPx,
        camera("widthPx"),
        { inputMode: "numeric" },
      )}
      {input(
        "height",
        words.sensorHeight,
        guide.camera.heightPx,
        camera("heightPx"),
        { inputMode: "numeric" },
      )}
      {segments(
        "sensor",
        words.sensor,
        guide.camera.sensor,
        [
          ["mono", words.mono],
          ["colour", words.colour],
        ],
        (value) => onChange({ camera: { sensor: value } }),
      )}
      <p
        className="admin-field admin-field-wide"
        data-testid="guide-scope-field"
      >
        <span>{words.fieldTitle}</span>
        <output>
          {field
            ? words.fieldValue
                .replace("{width}", tenth(field.widthDegrees))
                .replace("{height}", tenth(field.heightDegrees))
                .replace("{scale}", tenth(field.arcsecPerPixel))
            : words.fieldMissing}
        </output>
      </p>
      <h3 className="admin-field-wide equipment-guide-title">
        {words.methodSection}
      </h3>
      <div
        className="admin-field-wide equipment-guide-methods"
        role="radiogroup"
        aria-label={words.methodSection}
      >
        {[
          ["rings", words.ringsTitle, words.ringsBody, words.recommended],
          ["softwareOffset", words.offsetTitle, words.offsetBody, null],
        ].map(([value, title, body, tag]) => (
          <label
            key={value}
            className={`equipment-guide-method${guide.method === value ? " is-active" : ""}`}
          >
            <input
              type="radio"
              name="guide-scope-method"
              value={value}
              checked={guide.method === value}
              data-testid={`guide-scope-method-${value}`}
              onChange={() => onChange({ method: value })}
            />
            <span>
              <strong>{title}</strong>
              {tag ? (
                <small className="admin-equipment-badge">{tag}</small>
              ) : null}
              <small className="account-muted">{body}</small>
            </span>
          </label>
        ))}
      </div>
      <p
        className="admin-help admin-field-wide"
        data-testid="guide-scope-last-adjustment"
      >
        {when && !Number.isNaN(when.getTime())
          ? words.adjusted
              .replace("{star}", last.star || "—")
              .replace(
                "{error}",
                Number.isFinite(Number(last.errorArcmin))
                  ? formatNumber(locale, Number(last.errorArcmin), 1)
                  : "—",
              )
              .replace(
                "{date}",
                new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                }).format(when),
              )
          : words.notAdjusted}
        {offset &&
        Number.isFinite(Number(offset.xDegrees)) &&
        Number.isFinite(Number(offset.yDegrees))
          ? ` · ${words.offsetTitle} ${formatNumber(locale, Number(offset.xDegrees), 2)}° ; ${formatNumber(locale, Number(offset.yDegrees), 2)}°`
          : ""}
        {" — "}
        {words.fromPhone}
      </p>
      <details className="admin-field-wide equipment-guide-advanced">
        <summary>{words.advanced}</summary>
        <div className="admin-grid">
          <label className="admin-field">
            <span>{words.exposure}</span>
            <select
              data-testid="guide-scope-exposure"
              value={guide.exposureSeconds}
              onChange={(event) =>
                onChange({ exposureSeconds: Number(event.target.value) })
              }
            >
              {GUIDE_SCOPE_EXPOSURES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {words.seconds.replace("{seconds}", String(seconds))}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{words.binning}</span>
            <select
              data-testid="guide-scope-binning"
              value={guide.binning}
              onChange={(event) =>
                onChange({ binning: Number(event.target.value) })
              }
            >
              {[1, 2].map((bin) => (
                <option key={bin} value={bin}>
                  {bin} × {bin}
                </option>
              ))}
            </select>
          </label>
          {input(
            "gain",
            words.gain,
            guide.gain,
            (value) => onChange({ gain: value }),
            {
              placeholder: words.gainHint,
              inputMode: "numeric",
            },
          )}
        </div>
      </details>
    </>
  );
}

/**
 * « Chercheur » (AXIS-CALIBRATION-FINDER-01, AXF-3): « Non précisé »,
 * « Aligné sur le tube », « Aucun », the application's segmented control,
 * and the line that says what it is for.
 */
function FinderField({ text, value, onChange }) {
  const labels = {
    "": text.unspecified,
    aligned: text.aligned,
    none: text.none,
  };
  return (
    <fieldset className="admin-field-wide equipment-finder">
      <legend>{text.label}</legend>
      <div
        className="equipment-smart-mount equipment-finder-choice"
        role="radiogroup"
        aria-label={text.label}
      >
        {FINDER_VALUES.map((choice) => (
          <label
            key={choice || "unspecified"}
            className={value === choice ? "is-active" : undefined}
          >
            <input
              type="radio"
              name="telescope-finder"
              value={choice}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            <span>{labels[choice]}</span>
          </label>
        ))}
      </div>
      <p className="admin-help">{text.help}</p>
    </fieldset>
  );
}

/**
 * The box « Télescope intelligent (caméra et monture intégrées) »: unticked,
 * its sentence; ticked, the sentence that says what a plan does with it,
 * « Capteur intégré » (Largeur, Hauteur, Pixels, Nom du capteur) and
 * « Monture intégrée » (Azimutale / Équatoriale, the app's segmented
 * control).
 */
function SmartTelescopeFields({
  text,
  draft,
  smart,
  onTick,
  onCamera,
  onMount,
}) {
  const camera = draft.planner?.integratedCamera || {};
  const kind = integratedMountKind(draft);
  const sensorFields = [
    ["sensorWidthMm", text.width],
    ["sensorHeightMm", text.height],
    ["pixelSizeUm", text.pixels],
  ];
  return (
    <fieldset className="admin-field-wide equipment-smart-telescope">
      <label className="admin-field admin-binary-field">
        <input
          type="checkbox"
          checked={smart}
          onChange={(event) => onTick(event.target.checked)}
        />
        <span>{text.label}</span>
      </label>
      <p className="admin-help">{smart ? text.ticked : text.help}</p>
      {/* SMART-SCOPE-WIFI-01 (Q8): the telescope's Wi-Fi and its key are kept
          on the phone only; said so the absence does not read as a gap. */}
      {smart && (
        <p className="admin-help equipment-smart-on-phone">{text.onPhone}</p>
      )}
      {smart && (
        <>
          <fieldset className="equipment-smart-group">
            <legend>{text.sensor}</legend>
            <div className="admin-grid">
              {sensorFields.map(([key, label]) => (
                <label className="admin-field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    required={key !== "pixelSizeUm"}
                    value={camera[key] ?? ""}
                    onChange={(event) => onCamera(key, event.target.value)}
                  />
                </label>
              ))}
              <label className="admin-field">
                <span>{text.sensorName}</span>
                <input
                  value={camera.name ?? ""}
                  onChange={(event) => onCamera("name", event.target.value)}
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="equipment-smart-group">
            <legend>{text.mount}</legend>
            <div
              className="equipment-smart-mount"
              role="radiogroup"
              aria-label={text.mountType}
            >
              {[
                ["altaz", text.altaz],
                ["equatorial", text.equatorial],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={kind === value ? "is-active" : undefined}
                >
                  <input
                    type="radio"
                    name="integrated-mount"
                    value={value}
                    checked={kind === value}
                    onChange={() => onMount(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </fieldset>
  );
}

/**
 * The switch « Proposé pour tout le matériel » and the list « Matériel » of a
 * filter's form: on, the list is optional and only serves to find the filter in
 * the equipment's own page; off, the filter is offered with the ticked
 * equipment only. Nothing ticked: the switch stays on (disabled) and its line
 * says why.
 */
function FilterOfferFields({ locale, draft, equipment, onOffer, onEquipment }) {
  const forAll = filterOfferedForAll(draft);
  const ticked = attachedEquipmentIds(draft);
  const limitable = canLimitFilter(draft);
  const pieces = equipment.filter(
    (item) =>
      !item.archivedAt && (item.type === "telescope" || item.type === "camera"),
  );
  const kindOf = (item) =>
    item.type === "camera"
      ? message(locale, "filterEquipmentKindCamera")
      : item.planner?.integratedCamera
        ? message(locale, "filterEquipmentKindSmartTelescope")
        : message(locale, "filterEquipmentKindTelescope");
  return (
    <fieldset
      className="admin-field-wide equipment-filter-offer"
      data-filter-offer
    >
      <div className="equipment-offer-row">
        <label className="space-calibration-switch equipment-offer-switch">
          <span>
            <span className="equipment-hide-defaults-title">
              {message(locale, "filterOfferAllTitle")}
            </span>
            <span className="account-muted equipment-hide-defaults-line">
              {forAll
                ? message(locale, "filterOfferAllOn")
                : message(locale, "filterOfferAllOff")}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            data-filter-offer-all
            checked={forAll}
            aria-checked={forAll}
            disabled={forAll && !limitable}
            onChange={(event) => onOffer(event.target.checked)}
          />
          <span className="space-calibration-track" aria-hidden="true">
            <span />
          </span>
        </label>
        <InfoButton
          locale={locale}
          label={message(locale, "filterOfferAllTitle")}
          body={message(locale, "filterOfferAllInfoBody")}
        />
      </div>
      {forAll && !limitable && pieces.length > 0 ? (
        <p className="admin-help" data-filter-offer-needs>
          {message(locale, "filterOfferNeedsEquipment")}
        </p>
      ) : null}
      {pieces.length > 0 ? (
        <>
          <strong className="equipment-offer-heading">
            {message(locale, "filterEquipmentLabel")}
          </strong>
          <ul className="equipment-offer-list">
            {pieces.map((item) => (
              <li key={item.id}>
                <label className="admin-binary-field">
                  <input
                    type="checkbox"
                    data-filter-equipment={item.id}
                    checked={ticked.includes(item.id)}
                    onChange={(event) =>
                      onEquipment(item.id, event.target.checked)
                    }
                  />
                  <span>
                    {item.name}
                    <small className="account-muted"> · {kindOf(item)}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="admin-help">
            {forAll
              ? message(locale, "filterEquipmentOptional")
              : message(locale, "filterEquipmentOnly")}
          </p>
        </>
      ) : null}
    </fieldset>
  );
}

/**
 * The section « Filtres » of a telescope's or a camera's form: the
 * filters attached to it -- a smart telescope's built-in ones first,
 * read-only and tagged « intégré » -- « Ajouter un filtre » (the filter's
 * form opens with this equipment ticked) and the switch « Ne proposer que ses
 * filtres ». A hand-typed telescope has no built-in filters.
 */
function EquipmentFiltersSection({
  locale,
  draft,
  equipment,
  onOwnOnly,
  onOpenItem,
  onAddFilter,
}) {
  const builtIn = draft.type === "telescope" ? builtInFiltersFor(draft) : [];
  const attached = draft.id ? filtersAttachedTo(equipment, draft.id) : [];
  const ownOnly = ownFiltersOnlyOf(draft);
  return (
    <fieldset
      className="admin-field-wide equipment-filters-section"
      data-equipment-filters
    >
      <legend>{message(locale, "equipmentFiltersTitle")}</legend>
      {builtIn.length + attached.length === 0 ? (
        <p className="admin-help" data-equipment-filters-none>
          {message(locale, "equipmentFiltersNone")}
        </p>
      ) : (
        <ul className="equipment-filters-list">
          {builtIn.map((filter) => (
            <li key={filter.id} data-built-in-filter={filter.id}>
              <strong>{filter.name}</strong>
              <small className="admin-equipment-badge">
                {message(locale, "filterTagBuiltIn")}
              </small>
            </li>
          ))}
          {attached.map((filter) => (
            <li key={filter.id} data-attached-filter={filter.id}>
              <strong>{filter.name}</strong>
              <small className="account-muted">
                {filterOfferedForAll(filter)
                  ? message(locale, "filterTagEverywhere")
                  : message(locale, "filterTagHereOnly")}
              </small>
              {onOpenItem ? (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => onOpenItem(filter)}
                >
                  {message(locale, "filtersOwnOnlyEdit")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {draft.id && onAddFilter ? (
        <div className="equipment-filters-add">
          <button
            type="button"
            className="btn-tertiary"
            data-add-filter
            onClick={() => onAddFilter(draft)}
          >
            {message(locale, "filterAddForEquipment")}
          </button>
        </div>
      ) : null}
      <div className="equipment-offer-row">
        <label className="space-calibration-switch equipment-offer-switch">
          <span>
            <span className="equipment-hide-defaults-title">
              {message(locale, "equipmentOwnOnlyTitle")}
            </span>
            <span className="account-muted equipment-hide-defaults-line">
              {ownOnly
                ? message(locale, "equipmentOwnOnlyOn")
                : message(locale, "equipmentOwnOnlyOff")}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            data-own-filters-only
            checked={ownOnly}
            aria-checked={ownOnly}
            onChange={(event) => onOwnOnly(event.target.checked)}
          />
          <span className="space-calibration-track" aria-hidden="true">
            <span />
          </span>
        </label>
        <InfoButton
          locale={locale}
          label={message(locale, "equipmentOwnOnlyTitle")}
          body={message(locale, "equipmentOwnOnlyInfoBody")}
        />
      </div>
    </fieldset>
  );
}
