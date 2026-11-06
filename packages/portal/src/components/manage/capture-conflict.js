import {
  conflictLineCells,
  equipmentName,
  nightLine,
  shortened,
} from "./CaptureMetadata.js";

/**
 * What the page says when the service refuses a write with
 * `409 capture_conflict` (« A capture written by two hands »): the capture is
 * written field by field against its `revision`, by the web and by the devices,
 * and the service refuses a write only if the field it writes changed after the
 * revision the page read. The page then
 *
 * - takes the capture as it is now (the answer carries it),
 * - keeps the editor of the field open with what the person typed,
 * - says which field changed on another device (`captureEditConflict`), shows
 *   the two values (`captureEditYours`, `captureEditCurrent`) and asks which
 *  to keep (« Garder ma version » sends the entry again against the
 *   new revision, « Garder la version actuelle » closes the editor and writes
 *   nothing),
 * - leaves every other entry as it was.
 *
 * A pure module: the page reads these functions, the tests read them without
 * rendering.
 */

/** The editor a service field belongs to (`editingField`), or its own name. */
export function conflictKeyOf(field, line = null) {
  if (field === "acquisition" && line) return `line:${line}`;
  if (field === "sessionId") return "night";
  return field;
}

/** The name of a field, as the page names it on its own row. */
export function conflictLabel({ meta, copy, field, capture, line = null }) {
  if (field === "acquisition" && line) {
    const found = capture?.metadata?.acquisition?.lines?.find(
      (entry) => entry.id === line,
    );
    return found ? found.filter || meta.noFilter : meta.acquisitionZone;
  }
  return (
    {
      title: meta.titleLabel,
      description: meta.descriptionZone,
      notes: meta.notesZone,
      calibration: meta.calibrationLabel,
      "processing.software": meta.softwareLabel,
      "processing.steps": meta.stepsLabel,
      sensor: meta.sensorLabel,
      "equipment.telescopeId": meta.telescope,
      "equipment.cameraId": meta.camera,
      "equipment.mountId": meta.mount,
      "equipment.filterIds": meta.filter,
      sessionId: meta.nightLabel,
      targetIds: copy.targetZone,
      tags: copy.tags,
      stage: copy.stateZone,
      visibility: copy.makePublic,
      acquisition: meta.acquisitionZone,
    }[field] ?? field
  );
}

/** What the field holds now, in a line (or `null` when it holds nothing). */
export function conflictCurrent({ meta, locale, field, capture, line = null }) {
  const metadata = capture?.metadata;
  if (!metadata && field !== "tags") return null;
  let text = null;
  switch (field) {
    case "title":
    case "description":
    case "notes":
    case "calibration":
      text = metadata[field]?.value ?? null;
      break;
    case "processing.software":
      text = metadata.processing?.software?.value ?? null;
      break;
    case "processing.steps":
      text = metadata.processing?.steps?.value ?? null;
      break;
    case "sensor": {
      const value = metadata.sensor?.value;
      text = value
        ? meta.sensorValue(
            value.temperatureC === null
              ? null
              : String(value.temperatureC).replace("-", "−"),
            value.binning,
          )
        : null;
      break;
    }
    case "equipment.telescopeId":
    case "equipment.cameraId":
    case "equipment.mountId": {
      const role = field.slice("equipment.".length, -2);
      const value = metadata.equipment?.[role]?.value;
      text = equipmentName(meta, value, {
        locale,
        telescope: metadata.equipment?.telescope?.value,
      });
      break;
    }
    case "equipment.filterIds":
      text =
        (metadata.equipment?.filters?.value ?? [])
          .map((entry) => equipmentName(meta, entry, { locale }))
          .filter(Boolean)
          .join(", ") || null;
      break;
    case "sessionId":
      text = nightLine(meta, metadata.night, locale);
      break;
    case "tags":
      text = (capture?.tags ?? []).join(", ") || null;
      break;
    case "acquisition": {
      const found = line
        ? metadata.acquisition?.lines?.find((entry) => entry.id === line)
        : null;
      text = found
        ? `${found.filter || meta.noFilter} · ${meta.framesTimes(found.frameCount, found.exposureSeconds)}`
        : null;
      break;
    }
    default:
      text = null;
  }
  return text ? shortened(text) : null;
}

/** The line the conflict is about, as the capture holds it now. */
function conflictLine(capture, line) {
  return line
    ? (capture?.metadata?.acquisition?.lines?.find(
        (entry) => entry.id === line,
      ) ?? null)
    : null;
}

/**
 * Whether the current value is Astro Sync's: the contract names the origin
 * of a value (`source`, a line's `origin`) but not the device that wrote
 * it, so only « Astro Sync, not corrected by the owner » can be said.
 */
export function conflictFromSync({ field, capture, line = null }) {
  const metadata = capture?.metadata;
  if (!metadata) return false;
  if (field === "acquisition") {
    const found = conflictLine(capture, line);
    return found
      ? found.origin === "astro-sync" && !found.edited
      : metadata.acquisition?.source === "astro-sync" &&
          !metadata.acquisition?.edited;
  }
  const entry = {
    title: metadata.title,
    description: metadata.description,
    notes: metadata.notes,
    calibration: metadata.calibration,
    "processing.software": metadata.processing?.software,
    "processing.steps": metadata.processing?.steps,
    sensor: metadata.sensor,
    "equipment.filterIds": metadata.equipment?.filters,
    "equipment.telescopeId": metadata.equipment?.telescope,
    "equipment.cameraId": metadata.equipment?.camera,
    "equipment.mountId": metadata.equipment?.mount,
  }[field];
  return entry?.source === "astro-sync" && !entry?.edited;
}

/**
 * The three cells (filter, poses, time) of the line a conflict is about, as
 * it stands now: for the side-by-side comparison; `null` for anything else.
 */
export function conflictCurrentLine({ meta, locale, field, capture, line }) {
  const found = field === "acquisition" ? conflictLine(capture, line) : null;
  return found ? conflictLineCells(meta, locale, found) : null;
}

/**
 * The conflict as the page holds it: `key` (the editor it belongs to),
 * `message` (« “Titre de la capture” a changé sur un autre appareil. … »),
 * `current` (what the field holds now), `currentLine` (its three cells when
 * it is a line of « Intégrations »), `fromSync` (the current value is Astro
 * Sync's) and `inline` (an editor of the field
 * is open, or it is the tags' field: the editor says it; else the page does,
 * above the detail).
 */
export function describeConflict({
  meta,
  copy,
  locale,
  field,
  line = null,
  capture,
  editing = null,
}) {
  const key = conflictKeyOf(field, line);
  return {
    key,
    field,
    line,
    message: meta.captureEditConflict(
      conflictLabel({ meta, copy, field, capture, line }),
    ),
    current: conflictCurrent({ meta, locale, field, capture, line }),
    currentLine: conflictCurrentLine({ meta, locale, field, capture, line }),
    fromSync: conflictFromSync({ field, capture, line }),
    inline: field === "tags" || (editing !== null && editing === key),
  };
}
