"use client";

import { message } from "portal/i18n.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { countedText, fillText } from "../filters/FilterControls.js";
import { agoText, hoursText } from "./space-lists.js";

const GRACE_DAYS = 30;

const WarnIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

/** The amber warning of a night in progress on a phone (3C): « be careful », not « this erases ». */
function RunningWarning({ locale, signalAt = null, text = null }) {
  const ago = agoText(signalAt, locale);
  return (
    <div className="space-list-warning" data-testid="space-running-warning">
      <WarnIcon />
      <span>
        {text ??
          (ago
            ? fillText(message(locale, "spacePlanDeleteRunning"), { ago })
            : message(locale, "spacePlanDeleteRunningNoSignal"))}
      </span>
    </div>
  );
}

function Footer({ locale, busy, confirmLabel, onCancel, onConfirm }) {
  return (
    <>
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        onClick={onCancel}
      >
        {message(locale, "nightPageCancel")}
      </button>
      <button
        type="button"
        className="btn-primary is-destructive"
        data-action="confirm-delete"
        data-autofocus=""
        disabled={busy}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </>
  );
}

const Failure = ({ text }) =>
  text ? (
    <p className="session-delete-failed" role="alert">
      {text}
    </p>
  ) : null;

/**
 * « Supprimer ce plan ? » (3D) for a plan of one night, and its night in
 * progress on a phone (3C): the plan, its slots and its targets go; it stays
 * 30 days in « Supprimés » of « Plans ». A night in progress says so in the
 * amber of a warning, and the primary becomes « Supprimer quand même ».
 */
export function PlanDeleteDialog({
  locale,
  row,
  signalAt = null,
  busy = false,
  failure = null,
  onCancel,
  onConfirm,
}) {
  return (
    <WebDialog
      className="session-delete-dialog space-delete-dialog"
      bodyClassName="session-delete-body"
      role="alertdialog"
      closeLabel={message(locale, "nightPageCancel")}
      closeDisabled={busy}
      title={message(locale, "plannerPlanDeleteTitle")}
      onClose={onCancel}
      footer={
        <Footer
          locale={locale}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={message(
            locale,
            row.running ? "spaceDeleteAnyway" : "spacePlansDelete",
          )}
        />
      }
    >
      <PlanDeleteBody
        locale={locale}
        row={row}
        signalAt={signalAt}
        failure={failure}
      />
    </WebDialog>
  );
}

/**
 * « Supprimer ce plan multi-nuits ? » (3B): what goes (the plan and its goal,
 * its nights still to come) and what stays (its sessions, detached, in the
 * Journal; its image in « Captures »), the 30 days of « Supprimés », and a
 * night in progress said in amber with « Supprimer quand même ».
 */
export function ProjectDeleteDialog({
  locale,
  row,
  busy = false,
  failure = null,
  onCancel,
  onConfirm,
}) {
  return (
    <WebDialog
      className="session-delete-dialog space-delete-dialog"
      bodyClassName="session-delete-body"
      role="alertdialog"
      closeLabel={message(locale, "nightPageCancel")}
      closeDisabled={busy}
      title={message(locale, "spaceMultiDeleteTitle")}
      onClose={onCancel}
      footer={
        <Footer
          locale={locale}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={message(
            locale,
            row.running ? "spaceDeleteAnyway" : "spaceMultiDeleteConfirm",
          )}
        />
      }
    >
      <ProjectDeleteBody locale={locale} row={row} failure={failure} />
    </WebDialog>
  );
}

/**
 * « Supprimer 2 plans ? » for a selection: the plans that go, named; the
 * executed ones the selection holds are left out and said (they are archived,
 * or their session deleted); a night in progress among them said in amber.
 */
export function PlansDeleteDialog({
  locale,
  rows,
  skipped = 0,
  busy = false,
  failure = null,
  onCancel,
  onConfirm,
}) {
  const running = rows.filter((row) => row.running);
  return (
    <WebDialog
      className="session-delete-dialog space-delete-dialog"
      bodyClassName="session-delete-body"
      role="alertdialog"
      closeLabel={message(locale, "nightPageCancel")}
      closeDisabled={busy}
      title={countedText(locale, "spacePlansDeleteManyTitle", rows.length)}
      onClose={onCancel}
      footer={
        <Footer
          locale={locale}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={
            running.length
              ? message(locale, "spaceDeleteAnyway")
              : countedText(locale, "spacePlansDeleteSelected", rows.length)
          }
        />
      }
    >
      <PlansDeleteBody
        locale={locale}
        rows={rows}
        skipped={skipped}
        failure={failure}
      />
    </WebDialog>
  );
}

/**
 * A plan that ran, or archived, whose session is still in the Journal: « Ce
 * plan ne se supprime pas encore », why (its session and its captures depend
 * on it) and the condition — its session in the trash first (« Sessions »);
 * archiving it stays offered (the primary, « Archiver ce plan »).
 */
