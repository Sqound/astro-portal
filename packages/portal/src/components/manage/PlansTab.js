"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { headerStale } from "../header-refresh.js";
import { StatusTag } from "../status/StatusTag.js";
import {
  countedText,
  fillText,
  pluralText,
} from "../filters/FilterControls.js";
import {
  guidedPlanName,
  multiNightPlanHref,
} from "../sessions/journal-list-view.js";
import { callService } from "../space/space-client.js";
import {
  PLAN_FILTERS,
  filterPlanRows,
  matchesSearch,
  planCounter,
  planRows,
  sortRows,
} from "./space-lists.js";
import {
  archivePlan,
  archiveProject,
  deletePlan,
  erasePlan,
  eraseProject,
  loadDeletedPlans,
  loadPlansAndProjects,
  restorePlan,
  restoreProject,
  trashProject,
  unarchivePlan,
} from "./space-lists-client.js";
import {
  ListBand,
  ListNotice,
  ListRow,
  SelectionBar,
} from "./SpaceListParts.js";
import {
  PlanDeleteDialog,
  PlanEraseDialog,
  PlanRefusalDialog,
  PlansDeleteDialog,
  ProjectDeleteDialog,
} from "./PlanDeleteDialogs.js";

const GRACE_DAYS = 30;

const dayOf = (instant, locale) => {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
};

/** The address that edits a plan of one night: the planner, on that plan. */
export const planEditHref = (locale, row) =>
  row.clientId
    ? `/${locale}/planner?plan=${encodeURIComponent(row.clientId)}`
    : `/${locale}/planner?view=plans`;

/**
 * The tab « Plans » of « Mon espace » (SPACE-DATA-MANAGE-01, planche SDM01-1B,
 * 2A, 2C, 3B–3D): every plan of the space — of one night and multi-night —
 * in one list, with its filters (« Tous », « Une nuit », « Multi-nuits »,
 * « Archivés », « Supprimés »), a search, the order, the counter; a ⋯ per row
 * (« Modifier le plan », « Archiver le plan », then « Supprimer le plan » in
 * the destructive tint); boxes and the bar of a selection (« Archiver »,
 * « Supprimer les 2 plans »). A deleted plan stays 30 days in « Supprimés »,
 * where it is restored or deleted for good. A plan that ran is not deleted:
 * its dialog says to archive it or to delete its session. The planner and the
 * Journal stay as they are.
 */
