"use client";

// "Réglages du plan", in its own module so it can be rendered without the
// planner page.
import { validTimeZone } from "astro-core/night-window.js";
import { message } from "portal/i18n.js";
import { planFieldSideLocal, planFieldSideOther } from "../plan-merge.js";
import { normalizeWindTolerance } from "../wind.js";

function time(value, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: validTimeZone(timeZone),
  }).format(new Date(value));
}

// "Réglages du plan": the label of a setting row — the plan forms' own
// words — and the value of one side, as lines.
const planMergeFieldLabelKeys = {
  name: "plannerPlanName",
  date: "plannerDate",
  location: "plannerLocation",
  "equipment.mode": "plannerObservationMode",
  "equipment.telescope": "plannerTelescope",
  "equipment.mount": "plannerMount",
  "equipment.camera": "plannerCamera",
  "equipment.eyepiece": "plannerEyepiece",
  "equipment.modifier": "plannerOpticalModifier",
  "equipment.filters": "plannerFilters",
  "equipment.restrictToEquipment": "plannerEquipmentRestriction",
  "equipment.windTolerance": "plannerWindTitle",
  minAltitude: "plannerMinAltitude",
  moonSeparationMinimum: "plannerMoonSeparation",
  moonSeparationMinimumByFilter: "plannerMoonSeparationByFilter",
  mountSafety: "plannerMountSafety",
  catalogueSelection: "plannerTargetCatalogueSelection",
  darkness: "plannerDarknessTitle",
  nightSpan: "plannerNightSpanTitle",
};

const planMergeCatalogueKeys = {
  all: "plannerTargetCatalogueAllTargets",
  extended: "plannerTargetCatalogueExtended",
  favorites: "plannerTargetCatalogueFavorites",
};

const planMergeWindPresetKeys = {
  light: "plannerWindPresetLight",
  heavy: "plannerWindPresetHeavy",
  custom: "plannerWindPresetCustom",
};

function planMergeFieldLabel(locale, field) {
  const key = planMergeFieldLabelKeys[field];
  return key ? message(locale, key) : field;
}

function planMergeDegrees(value) {
  const number = Number(value);
  return value === "" ||
    value === null ||
    value === undefined ||
    !Number.isFinite(number)
    ? "—"
    : `${Math.round(number * 10) / 10}°`;
}

function planMergeProfileName(profiles, id) {
  const profile = (profiles || []).find(
    (candidate) => String(candidate.id) === String(id),
  );
  if (profile?.name) return profile.name;
  return id === undefined || id === null || id === "" ? "—" : String(id);
}