export function PlanRefusalDialog({
  locale,
  row,
  busy = false,
  onClose,
  onArchive = null,
}) {
  return (
    <WebDialog
      className="session-delete-dialog space-delete-dialog"
      bodyClassName="session-delete-body"
      role="alertdialog"
      closeLabel={message(locale, "planDeletionRefusedClose")}
      closeDisabled={busy}
      title={message(locale, "spacePlanNotDeletableTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            onClick={onClose}
            data-autofocus=""
          >
            {message(locale, "planDeletionRefusedClose")}
          </button>
          {onArchive ? (
            <button
              type="button"
              className="btn-primary"
              data-action="archive-instead"
              disabled={busy}
              onClick={onArchive}
            >
              {message(locale, "planDeletionRefusedArchive")}
            </button>
          ) : null}
        </>
      }
    >
      <PlanRefusalBody locale={locale} row={row} />
    </WebDialog>
  );
}

/** « Supprimer définitivement ce plan ? » of « Supprimés ». */
export function PlanEraseDialog({
  locale,
  entry,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const multi = entry.kind === "project";
  return (
    <WebDialog
      className="journal-erase-dialog"
      role="alertdialog"
      closeLabel={message(locale, "nightPageCancel")}
      closeDisabled={busy}
      title={message(
        locale,
        multi ? "spacePlansEraseMultiTitle" : "spacePlansEraseTitle",
      )}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            data-autofocus=""
            onClick={onCancel}
          >
            {message(locale, "nightPageCancel")}
          </button>
          <button
            type="button"
            className="btn-primary is-destructive"
            data-action="erase-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {message(locale, "journalDeletedDeleteForever")}
          </button>
        </>
      }
    >
      <p className="journal-erase-what">{entry.name}</p>
      <p>
        {message(
          locale,
          multi ? "spacePlansEraseMultiBody" : "spacePlansEraseBody",
        )}
      </p>
    </WebDialog>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function PlanDeleteBody({
  locale,
  row,
  signalAt = null,
  failure = null,
}) {
  const count = row.targets.length;
  const quantity = count === 0 ? "Zero" : count === 1 ? "One" : "Many";
  return (
    <>
      {row.running ? (
        <RunningWarning locale={locale} signalAt={signalAt} />
      ) : null}
      <p>
        {fillText(message(locale, `plannerPlanDeleteDescription${quantity}`), {
          name: row.name,
          count,
        })}
      </p>
      {row.running ? (
        <p>{message(locale, "spacePlanDeleteRunningSession")}</p>
      ) : null}
      <p className="space-delete-trash">
        {fillText(message(locale, "spacePlanDeleteTrash"), {
          days: GRACE_DAYS,
        })}
      </p>
      <Failure text={failure} />
    </>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function ProjectDeleteBody({ locale, row, failure = null }) {
  const sessions = row.sessionCount ?? 0;
  const toCome = row.toComeCount ?? 0;
  return (
    <>
      {row.running ? <RunningWarning locale={locale} /> : null}
      <p>
        <strong>{row.name}</strong>
        <br />
        {fillText(message(locale, "spaceMultiDeleteSummary"), {
          nights: countedText(locale, "spacePlansNights", row.nightCount ?? 0),
          sessions: countedText(locale, "spaceSessionsCount", sessions),
        })}
      </p>
      <p className="session-delete-what">
        {message(locale, "sessionDeleteWhatGoes")}
      </p>
      <ul className="session-delete-items">
        <li>
          {row.goalSeconds
            ? fillText(message(locale, "spaceMultiDeleteItemPlan"), {
                goal: hoursText(row.goalSeconds, locale),
              })
            : message(locale, "spaceMultiDeleteItemPlanNoGoal")}
        </li>
        {toCome > 0 ? (
          <li>{countedText(locale, "spaceMultiDeleteItemNights", toCome)}</li>
        ) : null}
      </ul>
      <p className="session-delete-what">
        {message(locale, "spaceMultiDeleteWhatStays")}
      </p>
      <ul className="session-delete-items" data-testid="space-multi-stays">
        <li>
          {sessions > 0
            ? countedText(locale, "spaceMultiDeleteStaysSessions", sessions)
            : message(locale, "spaceMultiDeleteNoSession")}
        </li>
        {row.hasImage ? (
          <li>{message(locale, "spaceMultiDeleteStaysImage")}</li>
        ) : null}
      </ul>
      <p className="space-delete-trash">
        {fillText(message(locale, "spaceMultiDeleteTrash"), {
          days: GRACE_DAYS,
        })}
      </p>
      <Failure text={failure} />
    </>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function PlansDeleteBody({ locale, rows, skipped = 0, failure = null }) {
  const running = rows.filter((row) => row.running);
  return (
    <>
      {running.map((row) => (
        <RunningWarning
          key={row.key}
          locale={locale}
          text={fillText(message(locale, "spacePlansDeleteManyRunning"), {
            name: row.name,
          })}
        />
      ))}
      <p className="session-delete-what">
        {message(locale, "sessionDeleteWhatGoes")}
      </p>
      <ul className="session-delete-items">
        {rows.map((row) => (
          <li key={row.key}>
            {row.kind === "project"
              ? `${message(locale, "spacePlansMultiKind")} · ${row.name}`
              : [row.name, row.eyebrow].filter(Boolean).join(" · ")}
          </li>
        ))}
      </ul>
      {skipped > 0 ? (
        <p>{countedText(locale, "spacePlansSkippedExecuted", skipped)}</p>
      ) : null}
      <p className="space-delete-trash">
        {fillText(message(locale, "spacePlansDeleteManyTrash"), {
          days: GRACE_DAYS,
        })}
      </p>
      <Failure text={failure} />
    </>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function PlanRefusalBody({ locale, row }) {
  return (
    <>
      <p>
        {fillText(
          message(
            locale,
            row.rights?.archived
              ? "spacePlanArchivedNotDeletable"
              : "planDeletionRefusedExecutedDetail",
          ),
          { name: row.name },
        )}
      </p>
      <p>{message(locale, "spacePlanNotDeletableHow")}</p>
    </>
  );
}
