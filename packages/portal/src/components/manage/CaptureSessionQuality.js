"use client";

import { message } from "portal/i18n.js";
import { InfoLine } from "../dialog/InfoButton.js";
import { CaptureNightsPart, usePlanNights } from "./CaptureNights.js";
import {
  aduText,
  arcsecText,
  numberText,
} from "../sessions/night-detail-view.js";

/**
 * What the owner's page of a capture says of its session and of its quality:
 *
 * - `CaptureSessionLine`: « Session du 7 au 8 oct. » and « Voir la session »
 *   (secondary: the action of a zone without a primary) under the pills;
 *   without a session, one line + ⓘ;
 * - `CaptureQualityZone`: « Qualité des captures » in three parts, each absent
 *   when its data is `null` and the zone absent when all are — « Cette
 *   image » (what Astro Sync measured on the stacked image), « Les nuits de
 *   cette image » for the image of a multi-night plan (`CaptureNights.js`)
 *   and « La session » (the medians of the night, as the Journal draws them).
 *
 * The statistics are shown on the private and the public gallery alike, with a
 * switch for each: « Cette image » is also drawn in
 * the capture's page of the private gallery and of the public gallery (the
 * « Qualité » section of `PublicCapturePage`), each while the owner's switch
 * of that gallery is on — `controls`, drawn under « Cette image » by the
 * tab, holds the two switches. « La session » (the night's medians) stays in
 * the owner's page alone: the galleries never carry it.
 */

/** The evening of the night and the morning after: « 7 oct. », « 8 oct. ». */
export function sessionSpanOf(night, locale) {
  const value = night?.value;
  const date = value?.date ?? value?.startedAt?.slice(0, 10) ?? null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 86_400_000);
  const write = (value, options) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
      value,
    );
  return {
    from: write(start, { day: "numeric", month: "short" }),
    to: write(end, { day: "numeric", month: "short" }),
    fromDay: write(start, { day: "numeric" }),
    sameMonth: start.getUTCMonth() === end.getUTCMonth(),
  };
}

/**
 * The head line of the page, under the pills. A capture that is the image of
 * a multi-night plan combines several sessions: it says so instead of the
 * missing session.
 */
export function CaptureSessionLine({ capture, meta, locale, href }) {
  const metadata = capture.metadata;
  if (!metadata) return null;
  if (capture.projectId && !metadata.sessionId)
    return <p className="capture-session-line">{meta.capturePlanImageLine}</p>;
  if (!metadata.sessionId)
    return (
      <InfoLine
        locale={locale}
        className="capture-session-line"
        text={meta.captureNoSessionLine}
        title={meta.nightZone}
        body={meta.captureNoSessionInfo}
      />
    );
  const span = sessionSpanOf(metadata.night, locale);
  return (
    <div className="capture-session-line" data-session={metadata.sessionId}>
      <p className="capture-session-day">
        {span
          ? meta.captureSessionLine(
              span.from,
              span.to,
              span.fromDay,
              span.sameMonth,
            )
          : meta.nightLabel}
      </p>
      {href ? (
        <a className="btn-secondary" href={href}>
          {message(locale, "planSeeSession")}
        </a>
      ) : null}
    </div>
  );
}

