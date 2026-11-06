"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { headerStale } from "../header-refresh.js";
import { WebDialog } from "../dialog/WebDialog.js";
import { countedText, fillText } from "../filters/FilterControls.js";
import { JournalDeleted } from "../sessions/JournalDeleted.js";
import { JournalOutcomeChip } from "../sessions/JournalOutcomeChip.js";
import { SessionDeleteDialog } from "../sessions/JournalSessionMenu.js";
import { journalLineHref } from "../sessions/journal-list-view.js";
import {
  SESSION_FILTERS,
  capturesBySession,
  filterSessionRows,
  listText,
  matchesSearch,
  sessionCounter,
  sessionRows,
  sizeText,
  sortRows,
} from "./space-lists.js";
import {
  deleteSession,
  loadCaptureSummaries,
  loadDeletedSessions,
  loadSessions,
} from "./space-lists-client.js";
import {
  ListBand,
  ListNotice,
  ListRow,
  SelectionBar,
} from "./SpaceListParts.js";

const GRACE_DAYS = 30;

const dateWords = (date, locale) => {
  const at = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(at)) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
};

/**
 * « Supprimer 2 sessions ? » (planche SDM01-3E): the sessions named by their
 * nights, their captures together (« 2 captures (0,4 Mo) : M31, M42 »), the
 * data of Astro Sync, the 30 days of « Sessions supprimées ».
 */
export function SessionsDeleteDialog({
  locale,
  rows,
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
      title={countedText(locale, "spaceSessionsDeleteManyTitle", rows.length)}
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
            data-action="confirm-delete"
            data-autofocus=""
            disabled={busy}
            onClick={onConfirm}
          >
            {countedText(locale, "spaceSessionsDeleteSelected", rows.length)}
          </button>
        </>
      }
    >
      <SessionsDeleteBody locale={locale} rows={rows} failure={failure} />
    </WebDialog>
  );
}

/**
 * The tab « Sessions » of « Mon espace » (SPACE-DATA-MANAGE-01, planche
 * SDM01-1B, 2C, 2D, 3A, 3E): every session of the Journal in one list — its
 * night, its place, its targets, its outcome, its captures and their size —,
 * its filters (« Toutes », « Avec captures », « Sans plan », « Supprimées »), a
 * search, the order, the counter; a ⋯ per row (« Voir la session », then
 * « Supprimer la session »), boxes and the bar of a selection. « Supprimées »
 * is the trash of the Journal (« Sessions supprimées »), the same rows and the
 * same words.
 */
