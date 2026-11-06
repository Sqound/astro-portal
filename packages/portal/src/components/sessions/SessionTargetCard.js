"use client";

import { DetectedMention } from "./DetectedMention.js";
import { message } from "portal/i18n.js";
import { CapturePills } from "../manage/CapturesTab.js";
import { captureMediaPath } from "../manage/captures-client.js";
import { capturesCopyFor } from "../manage/captures-copy.js";
import { managePath } from "../manage/manage-copy.js";
import { ReportGlyph } from "./SessionFrise.js";
import { journalStatisticsHref } from "./journal-list-view.js";
import {
  cardLines,
  photoSentence,
  reportClock,
  reportText,
} from "./session-page-view.js";

// A card per target of the session: the final photo (or the pictogram), the
// name, the target's place against the promise (« Ajoutée sur le terrain »,
// « Retirée au débriefing »), what the plan promised then what the night gave,
// the frames, the photo's two pills and « Voir la fiche », the reports placed
// on it, and at the right the send icon of a final photo — a capture of the
// session and of the target (`SessionSendButton`). The actions of a card are icons at the right, the
// bin last and in the destructive tint; « Voir la fiche » is a link.

const TargetGlyph = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const UploadGlyph = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 16V5M7 9.5L12 4.5l5 5M5 19.5h14" />
  </svg>
);

export const PencilGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
  </svg>
);

export const BinGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const HandleGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

export const BarsGlyph = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M5 20v-6M10 20V8M15 20v-9M20 20V5" />
  </svg>
);

/** « 22:18 · Pause · Retournement au méridien · 10 min » and its place. */
export function ReportLine({
  report,
  locale,
  actions = null,
  timeZone = null,
}) {
  return (
    <li className={`session-report is-${report.kind}`} data-report={report.id}>
      <span className="session-report-glyph">
        <ReportGlyph kind={report.kind} />
      </span>
      <span className="session-report-clock">
        {reportClock(report, timeZone)}
      </span>
      <span className="session-report-text">
        {reportText(report, locale, timeZone)}
        {report.reconstructed ? (
          <em className="session-report-mark">
            {" "}
            · {message(locale, "sessionPageReportReconstructed")}
          </em>
        ) : null}
        {report.detected ? (
          <>
            {" "}
            <DetectedMention locale={locale} />
          </>
        ) : null}
      </span>
      {actions}
    </li>
  );
}

