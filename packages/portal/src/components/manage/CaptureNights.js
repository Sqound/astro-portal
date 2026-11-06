"use client";

// SESSION-GUIDING-STATS-01 — « Les nuits de cette image », in
// « Qualité des captures » of the owner's page of a capture of a multi-night
// plan, under « Cette image »: one line (« Guidage RMS 0,78″ · 309 poses
// gardées sur 324 · 3 nuits · 13 h 14 »), then a tab « Cumulé » (a row per
// night with its RMS, its frames and its integration, each leading to the
// page of its session, the cumulative row, and each night's share of the kept
// integration) and a tab per night (its figures, its guiding curve and its
// frames, small and still, and « Ouvrir la session du … »). The figures are
// `GET /v1/projects/{projectId}/analyses`'s; a night's curve and frames are
// read when its tab opens (`GET /v1/sessions/{id}` and its analysis). A plan
// of one night has no tab.

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { requestJson } from "../sessions/portal-fetch.js";
import { say } from "../sessions/night-detail-view.js";
import { GuidingTraceChart } from "../sessions/SessionGuiding.js";
import { PosesTimeline } from "../sessions/SessionPoses.js";
import {
  figureText,
  nightMarkers,
  nightWindow,
  planNightsView,
  posesOf,
  sessionPath,
  traceOf,
} from "../sessions/session-guiding-view.js";
import { durationText } from "../../written-forms.js";

const arcsec = (value, locale) =>
  value === null ? "—" : `${figureText(value, locale, 2)}″`;
const integration = (seconds, locale) =>
  seconds > 0 ? durationText(Math.round(seconds / 60), locale) : "—";

