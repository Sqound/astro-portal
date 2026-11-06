"use client";

import { useEffect, useRef, useState } from "react";
import { HeldChip, PurchasePrimary } from "../../offers-slot.js";
import { astroSyncDownloadUrl } from "portal/captures/astro-sync-link.js";
import { integrationText } from "portal/components/sessions/night-detail-view.js";
import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { uploadCapture } from "portal/components/manage/captures-client.js";
import { csrfToken } from "portal/components/sessions/portal-fetch.js";
import { EmptyStateStar } from "portal/components/empty/EmptyState.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { loadProjectDetail, useMultiNightStore } from "./client.js";
import { choose, say } from "./copy.js";
import { multiNightDayMonth, multiNightLineDate } from "./model.js";

// The words of the offers — "Planification avancée", "Voir les offres" —
// are the shell's that sells them (`planner.offers`); a server that sells
// nothing registers none, and these views never draw a held-back entry there.
const gateCopy = (locale) =>
  getPlannerExtensions("planner.offers")[0]?.gateCopy?.(locale) ?? {};

// "Intégrations" and "Image du plan" on the page of a multi-night plan: what
// Astro Sync sent for the plan — one line per night, target and family of
// frames, never a file — with the total by filter, then the image of the plan
// Astro Sync made from them, with the nights it combines and the one it leaves
// out. Read from `GET /api/v1/projects/{id}` (reading never needs a
// capability). Without "Synchronisation avancée+" (`analysis.progression`) the
// lines stay, greyed, with the lock card; with it and nothing sent yet, the
// empty state leads to Astro Sync's download page. Red mode is the page's night
// filter.

const CAPABILITY = "analysis.progression";

/** "4 h 54", "4 h 00", "45 min": seconds of integration. */
const duration = (locale, seconds) => integrationText(seconds, locale);

/** The filter as the frames name it; "Sans filtre" for none. */
const filterName = (locale, filter) => filter ?? say(locale, "noFilter");

