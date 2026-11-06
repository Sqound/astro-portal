"use client";

import { useEffect, useState } from "react";
import { PlanActionsMenu } from "../../components/MultiNightEntries.js";
import { LockedChip } from "../../offers-slot.js";
import { durationText } from "portal/components/sessions/night-summary-view.js";
import {
  loadProjects,
  openMultiNightRoute,
  useMultiNightStore,
} from "./client.js";
import { say } from "./copy.js";
import {
  AttachDialog,
  FollowDialog,
  TonightFigures,
  TurnIntoDialog,
} from "./MultiNightDialogs.js";
import {
  itemsDetached,
  multiNightDuration,
  multiNightIntegrationOf,
  multiNightNightAdds,
  multiNightRange,
  multiNightTonightOf,
  multiNightWorthFollowing,
} from "./model.js";
import { AdvancedPlanningBadge } from "./MultiNightParts.js";

// What the multi-night plans add to a plan of the planner, at the points
// the core reads them: the open card of a target on the night's schedule
// ("Suivre sur plusieurs nuits", or "Cette cible fait partie du plan
// multi-nuits …" and "Détacher"), "Actions du plan" ("Transformer",
// "Rattacher"), the band of a plan that holds a night of one, and the
// debriefing's link to a multi-night plan's progress.

function useProjects(signedIn = true) {
  const store = useMultiNightStore();
  useEffect(() => {
    if (signedIn) loadProjects();
  }, [signedIn]);
  return store.projects.filter((project) => project.status !== "archived");
}

/** The open card of a target on the night's schedule. */
export function TimelineAction({
  host,
  plan,
  item,
  card,
  availability,
  total,
  readOnly = false,
  held = false,
}) {
  const { locale } = host;
  const projects = useProjects(host.signedIn);
  const [following, setFollowing] = useState(false);
  const [said, setSaid] = useState("");
  const linked = item.projectId
    ? projects.find((project) => project.id === item.projectId) || null
    : null;
  if (item.projectId) {
    const name = linked?.target?.name || item.target?.designation || item.id;
    return (
      <div className="multi-night-follow is-linked">
        <p>{say(locale, "itemLinked", { target: name })}</p>
        {linked && (
          <button
            className="btn-link"
            type="button"
            onClick={() => {
              host.showLibrary("multi");
              openMultiNightRoute({ screen: "detail", projectId: linked.id });
            }}
          >
            {say(locale, "contextLabel", { target: name })}
          </button>
        )}
        {!readOnly && (
          <button
            className="btn-tertiary"
            type="button"
            onClick={() => {
              host.updatePlanItems(plan.id, (items) =>
                itemsDetached(items, item.id),
              );
              setSaid(say(locale, "detached", { target: name }));
            }}
          >
            {say(locale, "detach")}
          </button>
        )}
      </div>
    );
  }
  const integration = multiNightIntegrationOf(card);
  const tonight = multiNightTonightOf(availability, total);
  if (readOnly || !multiNightWorthFollowing(integration, tonight))
    return said ? (
      <p className="multi-night-follow-said" role="status">
        {said}
      </p>
    ) : null;
  const missing = integration.recommended - tonight.minutes;
  return (
    <div className="multi-night-follow">
      <p className="multi-night-follow-line">
        {say(locale, "recommendedVsTonight", {
          recommended: multiNightDuration(locale, integration.recommended),
          tonight: multiNightDuration(locale, tonight.minutes),
        })}
      </p>
      <span
        className="multi-night-tonight-bar"
        role="img"
        aria-label={say(locale, "missingLabel", {
          recommended: multiNightDuration(locale, integration.recommended),
          tonight: multiNightDuration(locale, tonight.minutes),
          missing: multiNightDuration(locale, missing),
        })}
      >
        <span
          style={{
            width: `${Math.min(100, (tonight.minutes / integration.recommended) * 100)}%`,
          }}
        />
      </span>
      <p className="multi-night-tonight-legend">
        <span>
          {say(locale, "tonightShare", {
            duration: multiNightDuration(locale, tonight.minutes),
          })}
        </span>
        <span>
          {say(locale, "missing", {
            duration: multiNightDuration(locale, missing),
          })}
        </span>
      </p>
      <p className="multi-night-help">
        {say(locale, tonight.wholeNight ? "hintWholeNight" : "hintWindow", {
          range: multiNightRange(
            locale,
            integration.minimum,
            integration.maximum,
          ),
          tonight: multiNightDuration(locale, tonight.minutes),
        })}
      </p>
      <span className="locked-chip-slot">
        <button
          className="btn-tertiary"
          type="button"
          onClick={() => setFollowing(true)}
        >
          {say(locale, "follow")}
        </button>
        {/* Held back (place 4): the chip beside the action; the dialog it
            opens is the same dialog, held. */}
        {held && <LockedChip locale={locale} feature="follow" />}
      </span>
      {following && (
        <FollowDialog
          held={held}
          host={host}
          plan={plan}
          item={item}
          card={card}
          tonight={tonight}
          onClose={() => setFollowing(false)}
        />
      )}
    </div>
  );
}