/** The figures of the plan's nights, read once for the capture. */
export function usePlanNights(projectId, fetcher = requestJson) {
  const [body, setBody] = useState(null);
  useEffect(() => {
    if (!projectId) return undefined;
    let live = true;
    (async () => {
      try {
        const response = await fetcher(
          `/api/v1/projects/${encodeURIComponent(projectId)}/analyses`,
        );
        const read = response.ok ? await response.json() : null;
        if (live) setBody(read);
      } catch {
        if (live) setBody(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, fetcher]);
  return body;
}

/** One night's trace and frames, read when its tab opens. */
function useNightDetail(sessionId, fetcher = requestJson) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    let live = true;
    setDetail(null);
    (async () => {
      const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
      try {
        const [night, analysis] = await Promise.all([
          fetcher(base).then((response) =>
            response.ok ? response.json() : null,
          ),
          fetcher(`${base}/analyses`).then((response) =>
            response.ok ? response.json() : null,
          ),
        ]);
        if (live) setDetail({ night, analysis });
      } catch {
        if (live) setDetail({ night: null, analysis: null });
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionId, fetcher]);
  return detail;
}

function CumulativeTab({ view, locale }) {
  const top = Math.max(
    0.01,
    ...view.nights.map((night) => night.rmsTotal ?? 0),
    view.cumulative.rmsTotal ?? 0,
  );
  const bar = (value, cumulative = false) =>
    value === null ? null : (
      <i className="capture-nights-rms-track" aria-hidden="true">
        <i
          className={`capture-nights-rms-bar${cumulative ? " is-cumulative" : ""}`}
          style={{ width: `${Math.max(6, (value / top) * 100)}%` }}
        />
      </i>
    );
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const poses = (kept, total) =>
    kept === null || total === null
      ? "—"
      : `${number(kept)} / ${number(total)}`;
  return (
    <div className="capture-nights-cumulative">
      <div className="capture-nights-table-wrap">
        <table className="capture-nights-table">
          <thead>
            <tr>
              <th scope="col">{message(locale, "captureNightsColNight")}</th>
              <th scope="col">{message(locale, "nightPageRmsTotal")}</th>
              <th scope="col">{message(locale, "nightPageLegendRa")}</th>
              <th scope="col">{message(locale, "nightPageLegendDec")}</th>
              <th scope="col">{message(locale, "captureNightsColPoses")}</th>
              <th scope="col">
                {message(locale, "captureNightsColIntegration")}
              </th>
              <th scope="col">
                <span className="visually-hidden">
                  {message(locale, "captureNightsOpenStats")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.nights.map((night) => (
              <tr key={night.sessionId} data-session={night.sessionId}>
                <th scope="row">{night.span}</th>
                {night.analysed ? (
                  <>
                    <td>
                      <span className="capture-nights-rms">
                        {bar(night.rmsTotal)}
                        <span>{arcsec(night.rmsTotal, locale)}</span>
                      </span>
                    </td>
                    <td className="is-ra">{arcsec(night.rmsRa, locale)}</td>
                    <td className="is-dec">{arcsec(night.rmsDec, locale)}</td>
                    <td>{poses(night.kept, night.total)}</td>
                    <td>{integration(night.keptSeconds, locale)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="capture-nights-missing">
                    {message(locale, "captureNightsNotSent")}
                  </td>
                )}
                <td>
                  <a
                    className="btn-link"
                    href={sessionPath(locale, night.sessionId)}
                  >
                    {message(locale, "captureNightsOpenStats")}
                  </a>
                </td>
              </tr>
            ))}
            <tr className="is-cumulative">
              <th scope="row">{message(locale, "captureNightsCumulative")}</th>
              <td>
                <span className="capture-nights-rms">
                  {bar(view.cumulative.rmsTotal, true)}
                  <span>{arcsec(view.cumulative.rmsTotal, locale)}</span>
                </span>
              </td>
              <td className="is-ra">{arcsec(view.cumulative.rmsRa, locale)}</td>
              <td className="is-dec">
                {arcsec(view.cumulative.rmsDec, locale)}
              </td>
              <td>{poses(view.cumulative.kept, view.cumulative.total)}</td>
              <td>{integration(view.cumulative.keptSeconds, locale)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {view.cumulative.keptSeconds > 0 ? (
        <div className="capture-nights-share">
          <p className="capture-zone-line account-muted">
            {message(locale, "captureNightsShare")}
          </p>
          <div className="capture-nights-share-bar">
            {view.nights
              .filter((night) => night.share > 0)
              .map((night, index) => (
                <span
                  key={night.sessionId}
                  className={`capture-nights-share-part is-${index % 3}`}
                  style={{ flexGrow: night.share }}
                  title={`${night.span} · ${integration(night.keptSeconds, locale)}`}
                >
                  {`${night.span} · ${integration(night.keptSeconds, locale)}`}
                </span>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NightTab({ night, locale, fetcher }) {
  const detail = useNightDetail(night.sessionId, fetcher);
  const read = detail?.night ?? null;
  const zone = read?.zone?.timeZone ?? night.zone ?? null;
  const trace = traceOf(read?.guidingTrace ?? null);
  const report = detail?.analysis?.report ?? null;
  const rejectedKnown = read?.posesSummary?.rejectedKnown === true;
  const poses = report ? posesOf(report, { rejectedKnown }) : [];
  const bounds = {
    start: read?.night?.startedAt?.value ?? null,
    end: read?.night?.finishedAt?.value ?? null,
  };
  const window = nightWindow(
    bounds,
    trace ??
      (poses.length
        ? { from: poses[0].at, to: poses[poses.length - 1].end }
        : null),
  );
  const markers = nightMarkers(trace, report);
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  return (
    <div className="capture-nights-night" data-session={night.sessionId}>
      {night.analysed ? (
        <dl className="night-figures session-guiding-figures">
          <div className="night-figure">
            <dt>{message(locale, "nightPageRmsTotal")}</dt>
            <dd>{arcsec(night.rmsTotal, locale)}</dd>
          </div>
          <div className="night-figure is-ra">
            <dt>{message(locale, "nightPageRmsRa")}</dt>
            <dd>{arcsec(night.rmsRa, locale)}</dd>
          </div>
          <div className="night-figure is-dec">
            <dt>{message(locale, "nightPageRmsDec")}</dt>
            <dd>{arcsec(night.rmsDec, locale)}</dd>
          </div>
          <div className="night-figure">
            <dt>{message(locale, "sessionPosesKept")}</dt>
            <dd>
              {night.kept === null ? "—" : number(night.kept)}
              {night.total !== null ? (
                <span className="night-figure-extra">
                  {" "}
                  {say(locale, "sessionPosesOf", {
                    total: number(night.total),
                  })}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="capture-zone-line account-muted">
          {message(locale, "captureNightsNotSent")}
        </p>
      )}
      {trace && window ? (
        <GuidingTraceChart
          locale={locale}
          trace={trace}
          markers={markers}
          window={window}
          zone={zone}
          compact
          initialWidth={720}
        />
      ) : null}
      {poses.length && window ? (
        <PosesTimeline
          locale={locale}
          poses={poses}
          markers={markers}
          window={window}
          zone={zone}
          compact
          initialWidth={720}
        />
      ) : null}
      <p className="capture-zone-line">
        <a className="btn-link" href={sessionPath(locale, night.sessionId)}>
          {say(locale, "captureNightsOpenSession", { span: night.span })}
        </a>
      </p>
    </div>
  );
}

/**
 * The part itself; `body` is the answer of `GET /v1/projects/{id}/analyses`
 * (read by `usePlanNights`), `null` while it is read or when it failed: the
 * part is then absent.
 */
export function CaptureNightsPart({
  body,
  locale = "en",
  fetcher = requestJson,
  initialTab = "cumulative",
}) {
  const [tab, setTab] = useState(initialTab);
  const view = planNightsView(body, locale);
  if (!view) return null;
  const current = view.single
    ? view.nights[0].sessionId
    : tab === "cumulative" ||
        view.nights.some((night) => night.sessionId === tab)
      ? tab
      : "cumulative";
  const tabs = [
    { key: "cumulative", label: message(locale, "captureNightsCumulative") },
    ...view.nights.map((night) => ({
      key: night.sessionId,
      label: night.span,
    })),
  ];
  return (
    <div
      className="capture-quality-part capture-nights"
      data-quality="nights"
      data-testid="capture-nights"
    >
      <h4 className="capture-quality-part-title">
        {message(locale, "captureNightsTitle")}
      </h4>
      <p className="capture-nights-summary">{view.summary}</p>
      {view.single ? null : (
        <div
          className="capture-nights-tabs"
          role="tablist"
          aria-label={message(locale, "captureNightsTitle")}
        >
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={current === entry.key}
              className={current === entry.key ? "is-active" : ""}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      <div role={view.single ? undefined : "tabpanel"}>
        {current === "cumulative" ? (
          <CumulativeTab view={view} locale={locale} />
        ) : (
          <NightTab
            key={current}
            night={view.nights.find((night) => night.sessionId === current)}
            locale={locale}
            fetcher={fetcher}
          />
        )}
      </div>
    </div>
  );
}
