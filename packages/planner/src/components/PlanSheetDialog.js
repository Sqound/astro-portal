"use client";

import { useEffect, useMemo, useState } from "react";
import { TargetTile } from "portal/components/ObjectPictogram.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { StatusTag } from "portal/components/status/StatusTag.js";
import { AcquisitionDialog } from "./AcquisitionDialog.js";
import { AcquisitionTargetBlock } from "./AcquisitionParts.js";
import { PlanFrise } from "./PlanFrise.js";
import { PlanExecutionCard, PlanExecutionTag } from "./PlanExecutionCard.js";
import { PlanTargetDialog } from "./PlanTargetDialog.js";
import {
  planDialogModel,
  targetDialogModel,
} from "../acquisition-dialog-model.js";
import {
  acquisitionExampleItem,
  acquisitionItemView,
  chosenDefaults,
} from "../acquisition-reading.js";
import { acquisitionPlanLineText } from "../acquisition-words.js";
import { launchedAcquisitionByItem } from "../plan-acquisition.js";
import { planFriseInput, planFriseOf } from "../plan-frise-input.js";
import { planDebriefWordKey } from "../plan-library-filters.js";
import { planSheetWords } from "../plan-sheet-words.js";
import {
  loadPlanTargetPictures,
  planTargetIds,
  targetWithPicture,
} from "../plan-target-pictures.js";
import { scorePlanTargets } from "../tonight-plan-targets.js";

// The dialog of a plan in the web library, in a `WebDialog`. A click on a
// library card opens it: the name with the dialog's cross, the tags of the plan
// (the shared palette; "Exécuté" then "À débriefer" when its session waits) and
// the sync line, for an executed plan the notice "lié à sa session" with "Voir
// la session", the framed block of the plan, the read-only line, the reduced
// frise, "N cibles · … placées" and the targets in the order of the night — a
// row opens the target's dialog —, then "Autres actions" (the ones that keep,
// the removing ones last, never "Supprimer le plan" on an executed plan) and,
// fixed at the bottom, the action that matters: the blue "Débriefer cette
// session" of a night that waits, else "Modifier le plan", with the icon-only
// "Exporter ce plan" at the end of that bar for a plan in any state. No
// "Exécuter le plan" on the web (no execution page); no "Versions précédentes"
// (the web keeps no set-aside version).
//
// "Prise de vue par cible": in the facts, under the equipment, the plan's defaults — "Prise de
// vue · pose suggérée · gain 100 · filtre conseillé" — and a pencil icon button (tertiary, 44
// px), which opens the dialog "Paramètres de la pose" for the plan; under each target, its
// effective line — "120 s · gain 100 · UV/IR-cut · ≈ 39 poses" —, "suggéré" while nothing is
// chosen for it, and the link "Paramètres de la pose ›" that opens the same dialog for that
// target. A plan whose night was launched shows what the launch froze, read-only; a plan that
// is no longer pending shows nothing. Photo mode only (`acquisition` is `null` otherwise).

const icons = {
  night: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  place: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  rig: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  darkness: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  pencil: (
    <>
      <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </>
  ),
};