export { TonightFigures };

/** "Actions du plan" (⋮): "Transformer", "Rattacher". */
export function PlanMenu({ host, plan }) {
  const { locale } = host;
  const projects = useProjects(host.signedIn);
  const [dialog, setDialog] = useState(null);
  // What the last gesture said, with the way to undo it when it has one
  // ("Annuler"): `{ text, undo }`.
  const [saidState, setSaidState] = useState(null);
  const said = saidState?.text || "";
  const setSaid = (text, undo = null) =>
    setSaidState(text ? { text, undo } : null);
  const hasItems = (plan.items || []).length > 0;
  const open = (kind) => {
    if (!hasItems) {
      setSaid(say(locale, "needsPlan"));
      return;
    }
    setSaid("");
    host.dismissLinkRefusal?.();
    setDialog(kind);
  };
  // The last link the service refused for an item of this plan: the
  // link went back, and this says why, under the control.
  const refusal = host.linkRefusal;
  const refusedHere =
    refusal &&
    (!refusal.itemId ||
      (plan.items || []).some((item) => item.id === refusal.itemId))
      ? say(
          locale,
          refusal.code === "project_not_found"
            ? "linkRefusedProjectGone"
            : "linkRefusedTargetMismatch",
        )
      : "";
  return (
    <>
      <PlanActionsMenu
        locale={locale}
        label={say(locale, "planActions")}
        items={[
          {
            key: "turnInto",
            label: say(locale, "turnInto"),
            onSelect: () => open("turnInto"),
          },
          {
            key: "attach",
            label: say(locale, "attach"),
            onSelect: () => open("attach"),
          },
        ]}
      />
      {refusedHere && (
        <span
          className="multi-night-menu-said multi-night-error"
          role="alert"
          data-link-refusal={refusal.code}
        >
          {refusedHere}
        </span>
      )}
      {said && (
        <span className="multi-night-menu-said" role="status">
          {said}
          {saidState.undo && (
            <button
              className="btn-link"
              type="button"
              onClick={() => {
                saidState.undo();
                setSaid("");
              }}
            >
              {say(locale, "undo")}
            </button>
          )}
        </span>
      )}
      {dialog === "turnInto" && (
        <TurnIntoDialog
          host={host}
          plan={plan}
          onClose={() => setDialog(null)}
          onDone={setSaid}
        />
      )}
      {dialog === "attach" && (
        <AttachDialog
          host={host}
          plan={plan}
          projects={projects}
          onClose={() => setDialog(null)}
          onDone={setSaid}
          onTurnInto={() => open("turnInto")}
        />
      )}
    </>
  );
}

/** The band of a plan that holds a night of a multi-night plan. */
export function PlanBand({ host, plan }) {
  const { locale } = host;
  const projects = useProjects(host.signedIn);
  const ids = [
    ...new Set(
      (plan.items || [])
        .map((item) => item?.projectId)
        .filter((id) => typeof id === "string" && id),
    ),
  ];
  if (!ids.length) return null;
  return (
    <div className="multi-night-band" role="note">
      {ids.map((id) => {
        const project = projects.find((entry) => entry.id === id);
        const name =
          project?.target?.name ||
          (plan.items || []).find((item) => item.projectId === id)?.target
            ?.designation ||
          "";
        return (
          <button
            key={id}
            className="btn-link"
            type="button"
            disabled={!project}
            onClick={() => {
              host.showLibrary("multi");
              openMultiNightRoute({ screen: "detail", projectId: id });
            }}
          >
            {say(locale, "contextLabel", { target: name })}
          </button>
        );
      })}
      <AdvancedPlanningBadge locale={locale} />
    </div>
  );
}

/**
 * The debriefing's card: "Voir l’avancement du plan multi-nuits …" and
 * "Cette nuit ajoute H h MM au plan multi-nuits", one per multi-night plan
 * the night serves, leading to "Avancement du plan".
 */
export function DebriefLink({ locale, plan, summary, confirmed = false }) {
  const projects = useProjects(true);
  const items = plan?.payload?.items || [];
  const added = multiNightNightAdds(items, summary);
  const ids = Object.keys(added).length
    ? Object.keys(added)
    : [...new Set(items.map((item) => item?.projectId).filter(Boolean))];
  const shown = ids
    .map((id) => projects.find((project) => project.id === id))
    .filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="multi-night-debrief-links">
      {shown.map((project) => {
        const href = `/${locale}/planner?${new URLSearchParams({
          view: "plans",
          kind: "multi",
          multiNight: project.id,
          screen: "progress",
          ...(confirmed && plan?.payload?.id ? { night: plan.payload.id } : {}),
        })}`;
        return (
          <a className="multi-night-debrief-link" href={href} key={project.id}>
            <strong>
              {say(locale, "seeProgress", { target: project.target?.name })}
            </strong>
            <small>
              {say(locale, "nightAdds", {
                duration: durationText(locale, added[project.id] || 0),
              })}
            </small>
          </a>
        );
      })}
    </div>
  );
}