export function SessionsTab({
  locale = "en",
  fetcher,
  csrf = () => "",
  leaves = () => false,
  initialFilter = "all",
}) {
  const [list, setList] = useState({
    status: "loading",
    lines: [],
    captures: new Map(),
  });
  const [deleted, setDeleted] = useState({ status: "loading", entries: [] });
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // The page hands a new `leaves` at each render: read through a ref, so
  // that reading the list again does not follow it.
  const leavesRef = useRef(leaves);
  leavesRef.current = leaves;
  const token = () => (typeof csrf === "function" ? csrf() : csrf);

  const reload = useCallback(async () => {
    const [sessions, trash, captures] = await Promise.all([
      loadSessions(fetcher),
      loadDeletedSessions(fetcher),
      loadCaptureSummaries(fetcher, { locale }),
    ]);
    if (leavesRef.current(sessions) || leavesRef.current(trash)) return;
    setList(
      sessions.kind === "ok"
        ? {
            status: "ready",
            lines: sessions.lines,
            captures: capturesBySession(captures),
          }
        : { status: "failed", lines: [], captures: new Map() },
    );
    setDeleted(
      trash.kind === "ok"
        ? { status: "ready", entries: trash.entries }
        : { status: "failed", entries: [] },
    );
  }, [fetcher, locale]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(
    () => sessionRows({ lines: list.lines, captures: list.captures, locale }),
    [list, locale],
  );
  const shown = useMemo(
    () =>
      sortRows(
        filterSessionRows(rows, filter).filter((row) =>
          matchesSearch(row, query),
        ),
        oldestFirst,
      ),
    [rows, filter, query, oldestFirst],
  );
  const chosen = shown.filter((row) => selected.has(row.key));
  const trashCount = deleted.entries.length;

  const remove = async (targets) => {
    setBusy(true);
    let count = 0;
    for (const row of targets) {
      const outcome = await deleteSession(fetcher, {
        id: row.id,
        csrf: token(),
      });
      if (leaves(outcome)) return;
      if (outcome.kind === "ok") count += 1;
    }
    setBusy(false);
    if (!count) {
      setDialog((current) =>
        current
          ? { ...current, failure: message(locale, "sessionDeleteFailed") }
          : current,
      );
      return;
    }
    setDialog(null);
    setSelected(new Set());
    setNotice({
      kind: "status",
      text:
        count === 1
          ? fillText(message(locale, "journalSessionDeletedNotice"), {
              days: GRACE_DAYS,
            })
          : fillText(message(locale, "spaceSessionsDeletedNoticeMany"), {
              count,
              days: GRACE_DAYS,
            }),
    });
    headerStale();
    await reload();
  };

  const filters = SESSION_FILTERS.map((key) => ({
    key,
    label:
      key === "deleted" && trashCount
        ? `${message(locale, "spaceSessionsFilterDeleted")} ${trashCount}`
        : message(
            locale,
            {
              all: "spaceSessionsFilterAll",
              captures: "spaceSessionsFilterCaptures",
              noPlan: "spaceSessionsFilterNoPlan",
              deleted: "spaceSessionsFilterDeleted",
            }[key],
          ),
  }));

  return (
    <section
      className="account-panel space-lists space-sessions"
      aria-label={message(locale, "spaceSessionsTitle")}
      aria-busy={list.status === "loading"}
      data-testid="space-sessions"
    >
      <div className="account-panel-heading space-list-heading">
        <h2>{message(locale, "spaceSessionsTitle")}</h2>
      </div>
      <ListBand
        filters={filters}
        filter={filter}
        onFilter={(key) => {
          setFilter(key);
          setSelected(new Set());
        }}
        query={query}
        onQuery={filter === "deleted" ? null : setQuery}
        searchLabel={message(locale, "spaceSessionsSearch")}
        oldestFirst={oldestFirst}
        onSort={
          filter === "deleted" ? null : () => setOldestFirst((value) => !value)
        }
        sortWords={{
          label: message(locale, "spaceSessionsSortLabel"),
          newest: message(locale, "spaceSessionsSortNewest"),
          oldest: message(locale, "spaceSessionsSortOldest"),
        }}
      />
      {filter !== "deleted" ? (
        <p className="captures-counter space-list-counter">
          {list.status === "ready" ? sessionCounter(shown, locale) : ""}
        </p>
      ) : null}
      <ListNotice notice={notice} />
      {filter === "deleted" ? (
        deleted.entries.length ? (
          <JournalDeleted
            entries={deleted.entries}
            graceDays={GRACE_DAYS}
            locale={locale}
            onChanged={reload}
            onNotice={(text) => setNotice({ kind: "status", text })}
          />
        ) : (
          <p className="space-list-empty">
            {message(locale, "spaceSessionsDeletedEmpty")}
          </p>
        )
      ) : list.status === "failed" ? (
        <div className="space-failure">
          <p className="account-muted">
            {message(locale, "spaceSessionsUnreadable")}
          </p>
          <button type="button" className="btn-link" onClick={reload}>
            {message(locale, "journalRetry")}
          </button>
        </div>
      ) : list.status === "loading" ? null : (
        <>
          <SelectionBar
            locale={locale}
            count={chosen.length}
            shown={shown.length}
            countKey="spaceSessionsSelected"
            deleteKey="spaceSessionsDeleteSelected"
            busy={busy}
            onAll={() => setSelected(new Set(shown.map((row) => row.key)))}
            onNone={() => setSelected(new Set())}
            onDelete={() =>
              setDialog(
                chosen.length === 1
                  ? { kind: "one", row: chosen[0] }
                  : { kind: "many", rows: chosen },
              )
            }
          />
          {shown.length ? (
            <ul className="space-list" data-testid="space-sessions-list">
              {shown.map((row) => (
                <ListRow
                  key={row.key}
                  row={row}
                  selected={selected.has(row.key)}
                  onSelect={(on) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (on) next.add(row.key);
                      else next.delete(row.key);
                      return next;
                    })
                  }
                  selectLabel={fillText(
                    message(locale, "spaceSessionsSelect"),
                    {
                      date: row.eyebrow,
                    },
                  )}
                  href={journalLineHref(locale, row.resource)}
                  badge={
                    row.projectName
                      ? fillText(message(locale, "spacePlansMultiOf"), {
                          name: row.projectName,
                        })
                      : null
                  }
                  state={
                    <JournalOutcomeChip
                      state={row.state}
                      locale={locale}
                      guidedEvening={row.guidedEvening === true}
                    />
                  }
                  menuLabel={message(locale, "journalMenuOpen")}
                  menuItems={[
                    {
                      key: "session",
                      label: message(locale, "planSeeSession"),
                      href: journalLineHref(locale, row.resource),
                    },
                    {
                      key: "delete",
                      label: message(locale, "sessionDeleteAction"),
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => {
                        setNotice(null);
                        setDialog({ kind: "one", row });
                      },
                    },
                  ]}
                />
              ))}
            </ul>
          ) : (
            <p className="space-list-empty">
              {message(
                locale,
                rows.length ? "spaceSessionsEmptyFilter" : "spaceSessionsEmpty",
              )}
            </p>
          )}
          {trashCount ? (
            <p className="space-list-foot">
              <button
                type="button"
                className="btn-link"
                data-action="show-deleted"
                onClick={() => {
                  setFilter("deleted");
                  setSelected(new Set());
                }}
              >
                {`${message(locale, "journalDeletedTitle")} (${trashCount})`}
              </button>
            </p>
          ) : null}
        </>
      )}
      {dialog?.kind === "one" ? (
        <SessionDeleteDialog
          locale={locale}
          item={dialog.row.resource}
          summary={{
            count: dialog.row.captureCount,
            bytes: dialog.row.captureBytes,
            labels: dialog.row.captureLabels,
          }}
          busy={busy}
          failed={Boolean(dialog.failure)}
          onCancel={() => setDialog(null)}
          onConfirm={() => remove([dialog.row])}
        />
      ) : null}
      {dialog?.kind === "many" ? (
        <SessionsDeleteDialog
          locale={locale}
          rows={dialog.rows}
          busy={busy}
          failure={dialog.failure}
          onCancel={() => setDialog(null)}
          onConfirm={() => remove(dialog.rows)}
        />
      ) : null}
    </section>
  );
}

