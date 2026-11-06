/**
 * The verdict on the automatic check, which this service applies: **REDUCED**.
 * The rule of the check answers `other` for a painted image only (a
 * screenshot, a document, a drawing); a person is held for the team as
 * `undetermined` (reason `person_detected`), like any image that is neither
 * the sky nor a landscape. So the private side stays with the figures only:
 *
 * - a result `other` is stored (`captures.auto_check`) and counted for the
 *   administrator, who reads the rows;
 * - a private capture answered `other` gets **no notice, no message and no
 *   lifting of its protection** — none of them is built;
 * - for its owner, such a capture reads as `undetermined`: « Publique » asks
 *   for a verification, as for any capture the check could not recognise.
 *
 * Under a verdict GO (a model, or a rule that draws the line), a later
 * change builds the notice of 14 days and its message, sets
 * `protection_notice_at` when the check answers `other`, and turns
 * `OTHER_READS_AS_UNDETERMINED` off: the rule of a capture's state
 * (`capture-state.js`) already draws the notice and its lifting.
 */
export const SKY_CHECK_VERDICT = "REDUCED";

/**
 * Whether a capture answered `other`, whose owner was never given the
 * notice (`protection_notice_at` null), reads as `undetermined` for its
 * owner.
 */
export const OTHER_READS_AS_UNDETERMINED = SKY_CHECK_VERDICT !== "GO";
