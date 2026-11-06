"use client";

import { useEffect, useMemo, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import {
  LockedCard,
  LockedChip,
  LockedFields,
  NightsOfferDialog,
  offersCopy,
} from "../../offers-slot.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import {
  createProject,
  createProjectFromNights,
  isPlanningRefusal,
  listTargetCandidates,
  openMultiNightRoute,
  planningLocked,
  updateProject,
  useMultiNightStore,
} from "./client.js";
import { say } from "./copy.js";
import {
  itemsLinkedTo,
  multiNightConstraintsFromPlan,
  multiNightDocumentFromPlan,
  multiNightDuration,
  multiNightEquipmentDiffers,
  multiNightGoalFor,
  multiNightIntegrationOf,
  multiNightPlaceDiffers,
  multiNightPlaceLabel,
  multiNightRange,
  multiNightTargetDocument,
  multiNightClock,
  multiNightWriteBody,
  rememberTarget,
} from "./model.js";
import { AdvancedPlanningBadge } from "./MultiNightParts.js";
import {
  NightsPicker,
  NightsReadFailed,
  useRead,
  useTicks,
} from "./MultiNightNights.js";
import { nightsBody, projectMatches, tickedLines } from "../nights.js";
import { PlanFrame } from "./NightPlan.js";

// The dialogs of the multi-night plans on the web: a new multi-night plan,
// "Suivre cette cible sur plusieurs nuits", "Transformer en plan multi-nuits",
// "Rattacher à un plan multi-nuits" and "Ajuster l’objectif". Every one of them
// only writes `projectId` on a plan's items, and the resource of the
// multi-night plan; nothing else of a plan changes.

/** "Objectif" with its two steps of an hour (30 min to 100 h). */
export function GoalStepper({ locale, value, onChange }) {
  const step = (delta) =>
    onChange(Math.min(6000, Math.max(30, Math.round(value + delta))));
  return (
    <div className="multi-night-goal">
      <span className="multi-night-goal-label">{say(locale, "goal")}</span>
      <button
        className="multi-night-goal-step"
        type="button"
        aria-label={say(locale, "goalDecrease")}
        title={say(locale, "goalDecrease")}
        disabled={value <= 30}
        onClick={() => step(-60)}
      >
        −
      </button>
      <output aria-live="polite">{multiNightDuration(locale, value)}</output>
      <button
        className="multi-night-goal-step"
        type="button"
        aria-label={say(locale, "goalIncrease")}
        title={say(locale, "goalIncrease")}
        disabled={value >= 6000}
        onClick={() => step(60)}
      >
        +
      </button>
    </div>
  );
}

/** "Hauteur ≥ 30° · écart à la Lune par filtre". */
export function constraintsLine(locale, constraints) {
  const byFilter = constraints?.moonSeparationMinimumByFilter || {};
  return Object.keys(byFilter).length
    ? say(locale, "constraintsByFilter", {
        altitude: Math.round(constraints.minAltitude),
      })
    : say(locale, "constraintsMoon", {
        altitude: Math.round(constraints.minAltitude),
        moon: Math.round(constraints.moonSeparationMinimum),
      });
}

/** "Actif, jusqu’à 55°" or "Aucun". */
export function maskLine(locale, location) {
  const mask = normaliseHorizonMask(location?.horizonMask);
  if (!mask.enabled) return say(locale, "maskNone");
  const highest = Math.max(0, ...mask.points.map((point) => point.altitude));
  return highest > 0
    ? say(locale, "maskUpTo", { altitude: Math.round(highest) })
    : say(locale, "maskNone");
}

