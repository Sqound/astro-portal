"use client";

import { useMemo, useState } from "react";
import { message } from "portal/i18n.js";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { equipmentCopyFor } from "portal/components/equipment/equipment-copy.js";
import { normalizeDefaultConfiguration } from "portal/planner/default-configuration.js";
import { useEquipmentPicker } from "./EquipmentPickerContext.js";
import { managePath } from "./manage-copy.js";

/**
 * « Ma configuration par défaut » on the web: a
 * card at the head of « Mon espace » → « Matériel », its rows in the order of
 * the planner's equipment step, and a dialog with the same fields that writes
 * only the configuration, never a plan.
 */

/** The kind of « Mon matériel » each place of a configuration names. */
const PLACE_KIND = Object.freeze({
  telescopeId: "telescope",
  cameraId: "camera",
  eyepieceId: "eyepiece",
  modifierId: "lens",
  mountId: "mount",
  filterIds: "filter",
});

/** `{ mine, defaults }` of one kind: the space's active items, the default rows. */
export function configurationChoices(read, kind) {
  const active = (read?.equipment || []).filter(
    (item) => item.type === kind && !item.archivedAt,
  );
  const defaults = (read?.defaults || []).filter((item) => item.type === kind);
  return { mine: active, defaults };
}

const findItem = (read, kind, id) => {
  if (!id) return null;
  const { mine, defaults } = configurationChoices(read, kind);
  return [...mine, ...defaults].find((item) => item.id === id) || null;
};

const isSmart = (item) =>
  Boolean(
    item?.planner?.integratedCamera &&
    typeof item.planner.integratedCamera === "object",
  );

// The rule of the planner's `integratedMountName` (`telescope-picker.js`),
// over an item of « Mon matériel », whose planner fields are its `planner`.
const integratedMountName = (locale, telescope) => {
  const mount = telescope?.planner?.mount;
  if (mount?.id === "integrated-eq")
    return message(locale, "plannerMountIntegratedEquatorial");
  return !mount ||
    mount.id === "integrated-altaz" ||
    !String(mount.name || "").trim()
    ? message(locale, "plannerMountIntegratedAltaz")
    : mount.name;
};

/**
 * The rows of the card, `[key, label, value, toChoose]` in the order of the
 * planner's equipment step: mode, telescope, camera or eyepiece, reducer, filters, mount. A
 * place the configuration leaves out, or an item no longer in the lists,
 * reads « à choisir ».
 */
export function configurationRows(locale, configuration, read) {
  const text = equipmentCopyFor(locale).configuration;
  const visual = configuration.mode === "visual";
  const named = (key) => {
    if (!(key in configuration)) return [text.toChoose, true];
    const id = configuration[key];
    const item = findItem(read, PLACE_KIND[key], id);
    return item ? [item.name, false] : [text.toChoose, true];
  };
  const telescope = configuration.telescopeId
    ? findItem(read, "telescope", configuration.telescopeId)
    : null;
  const smart = isSmart(telescope);
  const rows = [
    [
      "mode",
      text.mode,
      message(locale, visual ? "plannerVisual" : "plannerImaging"),
      false,
    ],
    ["telescope", message(locale, "plannerTelescope"), ...named("telescopeId")],
  ];
  if (visual)
    rows.push([
      "eyepiece",
      message(locale, "plannerEyepiece"),
      ...named("eyepieceId"),
    ]);
  else if (smart)
    rows.push([
      "camera",
      message(locale, "plannerCamera"),
      message(locale, "plannerIntegratedCamera")
        .replace("{telescope}", telescope.name)
        .replace("{sensor}", telescope.planner.integratedCamera.name || ""),
      false,
    ]);
  else
    rows.push([
      "camera",
      message(locale, "plannerCamera"),
      ...named("cameraId"),
    ]);
  if (!smart)
    rows.push([
      "modifier",
      message(locale, "plannerOpticalModifier"),
      ...(configuration.modifierId === "none"
        ? [message(locale, "plannerModifierNone"), false]
        : named("modifierId")),
    ]);
  if (!Array.isArray(configuration.filterIds))
    rows.push([
      "filters",
      message(locale, "plannerFilters"),
      text.toChoose,
      true,
    ]);
  else {
    const names = configuration.filterIds
      .map((id) => findItem(read, "filter", id)?.name)
      .filter(Boolean);
    rows.push([
      "filters",
      message(locale, "plannerFilters"),
      names.length ? names.join(" · ") : message(locale, "plannerModifierNone"),
      false,
    ]);
  }
  rows.push([
    "mount",
    message(locale, "plannerMount"),
    ...(smart
      ? [integratedMountName(locale, telescope), false]
      : !("mountId" in configuration)
        ? [text.toChoose, true]
        : configuration.mountId === "none"
          ? [text.mountNone, false]
          : named("mountId", "")),
  ]);
  return rows;
}