/** "Bibande · 98 × 180 s · 4 h 54": one line; a declared line may not know its frames. */
function lineText(locale, line) {
  return [
    filterName(locale, line.filter),
    line.frameCount > 0 && line.exposureSeconds > 0
      ? say(locale, "framesValue", {
          count: line.frameCount,
          exposure: line.exposureSeconds,
        })
      : null,
    duration(locale, line.totalSeconds),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A line says what declared it: the session (`declared`), or Astro Sync (the rest). */
export const isDeclared = (line) => line?.source === "declared";

/**
 * The lines, declared by the sessions then measured by Astro Sync: the line,
 * its session, and what it comes from. A declared line is readable by everyone;
 * a measured line is greyed without "Synchronisation avancée+"
 * (`analysis.progression`), where the lock card stands.
 */
function IntegrationsList({ locale, integrations, locked }) {
  const ordered = [
    ...integrations.filter(isDeclared),
    ...integrations.filter((line) => !isDeclared(line)),
  ];
  return (
    <ul className="multi-night-integrations-lines">
      {ordered.map((line) => {
        const declared = isDeclared(line);
        const sessionId = line.sessionId ?? line.nightId;
        return (
          <li
            key={line.id}
            className={`multi-night-integrations-line${
              locked && !declared ? " is-locked" : ""
            }`}
            data-integration={line.id}
            data-source={declared ? "declared" : "measured"}
          >
            <p className="multi-night-integrations-main">
              {lineText(locale, line)}
            </p>
            <p className="multi-night-integrations-session">
              {sessionId ? (
                <a
                  className="btn-link"
                  href={`/${locale}/sessions/${encodeURIComponent(sessionId)}`}
                >
                  {say(locale, "sessionOf", {
                    date: multiNightDayMonth(locale, line.eveningDate),
                  })}
                </a>
              ) : (
                say(locale, "sessionOf", {
                  date: multiNightDayMonth(locale, line.eveningDate),
                })
              )}
            </p>
            <span className="multi-night-integrations-provenance">
              {say(
                locale,
                declared
                  ? "integrationFromDeclared"
                  : "integrationFromMeasured",
              )}
              {!declared && line.computerLabel
                ? ` · ${line.computerLabel}`
                : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TotalsByFilter({ locale, totals }) {
  return (
    <div className="multi-night-integrations-totals">
      <span className="multi-night-integrations-totals-label">
        {say(locale, "totalByFilter")}
      </span>
      <ul>
        {totals.map((total) => (
          <li key={total.filter ?? ""}>
            <span>{filterName(locale, total.filter)}</span>
            <strong>{duration(locale, total.totalSeconds)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "9 août · Bibande 4 h 54": one integration in a sentence. */
function integrationPhrase(locale, line) {
  return say(locale, "integrationPhrase", {
    date: multiNightDayMonth(locale, line.eveningDate),
    filter: filterName(locale, line.filter),
    duration: duration(locale, line.totalSeconds),
  });
}

function PlanImage({ locale, project, planCapture, count, integrations }) {
  const [thumbnail, setThumbnail] = useState(true);
  const combined = new Set(planCapture.combinedNightIds);
  const inside = integrations.filter((line) => combined.has(line.nightId));
  const outside = integrations.filter((line) => !combined.has(line.nightId));
  const declared = planCapture.totalsByFilter.reduce(
    (sum, total) => sum + Number(total.totalSeconds || 0),
    0,
  );
  const total =
    declared || inside.reduce((sum, line) => sum + line.totalSeconds, 0);
  const href = `/${locale}/manage/captures/${encodeURIComponent(planCapture.id)}`;
  const render = planCapture.render
    ? choose(locale, "planRender", planCapture.render)
    : null;
  const made = say(locale, "planMade", {
    date: multiNightDayMonth(locale, planCapture.createdAt.slice(0, 10)),
  });
  return (
    <section
      className="multi-night-section multi-night-plan-image"
      aria-labelledby="multi-night-plan-image"
    >
      <div className="multi-night-section-heading">
        <h3 id="multi-night-plan-image">{say(locale, "planImageTitle")}</h3>
        <span>{say(locale, "planCaptureCount", { count })}</span>
      </div>
      <div className="multi-night-panel multi-night-plan-image-card">
        <div className="multi-night-plan-image-thumb">
          {thumbnail ? (
            <img
              src={`/api/v1/manage/captures/${encodeURIComponent(planCapture.id)}/media?variant=thumbnail`}
              alt=""
              onError={() => setThumbnail(false)}
            />
          ) : null}
        </div>
        <div className="multi-night-plan-image-text">
          <p className="multi-night-plan-image-title">
            {say(locale, "planImageName", {
              target: project.target?.name ?? "",
            })}
          </p>
          <p className="multi-night-help">
            {render ? `${render} · ${made}` : made}
          </p>
          {inside.length ? (
            <p className="multi-night-plan-image-combined">
              {say(locale, "planCombined", {
                count: new Set(inside.map((line) => line.nightId)).size,
                nights: inside
                  .map((line) => integrationPhrase(locale, line))
                  .join(say(locale, "phraseSeparator")),
                total: duration(locale, total),
              })}
            </p>
          ) : null}
          {outside.length ? (
            <p className="multi-night-help">
              {say(locale, "planNotCombined", {
                nights: outside
                  .map((line) => integrationPhrase(locale, line))
                  .join(say(locale, "phraseSeparator")),
              })}
            </p>
          ) : null}
          <a className="btn-link multi-night-plan-image-open" href={href}>
            {say(locale, "openCapture")}
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * The lock card ("Every locked place"): the tag, the sentence, and what buys.
 * This is a feature of a subscription alone: the primary is "S'abonner — … par
 * an" (the annual one, which includes the one-time purchases, said inside the
 * button), "Passer à Synchronisation avancée+" for a subscriber of the lower
 * subscription (it replaces the current one, never a second), and "Voir les
 * offres" a link to the monthly one. Where nothing is sold (the space of an
 * administrator) there is no primary.
 */
function LockCard({ host }) {
  const { locale } = host;
  // A subscriber of "Synchronisation avancée": the capability its
  // subscription gives and the "+" does not take away.
  const subscribed = host.capabilities?.["portal.invitations"] === true;
  return (
    <div
      className="multi-night-panel multi-night-integrations-lock"
      data-multi-night-sync="locked"
    >
      <HeldChip offer="synchronizationAdvanced" locale={locale} />
      <p className="multi-night-integrations-lock-title">
        {say(locale, "lockTitle")}
      </p>
      <p className="multi-night-help">{say(locale, "lockSentence")}</p>
      <PurchasePrimary
        locale={locale}
        offer="synchronizationAdvanced"
        kind={subscribed ? "switch" : "subscribe"}
        signedIn={Boolean(host.signedIn)}
        signInHref={host.signInHref}
        className="multi-night-integrations-buy"
      />
      {host.offersHref ? (
        <a className="btn-link" href={host.offersHref}>
          {gateCopy(locale).seeOffers}
        </a>
      ) : null}
    </div>
  );
}

/** The empty state: one sentence, the way to Astro Sync, the star. */
function EmptyIntegrations({ locale }) {
  return (
    <div
      className="empty-state multi-night-integrations-empty"
      data-empty-state=""
    >
      <EmptyStateStar />
      <div className="empty-state-content">
        <p className="empty-state-sentence">
          {say(locale, "integrationsEmpty")}
        </p>
        <a
          className="btn-secondary"
          href={astroSyncDownloadUrl(locale)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {say(locale, "downloadAstroSync")}
        </a>
      </div>
    </div>
  );
}

/**
 * The detail of a multi-night plan read alone (`GET /api/v1/projects/{id}`:
 * its integrations, their totals by filter, the image of the plan, its nights
 * with their state and `allSessionsDone`), read again when a night is added or
 * detached. `[detail, reload]`; `detail` is `null` while it is read or when it
 * cannot be. `enabled` false reads nothing (the page reads it once for all).
 */
export function useProjectDetail(project, { enabled = true } = {}) {
  const { nightsVersion } = useMultiNightStore();
  const [detail, setDetail] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    loadProjectDetail(project.id)
      .then((value) => current && setDetail(value))
      .catch(() => current && setDetail(null));
    return () => {
      current = false;
    };
  }, [enabled, project.id, project.revision, nightsVersion, attempt]);
  return [detail, () => setAttempt((value) => value + 1)];
}

/** The nights the plan image combines: the sessions made, else those its lines come from. */
export function planImageCombinedNights(detail) {
  const made = (detail?.nights ?? [])
    .filter((night) => night.state === "done" && night.sessionId)
    .map((night) => night.sessionId);
  if (made.length) return made;
  return [
    ...new Set(
      (detail?.integrations ?? []).map(
        (line) => line.sessionId ?? line.nightId,
      ),
    ),
  ].filter(Boolean);
}

/** What the plan image is sent with: its plan, its nights and its total by filter. */
export function planImageMetadata(detail, project) {
  return {
    role: "plan",
    projectId: project.id,
    combinedNightIds: planImageCombinedNights(detail),
    totalsByFilter: (detail?.totalsByFilter ?? []).map((total) => ({
      filter: total.filter ?? null,
      totalSeconds: total.totalSeconds,
    })),
  };
}

/**
 * "Image du plan" while it has not come: the sentence that says it waits for
 * the sessions, then, once every session is done (`allSessionsDone`), the
 * action — "Envoyer l'image du plan" (the only primary of the page) beside
 * "Faire l'image avec Astro Sync". The image and its sending keep
 * `analysis.progression`: without it the lock card below says so and the action
 * is not offered.
 */
function PlanImageAction({ locale, project, detail, active, onSent, upload }) {
  const input = useRef(null);
  const [state, setState] = useState({ busy: false, failed: false });
  const ready = detail.allSessionsDone === true;
  const choose_ = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setState({ busy: true, failed: false });
    const outcome = await upload(fetch, {
      file,
      csrf: csrfToken(),
      metadata: planImageMetadata(detail, project),
    });
    if (outcome.kind === "ok") {
      setState({ busy: false, failed: false });
      onSent();
    } else setState({ busy: false, failed: true });
  };
  return (
    <section
      className="multi-night-section multi-night-plan-image multi-night-plan-image-action"
      aria-labelledby="multi-night-plan-image"
      data-plan-image={ready ? "ready" : "waiting"}
    >
      <div className="multi-night-section-heading">
        <h3 id="multi-night-plan-image">{say(locale, "planImageTitle")}</h3>
      </div>
      <div className={`multi-night-panel${ready && active ? " is-ready" : ""}`}>
        <p className="multi-night-help">
          {say(locale, ready ? "planImageReady" : "planImageWaiting")}
        </p>
        {ready && active ? (
          <div className="multi-night-plan-image-actions">
            <a
              className="btn-secondary"
              href={astroSyncDownloadUrl(locale)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {say(locale, "makeWithAstroSync")}
            </a>
            <button
              className="btn-primary"
              type="button"
              disabled={state.busy}
              data-action="send-plan-image"
              onClick={() => input.current?.click()}
            >
              {say(locale, "sendPlanImage")}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              onChange={choose_}
            />
          </div>
        ) : null}
        {state.failed ? (
          <p className="multi-night-help" role="alert">
            {say(locale, "writeFailed")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** "Use Astro Sync on a computer to complete the night…" */
function AstroSyncMessage({ locale }) {
  return (
    <aside className="multi-night-astro-sync-message">
      <p>{say(locale, "astroSyncMessage")}</p>
      <a
        className="btn-link"
        href={astroSyncDownloadUrl(locale)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {say(locale, "discoverAstroSync")}
      </a>
    </aside>
  );
}

export function MultiNightIntegrations({
  host,
  project,
  detail: given,
  onReload = null,
  upload = uploadCapture,
}) {
  const { locale } = host;
  const [own, reloadOwn] = useProjectDetail(project, {
    enabled: given === undefined,
  });
  const detail = given === undefined ? own : given;
  const reload = onReload ?? reloadOwn;
  if (!detail) return null;
  // Where nothing restricts them, they are always active.
  const active =
    host.hosted === false || host.capabilities?.[CAPABILITY] === true;
  const integrations = detail.integrations ?? [];
  const totals = detail.totalsByFilter ?? [];
  const nightCount = new Set(integrations.map((line) => line.nightId)).size;
  const totalSeconds = totals.reduce(
    (sum, total) => sum + total.totalSeconds,
    0,
  );
  const declaredSeconds = integrations
    .filter(isDeclared)
    .reduce((sum, line) => sum + Number(line.totalSeconds || 0), 0);
  const measured = integrations.some((line) => !isDeclared(line));
  return (
    <div
      className={`multi-night-integrations${
        active || !measured ? "" : " is-locked"
      }`}
      data-multi-night-sync={active ? "active" : "locked"}
    >
      <section
        className="multi-night-section"
        aria-labelledby="multi-night-integrations"
      >
        <div className="multi-night-section-heading">
          <h3 id="multi-night-integrations">
            {say(locale, "integrationsTitle")}
          </h3>
          {integrations.length ? (
            <span>
              {say(locale, "integrationsCount", {
                nights: say(locale, "integrationsNights", {
                  count: nightCount,
                }),
                duration: duration(locale, totalSeconds),
              })}
            </span>
          ) : null}
        </div>
        {integrations.length ? (
          <div className="multi-night-panel multi-night-integrations-panel">
            <IntegrationsList
              locale={locale}
              integrations={integrations}
              locked={!active}
            />
            <TotalsByFilter locale={locale} totals={totals} />
            {declaredSeconds > 0 ? (
              <p
                className="multi-night-help multi-night-integrations-declared"
                data-declared-seconds={declaredSeconds}
              >
                {say(locale, "integrationsDeclaredTotal", {
                  duration: duration(locale, declaredSeconds),
                })}
              </p>
            ) : null}
            <InfoLine
              locale={locale}
              className="multi-night-integrations-note"
              text={say(locale, "integrationsNote")}
              title={say(locale, "integrationsTitle")}
              body={say(locale, "integrationsDetail")}
            />
          </div>
        ) : active ? (
          <EmptyIntegrations locale={locale} />
        ) : null}
      </section>
      {detail.planCapture ? (
        <PlanImage
          locale={locale}
          project={project}
          planCapture={detail.planCapture}
          count={detail.planCaptureCount ?? 1}
          integrations={integrations}
        />
      ) : (
        <PlanImageAction
          locale={locale}
          project={project}
          detail={detail}
          active={active}
          onSent={reload}
          upload={upload}
        />
      )}
      {active ? null : <LockCard host={host} />}
      <AstroSyncMessage locale={locale} />
    </div>
  );
}
