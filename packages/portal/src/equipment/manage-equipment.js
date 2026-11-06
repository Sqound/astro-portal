import {
  configurationWithoutEquipment,
  normalizeDefaultConfiguration,
} from "../planner/default-configuration.js";

// « Mon espace » → « Matériel » and the administration's « Matériel par
// défaut ». Every signed-in person creates, edits, orders and archives
// their own equipment; nothing is deleted (a capture or a plan may name an
// item) and « Archives » brings an item back. The default list is the
// administration's: a space reads it, never writes it. The rules are the
// server's: a write names an item of the space's own list, or it is refused
// as unknown (404), whatever the page shows.

/** The kinds of equipment, in the order the tab « Matériel » lists them. */
export const EQUIPMENT_KINDS = Object.freeze([
  "telescope",
  "camera",
  "eyepiece",
  "lens",
  "mount",
  "guide-scope",
  "filter",
  "controller",
]);

const MAX_BODY_CHARACTERS = 100_000;
const MAX_CONFIGURATION_CHARACTERS = 20_000;

/** A refusal that a route adapter maps to its error envelope. */
export class ManageEquipmentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ManageEquipmentError";
    this.code = code;
    this.status = status;
  }
}

const invalid = (message) =>
  new ManageEquipmentError("invalid_request", message);
const notFound = () =>
  new ManageEquipmentError(
    "equipment_not_found",
    "This equipment is not in the space.",
    404,
  );

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * The item a request carries, checked before the reader sees it: an object
 * of a known kind with a name, its specifications and planner fields as
 * objects, and no more than 100 000 characters in all.
 */
export function equipmentInput(value) {
  if (!isObject(value)) throw invalid("The equipment is a JSON object.");
  if (JSON.stringify(value).length > MAX_BODY_CHARACTERS)
    throw invalid("The equipment is too large.");
  if (!EQUIPMENT_KINDS.includes(value.type))
    throw invalid("The equipment type is not one of the kinds.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 200)
    throw invalid("The equipment name is required (200 characters at most).");
  for (const key of ["specifications", "planner"])
    if (value[key] !== undefined && !isObject(value[key]))
      throw invalid(`${key} is a JSON object.`);
  // A smart telescope's built-in sensor and mount (the box « Télescope
  // intelligent » of « Mon matériel »): objects when they are given.
  for (const key of ["integratedCamera", "mount"])
    if (value.planner?.[key] !== undefined && !isObject(value.planner[key]))
      throw invalid(`planner.${key} is a JSON object.`);
  for (const key of ["manufacturer", "model", "notes"])
    if (
      value[key] !== undefined &&
      value[key] !== null &&
      typeof value[key] !== "string"
    )
      throw invalid(`${key} is a string.`);
  return {
    type: value.type,
    name,
    manufacturer: value.manufacturer || "",
    model: value.model || "",
    isBinoculars: value.isBinoculars === true,
    specifications: value.specifications || {},
    planner: value.planner || {},
    notes: value.notes || "",
  };
}

/** The most items one import may carry (a phone's own list). */
export const MAX_IMPORTED_ITEMS = 200;

const LOCAL_ID = /^[A-Za-z0-9_-]{1,100}$/;

// A value of a characteristic as it compares: a number written as text
// (« 72 », the web form stores what was typed) is that number; an empty text
// is no value at all.
function comparableValue(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    const number = Number(text.replace(",", "."));
    return Number.isFinite(number) ? number : text;
  }
  if (Array.isArray(value)) return value.map(comparableValue);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const inner = comparableValue(value[key]);
      if (inner !== undefined && inner !== null) out[key] = inner;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value === null ? undefined : value;
}

/**
 * What makes two items « the same item » when a phone sends its own list to
 * the space (the rule being « same name and same characteristics »): the
 * kind, the name (trimmed, inner spaces folded, case ignored) and the
 * characteristics — the specifications, the planner fields and the
 * binoculars mark, numbers written as text read as numbers. The maker, the
 * model and the private notes describe an item; they do not make it another
 * one.
 */