/** The card at the head of the tab « Matériel ». */
export function DefaultConfigurationCard({ locale = "en", read, onEdit }) {
  const text = equipmentCopyFor(locale).configuration;
  const configuration = normalizeDefaultConfiguration(
    read?.defaultConfiguration,
  );
  return (
    <section
      className="account-panel default-configuration-card"
      aria-label={text.title}
      data-r70="card"
    >
      <div className="default-configuration-heading">
        <div>
          <h2>{text.title}</h2>
          <p className="account-muted">{text.subtitle}</p>
        </div>
        <InfoButton
          locale={locale}
          label={text.info}
          title={text.title}
          body={text.infoBody}
        />
      </div>
      {configuration ? (
        <>
          <dl className="default-configuration-rows">
            {configurationRows(locale, configuration, read).map(
              ([key, label, value, toChoose]) => (
                <div key={key} data-row={key}>
                  <dt>{label}</dt>
                  <dd className={toChoose ? "is-to-choose" : undefined}>
                    {value}
                  </dd>
                </div>
              ),
            )}
          </dl>
          <div className="default-configuration-footer">
            <span className="account-muted">{text.stored}</span>
            <button type="button" className="btn-tertiary" onClick={onEdit}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                <path d="m13.5 6.5 4 4" />
              </svg>
              {text.edit}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="default-configuration-unset">{text.unset}</p>
          <div className="default-configuration-footer is-unset">
            <button type="button" className="btn-primary" onClick={onEdit}>
              {text.choose}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One place of the dialog. With the planner's pickers handed down
 * (`EquipmentPickerContext`): the search, « Marque » and « Type », « Mon
 * matériel » first; else a select of the two groups.
 */
function ChoiceSelect({
  locale,
  id,
  label,
  value,
  onChange,
  kind,
  read,
  extra = null,
  leading = [],
  define = null,
  onNoMatchChange,
}) {
  const copy = equipmentCopyFor(locale);
  const pickers = useEquipmentPicker();
  const { mine, defaults } = useMemo(
    () => configurationChoices(read, kind),
    [read, kind],
  );
  const hidden = Boolean(read?.hideDefaultEquipment);
  if (pickers?.Picker) {
    const { Picker } = pickers;
    return (
      <div className="default-configuration-field" data-place={kind}>
        <span>{label}</span>
        <Picker
          locale={locale}
          kind={kind}
          mine={mine}
          defaults={defaults}
          hidden={hidden}
          value={value ?? null}
          leading={leading}
          label={label}
          define={define}
          onNoMatchChange={onNoMatchChange}
          onChange={onChange}
        />
      </div>
    );
  }
  const shownDefaults = hidden
    ? defaults.filter((item) => item.id === value)
    : defaults;
  return (
    <label className="default-configuration-field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{copy.configuration.toChoose}</option>
        {extra}
        {mine.length ? (
          <optgroup label={copy.own.title}>
            {mine.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {shownDefaults.length ? (
          <optgroup label={copy.platform.title}>
            {shownDefaults.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

/**
 * The fields of the dialog over a draft (pure, for the tests): the mode,
 * then the rows of the equipment step — telescope first, the camera or the
 * eyepiece, the reducer, the filters, the mount; a smart telescope brings its
 * camera and its mount, and takes no reducer. A place left empty reads « à
 * choisir ». With the planner's pickers, « Définir mon matériel » closes on
 * the last field and leads to the list of « Mon matériel » of this tab
 * (`onDefine`: the dialog closes over it); a picker that finds nothing shows
 * its own meanwhile.
 */
export function DefaultConfigurationFields({
  locale = "en",
  read,
  draft,
  onSet,
  onDefine = null,
}) {
  const text = equipmentCopyFor(locale).configuration;
  const pickers = useEquipmentPicker();
  const [noMatch, setNoMatch] = useState({});
  const reportNoMatch = useMemo(
    () =>
      Object.fromEntries(
        ["telescope", "camera", "eyepiece", "lens", "mount"].map((kind) => [
          kind,
          (value) =>
            setNoMatch((current) =>
              Boolean(current[kind]) === value
                ? current
                : { ...current, [kind]: value },
            ),
        ]),
      ),
    [],
  );
  const define = pickers?.DefineLink
    ? {
        href: managePath(locale, "equipment"),
        onNavigate: (event) => {
          if (!onDefine) return;
          event?.preventDefault();
          onDefine();
        },
      }
    : null;
  const placeProps = (kind) => ({
    define,
    onNoMatchChange: reportNoMatch[kind],
  });
  const visual = draft.mode === "visual";
  const telescope = draft.telescopeId
    ? findItem(read, "telescope", draft.telescopeId)
    : null;
  const smart = isSmart(telescope);
  const selectedFilters = Array.isArray(draft.filterIds) ? draft.filterIds : [];
  const filters = configurationChoices(read, "filter");
  const filterItems = [
    ...filters.mine,
    ...(read?.hideDefaultEquipment
      ? filters.defaults.filter((item) => selectedFilters.includes(item.id))
      : filters.defaults),
  ];
  const toggleFilter = (id) =>
    onSet(
      "filterIds",
      selectedFilters.includes(id)
        ? selectedFilters.filter((one) => one !== id)
        : [...selectedFilters, id],
    );
  return (
    <div className="default-configuration-fields">
      <div
        className="default-configuration-mode"
        role="group"
        aria-label={text.mode}
      >
        {["imaging", "visual"].map((mode) => (
          <button
            key={mode}
            type="button"
            className={draft.mode === mode ? "is-active" : ""}
            aria-pressed={draft.mode === mode}
            onClick={() => onSet("mode", mode)}
          >
            {message(
              locale,
              mode === "visual" ? "plannerVisual" : "plannerImaging",
            )}
          </button>
        ))}
      </div>
      <ChoiceSelect
        locale={locale}
        id="default-configuration-telescope"
        label={message(locale, "plannerTelescope")}
        kind="telescope"
        read={read}
        {...placeProps("telescope")}
        value={draft.telescopeId}
        onChange={(value) => onSet("telescopeId", value)}
      />
      {visual ? (
        <ChoiceSelect
          locale={locale}
          id="default-configuration-eyepiece"
          label={message(locale, "plannerEyepiece")}
          kind="eyepiece"
          read={read}
          {...placeProps("eyepiece")}
          value={draft.eyepieceId}
          onChange={(value) => onSet("eyepieceId", value)}
        />
      ) : smart ? (
        <p className="default-configuration-integrated">
          <span>{message(locale, "plannerCamera")}</span>
          {message(locale, "plannerIntegratedCamera")
            .replace("{telescope}", telescope.name)
            .replace("{sensor}", telescope.planner.integratedCamera.name || "")}
        </p>
      ) : (
        <ChoiceSelect
          locale={locale}
          id="default-configuration-camera"
          label={message(locale, "plannerCamera")}
          kind="camera"
          read={read}
          {...placeProps("camera")}
          value={draft.cameraId}
          onChange={(value) => onSet("cameraId", value)}
        />
      )}
      {smart ? null : (
        <ChoiceSelect
          locale={locale}
          id="default-configuration-modifier"
          label={message(locale, "plannerOpticalModifier")}
          kind="lens"
          read={read}
          {...placeProps("lens")}
          value={draft.modifierId}
          extra={
            <option value="none">
              {message(locale, "plannerModifierNone")}
            </option>
          }
          leading={[
            { id: "none", label: message(locale, "plannerModifierNone") },
          ]}
          onChange={(value) => onSet("modifierId", value)}
        />
      )}
      <fieldset className="default-configuration-filters">
        <legend>{message(locale, "plannerFilters")}</legend>
        {filterItems.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selectedFilters.includes(item.id)}
              onChange={() => toggleFilter(item.id)}
            />
            <span>{item.name}</span>
          </label>
        ))}
      </fieldset>
      {smart ? (
        <p className="default-configuration-integrated">
          <span>{message(locale, "plannerMount")}</span>
          {integratedMountName(locale, telescope)}
        </p>
      ) : (
        <ChoiceSelect
          locale={locale}
          id="default-configuration-mount"
          label={message(locale, "plannerMount")}
          kind="mount"
          read={read}
          {...placeProps("mount")}
          value={draft.mountId}
          extra={<option value="none">{text.mountNone}</option>}
          leading={[{ id: "none", label: text.mountNone }]}
          onChange={(value) => onSet("mountId", value)}
        />
      )}
      {define && !Object.values(noMatch).some(Boolean) ? (
        <pickers.DefineLink locale={locale} {...define} />
      ) : null}
    </div>
  );
}

/**
 * The dialog's draft once `key` takes `value`: « Aucun choix » (`null`) and
 * the empty option take the place back to « à choisir » — the key leaves the
 * configuration, as one never chosen.
 */
export function configurationDraftWith(draft, key, value) {
  const next = { ...draft };
  if (value === "" || value === undefined || value === null) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * « Modifier ma configuration » / « Choisir mon matériel par défaut »: the
 * fields over a draft of the dialog's own, « Annuler » (link) / « Enregistrer
 * ma configuration » (primary). Without a configuration it starts empty but
 * for the mode (board state 4).
 */
export function DefaultConfigurationDialog({
  locale = "en",
  read,
  busy = false,
  failed = false,
  onCancel,
  onSave,
}) {
  const copy = equipmentCopyFor(locale);
  const text = copy.configuration;
  const [draft, setDraft] = useState(
    () =>
      normalizeDefaultConfiguration(read?.defaultConfiguration) || {
        mode: "imaging",
      },
  );
  const onSet = (key, value) =>
    setDraft((current) => configurationDraftWith(current, key, value));
  return (
    <WebDialog
      className="default-configuration-dialog"
      closeLabel={copy.cancel}
      closeDisabled={busy}
      onClose={onCancel}
      title={text.title}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={onCancel}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onSave(normalizeDefaultConfiguration(draft))}
          >
            {busy ? text.saving : text.save}
          </button>
        </>
      }
    >
      <p className="account-muted">{text.infoBody}</p>
      {failed ? (
        <p className="equipment-failure" role="alert">
          {text.failed}
        </p>
      ) : null}
      <DefaultConfigurationFields
        locale={locale}
        read={read}
        draft={draft}
        onSet={onSet}
        onDefine={busy ? null : onCancel}
      />
    </WebDialog>
  );
}