export function SessionTargetCard({
  locale = "en",
  card,
  canSend = false,
  answer = null,
  onSend = () => {},
  editing = false,
  reportActions = () => null,
  dragProps = null,
  onEdit = () => {},
  onRemove = () => {},
  onRestore = () => {},
  timeZone = null,
  colour = null,
  visual = false,
  instrument = null,
}) {
  const copy = capturesCopyFor(locale);
  const lines = cardLines(card, locale, timeZone, { visual });
  const removed = card.state === "removed";
  const capture = card.capture;
  const href = capture ? managePath(locale, "captures", capture.id) : null;
  const image =
    card.hasThumbnail && capture?.thumbnail ? (
      <img
        src={captureMediaPath(capture.id, { thumbnail: true })}
        alt=""
        loading="lazy"
        decoding="async"
      />
    ) : card.imageUrl ? (
      <img src={card.imageUrl} alt="" loading="lazy" decoding="async" />
    ) : (
      <span className="session-card-pictogram">
        <TargetGlyph />
      </span>
    );
  const sentence = photoSentence(answer, locale);
  return (
    <li
      className={`session-card is-${card.state}${editing ? " is-editing" : ""}`}
      data-target-id={card.key}
      data-state={card.state}
      {...(dragProps?.item ?? {})}
    >
      {editing ? (
        <span
          className="session-card-handle"
          title={message(locale, "sessionPageReworkDragHandle")}
          {...(dragProps?.handle ?? {})}
        >
          <HandleGlyph />
          <span className="visually-hidden">
            {message(locale, "sessionPageReworkDragHandle")}
          </span>
        </span>
      ) : null}
      {/* The colour of the target's segments — dashed,
          like its frame of the plan, for a target not done. */}
      <span
        className={`session-card-lisere ${
          removed ||
          card.outcome === "skipped" ||
          card.noTimeTonight ||
          colour === null
            ? "is-dashed"
            : `is-c${colour % 8}`
        }`}
        data-testid="session-card-lisere"
        aria-hidden="true"
      />
      <span className="session-card-image">
        {href ? (
          <a href={href} tabIndex={-1}>
            {image}
          </a>
        ) : (
          image
        )}
      </span>
      <div className="session-card-body">
        <div className="session-card-head">
          <h3 className="session-card-title">{card.label}</h3>
          {card.state === "added" ? (
            <span className="session-card-badge is-added">
              {message(locale, "sessionPageTargetAdded")}
            </span>
          ) : null}
          {removed ? (
            <span className="session-card-badge is-removed">
              {message(locale, "sessionPageTargetRemoved")}
            </span>
          ) : null}
          <span className="session-card-actions">
            {editing ? (
              removed ? (
                <button type="button" className="btn-link" onClick={onRestore}>
                  {message(locale, "sessionPageRestoreTarget")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="night-icon-button"
                    aria-label={message(locale, "sessionPageEditTarget")}
                    title={message(locale, "sessionPageEditTarget")}
                    onClick={onEdit}
                  >
                    <PencilGlyph />
                  </button>
                  <button
                    type="button"
                    className="night-icon-button night-icon-button-danger"
                    aria-label={message(locale, "sessionPageRemoveTarget")}
                    title={message(locale, "sessionPageRemoveTarget")}
                    onClick={onRemove}
                  >
                    <BinGlyph />
                  </button>
                </>
              )
            ) : canSend && !removed ? (
              <button
                type="button"
                className="night-icon-button"
                aria-label={message(locale, "sessionPageSendFinalPhoto")}
                title={message(locale, "sessionPageSendFinalPhoto")}
                onClick={onSend}
              >
                <UploadGlyph />
              </button>
            ) : null}
          </span>
        </div>
        {lines.planned ? (
          <p className="session-card-line is-planned">{lines.planned}</p>
        ) : null}
        {lines.plannedShooting ? (
          <p
            className="session-card-line is-planned is-shooting"
            data-shooting="planned"
          >
            {lines.plannedShooting}
          </p>
        ) : null}
        {lines.done ? (
          typeof lines.done === "string" ? (
            <p className="session-card-line is-not-done">{lines.done}</p>
          ) : (
            <p className="session-card-line is-done">
              {lines.done.span}
              {lines.done.cumulated ? (
                <>
                  <br />
                  <strong data-cumulated={card.key}>
                    {lines.done.cumulated}
                  </strong>
                  {lines.done.deducted ? ` · ${lines.done.deducted}` : null}
                </>
              ) : null}
              {lines.done.acquired ? (
                <>
                  {" · "}
                  <strong>{lines.done.acquired}</strong>
                </>
              ) : null}
            </p>
          )
        ) : null}
        {lines.frames ? (
          <p className="session-card-line is-frames">{lines.frames}</p>
        ) : null}
        {/* What the telescope said of this target
            (`instrumentTargetLine`): « · double bande · 128 rejetées »,
            after the declared line or, when there is none, on a line of its
            own. */}
        {lines.measuredShooting || instrument ? (
          <p
            className="session-card-line is-frames is-shooting"
            data-shooting={lines.measuredShooting ? "measured" : "instrument"}
          >
            {lines.measuredShooting}
            {instrument?.filter ? (
              <>
                {lines.measuredShooting ? " · " : null}
                <span data-instrument="filter">{instrument.filter}</span>
              </>
            ) : null}
            {instrument?.rejected ? (
              <>
                {lines.measuredShooting || instrument.filter ? " · " : null}
                <span
                  className="session-card-rejected"
                  data-instrument="rejected"
                >
                  {instrument.rejected}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
        {capture ? (
          <p className="session-card-photo">
            <span className="session-card-photo-label">
              {message(locale, "sessionPageFinalPhoto")}
            </span>
            <CapturePills capture={capture} copy={copy} />
            {href ? (
              <a className="btn-link" href={href}>
                {message(locale, "sessionPageSeeCapture")}
              </a>
            ) : null}
          </p>
        ) : null}
        {sentence ? (
          <p className="session-card-sentence" role="status">
            {sentence}
          </p>
        ) : null}
        {card.reports.length ? (
          <ul className="session-reports">
            {card.reports.map((report) => (
              <ReportLine
                key={report.id}
                report={report}
                locale={locale}
                timeZone={timeZone}
                actions={reportActions(report)}
              />
            ))}
          </ul>
        ) : null}
        {/* Every night of the target, where this night gave time on it. */}
        {!removed && !editing && (card.acquiredSeconds ?? 0) > 0 ? (
          <p className="session-card-statistics">
            <a
              className="btn-link"
              href={journalStatisticsHref(locale, { target: card.key })}
              data-testid={`session-target-statistics-${card.key}`}
            >
              {message(locale, "journalStatisticsAllNightsOf").replace(
                "{target}",
                card.label,
              )}
            </a>
          </p>
        ) : null}
      </div>
    </li>
  );
}
