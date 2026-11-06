/**
 * The box « Télescope intelligent (caméra et monture intégrées) » of a
 * telescope's form in « Mon matériel »:
 * ticked, the telescope carries its built-in sensor and mount in its
 * `planner` (`integratedCamera`, `mount`), the shape the common profiles of
 * the connected telescopes already have, and the planners hide the camera
 * and mount choices for it. Unticking hides the fields without erasing what
 * was typed; only the saved item drops them.
 */

/** The two built-in mounts the form offers, with the name the data keeps. */
export const INTEGRATED_MOUNTS = Object.freeze({
  altaz: Object.freeze({ id: "integrated-altaz", name: "Azimutale intégrée" }),
  equatorial: Object.freeze({
    id: "integrated-eq",
    name: "Équatoriale intégrée",
  }),
});

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Whether an item is a telescope that carries a built-in camera. */
export function isSmartTelescope(item) {
  return (
    item?.type === "telescope" && isObject(item?.planner?.integratedCamera)
  );
}

/** « altaz » or « equatorial »: the kind of a draft's built-in mount. */
export function integratedMountKind(draft) {
  return draft?.planner?.mount?.id === INTEGRATED_MOUNTS.equatorial.id
    ? "equatorial"
    : "altaz";
}

const asNumber = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
};

/**
 * The draft with one field of its built-in sensor changed: `name` as typed,
 * the widths, height and pixel size as numbers (an empty field stays empty).
 * The mount is set to « Azimutale intégrée » when the draft had none.
 */
export function withIntegratedCamera(draft, key, value) {
  const planner = isObject(draft?.planner) ? draft.planner : {};
  const camera = isObject(planner.integratedCamera)
    ? planner.integratedCamera
    : {};
  return {
    ...draft,
    planner: {
      ...planner,
      integratedCamera: {
        ...camera,
        [key]: key === "name" ? value : asNumber(value),
      },
      mount: isObject(planner.mount)
        ? planner.mount
        : { ...INTEGRATED_MOUNTS.altaz },
    },
  };
}

/** The draft with its built-in mount set to `kind` (« altaz », « equatorial »). */
export function withIntegratedMount(draft, kind) {
  const planner = isObject(draft?.planner) ? draft.planner : {};
  return {
    ...draft,
    planner: {
      ...planner,
      mount: {
        ...(INTEGRATED_MOUNTS[kind] || INTEGRATED_MOUNTS.altaz),
      },
    },
  };
}

/**
 * Ticking the box: the draft gains an (empty) built-in sensor and the
 * alt-azimuth mount when it has none yet; what was typed before stays.
 */
export function withSmartTelescope(draft) {
  const planner = isObject(draft?.planner) ? draft.planner : {};
  return {
    ...draft,
    planner: {
      ...planner,
      integratedCamera: isObject(planner.integratedCamera)
        ? planner.integratedCamera
        : { name: "", sensorWidthMm: "", sensorHeightMm: "" },
      mount: isObject(planner.mount)
        ? planner.mount
        : { ...INTEGRATED_MOUNTS.altaz },
    },
  };
}

/**
 * The item the form writes: a smart telescope keeps its built-in sensor and
 * mount; anything else (the box unticked, another kind) leaves them out.
 */
export function equipmentToSave(draft, smart) {
  const planner = isObject(draft?.planner) ? draft.planner : {};
  if (smart && draft?.type === "telescope") return { ...draft, planner };
  const rest = { ...planner };
  delete rest.integratedCamera;
  delete rest.mount;
  return { ...draft, planner: rest };
}