export function sameEquipmentKey(item) {
  const name = String(item?.name || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return JSON.stringify([
    item?.type || "",
    name,
    comparableValue(item?.specifications) || {},
    comparableValue(item?.planner) || {},
    item?.isBinoculars === true,
  ]);
}

function importInput(body) {
  if (!Array.isArray(body.items) || body.items.length > MAX_IMPORTED_ITEMS)
    throw invalid(
      `items is the list of the items to send (${MAX_IMPORTED_ITEMS} at most).`,
    );
  return body.items.map((value) => {
    const equipment = equipmentInput(value);
    const localId =
      typeof value.id === "string" && LOCAL_ID.test(value.id) ? value.id : null;
    return { equipment, localId };
  });
}

function reorderInput(body) {
  if (!EQUIPMENT_KINDS.includes(body.type))
    throw invalid("The equipment type is not one of the kinds.");
  if (
    !Array.isArray(body.ids) ||
    body.ids.some((id) => typeof id !== "string" || !id)
  )
    throw invalid("ids is the list of the kind's items, in their new order.");
  return { equipmentType: body.type, equipmentIds: body.ids };
}

// The reader refuses an order that is not exactly the kind's active items.
async function reordered(run) {
  try {
    return await run();
  } catch (error) {
    if (/preference order/i.test(error?.message || ""))
      throw new ManageEquipmentError(
        "invalid_equipment_order",
        "The order names exactly the active items of the kind.",
      );
    throw error;
  }
}

/**
 * The owner's equipment, on the equipment reader of the process
 * (`persistence/equipment-reader.js`).
 */
export function createManageEquipment(reader) {
  async function own(tenantId, equipmentId) {
    const item = await reader.getEquipment(tenantId, equipmentId);
    if (!item) throw notFound();
    return item;
  }

  /** « Ma configuration par défaut » of the space, or null. */
  async function storedConfiguration(tenantId) {
    if (typeof reader.defaultConfiguration !== "function") return null;
    return reader.defaultConfiguration(tenantId);
  }

  async function read({ tenantId }) {
    return {
      equipment: await reader.listEquipment(tenantId, {
        includeArchived: true,
      }),
      defaults: await reader.defaultEquipmentForSpaces(),
      hideDefaultEquipment: await reader.hideDefaultEquipment(tenantId),
      defaultConfiguration:
        (await storedConfiguration(tenantId))?.configuration ?? null,
    };
  }

  /**
   * A phone's own items sent to the space: the items a guest device kept,
   * at its pairing, and every item the phone creates (its queue replays
   * safely). Each one is, in order: the item of the space that already
   * carries its identifier (a write that reached the space before its
   * answer was lost), or an active item of the space with the same name and
   * characteristics ([sameEquipmentKey]), or a new item — under the phone's
   * identifier when no row uses it, a fresh one otherwise. Nothing of the
   * space is changed. Answers, per item, `{ localId, id, created }`.
   */
  async function importItems({ tenantId, userId, items }) {
    const known = new Map();
    for (const item of await reader.listEquipment(tenantId))
      if (!known.has(sameEquipmentKey(item)))
        known.set(sameEquipmentKey(item), item.id);
    const imported = [];
    for (const { equipment, localId } of items) {
      const already = localId
        ? await reader.getEquipment(tenantId, localId)
        : null;
      if (already) {
        imported.push({ localId, id: already.id, created: false });
        continue;
      }
      const key = sameEquipmentKey(equipment);
      if (known.has(key)) {
        imported.push({ localId, id: known.get(key), created: false });
        continue;
      }
      const saved = await reader.saveEquipment({
        tenantId,
        userId,
        equipment: localId ? { ...equipment, id: localId } : equipment,
      });
      known.set(key, saved.id);
      imported.push({ localId, id: saved.id, created: true });
    }
    return imported;
  }

  return {
    read,
    importItems,

    /**
     * What the planners read (`GET /v1/equipment`, `GET /api/equipment`):
     * the space's active items, the active default rows and the option.
     */
    async plannerRead({ tenantId }) {
      return {
        equipment: await reader.listEquipment(tenantId),
        defaults: await reader.defaultEquipmentForSpaces(),
        hideDefaultEquipment: await reader.hideDefaultEquipment(tenantId),
        defaultConfiguration:
          (await storedConfiguration(tenantId))?.configuration ?? null,
      };
    },

    /**
     * « Ma configuration par défaut »:
     * `{ configuration, updatedAt }`, both null when none is set.
     */
    async configuration({ tenantId }) {
      const stored = await storedConfiguration(tenantId);
      return {
        configuration: stored?.configuration ?? null,
        updatedAt: stored?.updatedAt ?? null,
      };
    },

    /**
     * `{ configuration }`: the configuration that replaces the space's — the
     * keys of a plan's equipment it fixes, the others dropped — or `null` to
     * set none. Only « Enregistrer ma configuration » and « Enregistrer comme
     * configuration par défaut » call it: a plan's own equipment never does.
     */
    async saveConfiguration({ tenantId, userId, body }) {
      if (!isObject(body) || !("configuration" in body))
        throw invalid("Send { configuration } (an object, or null).");
      if (body.configuration !== null && !isObject(body.configuration))
        throw invalid("The configuration is a JSON object, or null.");
      if (
        JSON.stringify(body.configuration).length > MAX_CONFIGURATION_CHARACTERS
      )
        throw invalid("The configuration is too large.");
      const configuration =
        body.configuration === null
          ? null
          : normalizeDefaultConfiguration(body.configuration);
      const saved = await reader.setDefaultConfiguration({
        tenantId,
        userId,
        configuration,
      });
      return {
        configuration: saved?.configuration ?? null,
        updatedAt: saved?.updatedAt ?? null,
      };
    },

    /** « Nouveau matériel », « Ajouter »: always a new item. */
    async create({ tenantId, userId, body }) {
      const equipment = equipmentInput(body?.equipment);
      return reader.saveEquipment({ tenantId, userId, equipment });
    },

    /**
     * `{ equipment }` edits an item of the space; `{ action: "restore" }`
     * brings an archived one back (« Réactiver »).
     */
    async update({ tenantId, userId, equipmentId, body }) {
      if (!isObject(body)) throw invalid("The body is a JSON object.");
      const item = await own(tenantId, equipmentId);
      if (body.action === "restore") {
        if (item.archivedAt)
          await reader.restoreEquipment({ tenantId, userId, equipmentId });
        return reader.getEquipment(tenantId, equipmentId);
      }
      if (body.action !== undefined)
        throw invalid("The only action of an item is restore.");
      const equipment = equipmentInput(body.equipment);
      return reader.saveEquipment({
        tenantId,
        userId,
        equipment: { ...equipment, id: item.id },
      });
    },

    /**
     * « Archiver »: the item leaves the lists; « Archives » keeps it. An
     * archived item is no longer seen in the app: where « Ma configuration
     * par défaut » named it, it reads « à choisir ».
     */
    async archive({ tenantId, userId, equipmentId }) {
      const item = await own(tenantId, equipmentId);
      if (!item.archivedAt) {
        await reader.archiveEquipment({ tenantId, userId, equipmentId });
        const stored = await storedConfiguration(tenantId);
        if (stored) {
          const next = configurationWithoutEquipment(
            stored.configuration,
            item.id,
          );
          if (JSON.stringify(next) !== JSON.stringify(stored.configuration))
            await reader.setDefaultConfiguration({
              tenantId,
              userId,
              configuration: next,
            });
        }
      }
      return reader.getEquipment(tenantId, equipmentId);
    },

    /**
     * `{ hideDefaultEquipment }` (« Masquer le matériel par défaut »),
     * `{ action: "reorder", type, ids }` (the order of a kind) or
     * `{ action: "import", items }` (a phone's own list: see
     * [importItems]); then the whole read, and `imported` for an import.
     */
    async change({ tenantId, userId, body }) {
      if (!isObject(body)) throw invalid("The body is a JSON object.");
      if (body.action === "import") {
        const imported = await importItems({
          tenantId,
          userId,
          items: importInput(body),
        });
        return { ...(await read({ tenantId })), imported };
      }
      if (body.action === "reorder")
        await reordered(() =>
          reader.reorderEquipment({ tenantId, userId, ...reorderInput(body) }),
        );
      else if (
        body.action === undefined &&
        typeof body.hideDefaultEquipment === "boolean"
      )
        await reader.setHideDefaultEquipment({
          tenantId,
          userId,
          hidden: body.hideDefaultEquipment,
        });
      else
        throw invalid(
          "Send { hideDefaultEquipment }, { action: 'reorder', type, ids } or { action: 'import', items }.",
        );
      return read({ tenantId });
    },
  };
}

/**
 * The administration's « Matériel par défaut »: the same gestures on the
 * default rows (`/api/admin/default-equipment`).
 */
export function createDefaultEquipmentAdministration(reader) {
  async function exists(equipmentId) {
    const item = await reader.getDefaultEquipment(equipmentId);
    if (!item) throw notFound();
    return item;
  }
  return {
    async list() {
      return reader.listDefaultEquipment({ includeArchived: true });
    },
    /** A new default row, or the edit of one (`equipment.id`). */
    async save({ userId, body }) {
      const equipment = equipmentInput(body?.equipment);
      const id =
        typeof body.equipment.id === "string" ? body.equipment.id : null;
      if (id) await exists(id);
      return reader.saveDefaultEquipment({
        userId,
        equipment: id ? { ...equipment, id } : equipment,
      });
    },
    async archive({ userId, equipmentId }) {
      const item = await exists(equipmentId);
      if (!item.archivedAt)
        await reader.archiveDefaultEquipment({ userId, equipmentId });
      return reader.getDefaultEquipment(equipmentId);
    },
    async restore({ userId, equipmentId }) {
      const item = await exists(equipmentId);
      if (item.archivedAt)
        await reader.restoreDefaultEquipment({ userId, equipmentId });
      return reader.getDefaultEquipment(equipmentId);
    },
    async reorder({ userId, body }) {
      return reordered(() =>
        reader.reorderDefaultEquipment({ userId, ...reorderInput(body) }),
      );
    },
  };
}