function planMergeFieldLines(locale, field, values, profiles, timeZone) {
  switch (field) {
    case "name":
      return [String(values.name || "").trim() || "—"];
    case "date": {
      const parsed = values.date ? new Date(`${values.date}T12:00:00Z`) : null;
      return [
        parsed && !Number.isNaN(parsed.getTime())
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(parsed)
          : "—",
      ];
    }
    case "location": {
      const location = values.location;
      if (!location || typeof location !== "object") return ["—"];
      const name = String(location.name || "").trim();
      return [name || `${location.latitude}, ${location.longitude}`];
    }
    case "equipment.mode":
      return [
        message(
          locale,
          values.mode === "visual" ? "plannerVisual" : "plannerImaging",
        ),
      ];
    case "equipment.telescope":
      return [planMergeProfileName(profiles?.telescopes, values.telescopeId)];
    case "equipment.mount":
      return [
        !values.mountId || values.mountId === "none"
          ? message(locale, "plannerMountNone")
          : planMergeProfileName(profiles?.mounts, values.mountId),
      ];
    case "equipment.camera":
      return [planMergeProfileName(profiles?.cameras, values.cameraId)];
    case "equipment.eyepiece":
      return [planMergeProfileName(profiles?.eyepieces, values.eyepieceId)];
    case "equipment.modifier":
      return [
        !values.modifierId || values.modifierId === "none"
          ? message(locale, "plannerModifierNone")
          : planMergeProfileName(profiles?.modifiers, values.modifierId),
      ];
    case "equipment.filters": {
      const names = (Array.isArray(values.filterIds) ? values.filterIds : [])
        .map((id) => planMergeProfileName(profiles?.filters, id))
        .join(" · ");
      return [names || "—"];
    }
    case "equipment.restrictToEquipment":
      return [
        message(
          locale,
          values.restrictToEquipment === true
            ? "plannerEquipmentRestrictionEnabled"
            : "plannerEquipmentRestrictionAll",
        ),
      ];
    case "equipment.windTolerance": {
      const tolerance = normalizeWindTolerance(values.windTolerance);
      return [
        message(
          locale,
          planMergeWindPresetKeys[tolerance.preset] ||
            "plannerWindPresetStandard",
        ),
        `${message(locale, "plannerWindSustained")} ${tolerance.sustainedKmh} km/h`,
        `${message(locale, "plannerWindGusts")} ${tolerance.gustKmh} km/h`,
      ];
    }
    case "minAltitude":
      return [planMergeDegrees(values.minAltitude)];
    case "moonSeparationMinimum":
      return [planMergeDegrees(values.moonSeparationMinimum)];
    case "moonSeparationMinimumByFilter": {
      const entries = Object.entries(
        values.moonSeparationMinimumByFilter || {},
      );
      return entries.length
        ? [
            entries
              .map(([name, value]) => `${name} ${planMergeDegrees(value)}`)
              .join(" · "),
          ]
        : [message(locale, "plannerUseGlobalThreshold")];
    }
    case "mountSafety": {
      const safety = values.mountSafety || {};
      const zenith = Number(safety.zenithAvoidanceDegrees) || 0;
      const hasCable =
        safety.azimuthStart !== "" &&
        safety.azimuthStart !== null &&
        safety.azimuthStart !== undefined &&
        safety.azimuthEnd !== "" &&
        safety.azimuthEnd !== null &&
        safety.azimuthEnd !== undefined;
      const details = [
        zenith > 0 ? planMergeDegrees(zenith) : null,
        hasCable
          ? message(locale, "plannerNightSpanRange")
              .replace("{start}", planMergeDegrees(safety.azimuthStart))
              .replace("{end}", planMergeDegrees(safety.azimuthEnd))
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return [
        message(
          locale,
          safety.enabled
            ? "planMergeFieldsSafetyOn"
            : "planMergeFieldsSafetyOff",
        ),
        ...(details ? [details] : []),
      ];
    }
    case "catalogueSelection":
      return [
        message(
          locale,
          planMergeCatalogueKeys[values.catalogueSelection] ||
            "plannerTargetCatalogueEssential",
        ),
      ];
    case "darkness":
      return [
        message(
          locale,
          values.darkness === "nautical"
            ? "plannerDarknessNautical"
            : values.darkness === "civil"
              ? "plannerDarknessCivil"
              : "plannerAstronomicalNight",
        ),
      ];
    case "nightSpan": {
      const span = values.nightSpan;
      if (span?.mode === "custom") {
        const clock = (iso) => {
          const parsed = iso ? new Date(iso) : null;
          return parsed && !Number.isNaN(parsed.getTime())
            ? time(parsed, locale, timeZone)
            : "—";
        };
        return [
          message(locale, "plannerNightSpanRange")
            .replace("{start}", clock(span.start))
            .replace("{end}", clock(span.end)),
        ];
      }
      return [message(locale, "plannerNightSpanWholeNight")];
    }
    default:
      return [Object.values(values).join(" · ") || "—"];
  }
}

/**
 * "Réglages du plan": one line per setting that differs, this browser's value
 * then the other device's, the chosen one in the chosen look with a ✓; a
 * setting both versions changed is highlighted with no choice, and the closing
 * line holds "Valider" back.
 */
export function PlanMergeFieldsSection({
  busy,
  choices,
  locale,
  onChoose,
  profiles,
  rows,
  timeZone,
}) {
  const mention = (row, side) => {
    if (row.reason === "newer")
      return row.preselected === side
        ? message(locale, "planMergeFieldsNewer")
        : null;
    if (!row.changed.includes(side)) return null;
    return message(
      locale,
      side === planFieldSideLocal
        ? "planMergeFieldsChangedHere"
        : "planMergeFieldsChangedElsewhere",
    );
  };
  // The web writes the wind tolerance on one line ("Standard · vent
  // soutenu 20 km/h · rafales 30 km/h"); German keeps its nouns capitalised.
  const oneLine = (lines) =>
    lines
      .map((line, index) =>
        index === 0 || locale === "de"
          ? line
          : line.charAt(0).toLocaleLowerCase(locale) + line.slice(1),
      )
      .join(" · ");
  const blocked = rows.some((row) => !choices[row.field]);
  return (
    <section
      aria-label={message(locale, "planMergeFieldsTitle")}
      className="planner-merge-fields"
    >
      <h3>{message(locale, "planMergeFieldsTitle")}</h3>
      <div aria-hidden="true" className="planner-merge-fields-head">
        <span />
        <span>{message(locale, "planMergeColumnBrowser")}</span>
        <span>{message(locale, "planMergeFieldsSideOther")}</span>
      </div>
      {rows.map((row) => {
        const label = planMergeFieldLabel(locale, row.field);
        const pending = !choices[row.field];
        return (
          <div
            aria-label={label}
            className={`planner-merge-field${pending ? " is-pending" : ""}`}
            data-field={row.field}
            key={row.field}
            role="radiogroup"
          >
            <p className="planner-merge-field-label">{label}</p>
            {[
              [planFieldSideLocal, row.local, "planMergeColumnBrowser"],
              [planFieldSideOther, row.other, "planMergeFieldsSideOther"],
            ].map(([side, values, sideKey]) => {
              const chosen = choices[row.field] === side;
              const note = mention(row, side);
              return (
                <button
                  aria-checked={chosen}
                  className={`planner-merge-field-option${chosen ? " is-selected" : ""}`}
                  data-side={side}
                  disabled={busy}
                  key={side}
                  onClick={() => onChoose(row.field, side)}
                  role="radio"
                  type="button"
                >
                  <span className="planner-merge-field-side">
                    {message(locale, sideKey)}
                  </span>
                  <span className="planner-merge-field-value">
                    {oneLine(
                      planMergeFieldLines(
                        locale,
                        row.field,
                        values,
                        profiles,
                        timeZone,
                      ),
                    )}
                  </span>
                  {note && (
                    <span className="planner-merge-field-note">{note}</span>
                  )}
                  {chosen && (
                    <span
                      aria-hidden="true"
                      className="planner-merge-field-check"
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      {blocked && (
        <p className="planner-merge-fields-blocked" role="status">
          <span aria-hidden="true">⚠</span>
          <span>{message(locale, "planMergeFieldsChooseAll")}</span>
        </p>
      )}
    </section>
  );
}
