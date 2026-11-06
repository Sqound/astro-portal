// The words of a target's full-screen photo on the web. Kept apart from the
// component so they are tested without rendering. In this order: the header (the designation
// and the name), the facts as chips (type, magnitude, size, constellation),
// tonight's window ("dans votre plan" for a slot of the plan, else the best
// window), the description of the target's card, then "Sources" with the image
// credit last.
import {
  childrenParagraphs,
  knowledgeInChildrenVersion,
} from "portal/children-version.js";
import { message } from "portal/i18n.js";
import { knowledgeSections } from "portal/knowledge-sections.js";
import { skyCultureArtCredit, skyPictureKindOf } from "portal/sky-pictures.js";
import { targetArcminLabel } from "./target-facts-model.js";
import { tonightTargetNames } from "./tonight-overview.js";
import { fill } from "./wind-section.js";

const text = (value) => {
  const written = value === null || value === undefined ? "" : String(value);
  return written.trim() || null;
};

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Everything the viewer shows. `window` is tonight's window,
 * `{ start, end, maxAltitude, inPlan }` with `start` and `end` already
 * written in the place's clock; `knowledge` the catalogue's card of the
 * target when the caller read it; `credit` the image's credit; `children`
 * "Pour les enfants" is on: the children's paragraphs, when the target
 * has them, take the place of the page's text — its sources stay.
 */
export function targetPhotoViewerWords({
  target = {},
  knowledge = null,
  window = null,
  credit = null,
  children = false,
  locale,
}) {
  const say = (key, values = {}) => fill(message(locale, key), values);
  const card = { ...(target?.knowledge || {}), ...(knowledge || {}) };
  const sky = target?.skyTarget || {};
  // "M42" and "Nébuleuse d’Orion", the name never repeating the
  // designation ("M42 — Nébuleuse d’Orion").
  const { designation, name } = tonightTargetNames({
    designation: target.designation || card.designation,
    title: target.title || card.title,
    name: target.name,
    objects: target.objects,
  });
  const magnitude = [
    target.integratedMagnitude,
    target.magnitude,
    card.magnitude,
  ].find(finite);
  const size = Array.isArray(target.apparentSizeArcmin)
    ? targetArcminLabel(target.apparentSizeArcmin, locale)
    : text(target.apparentSizeLabel) || text(card.apparentSizeLabel) || "";
  const type = text(sky.type) || text(target.type) || text(card.type);
  const skyKind = skyPictureKindOf(target) || skyPictureKindOf(card);
  const constellation =
    text(sky.constellation) ||
    text(target.constellation) ||
    text(card.constellation);
  const chips = [
    type,
    magnitude === undefined
      ? null
      : say("targetPhotoViewerMagnitude", {
          value: new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(magnitude),
        }),
    size || null,
    // A constellation's own name is not repeated as a chip.
    skyKind === "constellation" ? null : constellation,
  ].filter(Boolean);
  const story = (source) =>
    Array.isArray(source?.storyParagraphs)
      ? source.storyParagraphs.filter(Boolean)
      : [source?.story].filter(Boolean);
  const own = story(target);
  const paragraphs = own.length ? own : story(card);
  // The knowledge that carries a published page (intertitled sections), if
  // any: the panel then shows the page, folded, in place of the flat text.
  const page = [target, card].find(
    (source) => knowledgeSections(source).length > 0,
  );
  const kids = [card, target]
    .map((source) => childrenParagraphs(source))
    .find((paragraphs) => paragraphs.length > 0);
  const tonight =
    window?.start && window?.end
      ? [
          finite(window.maxAltitude)
            ? say("targetPhotoViewerWindow", {
                start: window.start,
                end: window.end,
                altitude: Math.round(window.maxAltitude),
              })
            : say("targetPhotoViewerWindowShort", {
                start: window.start,
                end: window.end,
              }),
          window.inPlan ? message(locale, "targetPhotoViewerInPlan") : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
  const shownCredit = text(credit);
  return {
    designation,
    name,
    close: message(locale, "targetPhotoViewerClose"),
    photo: designation
      ? name
        ? say("targetPhotoViewerPhotoNamed", { designation, name })
        : say("targetPhotoViewerPhoto", { target: designation })
      : name || "",
    panel: message(locale, "targetPhotoViewerPanel"),
    chips,
    tonight: tonight
      ? { label: message(locale, "targetPhotoViewerTonight"), line: tonight }
      : null,
    paragraphs: children && kids ? kids : paragraphs,
    page:
      children && kids && page
        ? knowledgeInChildrenVersion({
            ...page,
            childrenSpokenParagraphs: kids,
          })
        : page || null,
    // What "Pour les enfants" needs to know: the children's text, if any.
    childrenKnowledge: kids ? { childrenSpokenParagraphs: kids } : null,
    // A constellation's picture carries its drawing: its author and its
    // licence come last.
    sources:
      skyKind === "constellation"
        ? {
            title: message(locale, "targetPhotoViewerCreditTitle"),
            lines: [skyCultureArtCredit(locale)],
          }
        : shownCredit
          ? {
              title: message(locale, "targetPhotoViewerCreditTitle"),
              lines: [say("targetPhotoViewerCredit", { credit: shownCredit })],
            }
          : null,
  };
}
