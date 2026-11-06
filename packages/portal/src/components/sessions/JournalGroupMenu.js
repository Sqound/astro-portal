"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { message } from "portal/i18n.js";
import { headerStale } from "../header-refresh.js";
import { fillText } from "../filters/FilterControls.js";
import { ActionMenu } from "../menu/ActionMenu.js";
import { ProjectDeleteDialog } from "../manage/PlanDeleteDialogs.js";
import { planRows } from "../manage/space-lists.js";
import { archiveProject, trashProject } from "../manage/space-lists-client.js";
import { callService } from "../space/space-client.js";
import { csrfToken } from "./portal-fetch.js";
import { journalNotice } from "./JournalSessionMenu.js";

/**
 * The ⋯ of the card of a multi-night plan in the Journal (planche SDM01-4A,
 * 4B), beside the chevron of its corner: « Voir le plan », « Archiver ce plan
 * multi-nuits », then « Supprimer ce plan multi-nuits » in the destructive
 * tint, which asks first (the dialog of « Mon espace », 3B: its nights to
 * come go with it, its sessions stay in the Journal, detached).
 */
export function JournalGroupMenu({ group, planHref, locale = "en" }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const fetcher = globalThis.fetch?.bind(globalThis);

  const read = async () => {
    const answer = await callService(
      fetcher,
      `/api/v1/projects/${encodeURIComponent(group.projectId)}`,
    );
    return answer.status === 200 ? answer.body : null;
  };

  const ask = async () => {
    const project = await read();
    if (!project) {
      journalNotice(message(locale, "spacePlansActionFailed"), "alert");
      return;
    }
    const [row] = planRows({ projects: [project], locale });
    setDialog({ row });
  };

  const archive = async () => {
    const project = await read();
    const outcome = project
      ? await archiveProject(fetcher, {
          id: project.id,
          revision: project.revision,
          csrf: csrfToken(),
        })
      : { kind: "failed" };
    journalNotice(
      message(
        locale,
        outcome.kind === "ok"
          ? "journalGroupArchivedNotice"
          : "spacePlansActionFailed",
      ),
      outcome.kind === "ok" ? "status" : "alert",
    );
    if (outcome.kind === "ok") router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    const outcome = await trashProject(fetcher, {
      id: group.projectId,
      force: dialog.row.running,
      csrf: csrfToken(),
    });
    setBusy(false);
    if (outcome.code === "project_in_progress") {
      setDialog({ row: { ...dialog.row, running: true } });
      return;
    }
    if (outcome.kind !== "ok") {
      setDialog({
        ...dialog,
        failure: message(locale, "spacePlansActionFailed"),
      });
      return;
    }
    setDialog(null);
    headerStale();
    journalNotice(
      fillText(message(locale, "spacePlansMultiDeletedNotice"), { days: 30 }),
    );
    router.refresh();
  };

  return (
    <>
      <ActionMenu
        label={message(locale, "journalGroupMenu")}
        testId="journal-group-menu"
        className="journal-group-menu"
        items={[
          {
            key: "plan",
            label: message(locale, "journalGroupSeePlan"),
            href: planHref,
          },
          group.status !== "archived"
            ? {
                key: "archive",
                label: message(locale, "spacePlansArchiveMulti"),
                onSelect: archive,
              }
            : null,
          {
            key: "delete",
            label: message(locale, "spacePlansDeleteMulti"),
            destructive: true,
            separatorBefore: true,
            onSelect: ask,
          },
        ]}
      />
      {dialog ? (
        <ProjectDeleteDialog
          locale={locale}
          row={dialog.row}
          busy={busy}
          failure={dialog.failure}
          onCancel={() => setDialog(null)}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
