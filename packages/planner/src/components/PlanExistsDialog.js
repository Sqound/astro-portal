"use client";
import { useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message as portalMessage } from "portal/i18n.js";
import { offersCopy, PlanExistsOffersCard } from "../offers-slot.js";
import { quickPlanMessage as message } from "../quick-plan-messages.js";

/**
 * The sentence that opens the dialog of a night that already has a plan: the
 * shell's own words where it registered its offers, else the core's.
 */
export const planExistsIntro = (locale) =>
  offersCopy(locale, "planExistsIntro") || message(locale, "planExistsIntro");

export function PlanExistsCards({
  data,
  locale = "en",
  busy = false,
  onMerge,
  onErase,
  offersHref,
  // "Nouveau plan" of the planner, where the plan is one click away: a
  // card that opens it (`{ summary, label, onOpen }`), and "Voir les
  // offres" as a button (`onOffers`) that leads to the purchase where the
  // offers are sold, a link (`offersHref`) otherwise.
  open = null,
  onOffers = null,
}) {
  const m = (key, values) => message(locale, key, values);
  // A plan of another night than "Cette nuit"'s (the next one, from "Suggest
  // for the night of …") is named by its date, never "this evening".
  const night = data.tonight === false;
  const minimum = data.visual ? 20 : 45;
  const canMerge = data.freeMinutes >= minimum;
  const canErase = !data.running && !data.debrief;
  const card = (kind, icon, title, content, button) => (
    <section
      className={`quick-plan-card ${kind === "erase" ? "is-destructive" : ""}`}
      data-quick-plan-card={kind}
    >
      <h3>
        <span className="quick-plan-card-icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {content}
      <div className="quick-plan-card-actions">{button}</div>
    </section>
  );
  // The night is taken by a plan that was run (executed, partial): nothing
  // to merge into or erase, only the offer.
  const taken = data.taken === true;
  return (
    <div className="quick-plan-cards">
      <p>{planExistsIntro(locale)}</p>
      {open &&
        card(
          "open",
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>,
          // The plan, named once: "Plan 1 · jeu. 22 oct. · 0 cibles".
          open.summary,
          null,
          <button type="button" className="btn-secondary" onClick={open.onOpen}>
            {open.label}
          </button>,
        )}
      {!taken &&
        card(
          "merge",
          <svg viewBox="0 0 24 24">
            <path d="M6 4v5a6 6 0 0 0 6 6h6M14 11l4 4-4 4M18 4v4" />
          </svg>,
          night
            ? m("planExistsMergeTitleNight", { date: data.date })
            : m("planExistsMergeTitle"),
          <>
            <p>
              {m("planExistsMergeBody", { name: data.name, free: data.free })}
            </p>
            {data.otherPlace && (
              <p>{m("planExistsMergePlace", { place: data.otherPlace })}</p>
            )}
            {!canMerge && (
              <p>
                {m("planExistsMergeShort", {
                  free: data.free,
                  minimum: data.minimum,
                })}
              </p>
            )}
          </>,
          <button
            type="button"
            className="btn-tertiary"
            disabled={!canMerge || busy}
            onClick={onMerge}
          >
            {m("planExistsMergeAction")}
          </button>,
        )}
      {!taken &&
        card(
          "erase",
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
          </svg>,
          night
            ? m("planExistsEraseTitleNight", { date: data.date })
            : m("planExistsEraseTitle"),
          <>
            <p>
              {m("planExistsSummary", {
                name: data.name,
                date: data.date,
                count: data.count,
              })}
            </p>
            <p>{m("planExistsJournal")}</p>
            {!canErase && (
              <p>
                {m(data.running ? "planExistsRunning" : "planExistsDebrief")}
              </p>
            )}
          </>,
          <button
            type="button"
            className="btn-tertiary is-destructive"
            disabled={!canErase || busy}
            onClick={onErase}
          >
            {m("planExistsEraseAction")}
          </button>,
        )}
      <PlanExistsOffersCard
        locale={locale}
        onOffers={onOffers}
        offersHref={offersHref}
      />
    </div>
  );
}

export function PlanExistsDialog({
  data,
  locale = "en",
  action,
  ids,
  offersHref,
  onClose,
  onResult,
  eraseState,
  onError,
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const m = (key, values) => message(locale, key, values);
  async function apply(fn) {
    setBusy(true);
    try {
      const result = await fn();
      onResult(result);
    } catch (error) {
      setBusy(false);
      onError(error);
    }
  }
  return (
    <>
      <WebDialog
        title={
          data.tonight === false
            ? m("planExistsTitleNight", { date: data.date })
            : m("planExistsTitle")
        }
        closeLabel={m("plannerFlowClose")}
        onClose={onClose}
        closeDisabled={busy}
        className="quick-plan-dialog"
        footer={
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={onClose}
          >
            {m("cancel")}
          </button>
        }
      >
        <PlanExistsCards
          data={data}
          locale={locale}
          busy={busy}
          offersHref={offersHref}
          onMerge={() => apply(() => action.merge(ids))}
          onErase={() => setConfirm(true)}
        />
      </WebDialog>
      {confirm && (
        <WebDialog
          className="quick-plan-dialog"
          role="alertdialog"
          ariaLabel={m("planExistsConfirmLabel")}
          title={m("planExistsConfirmTitle", { name: data.name })}
          closeLabel={m("plannerFlowClose")}
          onClose={() => setConfirm(false)}
          closeDisabled={busy}
          footer={
            <>
              <button
                type="button"
                className="btn-link"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {m("cancel")}
              </button>
              <button
                type="button"
                className="btn-primary is-destructive"
                disabled={busy}
                onClick={() =>
                  apply(async () =>
                    action.eraseAndCreate(ids, await eraseState()),
                  )
                }
              >
                {m("planExistsConfirmAction")}
              </button>
            </>
          }
        >
          <p>
            {m(
              data.synchronized
                ? "planExistsConfirmSync"
                : "planExistsConfirmLocal",
              { date: data.date, count: data.count },
            )}
          </p>
        </WebDialog>
      )}
    </>
  );
}

/**
 * "Nouveau plan" of the planner on a night that already holds its plan in a
 * space that has one per night -- the plan is named, one click opens it, and
 * the offer of several plans stays where it was. `plan` is
 * `{ name, date (YYYY-MM-DD), count }`; `tonight` says whether that night is
 * the one in progress ("ce soir"), else it is named by its date.
 */
export function PlannerPlanExistsDialog({
  plan,
  locale = "en",
  tonight = true,
  onOpen,
  onOffers,
  onClose,
}) {
  const m = (key, values) => message(locale, key, values);
  const date = new Date(`${plan.date}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <WebDialog
      title={
        tonight ? m("planExistsTitle") : m("planExistsTitleNight", { date })
      }
      closeLabel={m("plannerFlowClose")}
      onClose={onClose}
      className="quick-plan-dialog"
      footer={
        <button type="button" className="btn-link" onClick={onClose}>
          {m("cancel")}
        </button>
      }
    >
      <PlanExistsCards
        data={{ taken: true, tonight }}
        locale={locale}
        open={{
          summary: m("planExistsSummary", {
            name: plan.name,
            date,
            count: plan.count,
          }),
          label: portalMessage(locale, "tonightOpenPlan"),
          onOpen,
        }}
        onOffers={onOffers}
      />
    </WebDialog>
  );
}
