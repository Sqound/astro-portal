// « Ma configuration par défaut »: the mode
// and the equipment that fill every new plan, on the web and on the phone.
// It is fixed and edited on its own (« Mon espace » → « Matériel »);
// changing a plan's equipment never writes it. These rules are pinned by the
// conformance fixtures `default-configuration-*`.

/**
 * The keys of a plan's `equipment` a configuration fixes, in the order of
 * stage 2: the mode, the telescope, the camera or the eyepiece, the reducer
 * or Barlow, the filters, the mount. Nothing else of a plan (its constraints, its view, its wind tolerance, which
 * follows the mount on each device) belongs to it.
 */
export const defaultConfigurationKeys = Object.freeze([
  "mode",
  "telescopeId",
  "cameraId",
  "eyepieceId",
  "eyepieceFocalLengthMm",
  "modifierId",
  "filterIds",
  "mountId",
]);

const PROFILE_KEYS = Object.freeze([
  "telescopeId",
  "cameraId",
  "eyepieceId",
  "modifierId",
  "mountId",
]);

const MAX_ID = 200;
const MAX_FILTERS = 100;

/**
 * What a configuration key reads as when the configuration leaves it out:
 * the telescope, the camera and the eyepiece not chosen yet (`null`,
 * « Choisir… »), no reducer, no filter, no mount.
 */
const EMPTY = Object.freeze({
  mode: "imaging",
  telescopeId: null,
  cameraId: null,
  eyepieceId: null,
  eyepieceFocalLengthMm: "",
  modifierId: "none",
  filterIds: [],
  mountId: "none",
});

const plain = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const copy = (value) => JSON.parse(JSON.stringify(value));
const shortText = (value, limit) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.length > limit ? value.slice(0, limit) : value;
};

/**
 * The configuration a value holds, or `null` when it holds none (not an
 * object). Only [defaultConfigurationKeys] are kept, each in its own shape:
 * the mode `imaging` or `visual`; an identifier a non-empty text of 200
 * characters at most (else left out); the filters a list of distinct identifiers (100 at most). A key the
 * value leaves out stays out: it is « à choisir » (an item archived since,
 * or never chosen). Saving a plan's equipment as the configuration is this
 * function over it.
 */
export function normalizeDefaultConfiguration(value) {
  if (!plain(value)) return null;
  const out = {};
  for (const key of defaultConfigurationKeys) {
    if (!(key in value)) continue;
    const entry = value[key];
    if (key === "mode") {
      out.mode = entry === "visual" ? "visual" : "imaging";
    } else if (PROFILE_KEYS.includes(key)) {
      if (typeof entry === "string" && entry && entry.length <= MAX_ID)
        out[key] = entry;
    } else if (key === "eyepieceFocalLengthMm") {
      out[key] = shortText(entry, 40);
    } else if (key === "filterIds") {
      if (!Array.isArray(entry)) continue;
      const ids = [];
      for (const id of entry)
        if (
          typeof id === "string" &&
          id &&
          id.length <= MAX_ID &&
          !ids.includes(id) &&
          ids.length < MAX_FILTERS
        )
          ids.push(id);
      out.filterIds = ids;
    }
  }
  return out;
}

/**
 * The equipment a new plan starts with. Without a configuration (`null`,
 * not an object): `current`, the rule of before — a new plan takes the
 * equipment of the plan it was made from, and a paired owner's inventory
 * then fills what is not theirs (`newPlanEquipment`). With one: the
 * configuration, each key it leaves out on its empty value (nothing
 * chosen for the telescope, the camera and the eyepiece, no reducer, no
 * filter, no mount); the other keys of `current`
 * (not equipment the configuration fixes) are kept, but never its wind
 * tolerance, which follows the mount on each device.
 */
