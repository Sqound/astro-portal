"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WebDialog } from "../dialog/WebDialog.js";
import {
  countedText,
  fillText,
  pluralText,
} from "../filters/FilterControls.js";
import { headerStale } from "../header-refresh.js";
import { message } from "portal/i18n.js";
import { JOURNAL_NOTICE_EVENT, journalNotice } from "./JournalSessionMenu.js";
import { eveningText, placeLine } from "./journal-list-view.js";
import { requestJson, responseData } from "./portal-fetch.js";
import { nightTitle } from "./session-page-view.js";

const dayOf = (instant, locale) => {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
};

/**
 * The notice of the page (a session deleted from a card, restored or erased
 * for good): one sentence under the head, kept until the next gesture. A
 * refusal is an alert; the rest a status.
 */
export function JournalNotice({ initial = null }) {
  const [notice, setNotice] = useState(initial);
  useEffect(() => {
    // The address that brought the person here (`?deleted=1`) is not kept.
    const url = new URL(window.location.href);
    if (url.searchParams.has("deleted")) {
      url.searchParams.delete("deleted");
      window.history.replaceState({}, "", url);
    }
    const show = (event) => setNotice(event.detail);
    window.addEventListener(JOURNAL_NOTICE_EVENT, show);
    return () => window.removeEventListener(JOURNAL_NOTICE_EVENT, show);
  }, []);
  if (!notice) return null;
  return (
    <p
      className={`journal-notice${notice.kind === "alert" ? " is-alert" : ""}`}
      role={notice.kind === "alert" ? "alert" : "status"}
      data-testid="journal-notice"
    >
      {notice.text}
    </p>
  );
}

/**
 * « Sessions supprimées »,
 * at the bottom of the Journal: the sessions deleted from a device or from the
 * web stay here for 30 days — **the
 * restoration is made here, on the web, and nowhere else**, with a web session
 * (the service refuses a device's token) — then are erased with their captures
 * and their data. For each one, its evening, its place, its captures, the date
 * it was deleted and the date it will be erased, the days left, « Restaurer
 * cette session » and « Supprimer définitivement » (a tertiary in the
 * destructive tint, next to its neighbour's level) which asks first (the
 * dialog states what is erased, and that it cannot be undone). The section
 * exists only when it holds a session.
 */
export function JournalDeleted({
  entries = [],
  graceDays = 30,
  locale = "en",
  // « Supprimées » of the tab « Sessions » of « Mon espace » reads its list
  // again itself (the page of the Journal refreshes).
  onChanged = null,
  onNotice = null,
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  if (!entries.length) return null;

  async function act(entry, kind) {
    const id = entry.session.sessionId;
    setBusy(id);
    setFailure(null);
    try {
      await responseData(
        await requestJson(
          `/api/v1/sessions/${encodeURIComponent(id)}/${kind === "restore" ? "restore" : "erase"}`,
          { method: "POST", body: {} },
        ),
        message(
          locale,
          kind === "restore"
            ? "journalDeletedRestoreFailed"
            : "journalDeletedEraseFailed",
        ),
      );
      setAsking(null);
      headerStale();
      (onNotice ?? journalNotice)(
        message(
          locale,
          kind === "restore"
            ? "journalDeletedRestoredNotice"
            : "journalDeletedErasedNotice",
        ),
      );
      if (onChanged) await onChanged();
      else router.refresh();
    } catch (error) {
      // The plan of the session holds another session since: said as it is.
      setFailure({
        id,
        text:
          error.code === "session_plan_taken"
            ? message(locale, "journalDeletedRestoreTaken")
            : error.message,
      });
      setAsking(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="journal-deleted"
      aria-labelledby="journal-deleted-title"
      data-testid="journal-deleted"
    >
      <h2 id="journal-deleted-title">
        {message(locale, "journalDeletedTitle")}
        <span className="journal-deleted-count" aria-hidden="true">
          {entries.length}
        </span>
      </h2>
      <p className="journal-deleted-intro">
        {fillText(message(locale, "journalDeletedIntro"), { days: graceDays })}
      </p>
      <ul className="journal-deleted-list">
        {entries.map((entry) => {
          const id = entry.session.sessionId;
          const captures = entry.session.captureCount ?? 0;
          const meta = [
            placeLine(entry.session, locale),
            captures > 0
              ? countedText(locale, "journalDeletedCaptures", captures)
              : null,
            fillText(message(locale, "journalDeletedRow"), {
              deleted: dayOf(entry.deletedAt, locale),
              purge: dayOf(entry.purgeAt, locale),
            }),
            fillText(
              pluralText(locale, "journalDeletedDaysLeft", entry.daysRemaining),
              { days: entry.daysRemaining },
            ),
          ].filter(Boolean);
          return (
            <li key={id} className="journal-deleted-row" data-session={id}>
              <div className="journal-deleted-text">
                <p className="journal-deleted-evening">
                  {[
                    // A session the person named keeps its name.
                    entry.session.title,
                    eveningText(entry.session.eveningDate, locale),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="journal-deleted-meta">{meta.join(" · ")}</p>
                {failure?.id === id ? (
                  <p className="journal-deleted-failure" role="alert">
                    {failure.text}
                  </p>
                ) : null}
              </div>
              <div className="journal-deleted-actions">
                <button
                  type="button"
                  className="btn-tertiary is-destructive"
                  data-action="erase"
                  disabled={busy === id}
                  onClick={() => setAsking(entry)}
                >
                  {message(locale, "journalDeletedDeleteForever")}
                </button>
                <button
                  type="button"
                  className="btn-tertiary"
                  data-action="restore"
                  disabled={busy === id}
                  onClick={() => act(entry, "restore")}
                >
                  {message(locale, "journalDeletedRestore")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {asking ? (
        <WebDialog
          className="journal-erase-dialog"
          role="alertdialog"
          closeLabel={message(locale, "nightPageCancel")}
          closeDisabled={busy !== null}
          title={message(locale, "journalDeletedDeleteForeverTitle")}
          onClose={() => setAsking(null)}
          footer={
            <>
              <button
                type="button"
                className="btn-link"
                disabled={busy !== null}
                data-autofocus=""
                onClick={() => setAsking(null)}
              >
                {message(locale, "nightPageCancel")}
              </button>
              <button
                type="button"
                className="btn-primary is-destructive"
                data-action="erase-confirm"
                disabled={busy !== null}
                onClick={() => act(asking, "erase")}
              >
                {message(locale, "journalDeletedDeleteForever")}
              </button>
            </>
          }
        >
          <p className="journal-erase-what">
            {[
              asking.session.title ??
                fillText(message(locale, "sessionPageTitle"), {
                  night: nightTitle(asking.session.eveningDate, locale),
                }),
              placeLine(asking.session, locale),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>
            {fillText(message(locale, "journalDeletedDeleteForeverBody"), {
              count: asking.session.captureCount ?? 0,
            })}
          </p>
        </WebDialog>
      ) : null}
    </section>
  );
}
