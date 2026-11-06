// The acquisition lines of a plan, as the web planner reads and writes them
// ("Prise de vue par cible"). The rule is the service's own
// (`portal/planner/plan-acquisition.js`), re-exported here so that the
// planner and the service never read a plan two ways. The suggestion and the effective value of each field
// (`effectiveAcquisition`) are built on these types.

/**
 * One acquisition line (`$defs/acquisitionLine` of
 * `schemas/api/plan.schema.json`). Every field is optional: an absent one is
 * inherited (the target's line, `item.filter`, the plan's defaults, the
 * suggestion).
 *
 * @typedef {object} AcquisitionLine
 * @property {string | null} [filter] The filter as the person names it, 1 to
 *   40 characters; `null` is "no filter".
 * @property {number} [exposureSeconds] One exposure, in seconds (> 0,
 *   ≤ 86 400).
 * @property {number | null} [gain] The camera's gain or a body's ISO, an
 *   integer; `null` is "the device's own setting".
 * @property {number} [binning] An integer from 1 to 8.
 * @property {number} [frameCount] The number of exposures, an integer ≥ 1.
 */

/**
 * The lines of one target (`items[].acquisition`), or the lines frozen at
 * the launch (`launchedSchedule[].acquisition`): 1 to 8.
 *
 * @typedef {object} PlanItemAcquisition
 * @property {AcquisitionLine[]} lines
 */

/**
 * What the launch froze for one plan item.
 *
 * @typedef {object} LaunchedAcquisition
 * @property {AcquisitionLine[]} lines The effective lines at the launch.
 * @property {string | null} ruleVersion The version of the suggestion rule
 *   that resolved them, `null` when the entry names none.
 */

/**
 * A value a write refuses: its path in the plan, the bound it crossed
 * (`null` for a type) and the message the service answers.
 *
 * @typedef {object} AcquisitionRefusal
 * @property {string} field
 * @property {number | null} limit
 * @property {string} message
 */

export {
  acquisitionLimits,
  acquisitionLineFields,
  acquisitionLineRefusal,
  launchedAcquisitionByItem,
  normalizeAcquisitionLine,
  normalizeAcquisitionLines,
  normalizePlanAcquisition,
  planAcquisitionDefaults,
  planAcquisitionRefusal,
  planItemAcquisitionLines,
} from "portal/planner/plan-acquisition.js";
