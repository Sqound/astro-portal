"use client";

import { message } from "portal/i18n.js";
import { InfoButton } from "../dialog/InfoButton.js";
import {
  aduText,
  framePoints,
  hasGuiding,
  hasQuality,
  numberText,
  say,
} from "./night-detail-view.js";

// « Qualité des captures » of the page of a session: three curves over the
// night — the sky's background, the stars' FWHM, their eccentricity — each
// with the night's median at the right, and one line of guiding that leads to
// the detail (« Voir le guidage », under « Détails de la nuit »). Only when
// Astro Sync measured the night: the detail below keeps the old page's tables
// and charts. Inline SVG, no chart library.

const WIDTH = 340;
const HEIGHT = 56;

function Curve({ locale, label, value, rows, field }) {
  const points = framePoints(rows, field);
  if (!points.length) return null;
  const low = Math.min(...points.map((point) => point.value));
  const high = Math.max(...points.map((point) => point.value));
  const spread = high - low || 1;
  const from = points[0].t;
  const to = points[points.length - 1].t;
  const x = (t) => 6 + ((t - from) / (to - from || 1)) * (WIDTH - 12);
  const y = (v) => 6 + (1 - (v - low) / spread) * (HEIGHT - 12);
  return (
    <div className="session-curve" data-curve={field}>
      <div className="session-curve-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points
            .map(
              (point) =>
                `${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`,
            )
            .join(" ")}
        />
      </svg>
    </div>
  );
}

/**
 * The guiding line: « Guidage · RMS total 0,75″ · AD 0,71″ · Déc 0,25″ · 2
 * dithers ». Under a heading that already says « Guidage », `title: false`
 * leaves the first word out.
 */
export function guidingLine(summary, locale, { title = true } = {}) {
  if (!hasGuiding(summary)) return null;
  const arcsec = (value) =>
    value === null || value === undefined
      ? null
      : `${numberText(value, locale, 2)}″`;
  const parts = [
    title ? message(locale, "nightPageGuidingTitle") : null,
    summary.rmsTotalArcsec !== null && summary.rmsTotalArcsec !== undefined
      ? `${message(locale, "nightPageRmsTotal")} ${arcsec(summary.rmsTotalArcsec)}`
      : null,
    summary.rmsRaArcsec !== null && summary.rmsRaArcsec !== undefined
      ? `${message(locale, "nightPageRmsRa")} ${arcsec(summary.rmsRaArcsec)}`
      : null,
    summary.rmsDecArcsec !== null && summary.rmsDecArcsec !== undefined
      ? `${message(locale, "nightPageRmsDec")} ${arcsec(summary.rmsDecArcsec)}`
      : null,
    (summary.dithers ?? 0) > 0
      ? say(
          locale,
          summary.dithers === 1
            ? "nightPageDithersOne"
            : "nightPageDithersOther",
          { count: summary.dithers },
        )
      : null,
    (summary.meridianFlips ?? 0) > 0
      ? say(
          locale,
          summary.meridianFlips === 1
            ? "nightPageFlipsOne"
            : "nightPageFlipsOther",
          { count: summary.meridianFlips },
        )
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function SessionQualityCard({
  locale = "en",
  summary,
  guidingSummary = null,
  report = null,
  onSeeGuiding = () => {},
}) {
  const quality = hasQuality(summary);
  // A night with no measured frame (the headers carry no FWHM, no sky) has
  // no « Qualité des captures » to show: its guiding stands alone, under its
  // own heading, instead of an empty quality card.
  const guiding = guidingLine(guidingSummary, locale, { title: quality });
  if (!quality && !guiding) return null;
  const night = summary?.night ?? null;
  const rows = report?.quality ?? [];
  const frames = night?.measuredFrames ?? 0;
  return (
    <section
      className="night-card session-quality"
      aria-labelledby="session-quality-title"
    >
      <div className="night-section-head">
        <h2 id="session-quality-title">
          {message(
            locale,
            quality ? "sessionPageQualityTitle" : "nightPageGuidingTitle",
          )}
          <span className="session-measured">
            {message(locale, "sessionMeasuredBadge")}
          </span>
        </h2>
        {quality ? (
          <InfoButton
            locale={locale}
            label={message(locale, "nightPageQualityInfoLabel")}
            title={message(locale, "sessionPageQualityTitle")}
            body={message(locale, "nightPageQualityInfo")}
          />
        ) : null}
      </div>
      {quality ? (
        <>
          <p className="night-card-line">
            {say(
              locale,
              frames === 1
                ? "sessionPageMeasuredFramesOne"
                : "sessionPageMeasuredFramesOther",
              { count: frames },
            )}
          </p>
          <div className="session-curves">
            <Curve
              locale={locale}
              label={message(locale, "sessionPageQualitySky")}
              value={aduText(night.skyBackgroundAdu, locale)}
              rows={rows}
              field="skyBackgroundAdu"
            />
            <Curve
              locale={locale}
              label={message(locale, "sessionPageQualityFwhm")}
              value={`${numberText(night.fwhmPixels, locale, 1)} px`}
              rows={rows}
              field="fwhmPixels"
            />
            <Curve
              locale={locale}
              label={message(locale, "sessionPageQualityEccentricity")}
              value={numberText(night.eccentricity, locale, 2)}
              rows={rows}
              field="eccentricity"
            />
          </div>
        </>
      ) : null}
      {guiding ? (
        <div className="session-guiding-line">
          <p>{guiding}</p>
          <a
            className="btn-link"
            href="#session-details-quality"
            onClick={onSeeGuiding}
          >
            {message(locale, "sessionPageSeeGuiding")}
          </a>
        </div>
      ) : null}
    </section>
  );
}