export function PlanSheetDialog({
  locale,
  plan,
  clock = (value) => value,
  rigName = "",
  profileSets = null,
  // The sky of the plan's place (`{ sqm, bortleClass }`, see
  // `placeVisualSky`) the visual limit of its targets reads; null: dark sky.
  visualSkyQuality = null,
  unsyncedLabel = null,
  // What the Journal says of the plan (`plan-sessions.js`): its session.
  session = null,
  // The actions the plan offers (`planActionsOf`) and what they do.
  actions = { keep: [], remove: [] },
  recreating = false,
  now = Date.now(),
  onClose,
  onAction,
  onRecreate,
  // "Prise de vue par cible": `{ basis, onWriteDefaults(line),
  // onWriteItemLine(itemId, line) }` for a plan in photo mode, else `null`.
  acquisition = null,
  // `{ state: "running" | "paused" }` when the plan's night runs on a phone —
  // the dialog reads "Nuit en cours", shows the launched slots and offers
  // nothing that edits, executes, archives or deletes silently.
  execution = null,
}) {
  const nights = useMemo(() => {
    try {
      return scorePlanTargets({
        plan,
        profileSets,
        visualSkyQuality,
        locale,
      });
    } catch {
      return {};
    }
  }, [plan, profileSets, visualSkyQuality, locale]);
  const words = planSheetWords(locale, plan, {
    now,
    clock,
    rigName,
    nights,
    unsyncedLabel,
    session,
    execution,
  });
  const frise = useMemo(() => {
    return planFriseOf(planFriseInput(plan));
  }, [plan]);
  const [target, setTarget] = useState(null);
  const [acquisitionDialog, setAcquisitionDialog] = useState(null);
  // The picture of each target, as its card in the catalogue has it: read
  // once the dialog is open, the pictogram until then and where there is none.
  const targetIdsKey = planTargetIds(plan).join(",");
  const [pictures, setPictures] = useState(() => new Map());
  useEffect(() => {
    const ids = targetIdsKey ? targetIdsKey.split(",") : [];
    if (!ids.length) return undefined;
    const controller = new AbortController();
    loadPlanTargetPictures({ locale, ids, signal: controller.signal }).then(
      (rows) => {
        if (!controller.signal.aborted) setPictures(rows);
      },
    );
    return () => controller.abort();
  }, [locale, targetIdsKey]);
  const rowTarget = (entry) => {
    const item = plan.items?.[entry.item.index];
    return targetWithPicture(
      entry.item.target ?? item?.target,
      pictures.get(item?.target?.id ?? item?.id),
    );
  };
  // The lines show for a plan that is not finished; the launch's frozen lines
  // are read-only, and only a plan the dialog can edit takes a change.
  const basis =
    acquisition?.basis?.photo && words.kind !== "past"
      ? acquisition.basis
      : null;
  const frozen = basis
    ? Object.keys(launchedAcquisitionByItem(plan)).length > 0
    : false;
  const acquisitionEditable = Boolean(basis) && words.canEdit && !frozen;
  const planItemOf = (entry) => plan.items?.[entry.item.index] ?? null;
  const openTargetAcquisition = (entry) => {
    const item = planItemOf(entry);
    if (!item) return;
    const model = targetDialogModel({
      locale,
      basis,
      itemId: item.id,
      editable: acquisitionEditable,
      targetName: entry.designation,
      slot:
        entry.item.start && entry.item.end
          ? `${clock(entry.item.start)} → ${clock(entry.item.end)}`
          : null,
      minutes: entry.item.minutes ?? null,
      writeItemLine: acquisition.onWriteItemLine,
    });
    if (model) setAcquisitionDialog(model);
  };
  const openPlanAcquisition = () =>
    setAcquisitionDialog(
      planDialogModel({
        locale,
        basis,
        editable: acquisitionEditable,
        nameOf: (item) =>
          item?.target?.designation ?? item?.target?.title ?? String(item?.id),
        planName: words.title,
        writeDefaults: acquisition.onWriteDefaults,
      }),
    );
  const planAcquisitionLine = (() => {
    if (!basis || frozen) return null;
    const example = acquisitionExampleItem(basis.plan);
    return acquisitionPlanLineText(
      locale,
      chosenDefaults(basis.plan),
      example ? basis.suggestion(example) : null,
    );
  })();
  const row = (kind, text) =>
    text ? (
      <p className="plan-sheet-fact" data-row={kind}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {icons[kind]}
        </svg>
        <span>{text}</span>
      </p>
    ) : null;
  const offers = (action) =>
    actions.keep.includes(action) || actions.remove.includes(action);
  // An executed plan is linked to its session, which holds the
  // captures and the data of the night.
  const linked =
    words.sessionHref &&
    ["executed", "partial", "abandoned"].includes(words.status);
  const debrief = offers("debrief") && words.sessionHref;
  // A pending plan whose night is over and has no session — a night done
  // without the application, declared afterwards — reads "Marquer comme
  // faite" where a night run here reads "Débriefer cette session"; both go
  // to the same debriefing.
  const declared = debrief && words.status === "pending" && !session?.sessionId;
  // The action that matters is fixed at the bottom: the blue
  // "Débriefer cette session" of a night that waits, else "Modifier le
  // plan". The others are "Autres actions", the removing ones last.
  const footer = [
    debrief ? (
      <a
        key="debrief"
        className="btn-secondary is-debrief plan-sheet-action"
        data-action={declared ? "mark-done" : "debrief"}
        href={words.sessionHref}
      >
        {message(locale, planDebriefWordKey(declared))}
      </a>
    ) : null,
    words.canEdit && offers("edit") ? (
      <button
        key="edit"
        type="button"
        className="btn-secondary plan-sheet-action"
        data-action="edit"
        onClick={() => onAction?.("edit")}
      >
        {message(locale, "plannerEditPlan")}
      </button>
    ) : null,
  ].filter(Boolean);
  // The plan's export, at the end of the fixed bar whatever the state of the
  // plan (an executed, archived or abandoned plan is exported as it is): the
  // icon-only tertiary, opening the planner's export menu for this plan.
  const exportLabel = message(locale, "plannerExportTitle");
  const exportButton = onAction ? (
    <button
      key="export"
      type="button"
      className="btn-tertiary plan-sheet-export"
      data-action="export"
      aria-label={exportLabel}
      title={exportLabel}
      onClick={() => onAction("export")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15V4" />
        <path d="m8 8 4-4 4 4" />
        <path d="M6 12v7h12v-7" />
      </svg>
    </button>
  ) : null;
  const others = [
    ...actions.keep.filter((action) =>
      ["execute", "abandon", "restore"].includes(action),
    ),
    ...actions.remove,
  ];
  const otherWords = {
    execute: "plannerPlanExecute",
    abandon: "plannerPlanAbandon",
    restore: "plannerPlanRestore",
    archive: "plannerPlanArchive",
    delete: "plannerDeletePlan",
  };
  return (
    <>
      <WebDialog
        className="plan-sheet-dialog"
        focusTitle
        bodyClassName="plan-sheet-body"
        title={words.title}
        ariaLabel={words.title}
        closeLabel={message(locale, "infoClose")}
        onClose={onClose}
        footerClassName={`plan-sheet-footer${footer.length === 0 ? " is-alone" : ""}`}
        footer={
          footer.length || exportButton ? [...footer, exportButton] : null
        }
      >
        <p className="plan-sheet-status">
          {execution ? (
            <PlanExecutionTag locale={locale} execution={execution} />
          ) : (
            words.tags.map((tag) => (
              <StatusTag
                key={tag}
                tone={tag}
                locale={locale}
                data-plan-status={tag}
              />
            ))
          )}
          <span className="plan-sheet-sync">{words.sync}</span>
        </p>
        {linked ? (
          <section className="plan-sheet-linked" data-testid="plan-linked">
            <p>{message(locale, "planLinkedToSession")}</p>
            <a
              className={debrief ? "btn-tertiary" : "btn-secondary"}
              data-action="see-session"
              href={words.sessionHref}
            >
              {message(locale, "planSeeSession")}
            </a>
          </section>
        ) : null}
        {words.sessionMissing ? (
          <section className="plan-sheet-linked" data-testid="plan-missing">
            <h3>{message(locale, "planSessionMissing")}</h3>
            <p>{message(locale, "planSessionMissingBody")}</p>
            <button
              type="button"
              className="btn-secondary"
              data-action="recreate-session"
              disabled={recreating}
              onClick={() => onRecreate?.()}
            >
              {message(locale, "planRecreateSession")}
            </button>
          </section>
        ) : null}
        <section
          className="plan-sheet-block"
          aria-label={message(locale, "planSheetBlock")}
        >
          {row("night", words.night)}
          {row("place", words.place)}
          {row("rig", words.rig)}
          {planAcquisitionLine ? (
            <div
              className="plan-sheet-fact plan-sheet-acquisition"
              data-row="acquisition"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {icons.camera}
              </svg>
              <span data-acquisition="plan-line">{planAcquisitionLine}</span>
              {acquisitionEditable ? (
                <button
                  type="button"
                  className="btn-tertiary acq-plan-edit"
                  data-testid="plan-sheet-acquisition-edit"
                  aria-label={message(locale, "acqPlanEdit")}
                  title={message(locale, "acqPlanEdit")}
                  onClick={openPlanAcquisition}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {icons.pencil}
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
          {row("darkness", words.darkness)}
        </section>
        {words.readOnly ? (
          <p className="plan-sheet-read-only">{words.readOnly}</p>
        ) : null}
        {words.sessionLine ? (
          <p className="plan-sheet-session-line">{words.sessionLine}</p>
        ) : null}
        {execution ? (
          <PlanExecutionCard
            locale={locale}
            plan={plan}
            execution={execution}
            place={plan?.location ?? null}
            timeZone={plan?.location?.timeZone}
            clock={clock}
            variant="reduced"
            showTag={false}
          />
        ) : frise ? (
          <PlanFrise
            frise={frise}
            locale={locale}
            clock={clock}
            variant="reduced"
          />
        ) : null}
        <h3 className="plan-sheet-heading">{words.heading}</h3>
        {words.rows.length > 0 ? (
          <ul
            className="plan-sheet-targets"
            aria-label={message(locale, "planHubDetailsTargets")}
          >
            {words.rows.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className="plan-sheet-target-row"
                  data-item={entry.key}
                  onClick={() => setTarget(entry)}
                >
                  <TargetTile
                    target={rowTarget(entry)}
                    locale={locale}
                    visualMode={plan?.equipment?.mode === "visual"}
                  />
                  <span className="plan-sheet-target-text">
                    <span className="plan-sheet-target-names">
                      <strong>{entry.designation}</strong>
                      {entry.name ? (
                        <span className="plan-sheet-target-name">
                          {` · ${entry.name}`}
                        </span>
                      ) : null}
                    </span>
                    {entry.slot ? (
                      <span className="plan-sheet-target-slot">
                        {entry.slot}
                      </span>
                    ) : null}
                  </span>
                  {entry.score ? (
                    <span className="plan-sheet-target-score">
                      {entry.score}
                      <span>/100</span>
                    </span>
                  ) : null}
                  <span className="plan-sheet-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
                {basis && planItemOf(entry) ? (
                  <AcquisitionTargetBlock
                    locale={locale}
                    rowKey={entry.key}
                    view={acquisitionItemView(basis, planItemOf(entry))}
                    onOpen={() => openTargetAcquisition(entry)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {others.length ? (
          <section className="plan-sheet-others">
            <h3 className="plan-sheet-heading">
              {message(locale, "otherActionsTitle")}
            </h3>
            <div className="plan-sheet-other-actions">
              {others.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`btn-tertiary${action === "delete" ? " is-destructive" : ""}`}
                  data-action={action}
                  onClick={() => onAction?.(action)}
                >
                  {message(locale, otherWords[action])}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </WebDialog>
      {acquisitionDialog ? (
        <AcquisitionDialog
          key={`${acquisitionDialog.scope}-${acquisitionDialog.item?.id ?? "plan"}`}
          locale={locale}
          model={acquisitionDialog}
          onClose={() => setAcquisitionDialog(null)}
        />
      ) : null}
      {target ? (
        <PlanTargetDialog
          item={target.item}
          night={target.night}
          locale={locale}
          at={clock}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}
