"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoadingState } from "portal/components/LoadingState.js";
import { message } from "portal/i18n.js";
import { knowledgeSections } from "portal/knowledge-sections.js";
import { floatingPopoverPosition } from "portal/floating-popover.js";
import { hasChildrenVersion, knowledgeShown } from "portal/children-version.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import {
  ChildrenVersionControl,
  useChildrenVersion,
} from "./ChildrenVersionControl.js";

// The "i" of a target and the popover it opens ("À propos de la cible": the
// facts, the observing marks, the story, the sources): the catalogue's card,
// the planner's cards and the link "À propos de la cible" of the dialog
// "Statistiques de la cible" (`forcedOpen`, no trigger of its own). Moved out
// of `PlannerPage.js` so that dialog can open it too.

function decimal(value, locale, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The id whose page the popover reads from the service once opened, or `null`
 * when it already holds what it shows. A target that carries its own
 * `knowledge` names it; a card of the catalogue's listing that carries no text
 * (the pages of tier C are read online, one by one, never in a listing) names
 * its own id — never a text of its own.
 */
export function knowledgeRouteIdOf(target) {
  if (target?.knowledge?.id) return target.knowledge.id;
  const source = target?.knowledge || target;
  return target?.id &&
    !target.plannerSource &&
    !target.knowledge &&
    !knowledgeSections(source).length &&
    !source?.story
    ? String(target.id)
    : null;
}

/** The route that gives the page of a target (`GET /v1/targets/{id}`). */
export const knowledgeRouteUrl = (id, locale) =>
  `/api/v1/targets/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`;

/**
 * The text of a target in its popover: the sections of a published page, each
 * with its intertitle, else the paragraphs of a short generated text.
 */
export function KnowledgeText({ idPrefix, sections, paragraphs }) {
  if (sections.length > 0)
    return sections.map((section, sectionIndex) => (
      <section
        className="planner-target-knowledge-section"
        key={`${idPrefix}-section-${sectionIndex}`}
      >
        {section.heading && <h4>{section.heading}</h4>}
        {section.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>
    ));
  return paragraphs.map((paragraph, index) => (
    <p key={`${idPrefix}-${index}`}>{paragraph}</p>
  ));
}

export function TargetKnowledgeDetails({
  target,
  locale,
  className = "",
  visualMode = false,
  forcedOpen,
  onForcedClose,
  anchorRef = null,
}) {
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);
  const popoverRef = useRef(null);
  // `forcedOpen` (a boolean) hands the popover to the caller: the link "À
  // propos de la cible" of the statistics dialog opens it, from `anchorRef`,
  // and `onForcedClose` hears it closed. Without it the "i" is its own
  // trigger, as ever.
  const forced = typeof forcedOpen === "boolean";
  const [ownOpen, setOwnOpen] = useState(false);
  const open = forced ? forcedOpen : ownOpen;
  const setOpen = (next) => {
    const value = typeof next === "function" ? next(open) : next;
    if (forced) {
      if (!value) onForcedClose?.();
    } else setOwnOpen(value);
  };
  const [popoverStyle, setPopoverStyle] = useState(null);
  const sourceKnowledge = target?.knowledge || target;
  const targetKnowledgeId = knowledgeRouteIdOf(target);
  const [loadedKnowledge, setLoadedKnowledge] = useState(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState("idle");
  // "Pour les enfants" switches the text to the children's version
  // (`childrenSpokenParagraphs`), the sources staying at the bottom.
  const childrenOn = useChildrenVersion();
  const readKnowledge = loadedKnowledge || sourceKnowledge;
  const knowledge = knowledgeShown(readKnowledge, childrenOn);
  // This used to also show on hover/focus (`open || hovered || focused`), which
  // meant a mouse merely passing over the "i" glyph -- or tabbing past it --
  // popped the popover open with no click at all. Click is now the only
  // trigger; `open` alone decides [visible].
  const visible = open;

  useEffect(() => {
    setLoadedKnowledge(null);
    setKnowledgeStatus("idle");
  }, [sourceKnowledge?.story, targetKnowledgeId]);

  useEffect(() => {
    if (
      !visible ||
      !targetKnowledgeId ||
      (sourceKnowledge?.story && hasChildrenVersion(sourceKnowledge)) ||
      loadedKnowledge
    )
      return undefined;
    const controller = new AbortController();
    setKnowledgeStatus("loading");
    fetch(knowledgeRouteUrl(targetKnowledgeId, locale), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("target knowledge unavailable");
        return response.json();
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setLoadedKnowledge(next);
        setKnowledgeStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setKnowledgeStatus("error");
      });
    return () => controller.abort();
  }, [
    loadedKnowledge,
    locale,
    sourceKnowledge?.story,
    targetKnowledgeId,
    visible,
  ]);

  useLayoutEffect(() => {
    if (!visible) {
      setPopoverStyle(null);
      return undefined;
    }
    let frame = null;
    const reposition = () => {
      frame = window.requestAnimationFrame(() => {
        const anchor = (
          summaryRef.current || anchorRef?.current
        )?.getBoundingClientRect();
        const popover = popoverRef.current;
        if (!anchor || !popover) return;
        // `max-height` uses border-box sizing while scrollHeight excludes the
        // borders. Account for them so an exactly fitting panel does not gain
        // a needless one- or two-pixel scrollbar.
        const naturalHeight =
          popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
        const position = floatingPopoverPosition({
          anchor,
          viewport: {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
          },
          popover: { width: 352, height: naturalHeight },
        });
        setPopoverStyle((current) => {
          const next = {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`,
          };
          return Object.entries(next).every(
            ([key, value]) => current?.[key] === value,
          )
            ? current
            : next;
        });
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    const observer = new ResizeObserver(reposition);
    const anchorElement = summaryRef.current || anchorRef?.current;
    if (anchorElement) observer.observe(anchorElement);
    if (popoverRef.current) observer.observe(popoverRef.current);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      observer.disconnect();
    };
  }, [visible]);

  useEffect(() => {
    if (!open) return undefined;
    const dismissWhenOutside = (event) => {
      if (
        !detailsRef.current?.contains(event.target) &&
        !anchorRef?.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissWhenOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissWhenOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  // Opened from the dialog's link, the popover takes the focus (the cross)
  // and gives it back to the link: Escape then closes it alone.
  useEffect(() => {
    if (!forced || !open) return undefined;
    const anchor = anchorRef?.current;
    popoverRef.current
      ?.querySelector(".planner-target-knowledge-close")
      ?.focus({ preventScroll: true });
    return () => anchor?.focus?.({ preventScroll: true });
  }, [forced, open, anchorRef]);

  if (!knowledge?.story && !targetKnowledgeId) return null;
  // Inside a modal dialog the popover must live in that dialog (the top
  // layer), not under it in the body.
  const portalHost =
    (forced && anchorRef?.current?.closest?.("dialog")) ||
    (typeof document !== "undefined" ? document.body : null);
  const imageCredit = visualMode
    ? knowledge.visualImageCredit ||
      knowledge.visualPreviewImageCredit ||
      knowledge.photoImageCredit
    : knowledge.photoImageCredit;
  const imageSourceUrl = visualMode
    ? knowledge.visualImageSourceUrl ||
      knowledge.visualPreviewImageSourceUrl ||
      knowledge.photoImageSourceUrl
    : knowledge.photoImageSourceUrl;
  const storyParagraphs = Array.isArray(knowledge.storyParagraphs)
    ? knowledge.storyParagraphs.filter(Boolean)
    : [knowledge.story].filter(Boolean);
  const storySections = knowledgeSections(knowledge);
  const researchSources = Array.isArray(knowledge.researchSources)
    ? knowledge.researchSources.filter((source) => source?.label && source?.url)
    : [];
  const magnitude =
    knowledge.magnitude === null ||
    knowledge.magnitude === undefined ||
    String(knowledge.magnitude).trim() === ""
      ? null
      : Number(knowledge.magnitude);
  const facts = [
    knowledge.type,
    knowledge.constellation,
    knowledge.apparentSizeLabel,
    `${message(locale, "plannerCatalogueMagnitude")} ${Number.isFinite(magnitude) ? decimal(magnitude, locale, 1) : message(locale, "plannerCatalogueMagnitudeUnavailable")}`,
  ].filter(Boolean);
  const observingGuide = knowledge.observingGuide;
  const visualDifficulty = observingGuide?.visualDifficulty
    ? message(
        locale,
        `plannerTargetGuide${observingGuide.visualDifficulty[0].toUpperCase()}${observingGuide.visualDifficulty.slice(1)}`,
      )
    : null;

  return (
    <>
      {!forced && (
        <details
          ref={detailsRef}
          className={`planner-target-knowledge ${className} ${visible ? "is-visible" : ""} ${popoverStyle ? "is-positioned" : ""}`.trim()}
          open={open}
          // Stops a click from also reaching `.planner-target-card`'s own
          // `onClick` (map selection) -- unrelated to the hover removal above,
          // kept exactly as it already was.
          onClick={(event) => event.stopPropagation()}
        >
          <summary
            ref={summaryRef}
            aria-label={message(locale, "plannerTargetKnowledgeOpen")}
            aria-expanded={open}
            title={message(locale, "plannerTargetKnowledgeOpen")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => !current);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 10.7v5" />
              <path d="M12 7.5h.01" />
            </svg>
          </summary>
        </details>
      )}
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              className="planner-target-knowledge-backdrop"
              type="button"
              aria-label={flow(locale, "close")}
              onClick={() => setOpen(false)}
            />
            <div
              ref={popoverRef}
              className={`planner-target-knowledge-popover is-portal${popoverStyle ? " is-positioned" : ""}`}
              style={popoverStyle || undefined}
              role={open ? "dialog" : "tooltip"}
              aria-modal={open || undefined}
              aria-label={message(locale, "plannerTargetKnowledgeTitle")}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }}
            >
              <button
                className="planner-target-knowledge-close"
                type="button"
                aria-label={flow(locale, "close")}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <strong>{message(locale, "plannerTargetKnowledgeTitle")}</strong>
              {knowledgeStatus !== "loading" && knowledgeStatus !== "error" && (
                <ChildrenVersionControl
                  knowledge={readKnowledge}
                  locale={locale}
                />
              )}
              {knowledgeStatus === "loading" && (
                <LoadingState layout="inline">
                  {message(locale, "plannerTargetKnowledgeLoading")}
                </LoadingState>
              )}
              {facts.length > 0 && (
                <p className="planner-target-knowledge-facts">
                  {facts.join(" · ")}
                </p>
              )}
              {observingGuide && (
                <section className="planner-target-observing-guide">
                  <b>{message(locale, "plannerTargetObservingGuide")}</b>
                  <p>
                    {message(locale, "plannerTargetGuideFocalLength")}{" "}
                    <strong>
                      {decimal(observingGuide.focalLengthMinimumMm, locale, 0)}–
                      {decimal(observingGuide.focalLengthMaximumMm, locale, 0)}{" "}
                      mm
                    </strong>
                  </p>
                  <p>
                    {message(locale, "plannerTargetGuideVisualAperture")}{" "}
                    <strong>
                      {decimal(
                        observingGuide.visualMinimumApertureMm,
                        locale,
                        0,
                      )}{" "}
                      mm
                    </strong>
                    {" · "}
                    {visualDifficulty}
                    {" · "}
                    {message(locale, "plannerTargetGuideDarkSky")}
                  </p>
                  <small>
                    {message(locale, "plannerTargetGuideSensorNote")}
                  </small>
                </section>
              )}
              <KnowledgeText
                idPrefix={knowledge.id || knowledge.designation || "target"}
                sections={storySections}
                paragraphs={storyParagraphs}
              />
              {researchSources.length > 0 && (
                <div className="planner-target-knowledge-sources">
                  <b>{message(locale, "plannerTargetKnowledgeSources")}</b>
                  <ul>
                    {researchSources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {knowledge.researchNote && <p>{knowledge.researchNote}</p>}
                </div>
              )}
              {imageCredit && (
                <p className="planner-target-knowledge-credit">
                  <b>{message(locale, "plannerTargetImageCredit")}</b>{" "}
                  {imageCredit}
                </p>
              )}
              {imageSourceUrl && (
                <a
                  className="planner-target-knowledge-source"
                  href={imageSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {message(locale, "plannerTargetImageSource")}
                </a>
              )}
            </div>
          </>,
          portalHost,
        )}
    </>
  );
}