/** The words of the dialog, apart (a test reads them without a browser). */
export function SessionsDeleteBody({ locale, rows, failure = null }) {
  const count = rows.reduce((sum, row) => sum + row.captureCount, 0);
  const bytes = rows.reduce((sum, row) => sum + row.captureBytes, 0);
  const labels = [...new Set(rows.flatMap((row) => row.captureLabels))];
  return (
    <>
      <p className="session-delete-what">
        {message(locale, "sessionDeleteWhatGoes")}
      </p>
      <ul className="session-delete-items">
        <li>
          {fillText(message(locale, "spaceSessionsDeleteManyItemSessions"), {
            dates: fillText(message(locale, "spaceSessionsDates"), {
              list: listText(
                rows.map((row) => dateWords(row.date, locale)),
                locale,
              ),
            }),
          })}
        </li>
        {count > 0 ? (
          <li data-testid="session-delete-captures">
            {labels.length
              ? countedText(locale, "sessionDeleteItemCapturesNamed", count)
                  .replace("{list}", listText(labels, locale))
                  .replace("{size}", sizeText(bytes, locale) || "—")
              : fillText(message(locale, "sessionDeleteItemCaptures"), {
                  count,
                })}
          </li>
        ) : null}
        <li>{message(locale, "spaceSessionsDeleteManyItemAstroSync")}</li>
      </ul>
      <p>
        {fillText(message(locale, "spaceSessionsDeleteManyGrace"), {
          days: GRACE_DAYS,
        })}
      </p>
      {count > 0 ? (
        <p className="session-delete-counted">
          {message(locale, "spaceSessionsDeleteManyCounted")}
        </p>
      ) : null}
      {failure ? (
        <p className="session-delete-failed" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}
