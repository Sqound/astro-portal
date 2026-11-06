"use client";

import { TargetTile } from "portal/components/ObjectPictogram.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { KnowledgeStory } from "portal/components/detail/KnowledgeStory.js";
import { message } from "portal/i18n.js";
import { useTargetPhotoViewer } from "./TargetPhotoViewer.js";
import { useTargetKnowledge } from "./use-target-knowledge.js";
import { planTargetSheetWords } from "../plan-target-words.js";
import { hipsPreviewUrl } from "../recommendations.js";

// The dialog of a target of tonight's plan, with these sections in order — the
// photo, the names and their facts, "Tonight in this plan" (slot, duration,
// heights, score for the slot, the altitude curve of the slot, a line of
// facts), "Description" and "Repères d’observation" from the catalogue's card
// (a target with a published page shows the page of the detail page, whole), the image credit with "Voir l’image source", and
// "Fermer", its only action: the dialog's cross is not drawn (Escape still
// closes it, as every dialog of the page).

/** The altitude curve of the slot (320 × 40). */
function SlotCurve({ series, start, end, label }) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  const points = (series || [])
    .map((point) => ({
      time: Date.parse(point?.time),
      altitude: Number(point?.altitude),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.altitude) &&
        point.time >= from - 10 * 60000 &&
        point.time <= to + 10 * 60000,
    );
  if (points.length < 2 || !(to > from)) return null;
  const low = Math.min(...points.map((point) => point.altitude));
  const high = Math.max(...points.map((point) => point.altitude));
  const bottom = Math.max(0, low - 15);
  const top = Math.min(90, high + 5);
  const range = top - bottom > 0 ? top - bottom : 1;
  const x = (time) =>
    Math.min(320, Math.max(0, ((time - from) / (to - from)) * 320));
  const y = (altitude) => 40 * (1 - (altitude - bottom) / range);
  const line = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(point.time).toFixed(1)} ${y(point.altitude).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="plan-target-curve"
      viewBox="0 0 320 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className="plan-target-curve-fill" d={`${line} L320 40 L0 40 Z`} />
      <path className="plan-target-curve-line" d={line} />
    </svg>
  );
}

export function PlanTargetDialog({
  item,
  night = null,
  locale,
  at,
  moonUp = [],
  dew = null,
  onClose,
}) {
  const knowledge = useTargetKnowledge(item?.target, locale);
  const words = planTargetSheetWords({
    item,
    night,
    knowledge,
    locale,
    at,
    moonUp,
    dew,
  });
  const card = { ...(night?.card || {}), target: item.target };
  // The photo opens the target's full-screen photo, with the slot in the
  // plan and the catalogue's card this dialog read.
  const photo = useTargetPhotoViewer({ locale });
  return (
    <WebDialog
      className="plan-target-dialog"
      bodyClassName="plan-target-body"
      ariaLabel={words.title}
      closeLabel={words.close}
      onClose={onClose}
      footerClassName="plan-target-footer"
      footer={
        <button
          type="button"
          className="btn-tertiary plan-target-close"
          onClick={onClose}
        >
          {words.close}
        </button>
      }
    >
      <TargetTile
        className="plan-target-photo"
        target={item.target}
        previewUrl={hipsPreviewUrl(card)}
        locale={locale}
        openLabel={message(locale, "planTargetSheetPhoto").replace(
          "{target}",
          item.designation,
        )}
        onOpen={({ url, credit }) =>
          photo.open({
            target: item.target,
            url,
            credit,
            knowledge,
            window:
              item.start && item.end
                ? {
                    start: at(item.start),
                    end: at(item.end),
                    maxAltitude: night?.maxAltitude,
                    inPlan: true,
                  }
                : null,
          })
        }
      />
      {photo.viewer}
      <div className="plan-target-names">
        <h2 data-autofocus="" tabIndex={-1}>
          {words.title}
        </h2>
        {words.facts ? (
          <p className="plan-target-muted">{words.facts}</p>
        ) : null}
      </div>
      {words.tonight ? (
        <section
          aria-label={words.tonight}
          className="plan-target-section"
          data-section="tonight"
        >
          <h3>{words.tonight}</h3>
          <dl className="plan-target-tiles">
            {words.tiles.map((tile) => (
              <div key={tile.key} data-tile={tile.key}>
                <dt>{tile.label}</dt>
                <dd>
                  {tile.value}
                  {tile.outOf ? (
                    <span className="plan-target-out-of">{tile.outOf}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          {words.curveLabel ? (
            <SlotCurve
              series={night?.card?.series}
              start={item.start}
              end={item.end}
              label={words.curveLabel}
            />
          ) : null}
          {words.nightFacts ? (
            <p className="plan-target-muted">{words.nightFacts}</p>
          ) : null}
        </section>
      ) : null}
      {words.description ? (
        <section
          aria-label={words.description.title}
          className="plan-target-section"
          data-section="description"
        >
          <h3>{words.description.title}</h3>
          {words.description.page ? (
            // A published page: the page of the detail page, whole.
            <div className="knowledge-story plan-target-story">
              <KnowledgeStory
                knowledge={words.description.page}
                paragraphs={words.description.paragraphs}
                locale={locale}
              />
            </div>
          ) : (
            words.description.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))
          )}
        </section>
      ) : null}
      {words.guide ? (
        <section
          aria-label={words.guide.title}
          className="plan-target-section"
          data-section="guide"
        >
          <h3>{words.guide.title}</h3>
          <dl className="plan-target-tiles">
            <div>
              <dt>{words.guide.focalLabel}</dt>
              <dd>{words.guide.focal}</dd>
            </div>
            <div>
              <dt>{words.guide.visualLabel}</dt>
              <dd>{words.guide.visual}</dd>
            </div>
          </dl>
          <p className="plan-target-muted plan-target-small">
            {words.guide.note}
          </p>
        </section>
      ) : null}
      {words.credit || words.sourceUrl ? (
        <p className="plan-target-credit">
          {words.credit ? <span>{words.credit}</span> : null}
          {words.sourceUrl ? (
            <a
              className="btn-link"
              href={words.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {words.sourceLabel}
            </a>
          ) : null}
        </p>
      ) : null}
    </WebDialog>
  );
}