/** "Ce qui sera repris de ce plan". */
function KeptFromPlan({ host, plan }) {
  const { locale } = host;
  const rows = [
    ["keptPlace", multiNightPlaceLabel(plan.location)],
    [
      "keptEquipment",
      host.equipmentName(plan.equipment) || say(locale, "formEquipmentDefault"),
    ],
    [
      "keptConstraints",
      constraintsLine(locale, multiNightConstraintsFromPlan(plan)),
    ],
    ["keptMask", maskLine(locale, plan.location)],
  ];
  return (
    <section className="multi-night-kept" aria-labelledby="multi-night-kept">
      <h3 id="multi-night-kept">{say(locale, "keptTitle")}</h3>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{say(locale, key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The figures of a target tonight: "8 h recommandées · 3 h 20 possibles ce
 * soir", the bar of tonight against the rest, and what each number is.
 */
export function TonightFigures({ host, integration, tonight, explain = true }) {
  const { locale } = host;
  const recommended = integration.recommended;
  const rest = Math.max(0, recommended - tonight.minutes);
  const share =
    recommended > 0 ? Math.min(1, tonight.minutes / recommended) : 0;
  const start = host.night
    ? new Date(Date.parse(host.night.start) + tonight.startMinute * 60000)
    : null;
  const end = host.night
    ? new Date(Date.parse(host.night.start) + tonight.endMinute * 60000)
    : null;
  return (
    <div className="multi-night-tonight">
      <dl className="multi-night-tonight-figures">
        <div>
          <dd>{multiNightDuration(locale, recommended)}</dd>
          <dt>{say(locale, "recommended")}</dt>
        </div>
        <div>
          <dd className="is-tonight">
            {multiNightDuration(locale, tonight.minutes)}
          </dd>
          <dt>{say(locale, "possibleTonight")}</dt>
        </div>
      </dl>
      <span
        className="multi-night-tonight-bar"
        role="img"
        aria-label={say(locale, "followBarLabel", {
          recommended: multiNightDuration(locale, recommended),
          tonight: multiNightDuration(locale, tonight.minutes),
          rest: multiNightDuration(locale, rest),
        })}
      >
        <span style={{ width: `${share * 100}%` }} />
      </span>
      <p className="multi-night-tonight-legend">
        <span>
          {say(locale, "tonightShare", {
            duration: multiNightDuration(locale, tonight.minutes),
          })}
        </span>
        <span>
          {say(locale, "otherNights", {
            duration: multiNightDuration(locale, rest),
          })}
        </span>
      </p>
      {explain && start && end && (
        <p className="multi-night-tonight-explain">
          {say(
            locale,
            tonight.wholeNight ? "explainWholeNight" : "explainWindow",
            {
              tonight: multiNightDuration(locale, tonight.minutes),
              start: multiNightClock(start.toISOString(), host.timeZone),
              end: multiNightClock(end.toISOString(), host.timeZone),
              recommended: multiNightDuration(locale, recommended),
              range: multiNightRange(
                locale,
                integration.minimum,
                integration.maximum,
              ),
            },
          )}
        </p>
      )}
    </div>
  );
}

/**
 * "Suivre cette cible sur plusieurs nuits": a new multi-night plan for the
 * target of `item`, of which this plan becomes the first night.
 */
export function FollowDialog({
  host,
  plan,
  item,
  card,
  tonight,
  onClose,
  held = false,
}) {
  const { locale } = host;
  const integration = multiNightIntegrationOf(card);
  const target = item.target || card?.target || { id: item.id };
  const [goal, setGoal] = useState(integration?.recommended ?? 360);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = multiNightTargetDocument(target);
  const create = async () => {
    const body = multiNightDocumentFromPlan({
      plan,
      target,
      goalMinutes: goal,
    });
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      const project = await createProject(body);
      host.updatePlanItems(plan.id, (items) =>
        itemsLinkedTo(items, { [item.id]: project.id }),
      );
      onClose();
    } catch {
      setError(say(locale, "createFailed"));
      setBusy(false);
    }
  };
  return (
    <WebDialog
      className="multi-night-dialog multi-night-follow-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "followTitle")}
      headerActions={
        held ? <LockedChip locale={locale} feature="follow" /> : null
      }
      footer={
        <>
          <button className="btn-link" type="button" onClick={onClose}>
            {say(locale, "notNow")}
          </button>
          {!held && (
            <button
              className="btn-primary"
              type="button"
              disabled={busy || !name}
              onClick={create}
            >
              {say(locale, "create")}
            </button>
          )}
        </>
      }
    >
      <p className="multi-night-dialog-subtitle">
        {[name?.name, name?.commonName].filter(Boolean).join(" · ")}
      </p>
      {integration && tonight && (
        <TonightFigures
          host={host}
          integration={integration}
          tonight={tonight}
        />
      )}
      <KeptFromPlan host={host} plan={plan} />
      {held ? (
        <LockedFields locale={locale} feature="follow">
          <GoalStepper locale={locale} value={goal} onChange={setGoal} />
        </LockedFields>
      ) : (
        <GoalStepper locale={locale} value={goal} onChange={setGoal} />
      )}
      <p className="multi-night-help">{say(locale, "goalHelp")}</p>
      <p className="multi-night-first-night">{say(locale, "firstNight")}</p>
      {/* The box has no title: the chip says it. */}
      <aside className="multi-night-included">
        <span>{say(locale, "tonightStaysWhole")}</span>
      </aside>
      {held && integration && tonight && (
        <LockedCard
          locale={locale}
          kind="follow"
          feature="follow"
          data={{
            target: [name?.name].filter(Boolean).join(""),
            total: multiNightDuration(locale, integration.recommended),
            tonight: multiNightDuration(locale, tonight.minutes),
            other: multiNightDuration(
              locale,
              Math.max(0, integration.recommended - tonight.minutes),
            ),
            tonightFraction: Math.min(
              1,
              tonight.minutes / (integration.recommended || 1),
            ),
          }}
        />
      )}
      {error && (
        <p className="multi-night-error" role="alert">
          {error}
        </p>
      )}
    </WebDialog>
  );
}

async function searchTargets(locale, query, signal) {
  const parameters = new URLSearchParams({
    locale,
    q: query,
    limit: "8",
    offset: "0",
  });
  const response = await fetch(`/api/target-library?${parameters}`, { signal });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.targets) ? data.targets : [];
}

/**
 * "Nouveau plan multi-nuits": a target from the catalogue or a framing,
 * the place, the equipment and constraints of the latest plan, and the goal.
 * Created, the detail of the new multi-night plan opens.
 */
export function CreateDialog({ host, onClose, initialStep = "choose" }) {
  const { locale } = host;
  // The dialog opens on two
  // frames, "Un plan multi-nuits vierge" (the form) and "À partir de plans
  // déjà existants" (the target, then its nights, tickable).
  const [step, setStep] = useState(initialStep);
  const [offer, setOffer] = useState(false);
  const { projects } = useMultiNightStore();
  const locked = planningLocked(host.capabilities, {
    hosted: host.hosted !== false,
  });
  const latest =
    host.plans.find((plan) => plan.id === host.activePlanId) ||
    host.plans.at(-1) ||
    null;
  const places = useMemo(() => {
    const known = (host.knownLocations || []).filter(
      (place) => multiNightPlaceLabel(place) && place.latitude !== "",
    );
    if (
      latest?.location &&
      !known.some((place) => !multiNightPlaceDiffers(place, latest.location))
    )
      return [latest.location, ...known];
    return known;
  }, [host.knownLocations, latest]);
  const [placeIndex, setPlaceIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const [goal, setGoal] = useState(360);
  const [goalTouched, setGoalTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const framings = (host.framings || []).filter(
    (framing) => !framing.archivedAt && framing.payload?.target,
  );
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchTargets(locale, query.trim(), controller.signal)
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locale, query]);
  const choose = (candidate) => {
    setTarget(candidate);
    const integration = multiNightIntegrationOf({
      integration: host.integrationFor(candidate),
    });
    if (integration && !goalTouched) setGoal(integration.recommended);
  };
  const place = places[placeIndex] || null;
  const settings = latest || {
    equipment: host.equipment,
    ...host.constraints,
  };
  const targetDocument = target ? multiNightTargetDocument(target) : null;
  const [read, retryRead] = useRead(
    () =>
      step === "existing" && targetDocument
        ? listTargetCandidates(targetDocument)
        : Promise.resolve(null),
    `${step}:${targetDocument?.framingId ?? targetDocument?.targetId ?? ""}`,
  );
  const lines = read.data ?? [];
  const [ticked, setTicked] = useTicks(read.data);
  const chosen = tickedLines(lines, ticked);
  const create = async () => {
    if (!target || !place) return;
    const body = multiNightDocumentFromPlan({
      plan: { ...settings, location: place },
      target,
      goalMinutes: goal,
    });
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      if (!target.framingId) rememberTarget(target);
      const nights = step === "existing" ? nightsBody(chosen) : {};
      const project =
        nights.sessionIds || nights.planIds
          ? await createProjectFromNights({
              ...body,
              ...(nights.sessionIds
                ? { fromSessionIds: nights.sessionIds }
                : {}),
              ...(nights.planIds ? { fromPlanIds: nights.planIds } : {}),
            })
          : await createProject(body);
      onClose();
      host.showLibrary("multi");
      openMultiNightRoute({ screen: "detail", projectId: project.id });
    } catch (failure) {
      if (isPlanningRefusal(failure)) setOffer(true);
      else
        setError(
          say(
            locale,
            failure.code === "target_mismatch"
              ? "attachMismatch"
              : "createFailed",
          ),
        );
      setBusy(false);
    }
  };
  const equipmentName = latest ? host.equipmentName(latest.equipment) : "";
  const existing = step === "existing";
  if (step === "choose")
    return (
      <>
        <WebDialog
          className="multi-night-dialog multi-night-create-dialog nights-new-dialog"
          closeLabel={say(locale, "close")}
          onClose={onClose}
          title={say(locale, "formTitle")}
          footer={
            <button className="btn-link" type="button" onClick={onClose}>
              {say(locale, "cancel")}
            </button>
          }
        >
          <div className="nights-frames">
            <button
              className="nights-frame"
              type="button"
              data-nights-frame="blank"
              onClick={() => setStep("form")}
            >
              <span className="nights-frame-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path d="M4 10h16M9 3v4M15 3v4" />
                </svg>
              </span>
              <strong>{say(locale, "newBlank")}</strong>
              <small>{say(locale, "newBlankBody")}</small>
            </button>
            <button
              className="nights-frame"
              type="button"
              data-nights-frame="existing"
              onClick={() => (locked ? setOffer(true) : setStep("existing"))}
            >
              <span className="nights-frame-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M10 6h10M10 12h10M10 18h10" />
                  <path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" />
                </svg>
              </span>
              <strong>{say(locale, "newFromExisting")}</strong>
              <small>{say(locale, "newFromExistingBody")}</small>
              <small className="nights-frame-note">
                {say(locale, "newFromExistingDetail")}
              </small>
              {locked && <LockedChip locale={locale} feature="multiNight" />}
            </button>
          </div>
        </WebDialog>
        {offer && (
          <NightsOfferDialog
            locale={locale}
            sentence="lockGroup"
            onClose={() => setOffer(false)}
          />
        )}
      </>
    );
  return (
    <>
      <WebDialog
        className="multi-night-dialog multi-night-create-dialog"
        closeLabel={say(locale, "close")}
        onClose={onClose}
        title={say(locale, "formTitle")}
        footer={
          <>
            {existing && (
              <button
                className="btn-link nights-back"
                type="button"
                onClick={() => setStep("choose")}
              >
                ‹ {say(locale, "stepBack")}
              </button>
            )}
            <button className="btn-link" type="button" onClick={onClose}>
              {say(locale, "cancel")}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={busy || !target || !place}
              onClick={create}
            >
              {existing
                ? say(locale, "createWithNights", { count: chosen.length })
                : say(locale, "create")}
            </button>
          </>
        }
      >
        {existing && (
          <p className="multi-night-dialog-subtitle">
            {say(locale, "fromExistingIntro")}
          </p>
        )}
        <fieldset className="multi-night-form-target">
          <legend>{say(locale, "formTarget")}</legend>
          {target ? (
            <p className="multi-night-chosen">
              <strong>{multiNightTargetDocument(target)?.name}</strong>
              {multiNightTargetDocument(target)?.commonName && (
                <small>{multiNightTargetDocument(target).commonName}</small>
              )}
              <button
                className="btn-link"
                type="button"
                onClick={() => setTarget(null)}
              >
                {say(locale, "formSearch")}
              </button>
            </p>
          ) : (
            <>
              <input
                type="search"
                aria-label={say(locale, "formSearch")}
                placeholder={say(locale, "formSearch")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {results.length > 0 && (
                <ul className="multi-night-results" role="listbox">
                  {results.map((candidate) => (
                    <li key={candidate.id} role="option" aria-selected={false}>
                      <button
                        className="multi-night-result"
                        type="button"
                        onClick={() => choose(candidate)}
                      >
                        <strong>
                          {multiNightTargetDocument(candidate)?.name}
                        </strong>
                        <small>
                          {multiNightTargetDocument(candidate)?.commonName}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length >= 2 && !results.length && (
                <p className="multi-night-help">
                  {say(locale, "formNoResult")}
                </p>
              )}
              <p className="multi-night-subheading">
                {say(locale, "formFromFraming")}
              </p>
              {framings.length ? (
                <ul className="multi-night-results">
                  {framings.map((framing) => (
                    <li key={framing.id}>
                      <button
                        className="multi-night-result"
                        type="button"
                        onClick={() =>
                          choose({
                            ...framing.payload.target,
                            framingId: framing.id,
                            title: framing.name || framing.payload.target.title,
                          })
                        }
                      >
                        <strong>
                          {framing.name || framing.payload.target.title}
                        </strong>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="multi-night-help">
                  {say(locale, "formNoFraming")}
                </p>
              )}
            </>
          )}
        </fieldset>
        {existing && target && read.status === "loading" && (
          <p className="multi-night-help" aria-busy="true">
            …
          </p>
        )}
        {existing && target && read.status === "error" && (
          <NightsReadFailed locale={locale} onRetry={retryRead} />
        )}
        {existing && target && read.status === "ready" && lines.length > 0 && (
          <NightsPicker
            locale={locale}
            lines={lines}
            ticked={ticked}
            onTicked={setTicked}
            heading={say(locale, "fromExistingNights")}
            projects={projects}
          />
        )}
        {existing &&
          target &&
          read.status === "ready" &&
          lines.length === 0 && (
            <section className="nights-picker">
              <h3>{say(locale, "fromExistingNights")}</h3>
              <p>{say(locale, "noNightsForTarget")}</p>
              <p className="multi-night-help">
                {say(locale, "noNightsBlankNote")}
              </p>
            </section>
          )}
        <label className="multi-night-form-place">
          <span>{say(locale, "formPlace")}</span>
          {places.length ? (
            <select
              value={placeIndex}
              onChange={(event) => setPlaceIndex(Number(event.target.value))}
            >
              {places.map((entry, index) => (
                <option key={`${entry.id || index}`} value={index}>
                  {multiNightPlaceLabel(entry)}
                </option>
              ))}
            </select>
          ) : (
            <small>{say(locale, "formNoPlace")}</small>
          )}
        </label>
        {!existing && (
          <dl className="multi-night-form-facts">
            <div>
              <dt>{say(locale, "formEquipment")}</dt>
              <dd>
                {equipmentName
                  ? say(locale, "formEquipmentFrom", {
                      equipment: equipmentName,
                    })
                  : say(locale, "formEquipmentDefault")}
              </dd>
            </div>
            <div>
              <dt>{say(locale, "formConstraints")}</dt>
              <dd>
                {constraintsLine(
                  locale,
                  multiNightConstraintsFromPlan(settings),
                )}
              </dd>
            </div>
          </dl>
        )}
        <GoalStepper
          locale={locale}
          value={goal}
          onChange={(value) => {
            setGoalTouched(true);
            setGoal(value);
          }}
        />
        <p className="multi-night-help">{say(locale, "goalHelp")}</p>
        {!target && (
          <p className="multi-night-help">{say(locale, "formNoTarget")}</p>
        )}
        {!existing && offersCopy(locale, "includedTitle") && (
          // Where the shell sells, the offer that holds this form; the open
          // core says nothing of it.
          <aside className="multi-night-included">
            <strong>{offersCopy(locale, "includedTitle")}</strong>
            <AdvancedPlanningBadge locale={locale} />
          </aside>
        )}
        {error && (
          <p className="multi-night-error" role="alert">
            {error}
          </p>
        )}
      </WebDialog>
      {offer && (
        <NightsOfferDialog
          locale={locale}
          sentence="lockGroup"
          onClose={() => setOffer(false)}
        />
      )}
    </>
  );
}

/**
 * "Transformer en plan multi-nuits": each checked target becomes a
 * multi-night plan whose first night is this plan.
 */
export function TurnIntoDialog({ host, plan, onClose, onDone }) {
  const { locale } = host;
  const rows = (plan.items || []).map((item) => {
    const card = host.cardFor(item.id);
    const integration = multiNightIntegrationOf(card);
    const window = host.tonightFor(item.id);
    const tonight = window ? Math.max(0, window.end - window.start) : null;
    return {
      item,
      integration,
      tonight,
      followed: Boolean(item.projectId),
      worth: Boolean(
        integration && tonight !== null && integration.recommended > tonight,
      ),
    };
  });
  const [checked, setChecked] = useState(
    () =>
      new Set(
        rows
          .filter((row) => row.worth && !row.followed)
          .map((row) => row.item.id),
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true);
    setError("");
    const links = {};
    try {
      for (const row of rows) {
        if (!checked.has(row.item.id)) continue;
        const body = multiNightDocumentFromPlan({
          plan,
          target: row.item.target || { id: row.item.id },
          goalMinutes: row.integration?.recommended ?? 360,
        });
        if (!body) continue;
        const project = await createProject(body);
        links[row.item.id] = project.id;
      }
      host.updatePlanItems(plan.id, (items) => itemsLinkedTo(items, links));
      onDone?.(
        say(locale, "turnIntoDone", { count: Object.keys(links).length }),
      );
      onClose();
    } catch {
      if (Object.keys(links).length)
        host.updatePlanItems(plan.id, (items) => itemsLinkedTo(items, links));
      setError(say(locale, "createFailed"));
      setBusy(false);
    }
  };
  return (
    <WebDialog
      className="multi-night-dialog multi-night-turn-into-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "turnInto")}
      footer={
        <>
          <button className="btn-link" type="button" onClick={onClose}>
            {say(locale, "notNow")}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={busy || !checked.size}
            onClick={create}
          >
            {say(locale, "turnIntoCreate", { count: checked.size })}
          </button>
        </>
      }
    >
      <p className="multi-night-help">{say(locale, "turnIntoHelp")}</p>
      <ul className="multi-night-checks">
        {rows.map((row) => (
          <li key={row.item.id}>
            <label>
              <input
                type="checkbox"
                disabled={row.followed}
                checked={checked.has(row.item.id)}
                onChange={(event) =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(row.item.id);
                    else next.delete(row.item.id);
                    return next;
                  })
                }
              />
              <span>
                <strong>
                  {
                    multiNightTargetDocument(
                      row.item.target || { id: row.item.id },
                    )?.name
                  }
                </strong>
                <small>
                  {row.followed
                    ? say(locale, "turnIntoAlready")
                    : row.integration && row.tonight !== null
                      ? say(locale, "turnIntoLine", {
                          recommended: multiNightDuration(
                            locale,
                            row.integration.recommended,
                          ),
                          tonight: multiNightDuration(locale, row.tonight),
                        })
                      : ""}
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <KeptFromPlan host={host} plan={plan} />
      <p className="multi-night-help">{say(locale, "tonightStaysWhole")}</p>
      {error && (
        <p className="multi-night-error" role="alert">
          {error}
        </p>
      )}
    </WebDialog>
  );
}

/** The links of the items of `plan` that are of the target of `project`. */
function attachLinks(plan, project) {
  const links = {};
  for (const item of plan.items || [])
    if (
      item?.id === project.target?.targetId ||
      item?.target?.id === project.target?.targetId ||
      (project.target?.framingId &&
        item?.framingId === project.target.framingId)
    )
      links[item.id] = project.id;
  return links;
}

/**
 * "Rattacher à un plan multi-nuits": this plan becomes a night of the
 * multi-night plan chosen; the items of its target follow it. A frame per plan
 * of the plan's target, **a click attaches at once** (the status line says so,
 * with "Annuler"), a search finds a plan that was not proposed, and "Créer
 * un plan multi-nuits" leads to "Transformer en plan multi-nuits".
 */
export function AttachDialog({
  host,
  plan,
  projects,
  onClose,
  onDone,
  onTurnInto,
}) {
  const { locale } = host;
  const candidates = projects.filter(
    (project) => Object.keys(attachLinks(plan, project)).length > 0,
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const proposed = new Set(candidates.map((project) => project.id));
  const found = projects.filter(
    (project) => !proposed.has(project.id) && projectMatches(project, query),
  );
  const attach = (project) => {
    const links = attachLinks(plan, project);
    if (!Object.keys(links).length) {
      setError(say(locale, "attachMismatch"));
      return;
    }
    host.updatePlanItems(plan.id, (items) => itemsLinkedTo(items, links));
    onDone?.(say(locale, "attached", { target: project.target?.name }), () =>
      host.updatePlanItems(plan.id, (items) =>
        Object.keys(links).reduce(
          (next, itemId) => itemsDetached(next, itemId),
          items,
        ),
      ),
    );
    onClose();
  };
  const frame = (project) => (
    <PlanFrame
      key={project.id}
      locale={locale}
      project={project}
      onChoose={attach}
    >
      {multiNightPlaceDiffers(plan.location, project) && (
        <small className="multi-night-warning">
          {say(locale, "attachPlaceDiffers")}
        </small>
      )}
      {multiNightEquipmentDiffers(plan.equipment, project) && (
        <small className="multi-night-warning">
          {say(locale, "attachEquipmentDiffers")}
        </small>
      )}
    </PlanFrame>
  );
  return (
    <WebDialog
      className="multi-night-dialog nights-dialog multi-night-attach-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "attach")}
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {say(locale, "cancel")}
        </button>
      }
    >
      <p className="multi-night-help">{say(locale, "attachHelp")}</p>
      <section
        className="nights-plans"
        aria-label={say(locale, "attachPlansHeading")}
      >
        <h3>{say(locale, "attachPlansHeading")}</h3>
        {candidates.length ? (
          candidates.map(frame)
        ) : (
          <p className="multi-night-help">{say(locale, "attachNone")}</p>
        )}
      </section>
      {projects.length > candidates.length && (
        <div className="nights-plan-search">
          <input
            type="search"
            aria-label={say(locale, "searchPlan")}
            placeholder={say(locale, "searchPlan")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError("");
            }}
          />
          {query.trim() && found.length === 0 && (
            <p className="multi-night-help">{say(locale, "searchNoResult")}</p>
          )}
          {found.map(frame)}
        </div>
      )}
      {onTurnInto && (
        <button
          className="nights-plan-frame is-create"
          type="button"
          onClick={() => {
            onClose();
            onTurnInto();
          }}
        >
          <span className="nights-plan-frame-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="nights-plan-frame-text">
            <strong>{say(locale, "createCardTitle")}</strong>
            <small>{say(locale, "createCardBody")}</small>
          </span>
          <span className="multi-night-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      {error && (
        <p className="multi-night-error" role="alert">
          {error}
        </p>
      )}
    </WebDialog>
  );
}

/** "Ajuster l’objectif": the goal, an hour at a time. */
export function AdjustGoalDialog({ locale, project, onClose }) {
  const [goal, setGoal] = useState(project.goalMinutes);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await updateProject(
        project,
        multiNightWriteBody(project, { goalMinutes: goal }),
      );
    } finally {
      onClose();
    }
  };
  return (
    <WebDialog
      className="multi-night-dialog"
      closeLabel={say(locale, "close")}
      onClose={onClose}
      title={say(locale, "adjustTitle")}
      footer={
        <>
          <button className="btn-link" type="button" onClick={onClose}>
            {say(locale, "cancel")}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={save}
          >
            {say(locale, "save")}
          </button>
        </>
      }
    >
      <GoalStepper locale={locale} value={goal} onChange={setGoal} />
      <p className="multi-night-help">{say(locale, "goalHelp")}</p>
    </WebDialog>
  );
}

export { multiNightGoalFor };