export function planStartEquipment(current, configuration) {
  const base = plain(current) ? copy(current) : {};
  const fixed = normalizeDefaultConfiguration(configuration);
  if (!fixed) return base;
  const start = {};
  for (const [key, value] of Object.entries(base))
    if (key !== "windTolerance" && !defaultConfigurationKeys.includes(key))
      start[key] = value;
  return { ...start, ...copy(EMPTY), ...copy(fixed) };
}

const text = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const sameProfile = (plan, wanted, idKey) =>
  (plan[idKey] ?? null) === (wanted[idKey] ?? null);

/**
 * What of a plan's equipment differs from the configuration, in the order of
 * stage 2 (« Diffère de ma configuration par défaut : télescope, caméra,
 * monture. »): `mode`, `telescope`, `camera` (a plan in photo) or
 * `eyepiece` (a plan in visual), `modifier`, `filters`, `mount`. An empty
 * list: « Identique à ma configuration par défaut. »; `null`: no
 * configuration. `smartTelescopeIds` names the telescopes whose camera and
 * mount are in the same housing: behind one of them the camera and the mount
 * are the telescope's own and the reducer is not applied, as stage 2 shows
 * them.
 */
export function equipmentConfigurationDifferences(
  equipment,
  configuration,
  smartTelescopeIds = [],
) {
  const fixed = normalizeDefaultConfiguration(configuration);
  if (!fixed) return null;
  const plan = planStartEquipment(
    {},
    normalizeDefaultConfiguration(plain(equipment) ? equipment : {}),
  );
  const wanted = planStartEquipment({}, fixed);
  const smart = new Set(
    (Array.isArray(smartTelescopeIds) ? smartTelescopeIds : []).map(String),
  );
  const smartOf = (selection) =>
    selection.telescopeId != null && smart.has(selection.telescopeId)
      ? `integrated:${selection.telescopeId}`
      : null;
  const planSmart = smartOf(plan);
  const wantedSmart = smartOf(wanted);
  const out = [];
  if (plan.mode !== wanted.mode) out.push("mode");
  if (!sameProfile(plan, wanted, "telescopeId")) out.push("telescope");
  if (plan.mode === "visual") {
    if (
      !sameProfile(plan, wanted, "eyepieceId") ||
      text(plan.eyepieceFocalLengthMm) !== text(wanted.eyepieceFocalLengthMm)
    )
      out.push("eyepiece");
  } else if (planSmart || wantedSmart) {
    if (planSmart !== wantedSmart) out.push("camera");
  } else if (!sameProfile(plan, wanted, "cameraId")) {
    out.push("camera");
  }
  if (planSmart || wantedSmart) {
    const planModifier = planSmart ? "none" : plan.modifierId;
    const wantedModifier = wantedSmart ? "none" : wanted.modifierId;
    if (planModifier !== wantedModifier) out.push("modifier");
  } else if (!sameProfile(plan, wanted, "modifierId")) {
    out.push("modifier");
  }
  const planFilters = [...plan.filterIds].sort();
  const wantedFilters = [...wanted.filterIds].sort();
  if (planFilters.join("\u0000") !== wantedFilters.join("\u0000"))
    out.push("filters");
  if ((planSmart || plan.mountId) !== (wantedSmart || wanted.mountId))
    out.push("mount");
  return out;
}

/**
 * The configuration once an item of « Mon matériel » is archived (J13: an
 * archived item is no longer seen in the app): every place that names it is
 * left out — « à choisir » — and the other choices stay. `null` without a
 * configuration.
 */
export function configurationWithoutEquipment(configuration, equipmentId) {
  const fixed = normalizeDefaultConfiguration(configuration);
  if (!fixed) return null;
  const id = typeof equipmentId === "string" ? equipmentId : "";
  if (!id || id === "none") return fixed;
  const next = {};
  for (const [key, value] of Object.entries(fixed)) {
    if (PROFILE_KEYS.includes(key) && value === id) continue;
    next[key] =
      key === "filterIds" ? value.filter((filterId) => filterId !== id) : value;
  }
  return next;
}
