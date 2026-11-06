"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WebDialog } from "../dialog/WebDialog.js";
import { headerStale } from "../header-refresh.js";
import { fillText } from "../filters/FilterControls.js";
import { ActionMenu } from "../menu/ActionMenu.js";
import { message } from "portal/i18n.js";
import { requestJson, responseData } from "./portal-fetch.js";
import { SESSION_GRACE_DAYS } from "../../sessions/session-grace.js";
import { countedText } from "../filters/FilterControls.js";
import { loadCaptureSummaries } from "../manage/space-lists-client.js";
import {
  capturesBySession,
  listText,
  sizeText,
} from "../manage/space-lists.js";

/** The sentence of a notice that stays on the page after a deletion. */
export const JOURNAL_NOTICE_EVENT = "astro-portal:journal-notice";

/** Tells the Journal page to say something (a deletion, a restoration). */
export function journalNotice(text, kind = "status") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(JOURNAL_NOTICE_EVENT, { detail: { text, kind } }),
  );
}

/**
 * The ⋯ menu of a session of the Journal: « Voir la session », « Débriefer cette session » for
 * a night that waits for it, then — after a separator — « Supprimer la session »
 * in the destructive tint, which asks first (the box lists what goes with the
 * session: its captures, its Astro Sync data, and says it stays 30 days in
 * « Sessions supprimées »). A night of a private server's catalogue cannot be
 * deleted: it is not a session of the space.
 */
export function JournalSessionMenu({
  item,
  href,
  locale = "en",
  projectId = null,
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState(null);
  // The captures of the session, named in the dialog (« 1 capture : M31
  // (0,2 Mo) »): read when it opens; counted as before when they cannot be.
  const ask = () => {
    setFailed(false);
    setAsking(true);
    setSummary(null);
    void loadCaptureSummaries(globalThis.fetch?.bind(globalThis), { locale })
      .then((captures) =>
        setSummary(capturesBySession(captures).get(item.sessionId) ?? null),
      )
      .catch(() => setSummary(null));
  };
  // « Retirer de ce plan multi-nuits »: the night leaves the plan, the
  // session stays in the Journal (`DELETE /v1/projects/{id}/nights/{night}`).
  async function detach() {
    try {
      await responseData(
        await requestJson(
          `/api/v1/projects/${encodeURIComponent(projectId)}/nights/${encodeURIComponent(item.sessionId ?? item.planId)}`,
          { method: "DELETE" },
        ),
        message(locale, "spacePlansActionFailed"),
      );
      journalNotice(message(locale, "journalNightDetachedNotice"));
      router.refresh();
    } catch {
      journalNotice(message(locale, "spacePlansActionFailed"), "alert");
    }
  }
  const deletable =
    item.sessionId &&
    !String(item.sessionId).startsWith("catalogue:") &&
    item.origin !== "catalogue";
  const toDebrief = item.state === "to_debrief";
  const items = [
    !toDebrief && href
      ? { key: "session", label: message(locale, "planSeeSession"), href }
      : null,
    toDebrief && href
      ? {
          key: "debrief",
          label: message(locale, "journalDebriefSession"),
          href,
        }
      : null,
    projectId && (item.sessionId || item.planId) && item.origin !== "catalogue"
      ? {
          key: "detach",
          label: message(locale, "journalNightDetach"),
          onSelect: detach,
        }
      : null,
    deletable
      ? {
          key: "delete",
          label: message(locale, "sessionDeleteAction"),
          destructive: true,
          separatorBefore: Boolean(href || projectId),
          onSelect: ask,
        }
      : null,
  ].filter(Boolean);
  async function remove() {
    setBusy(true);
    setFailed(false);
    try {
      await responseData(
        await requestJson(
          `/api/v1/sessions/${encodeURIComponent(item.sessionId)}`,
          { method: "DELETE" },
        ),
        message(locale, "sessionDeleteFailed"),
      );
      setAsking(false);
      headerStale();
      journalNotice(
        fillText(message(locale, "journalSessionDeletedNotice"), {
          days: SESSION_GRACE_DAYS,
        }),
      );
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (!items.length) return null;
  return (
    <>
      <ActionMenu
        label={message(locale, "journalMenuOpen")}
        items={items}
        testId="journal-session-menu"
      />
      {asking ? (
        <SessionDeleteDialog
          locale={locale}
          item={item}
          summary={summary}
          busy={busy}
          failed={failed}
          onCancel={() => setAsking(false)}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}

/**
 * « Supprimer cette session ? » what
 * goes with the session — the session with its slots, events and statistics, its
 * captures and their integrations (counted), the logs and data Astro Sync sent —,
 * the grace of 30 days, and the primary of the dialog in the destructive tint
 *; « Annuler » is a link.
 */
export function SessionDeleteDialog({
  locale,
  item,
  summary = null,
  busy = false,
  failed = false,
  onCancel,
  onConfirm,
}) {
  return (
    <WebDialog
      className="session-delete-dialog"
      bodyClassName="session-delete-body"
      role="alertdialog"
      closeLabel={message(locale, "nightPageCancel")}
      closeDisabled={busy}
      title={message(locale, "sessionDeleteConfirmTitle")}
      onClose={onCancel}
      footer={
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
            data-autofocus=""
            disabled={busy}
            onClick={onConfirm}
          >
            {message(locale, "sessionDeleteAction")}
          </button>
        </>
      }
    >
      <SessionDeleteBody
        locale={locale}
        item={item}
        summary={summary}
        failed={failed}
      />
    </WebDialog>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function SessionDeleteBody({
  locale,
  item,
  summary = null,
  failed = false,
}) {
  const captures = summary?.count ?? item.captureCount ?? 0;
  // The captures named, with their size, when the list of the space was read
  // (planche SDM01-3A); else counted.
  const named =
    summary?.labels?.length && summary.count === captures
      ? countedText(locale, "sessionDeleteItemCapturesNamed", captures)
          .replace("{list}", listText([...new Set(summary.labels)], locale))
          .replace("{size}", sizeText(summary.bytes, locale) || "—")
      : null;
  return (
    <>
      <p className="session-delete-what">
        {message(locale, "sessionDeleteWhatGoes")}
      </p>
      <ul className="session-delete-items">
        <li>{message(locale, "sessionDeleteItemSession")}</li>
        {captures > 0 ? (
          <li data-testid="session-delete-captures">
            {named ??
              fillText(message(locale, "sessionDeleteItemCaptures"), {
                count: captures,
              })}
          </li>
        ) : null}
        <li>{message(locale, "sessionDeleteItemAstroSync")}</li>
      </ul>
      {item.planId && item.planName ? (
        <p className="session-delete-plan-stays">
          {fillText(message(locale, "sessionDeletePlanStays"), {
            plan: item.planName,
          })}
        </p>
      ) : null}
      <p>
        {fillText(message(locale, "journalSessionDeleteGrace"), {
          days: SESSION_GRACE_DAYS,
        })}
      </p>
      {captures > 0 ? (
        <p className="session-delete-counted">
          {message(locale, "sessionDeleteCapturesCounted")}
        </p>
      ) : null}
      {failed ? (
        <p className="session-delete-failed" role="alert">
          {message(locale, "sessionDeleteFailed")}
        </p>
      ) : null}
    </>
  );
}