/** The sentence of a replacement (`replacedAt`): shown for a photo sent from a device. */
export function CaptureReplacedLine({ capture, locale }) {
  if (!capture.replacedAt) return null;
  if (capture.replacedSource && capture.replacedSource !== "phone") return null;
  return (
    <p className="capture-replaced-line account-muted">
      {message(locale, "sessionPagePhotoReplaced")}
    </p>
  );
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** One figure of a part: its value and its name, as the Journal's strips. */
function Figure({ value, label }) {
  return (
    <div className="quality-chart">
      <div className="quality-chart-value">
        <strong>{value}</strong>
      </div>
      <div className="quality-chart-description">
        <span className="quality-chart-label">{label}</span>
      </div>
    </div>
  );
}

/**
 * « Cette image »: the FWHM in arc seconds (else in pixels), the
 * eccentricity, the stars measured, then the sentence that says on what.
 */
function imageFigures(quality, meta, locale) {
  return [
    {
      key: "fwhm",
      label: message(locale, "qualityFwhm"),
      value: finite(quality.fwhmArcsec)
        ? arcsecText(quality.fwhmArcsec, locale)
        : finite(quality.fwhmPixels)
          ? `${numberText(quality.fwhmPixels, locale, 1)} px`
          : null,
    },
    {
      key: "eccentricity",
      label: message(locale, "qualityEccentricity"),
      value: finite(quality.eccentricity)
        ? numberText(quality.eccentricity, locale, 2)
        : null,
    },
    {
      key: "stars",
      label: meta.qualityStars(quality.starCount),
      value: Number.isInteger(quality.starCount)
        ? new Intl.NumberFormat(locale).format(quality.starCount)
        : null,
    },
  ].filter((figure) => figure.value);
}

function ImagePart({ figures, meta, controls = null }) {
  return (
    <div className="capture-quality-part" data-quality="image">
      <h4 className="capture-quality-part-title">{meta.qualityImageTitle}</h4>
      <div className="quality-charts">
        {figures.map((figure) => (
          <Figure key={figure.key} value={figure.value} label={figure.label} />
        ))}
      </div>
      <p className="capture-zone-line account-muted">{meta.qualityImageNote}</p>
      {controls}
    </div>
  );
}

/**
 * « La session »: the three medians of the night through the Journal's own
 * strips (the sky background, the stars' FWHM, the eccentricity), the line
 * that says of which night and « Voir la session » as a link.
 */
function sessionStrips(quality, locale) {
  return [
    {
      key: "skyBackground",
      label: message(locale, "qualitySkyBackground"),
      value: finite(quality.skyBackground)
        ? aduText(quality.skyBackground, locale)
        : null,
    },
    {
      key: "fwhm",
      label: message(locale, "qualityFwhm"),
      value: finite(quality.fwhm) ? arcsecText(quality.fwhm, locale) : null,
    },
    {
      key: "eccentricity",
      label: message(locale, "qualityEccentricity"),
      value: finite(quality.eccentricity)
        ? numberText(quality.eccentricity, locale, 2)
        : null,
    },
  ].filter((strip) => strip.value);
}

function SessionPart({ strips, meta, locale, href, evening }) {
  return (
    <div className="capture-quality-part" data-quality="session">
      <h4 className="capture-quality-part-title">{meta.nightZone}</h4>
      <div className="quality-charts">
        {strips.map((strip) => (
          <Figure key={strip.key} value={strip.value} label={strip.label} />
        ))}
      </div>
      <p className="capture-zone-line account-muted">
        {evening ? meta.qualitySessionLine(evening) : null}
        {href ? (
          <>
            {evening ? " " : null}
            <a className="btn-link" href={href}>
              {message(locale, "planSeeSession")}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * The zone after « Intégrations ». `capture.quality` is the main image's
 * (the owner's page draws the main image: it has no image selector, so a
 * variant's own quality is not drawn), `capture.detail.sessionQuality` the
 * session's. Reading is never held by a right; both are `null` where nothing
 * was measured, and the zone is then absent.
 */
export function CaptureQualityZone({
  capture,
  meta,
  locale,
  href,
  controls = null,
  nights: givenNights,
}) {
  const image = capture.quality ?? null;
  const session = capture.detail?.sessionQuality ?? null;
  const figures = image ? imageFigures(image, meta, locale) : [];
  const strips = session ? sessionStrips(session, locale) : [];
  // The nights of a multi-night plan's image (« Les nuits de cette image »),
  // read from the plan's statistics; `nights` given by a test or a caller.
  const read = usePlanNights(
    givenNights === undefined ? (capture.projectId ?? null) : null,
  );
  const nights = givenNights === undefined ? read : givenNights;
  const hasNights = Array.isArray(nights?.nights) && nights.nights.length > 0;
  // A part with no figure is absent, and the zone with it.
  if (!figures.length && !strips.length && !hasNights) return null;
  const evening = session?.eveningDate
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${session.eveningDate}T12:00:00Z`))
    : null;
  return (
    <section
      className="capture-zone capture-meta-zone capture-quality-zone"
      aria-label={message(locale, "captureQuality")}
      data-zone="quality"
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">
          {message(locale, "captureQuality")}
        </h3>
      </div>
      {figures.length ? (
        <ImagePart
          figures={figures}
          meta={meta}
          controls={hasNights ? null : controls}
        />
      ) : null}
      {hasNights ? <CaptureNightsPart body={nights} locale={locale} /> : null}
      {/* The switches stay under the quality they show; with the nights of a
          plan's image, under them (« Les nuits » sits under « Cette image »). */}
      {hasNights && figures.length ? controls : null}
      {strips.length ? (
        <SessionPart
          strips={strips}
          meta={meta}
          locale={locale}
          href={href}
          evening={evening}
        />
      ) : null}
    </section>
  );
}