export function PlansTab({
  locale = "en",
  fetcher,
  csrf = () => "",
  leaves = () => false,
  initialFilter = "all",
}) {
  const [list, setList] = useState({
    status: "loading",
    plans: [],
    projects: [],
  });
  const [deleted, setDeleted] = useState({
    status: "loading",
    plans: [],
    projects: [],
  });
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
    const [plans, trash] = await Promise.all([
      loadPlansAndProjects(fetcher),
      loadDeletedPlans(fetcher),
    ]);
    if (leavesRef.current(plans) || leavesRef.current(trash)) return;
    setList(
      plans.kind === "ok"
        ? { status: "ready", plans: plans.plans, projects: plans.projects }
        : { status: "failed", plans: [], projects: [] },
    );
    setDeleted(
      trash.kind === "ok"
        ? { status: "ready", plans: trash.plans, projects: trash.projects }
        : { status: "failed", plans: [], projects: [] },
    );
  }, [fetcher]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(
    () => planRows({ plans: list.plans, projects: list.projects, locale }),
    [list, locale],
  );
  const shown = useMemo(
    () =>
      sortRows(
        filterPlanRows(rows, filter).filter((row) => matchesSearch(row, query)),
        oldestFirst,
      ),
    [rows, filter, query, oldestFirst],
  );
  const chosen = shown.filter((row) => selected.has(row.key));
  const trashCount = deleted.plans.length + deleted.projects.length;

  const select = (row, on) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(row.key);
      else next.delete(row.key);
      return next;
    });

  const done = async (text, kind = "status") => {
    setDialog(null);
    setSelected(new Set());
    setNotice(text ? { text, kind } : null);
    headerStale();
    await reload();
  };

  /** The open session's last signal, for « dernier signal il y a 4 min ». */
  const signalOf = async (row) => {
    if (!row.executionSessionId) return null;
    const answer = await callService(
      fetcher,
      `/api/v1/sessions/${encodeURIComponent(row.executionSessionId)}`,
    );
    return answer.status === 200
      ? (answer.body?.session?.updatedAt ?? answer.body?.updatedAt ?? null)
      : null;
  };

  const askDelete = async (targets) => {
    setNotice(null);
    const deletable = targets.filter((row) => row.rights.deletable);
    const skipped = targets.length - deletable.length;
    if (targets.length === 1 && !deletable.length) {
      setDialog({ kind: "refusal", row: targets[0] });
      return;
    }
    if (!deletable.length) {
      setNotice({
        text: countedText(locale, "spacePlansSkippedExecuted", skipped),
        kind: "alert",
      });
      return;
    }
    if (deletable.length === 1 && !skipped) {
      const [row] = deletable;
      if (row.kind === "project") setDialog({ kind: "project", row });
      else
        setDialog({
          kind: "plan",
          row,
          signalAt: row.running ? await signalOf(row) : null,
        });
      return;
    }
    setDialog({ kind: "many", rows: deletable, skipped });
  };

  const removeRows = async (targets) => {
    setBusy(true);
    let failed = null;
    let deletedCount = 0;
    for (const row of targets) {
      const outcome =
        row.kind === "project"
          ? await trashProject(fetcher, {
              id: row.id,
              force: row.running,
              csrf: token(),
            })
          : await deletePlan(fetcher, {
              id: row.id,
              revision: row.revision,
              force: row.running,
              csrf: token(),
            });
      if (leaves(outcome)) return;
      if (outcome.kind === "ok") deletedCount += 1;
      else if (
        ["plan_in_progress", "project_in_progress"].includes(outcome.code) &&
        targets.length === 1
      ) {
        // The night started on a phone since the list was read: said, and
        // asked again with « Supprimer quand même ».
        setBusy(false);
        setDialog({
          kind: row.kind === "project" ? "project" : "plan",
          row: { ...row, running: true },
          signalAt: outcome.body?.lastSignalAt ?? null,
        });
        return;
      } else if (
        outcome.code === "plan_not_deletable" &&
        targets.length === 1
      ) {
        // Its session came back to the Journal since the list was read.
        setBusy(false);
        setDialog({
          kind: "refusal",
          row: {
            ...row,
            rights: { ...row.rights, deletable: false, heldBySession: true },
          },
        });
        return;
      } else failed = message(locale, "spacePlansActionFailed");
    }
    setBusy(false);
    if (failed && !deletedCount) {
      setDialog((current) =>
        current ? { ...current, failure: failed } : current,
      );
      return;
    }
    const single = targets.length === 1 ? targets[0] : null;
    await done(
      single?.kind === "project"
        ? fillText(message(locale, "spacePlansMultiDeletedNotice"), {
            days: GRACE_DAYS,
          })
        : deletedCount === 1
          ? fillText(message(locale, "spacePlansDeletedNotice"), {
              days: GRACE_DAYS,
            })
          : fillText(message(locale, "spacePlansDeletedNoticeMany"), {
              count: deletedCount,
              days: GRACE_DAYS,
            }),
    );
  };

  const archiveRows = async (targets) => {
    setBusy(true);
    let count = 0;
    for (const row of targets.filter((one) => one.rights.archivable)) {
      const outcome =
        row.kind === "project"
          ? await archiveProject(fetcher, {
              id: row.id,
              revision: row.revision,
              csrf: token(),
            })
          : await archivePlan(fetcher, {
              resource: row.resource,
              csrf: token(),
            });
      if (leaves(outcome)) return;
      if (outcome.kind === "ok") count += 1;
    }
    setBusy(false);
    await done(
      count === 0
        ? message(locale, "spacePlansActionFailed")
        : count === 1
          ? message(locale, "spacePlansArchivedNotice")
          : fillText(message(locale, "spacePlansArchivedNoticeMany"), {
              count,
            }),
      count === 0 ? "alert" : "status",
    );
  };

  const unarchive = async (row) => {
    const outcome = await unarchivePlan(fetcher, {
      resource: row.resource,
      csrf: token(),
    });
    if (leaves(outcome)) return;
    await done(
      message(
        locale,
        outcome.kind === "ok"
          ? "spacePlansUnarchivedNotice"
          : "spacePlansActionFailed",
      ),
      outcome.kind === "ok" ? "status" : "alert",
    );
  };

  const restore = async (entry) => {
    setBusy(true);
    const outcome =
      entry.kind === "project"
        ? await restoreProject(fetcher, { id: entry.id, csrf: token() })
        : await restorePlan(fetcher, { id: entry.id, csrf: token() });
    setBusy(false);
    if (leaves(outcome)) return;
    if (outcome.kind !== "ok") {
      setNotice({
        kind: "alert",
        text: message(
          locale,
          outcome.code === "plan_night_place_conflict"
            ? "spacePlansRestoreTaken"
            : outcome.code === "plan_limit_reached"
              ? "spacePlansRestoreLimit"
              : "spacePlansActionFailed",
        ),
      });
      return;
    }
    const kept = outcome.body?.plansKept ?? 0;
    await done(
      kept > 0
        ? countedText(locale, "spacePlansRestoreKept", kept)
        : message(locale, "spacePlansRestoredNotice"),
    );
  };

  const erase = async (entry) => {
    setBusy(true);
    const outcome =
      entry.kind === "project"
        ? await eraseProject(fetcher, { id: entry.id, csrf: token() })
        : await erasePlan(fetcher, { id: entry.id, csrf: token() });
    setBusy(false);
    if (leaves(outcome)) return;
    await done(
      message(
        locale,
        outcome.kind === "ok"
          ? "spacePlansErasedNotice"
          : "spacePlansActionFailed",
      ),
      outcome.kind === "ok" ? "status" : "alert",
    );
  };

  const menuOf = (row) =>
    row.kind === "project"
      ? [
          {
            key: "open",
            label: message(locale, "spacePlansOpenMulti"),
            href: multiNightPlanHref(locale, row.id),
          },
          row.rights.archivable
            ? {
                key: "archive",
                label: message(locale, "spacePlansArchiveMulti"),
                onSelect: () => archiveRows([row]),
              }
            : null,
          {
            key: "delete",
            label: message(locale, "spacePlansDeleteMulti"),
            destructive: true,
            separatorBefore: true,
            onSelect: () => askDelete([row]),
          },
        ]
      : [
          // The internal plan of a guided evening is not edited in the
          // planner.
          row.guidedEvening
            ? null
            : {
                key: "edit",
                label: message(locale, "spacePlansEdit"),
                href: planEditHref(locale, row),
              },
          row.rights.archived
            ? {
                key: "unarchive",
                label: message(locale, "spacePlansUnarchive"),
                onSelect: () => unarchive(row),
              }
            : {
                key: "archive",
                label: message(locale, "spacePlansArchive"),
                onSelect: () => archiveRows([row]),
              },
          {
            key: "delete",
            label: message(locale, "spacePlansDelete"),
            destructive: true,
            separatorBefore: true,
            onSelect: () => askDelete([row]),
          },
        ];

  const stateOf = (row) =>
    row.kind === "project" ? (
      <>
        <span className="journal-badge is-plan">
          {message(locale, "spacePlansMultiKind")}
        </span>
        <StatusTag
          tone={row.tone}
          locale={locale}
          scheme={false}
          glyph={row.running ? "running" : row.tone}
          label={row.running ? message(locale, "spacePlansRunning") : row.label}
        />
      </>
    ) : (
      <StatusTag
        tone={row.tone}
        locale={locale}
        scheme={!row.running}
        glyph={row.glyph ?? row.tone}
        label={row.running ? message(locale, "spacePlansRunning") : null}
      />
    );

  const filters = PLAN_FILTERS.map((key) => ({
    key,
    label:
      key === "deleted" && trashCount
        ? `${message(locale, "spacePlansFilterDeleted")} ${trashCount}`
        : message(
            locale,
            {
              all: "spacePlansFilterAll",
              one: "spacePlansFilterOneNight",
              multi: "spacePlansFilterMulti",
              archived: "spacePlansFilterArchived",
              deleted: "spacePlansFilterDeleted",
            }[key],
          ),
  }));

  const deletedEntries = useMemo(() => {
    const names = new Map(
      deleted.projects.map((entry) => [
        entry.project.id,
        [entry.project.target?.name, entry.project.target?.commonName]
          .filter(Boolean)
          .join(" · "),
      ]),
    );
    return [
      ...deleted.projects.map((entry) => ({
        kind: "project",
        id: entry.project.id,
        name: names.get(entry.project.id),
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        daysRemaining: entry.daysRemaining,
        extra:
          entry.planIds.length > 0
            ? countedText(
                locale,
                "spacePlansDeletedNightsWith",
                entry.planIds.length,
              )
            : null,
      })),
      ...deleted.plans.map((entry) => ({
        kind: "plan",
        id: entry.plan.id,
        name: entry.plan.payload?.guidedEvening
          ? guidedPlanName(locale, entry.plan.payload?.name)
          : entry.plan.payload?.name || entry.plan.payload?.date,
        place: entry.plan.payload?.location?.name ?? null,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        daysRemaining: entry.daysRemaining,
        extra: entry.projectId
          ? fillText(message(locale, "spacePlansDeletedWith"), {
              name: names.get(entry.projectId) ?? "",
            })
          : null,
      })),
    ].sort((left, right) =>
      String(right.deletedAt).localeCompare(String(left.deletedAt)),
    );
  }, [deleted, locale]);

  const deletedView = (
    <>
      <p className="space-list-note">
        {fillText(message(locale, "spacePlansDeletedIntro"), {
          days: GRACE_DAYS,
        })}
      </p>
      {deletedEntries.length ? (
        <ul
          className="journal-deleted-list space-deleted-list"
          data-testid="space-plans-deleted"
        >
          {deletedEntries.map((entry) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              className="journal-deleted-row"
              data-entry={entry.id}
            >
              <div className="journal-deleted-text">
                <p className="journal-deleted-evening">
                  {entry.kind === "project"
                    ? `${message(locale, "spacePlansMultiKind")} · ${entry.name}`
                    : entry.name}
                </p>
                <p className="journal-deleted-meta">
                  {[
                    entry.place,
                    entry.extra,
                    fillText(message(locale, "spacePlansDeletedRow"), {
                      deleted: dayOf(entry.deletedAt, locale),
                      purge: dayOf(entry.purgeAt, locale),
                    }),
                    fillText(
                      pluralText(
                        locale,
                        "journalDeletedDaysLeft",
                        entry.daysRemaining,
                      ),
                      { days: entry.daysRemaining },
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="journal-deleted-actions">
                <button
                  type="button"
                  className="btn-tertiary is-destructive"
                  data-action="erase"
                  disabled={busy}
                  onClick={() => setDialog({ kind: "erase", entry })}
                >
                  {message(locale, "journalDeletedDeleteForever")}
                </button>
                <button
                  type="button"
                  className="btn-tertiary"
                  data-action="restore"
                  disabled={busy}
                  onClick={() => restore(entry)}
                >
                  {message(
                    locale,
                    entry.kind === "project"
                      ? "spacePlansRestoreMulti"
                      : "spacePlansRestore",
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="space-list-empty">
          {message(locale, "spacePlansDeletedEmpty")}
        </p>
      )}
    </>
  );

  return (
    <section
      className="account-panel space-lists space-plans"
      aria-label={message(locale, "spacePlansTitle")}
      aria-busy={list.status === "loading"}
      data-testid="space-plans"
    >
      <div className="account-panel-heading space-list-heading">
        <h2>{message(locale, "spacePlansTitle")}</h2>
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
        searchLabel={message(locale, "spacePlansSearch")}
        oldestFirst={oldestFirst}
        onSort={
          filter === "deleted" ? null : () => setOldestFirst((value) => !value)
        }
        sortWords={{
          label: message(locale, "spacePlansSortLabel"),
          newest: message(locale, "spacePlansSortNewest"),
          oldest: message(locale, "spacePlansSortOldest"),
        }}
      />
      <p className="captures-counter space-list-counter">
        {filter === "deleted"
          ? countedText(locale, "spacePlansDeletedCount", trashCount)
          : list.status === "ready"
            ? planCounter(shown, locale)
            : ""}
      </p>
      <ListNotice notice={notice} />
      {filter === "deleted" ? (
        deletedView
      ) : list.status === "failed" ? (
        <div className="space-failure">
          <p className="account-muted">
            {message(locale, "spacePlansUnreadable")}
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
            countKey="spacePlansSelected"
            deleteKey="spacePlansDeleteSelected"
            busy={busy}
            onAll={() => setSelected(new Set(shown.map((row) => row.key)))}
            onNone={() => setSelected(new Set())}
            onArchive={
              chosen.some((row) => row.rights.archivable)
                ? () => archiveRows(chosen)
                : null
            }
            onDelete={() => askDelete(chosen)}
          />
          {shown.length ? (
            <ul className="space-list" data-testid="space-plans-list">
              {shown.map((row) => (
                <ListRow
                  key={row.key}
                  row={row}
                  selected={selected.has(row.key)}
                  onSelect={(on) => select(row, on)}
                  selectLabel={fillText(message(locale, "spacePlansSelect"), {
                    name: row.name,
                  })}
                  href={
                    row.kind === "project"
                      ? multiNightPlanHref(locale, row.id)
                      : row.guidedEvening
                        ? null
                        : planEditHref(locale, row)
                  }
                  badge={
                    row.projectName
                      ? fillText(message(locale, "spacePlansMultiOf"), {
                          name: row.projectName,
                        })
                      : null
                  }
                  state={stateOf(row)}
                  menuLabel={message(
                    locale,
                    row.kind === "project"
                      ? "spacePlansMenuMulti"
                      : "spacePlansMenu",
                  )}
                  menuItems={menuOf(row)}
                />
              ))}
            </ul>
          ) : (
            <p className="space-list-empty">
              {message(
                locale,
                rows.length ? "spacePlansEmptyFilter" : "spacePlansEmpty",
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
                {`${message(locale, "spacePlansDeletedLink")} (${trashCount})`}
              </button>
            </p>
          ) : null}
        </>
      )}
      {dialog?.kind === "plan" ? (
        <PlanDeleteDialog
          locale={locale}
          row={dialog.row}
          signalAt={dialog.signalAt}
          busy={busy}
          failure={dialog.failure}
          onCancel={() => setDialog(null)}
          onConfirm={() => removeRows([dialog.row])}
        />
      ) : null}
      {dialog?.kind === "project" ? (
        <ProjectDeleteDialog
          locale={locale}
          row={dialog.row}
          busy={busy}
          failure={dialog.failure}
          onCancel={() => setDialog(null)}
          onConfirm={() => removeRows([dialog.row])}
        />
      ) : null}
      {dialog?.kind === "many" ? (
        <PlansDeleteDialog
          locale={locale}
          rows={dialog.rows}
          skipped={dialog.skipped}
          busy={busy}
          failure={dialog.failure}
          onCancel={() => setDialog(null)}
          onConfirm={() => removeRows(dialog.rows)}
        />
      ) : null}
      {dialog?.kind === "refusal" ? (
        <PlanRefusalDialog
          locale={locale}
          row={dialog.row}
          busy={busy}
          onClose={() => setDialog(null)}
          onArchive={
            dialog.row.rights.archivable
              ? () => archiveRows([dialog.row])
              : null
          }
        />
      ) : null}
      {dialog?.kind === "erase" ? (
        <PlanEraseDialog
          locale={locale}
          entry={dialog.entry}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => erase(dialog.entry)}
        />
      ) : null}
    </section>
  );
}
