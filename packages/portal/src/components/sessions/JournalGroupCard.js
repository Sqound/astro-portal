"use client";

import { useEffect, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { ImageOrPictogram } from "../ObjectPictogram.js";
import { StatusTag } from "../status/StatusTag.js";
import { JournalOutcomeChip } from "./JournalOutcomeChip.js";
import { JournalSessionMenu } from "./JournalSessionMenu.js";
import { JournalGroupMenu } from "./JournalGroupMenu.js";
import {
  captureThumbnailSrc,
  counted,
  durationOf,
  eveningShort,
  fill,
  groupFolded,
  groupSpanText,
  journalLineHref,
  lineKey,
  multiNightPlanHref,
  pictogramTargetOf,
  placeLine,
} from "./journal-list-view.js";

/** The event a pointer of another month sends to the card of its plan. */
const FOCUS_EVENT = "journal-group-focus";

/**
 * A multi-night plan in the Journal (`journal.md`, « A group »): one card for the plan,
 * from its first night on and whatever its state, at the date of its most
 * recent line. The header — « Plan multi-nuits » and the corner's link to the
 * plan's page, the plan's image, the target, the nights spanned, the place
 * and the instrument, the badges (« En cours » / « Terminé », the blue « N
 * nuits à débriefer », not a button), the progress (« 14 h 10 acquises sur
 * 31 h 53 ») and « 3 sessions · 405 poses » — gives the whole plan, whatever
 * the filters; inside, one compact card per line: the night, « durée ·
 * poses » (« 5 h 11 prévues » while nothing is declared), one badge, « avec
 * Sh2-103 », its ⋯ and its link. Up to three lines
 * all show; beyond, three (those « À débriefer » first) and « Voir les N
 * sessions ». A grey line counts the lines the filters leave out. No blue
 * « Débriefer » in the group: each line keeps its badge and
 * its way to the debriefing.
 */
export function JournalGroupCard({
  group,
  items,
  locale = "en",
  defaultOpen = false,
  highlight = null,
  pictures = null,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ringed, setRinged] = useState(highlight);
  const card = useRef(null);
  const ring = (key) => {
    setRinged(key);
    if (!groupFolded(items).some((item) => lineKey(item) === key))
      setOpen(true);
  };
  useEffect(() => {
    if (highlight) ring(highlight);
  }, [highlight]);
  useEffect(() => {
    if (!ringed) return undefined;
    const timer = setTimeout(() => setRinged(null), 2000);
    return () => clearTimeout(timer);
  }, [ringed]);
  useEffect(() => {
    const onFocus = (event) => {
      if (event.detail?.projectId !== group.projectId) return;
      ring(event.detail.key);
      card.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [group.projectId, items]);
  const latest = items[0];
  const title = [group.name, group.targetLabel]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" · ");
  const share =
    group.goalSeconds > 0
      ? Math.min(1, Math.max(0, group.acquiredSeconds / group.goalSeconds))
      : 0;
  const lineCount = group.lineCount ?? items.length;
  const frames =
    group.frameCount ??
    items.reduce((sum, item) => sum + (item.frameCount ?? 0), 0);
  const toDebrief =
    group.toDebriefCount ??
    items.filter((item) => item.state === "to_debrief").length;
  const hidden = Math.max(0, lineCount - items.length);
  const folds = items.length > 3;
  const shown = open || !folds ? items : groupFolded(items);
  const acquired = durationOf(group.acquiredSeconds, locale);
  const progress =
    group.goalSeconds > 0
      ? fill(message(locale, "journalGroupProgressValue"), {
          acquired,
          goal: durationOf(group.goalSeconds, locale),
        })
      : acquired;
  const at = progress.indexOf(acquired);
  const planHref = multiNightPlanHref(locale, group.projectId);
  const listId = `journal-group-${group.projectId}`;
  return (
    <article
      ref={card}
      className="session-card journal-group"
      data-project={group.projectId}
      data-status={group.status ?? "finished"}
    >
      <div className="journal-group-head">
        <div className="journal-group-eyebrow">
          <span className="journal-badge is-plan">
            {message(locale, "journalGroupPlanLabel")}
          </span>
          {/* The ⋯ of the plan beside the chevron (SDM01-4A): « Voir le
              plan », « Archiver ce plan multi-nuits », « Supprimer ce plan
              multi-nuits ». */}
          <span className="journal-group-corner-actions">
            <JournalGroupMenu
              group={group}
              planHref={planHref}
              locale={locale}
            />
            <a
              className="journal-group-corner"
              href={planHref}
              aria-label={`${message(locale, "journalGroupOpenPlan")} — ${title}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </a>
          </span>
        </div>
        <a className="journal-group-title" href={planHref}>
          <span className="journal-group-image">
            <ImageOrPictogram
              src={
                group.planCaptureId
                  ? captureThumbnailSrc(group.planCaptureId)
                  : (pictures?.[group.targetId]?.url ?? null)
              }
              target={pictogramTargetOf(
                pictures,
                group.targetId ?? group.projectId,
                title,
              )}
              locale={locale}
              named={false}
            />
          </span>
          <span className="journal-group-main">
            <h2>{title}</h2>
            <span className="journal-group-line">
              {[
                group.firstEveningDate
                  ? groupSpanText(
                      group.firstEveningDate,
                      group.lastEveningDate,
                      locale,
                    )
                  : null,
                latest ? placeLine(latest, locale) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </a>
        <div className="journal-session-chips journal-group-badges">
          {group.status === "finished" ? (
            <StatusTag
              tone="executed"
              locale={locale}
              scheme={false}
              label={message(locale, "journalGroupFinished")}
            />
          ) : group.status === "archived" ? (
            <StatusTag
              tone="archived"
              locale={locale}
              scheme={false}
              label={message(locale, "journalGroupArchived")}
            />
          ) : (
            <StatusTag
              tone="pending"
              locale={locale}
              scheme={false}
              label={message(locale, "journalGroupInProgress")}
            />
          )}
          {toDebrief > 0 ? (
            <StatusTag
              tone="to_debrief"
              locale={locale}
              scheme={false}
              className="journal-group-to-debrief"
              label={counted(locale, "journalGroupToDebrief", toDebrief)}
            />
          ) : null}
        </div>
        <div className="journal-progress">
          <span className="journal-progress-text">
            {at < 0 ? (
              progress
            ) : (
              <>
                {progress.slice(0, at)}
                <b>{acquired}</b>
                {progress.slice(at + acquired.length)}
              </>
            )}
          </span>
          {group.goalSeconds > 0 ? (
            <span
              className="journal-progress-bar"
              role="img"
              aria-label={progress}
            >
              <span style={{ width: `${(share * 100).toFixed(1)}%` }} />
            </span>
          ) : null}
        </div>
        <p className="journal-group-counts">
          {[
            counted(locale, "journalGroupSessions", lineCount),
            frames > 0 ? counted(locale, "journalFramesCount", frames) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="journal-group-body" id={listId}>
        <ul className="journal-group-sessions">
          {shown.map((item) => (
            <GroupNight
              key={lineKey(item)}
              item={item}
              group={group}
              locale={locale}
              ringed={ringed === lineKey(item)}
            />
          ))}
        </ul>
        {hidden > 0 ? (
          <p className="journal-group-note" data-hidden-by-filters="">
            {counted(locale, "journalGroupHiddenByFilters", hidden)}
          </p>
        ) : null}
        {folds ? (
          <button
            type="button"
            className="btn-link journal-group-toggle"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((current) => !current)}
          >
            {open
              ? message(locale, "journalGroupHideSessions")
              : counted(locale, "journalGroupSeeSessions", items.length)}
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** « 5 h 11 · 125 poses », « 5 h 11 prévues » while nothing is declared. */
function nightLine(item, locale) {
  if ((item.acquiredSeconds ?? 0) > 0)
    return [
      durationOf(item.acquiredSeconds, locale),
      item.frameCount > 0
        ? counted(locale, "journalFramesCount", item.frameCount)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  if ((item.plannedSeconds ?? 0) > 0)
    return fill(message(locale, "journalGroupPlanned"), {
      duration: durationOf(item.plannedSeconds, locale),
    });
  return "";
}

/** The night's targets other than the plan's (« avec Sh2-103 »). */
function otherTargets(item, group) {
  if (!group.targetId) return [];
  return (item.targets ?? [])
    .filter(
      (target) =>
        target.state !== "removed" && target.targetId !== group.targetId,
    )
    .map((target) => target.label);
}

function GroupNight({ item, group, locale, ringed }) {
  const href = journalLineHref(locale, item);
  const others = otherTargets(item, group);
  // A night the person named is called by its name, its date opening the
  // line under it.
  const line = [
    item.title ? eveningShort(item.eveningDate, locale) : null,
    nightLine(item, locale),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className={`journal-group-session${ringed ? " is-ringed" : ""}`}
      data-line={lineKey(item)}
    >
      <a className="journal-group-session-text" href={href}>
        <strong>{item.title || eveningShort(item.eveningDate, locale)}</strong>
        {line ? <span>{line}</span> : null}
        {others.length ? (
          <span className="journal-group-with">
            {fill(message(locale, "journalGroupWith"), {
              targets: others.join(", "),
            })}
          </span>
        ) : null}
      </a>
      <JournalOutcomeChip state={item.state} locale={locale} />
      <JournalSessionMenu
        item={item}
        href={href}
        locale={locale}
        projectId={group.projectId}
      />
    </li>
  );
}

/**
 * A line of a multi-night plan whose card stands in
 * another month — the night and « Session du plan multi-nuits IC 1805, rangée
 * en août », in a dashed frame. A click brings the card forward, unfolded,
 * the night ringed for two seconds.
 */
export function JournalGroupPointer({ group, item, month, locale = "en" }) {
  const [year, number] = month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(Date.UTC(year, number - 1, 1, 12));
  return (
    <button
      type="button"
      className="journal-group-pointer"
      data-pointer={lineKey(item)}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(FOCUS_EVENT, {
            detail: { projectId: group.projectId, key: lineKey(item) },
          }),
        )
      }
    >
      <strong>{eveningShort(item.eveningDate, locale)}</strong>
      <span>
        {fill(message(locale, "journalGroupPointer"), {
          plan: group.name,
          month: monthName,
        })}
      </span>
    </button>
  );
}
