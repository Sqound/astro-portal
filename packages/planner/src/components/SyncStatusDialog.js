"use client";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { message } from "portal/i18n.js";
import {
  shownSyncCode,
  syncAttemptWhen,
  syncPendingRows,
} from "../sync-status.js";

// The detail of the planner's sync status line. Touching the line opens this
// dialog: what waits, the last attempt and how it ended, the reason of a
// failure in plain words, a link "Réessayer maintenant" and the app's one ⓘ for
// the explanation in one line.
//
// Buttons: "Fermer"
// and "Réessayer maintenant" are links -- retry is a link unless it is the
// action of the zone, and the zone of this dialog is to look.
//
// Empty and reassuring when everything is synchronized; one sentence when the
// browser is signed in to no space. It names no offer and holds nothing
// personal.

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );

function failureText(locale, failure) {
  if (failure.kind === "offline")
    return message(locale, "plannerSyncDetailReasonOffline");
  if (failure.kind === "refused")
    return fill(message(locale, "plannerSyncDetailReasonRefused"), {
      code: shownSyncCode(failure),
    });
  return message(locale, "plannerSyncDetailReasonUnreachable");
}

/**
 * The dialog's content, without the shell (so that a test renders it):
 * `status` is the line's own (`local`, `syncing`, `synced`, `pending`);
 * `attempt` is `{ at, ok, failure }` or null; `failure` is shown only while
 * something waits.
 */
export function SyncStatusContent({
  locale = "en",
  status,
  edits = false,
  browserPlans = 0,
  attempt = null,
  online = true,
  now = Date.now(),
}) {
  const rows = syncPendingRows({ status, edits, browserPlans });
  const waiting = rows.length > 0;
  const failure = waiting
    ? online === false
      ? { kind: "offline" }
      : attempt && !attempt.ok
        ? attempt.failure
        : null
    : null;
  let lastAttempt = null;
  if (attempt) {
    const when = syncAttemptWhen(attempt.at, now, locale);
    lastAttempt = fill(
      message(
        locale,
        attempt.ok
          ? "plannerSyncDetailLastDone"
          : "plannerSyncDetailLastFailed",
      ),
      { when: fill(message(locale, when.key), when.values) },
    );
  } else if (waiting) {
    lastAttempt = message(locale, "plannerSyncDetailNoAttempt");
  }
  return (
    <div className="planner-sync-detail" data-testid="planner-sync-detail">
      {status === "local" ? (
        <p
          className="planner-sync-detail-sentence"
          data-testid="planner-sync-detail-local"
        >
          {message(locale, "plannerSyncDetailLocal")}
        </p>
      ) : waiting ? (
        <>
          <h3>{message(locale, "plannerSyncDetailPendingHeading")}</h3>
          <ul className="planner-sync-detail-rows">
            {rows.map((row) => (
              <li
                key={row.kind}
                data-testid={`planner-sync-detail-${row.kind}`}
              >
                <span>
                  {message(
                    locale,
                    row.kind === "edits"
                      ? "plannerSyncDetailEdits"
                      : "plannerSyncDetailBrowserPlans",
                  )}
                </span>
                {row.count ? <strong>{row.count}</strong> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p
          className="planner-sync-detail-sentence is-synced"
          data-testid="planner-sync-detail-synced"
        >
          {status === "syncing"
            ? message(locale, "plannerSyncDetailSyncing")
            : message(locale, "plannerSyncDetailAllSynced")}
        </p>
      )}
      {lastAttempt ? (
        <p
          className="planner-sync-detail-attempt"
          data-testid="planner-sync-detail-attempt"
        >
          {lastAttempt}
        </p>
      ) : null}
      {failure ? (
        <p
          className="planner-sync-detail-reason"
          data-testid="planner-sync-detail-reason"
          role="status"
        >
          {failureText(locale, failure)}
        </p>
      ) : null}
    </div>
  );
}

/** The ⓘ of the header: the app's one, with the explanation in one line. */
export function SyncStatusInfo({ locale = "en" }) {
  return (
    <InfoButton
      locale={locale}
      title={message(locale, "plannerSyncDetailTitle")}
      body={message(locale, "plannerSyncDetailInfo")}
      className="planner-sync-detail-info"
      testId="planner-sync-detail-info"
    />
  );
}

/** The footer: "Fermer" and, while something waits, the retry link. */
export function SyncStatusActions({
  locale = "en",
  canRetry = false,
  retrying = false,
  onRetry,
  onClose,
}) {
  return (
    <>
      <button
        type="button"
        className="btn-link"
        data-testid="planner-sync-detail-close"
        onClick={onClose}
      >
        {message(locale, "infoClose")}
      </button>
      {canRetry ? (
        <button
          type="button"
          className="btn-link"
          data-testid="planner-sync-detail-retry"
          disabled={retrying}
          onClick={onRetry}
        >
          {message(
            locale,
            retrying ? "plannerSyncDetailRetrying" : "plannerSyncDetailRetry",
          )}
        </button>
      ) : null}
    </>
  );
}

export function SyncStatusDialog({
  locale = "en",
  status,
  edits,
  browserPlans,
  attempt,
  online,
  retrying = false,
  signedIn = true,
  onRetry,
  onClose,
}) {
  const waiting = syncPendingRows({ status, edits, browserPlans }).length > 0;
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-sync-dialog"
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerSyncDetailTitle")}
      titleAs="h3"
      headerActions={<SyncStatusInfo locale={locale} />}
      footer={
        <SyncStatusActions
          locale={locale}
          canRetry={signedIn && waiting}
          retrying={retrying}
          onRetry={onRetry}
          onClose={onClose}
        />
      }
    >
      <SyncStatusContent
        locale={locale}
        status={status}
        edits={edits}
        browserPlans={browserPlans}
        attempt={attempt}
        online={online}
      />
    </WebDialog>
  );
}
