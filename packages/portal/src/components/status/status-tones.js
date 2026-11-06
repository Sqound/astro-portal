// The shared palette of states: one tone for each of the
// six states, the same for a plan (masculine) and a session (feminine). The colours are the tokens `--status-<tone>-*` of
// `portal.css` (`packages/astro-theme/tokens.json`, `status`): planned gold,
// to debrief blue, executed / partial / abandoned grey, archived dark grey.
// The word and the icon carry the state; the hue only repeats it.
import { message } from "portal/i18n.js";

export const STATUS_TONES = Object.freeze([
  "planned",
  "toDebrief",
  "executed",
  "partial",
  "abandoned",
  "archived",
]);

/** The tone a state of the Journal (`to_debrief`, `executed`…) is drawn in. */
export const journalStateTone = (state) =>
  ({
    to_debrief: "toDebrief",
    executed: "executed",
    partial: "partial",
    abandoned: "abandoned",
  })[state] ?? null;

/** The words of a tone: the plan's (masculine) or the session's (feminine). */
const PLAN_WORDS = {
  draft: "plannerPlanStatusDraft",
  planned: "plannerPlanStatusPending",
  toDebrief: "plannerPlanStatusToDebrief",
  executed: "plannerPlanStatusExecuted",
  partial: "plannerPlanStatusPartial",
  abandoned: "plannerPlanStatusAbandoned",
  archived: "plannerPlanStatusArchived",
};
const SESSION_WORDS = {
  draft: "plannerPlanStatusDraft",
  planned: "sessionOutcomePlanned",
  toDebrief: "sessionOutcomeToDebrief",
  executed: "sessionOutcomeExecuted",
  partial: "sessionOutcomePartial",
  abandoned: "sessionOutcomeNotExecuted",
  archived: "sessionOutcomeArchived",
};
export const statusWord = (locale, tone, { session = false } = {}) =>
  message(locale, (session ? SESSION_WORDS : PLAN_WORDS)[tone]);

/** The sentence under each tag of the scheme (the same for a plan and a session). */
export const STATUS_SENTENCES = {
  planned: "statusSheetPlanned",
  toDebrief: "statusSheetToDebrief",
  executed: "statusSheetExecuted",
  partial: "statusSheetPartial",
  abandoned: "statusSheetAbandoned",
  archived: "statusSheetArchived",
};
