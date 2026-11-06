"use client";

// The catalogue's card of a target, read for the dialog of a plan target
// and the target's full-screen photo.
import { useEffect, useState } from "react";
import { hasChildrenVersion } from "portal/children-version.js";
import { knowledgeSections } from "portal/knowledge-sections.js";

const hasText = (target) => Boolean(target?.story || target?.storyParagraphs);

/**
 * The catalogue's card of the target in `locale`: the item's frozen target
 * when it carries a description with its page, else the planner's own route.
 * A target that froze a flat description keeps it unless what is read is a
 * published page (the intertitled sections of a tier A target). `skip`: the
 * caller already has the description (nothing is read). `childrenWanted`:
 * the caller shows "Pour les enfants" and has no children's version of its
 * own, so a frozen description is read once more for the children's text the
 * route carries.
 */
export function useTargetKnowledge(
  target,
  locale,
  skip = false,
  childrenWanted = false,
) {
  const described = hasText(target);
  const frozen = Boolean(
    (skip || (described && knowledgeSections(target).length > 0)) &&
    !(childrenWanted && !hasChildrenVersion(target)),
  );
  const id = target?.id ? String(target.id) : null;
  const [knowledge, setKnowledge] = useState(null);
  useEffect(() => {
    setKnowledge(null);
    if (frozen || !id || typeof fetch !== "function") return undefined;
    const controller = new AbortController();
    fetch(
      `/api/planner-targets/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((next) => {
        if (controller.signal.aborted || !next) return;
        if (
          described &&
          knowledgeSections(next).length === 0 &&
          !hasChildrenVersion(next)
        )
          return;
        setKnowledge(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [frozen, described, id, locale]);
  return frozen ? null : knowledge;
}
