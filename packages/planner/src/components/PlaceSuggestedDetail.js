"use client";

import { LoadingState } from "portal/components/LoadingState.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { PlannerHorizonEditor } from "portal/components/planner/PlannerHorizonEditor.js";
import { horizonTracedPointCount } from "portal/planner/horizon-mask.js";
import { message } from "portal/i18n.js";
import { placeDistanceKm } from "portal/planner/state.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { useEffect, useState } from "react";
import {
  accessLabel,
  feeLabel,
  driveByCarLabel,
  placeKindLabel,
  placesAltitudeLabel,
  placesDateLabel,
  placesDistanceLabel,
  placesText,
  referenceNameInSentence,
  skyComparisonSentence,
  usagePlanLabel,
  usagePlanStatusLabel,
} from "../places-copy.js";
import {
  alreadyMinePlace,
  compareSky,
  itineraryUrl,
  knownPlaceLinkOf,
  placeHorizonRecorded,
  placeKindOf,
  placeLabel,
  skyScalePosition,
} from "../places-rules.js";
import { driveTimeEstimate } from "../places-rank.js";
import {
  PlaceLightMapButton,
  PlaceLightMapLink,
} from "./PlaceLightMapEntry.js";
import {
  PlaceTag,
  PlaceAttribution,
  PlaceCaution,
  PlaceChevron,
  PlaceExternalIcon,
  PlaceKindBadge,
  PlacePlusIcon,
  PlaceRouteIcon,
  SkyDeltaBadge,
  usePlaceSky,
} from "./PlacesParts.js";
import {
  SkyBrightnessInfo,
  SkyBrightnessPill,
  shownPlaceSky,
  usePlaceSkyMeasuresOfPage,
} from "./SkyBrightnessParts.js";

// "Fiche d’un lieu suggéré": the kind and name, the sky with its scale and how
// it compares, the distance and elevation, tonight's weather, the horizon, "À
// savoir", the caution and the source; the foot: "Itinéraire" on the left,
// "Ajouter à mes lieux" on the right, or, for a place already saved, "Déjà dans
// vos lieux" above "Itinéraire" and "Retirer de mes lieux". The same screen
// shows a personal place linked to a known place ("Détails"): its details are
// read through the link when shown, never stored in the place or the plan; a
// place the source dropped says so and the personal place stays as it is.
// "Itinéraire" opens OpenStreetMap's directions in a new tab, "Ouvrir le site"
// the site likewise.

// The card shows the sky value the place's rule picks — measured, typed, else
// the model's — with its pill and the info button of the information dialog.
function SkyCard({
  locale,
  sky,
  brightness,
  reference = null,
  referenceSky = null,
  comparison,
  place = null,
}) {
  const referenceName = reference?.name;
  return (
    <section
      className="places-sky-card"
      aria-label={message(locale, "placeSkyTitle")}
    >
      <header>
        <h3>{message(locale, "placeSkyTitle")}</h3>
        <SkyBrightnessPill
          className="places-estimate"
          locale={locale}
          source={brightness?.choice?.source}
        />
        <SkyBrightnessInfo
          locale={locale}
          sky={brightness}
          action={<PlaceLightMapButton locale={locale} place={place} />}
        />
      </header>
      {sky ? (
        <>
          <p className="places-sky-main">
            <strong>
              {message(locale, "bortle")} {sky.bortle}
            </strong>
            <span>
              {new Intl.NumberFormat(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(sky.sqm)}{" "}
              mag/arcsec²
            </span>
          </p>
          <div
            className="places-scale"
            role="img"
            aria-label={placesText(locale, "placeSkyScale", {
              sqm: new Intl.NumberFormat(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(sky.sqm),
            })}
          >
            <span
              className="places-scale-marker"
              style={{ left: `${skyScalePosition(sky.sqm) * 100}%` }}
            />
          </div>
          <p className="places-scale-labels" aria-hidden="true">
            <span>{message(locale, "placeSkyScaleLow")}</span>
            <span>{message(locale, "placeSkyScaleHigh")}</span>
          </p>
          {comparison && referenceName && (
            <p
              className="places-comparison-sentence"
              data-kind={comparison.kind}
            >
              {skyComparisonSentence(
                locale,
                comparison,
                referenceNameInSentence(locale, reference),
              )}
              {/* The same badge as the lists, the same explanation. */}
              {referenceSky && (
                <SkyDeltaBadge
                  locale={locale}
                  comparison={comparison}
                  place={{ name: place?.name ?? "", sqm: sky.sqm }}
                  reference={reference}
                  referenceSky={referenceSky}
                  testId="place-detail-delta"
                />
              )}
            </p>
          )}
        </>
      ) : (
        <p className="places-muted">{message(locale, "placeSkyUnknown")}</p>
      )}
      {/* The card's one link, at its end. */}
      <PlaceLightMapLink locale={locale} place={place} />
    </section>
  );
}

function Figures({ locale, place, reference, owned = null }) {
  const km = reference ? placeDistanceKm(reference, place) : null;
  const drive = km === null ? null : driveTimeEstimate(km).minutes;
  return (
    <>
      <div className="places-figures">
        {km !== null && !owned && (
          <div className="places-figure">
            <span>{message(locale, "placeDistance")}</span>
            <strong>{placesDistanceLabel(locale, km)}</strong>
            <small>
              {placesText(locale, "placeDistanceFrom", {
                place: referenceNameInSentence(locale, reference),
              })}
            </small>
          </div>
        )}
        <div className="places-figure">
          <span>{message(locale, "placeAltitude")}</span>
          {Number.isFinite(place.elevation) ? (
            <>
              <strong>{placesAltitudeLabel(locale, place.elevation)}</strong>
              <small>{message(locale, "placeAltitudeApproximate")}</small>
            </>
          ) : (
            <strong>{message(locale, "placeAltitudeUnknown")}</strong>
          )}
        </div>
        {owned && (
          <div className="places-figure" data-time-zone>
            <span>{message(locale, "placeTimeZone")}</span>
            <strong>{owned.timeZone || "UTC"}</strong>
            <small>
              {message(
                locale,
                owned.timeZone ? "placeTimeZoneDeduced" : "placeTimeZoneUnset",
              )}
            </small>
          </div>
        )}
      </div>
      {owned && km !== null && (
        // "Distance" is a line, not a tile, for one of my places: the
        // default place has no reference.
        <p className="places-drive-line" data-distance-line>
          {placesDistanceLabel(locale, km)} ·{" "}
          {placesText(locale, "placeDistanceFrom", {
            place: referenceNameInSentence(locale, reference),
          })}
        </p>
      )}
      {drive !== null && (
        <p className="places-drive-line" data-drive-time>
          {placesText(locale, "placeDriveTimeLine", {
            drive: driveByCarLabel(locale, drive),
          })}
        </p>
      )}
    </>
  );
}

// The compact horizon map: the recorded horizon drawn as the planner draws it,
// read only (the compact mode of the horizon editor's plot), with "N points
// relevés" under it; a click opens the horizon, as "Voir l’horizon" does.
function HorizonMap({ locale, mine, onOpen }) {
  const count = horizonTracedPointCount(mine.horizonMask);
  const plot = (
    <PlannerHorizonEditor
      locale={locale}
      mask={mine.horizonMask}
      readOnly
      compact
    />
  );
  return (
    <>
      {onOpen ? (
        <button
          type="button"
          className="places-horizon-map"
          data-place-horizon-map
          aria-label={flow(locale, "viewHorizon")}
          onClick={onOpen}
        >
          {plot}
        </button>
      ) : (
        <div className="places-horizon-map" data-place-horizon-map>
          {plot}
        </div>
      )}
      <p className="places-muted" data-place-horizon-count>
        {placesText(
          locale,
          count === 1 ? "placeHorizonPointsOne" : "placeHorizonPointsMany",
          { count },
        )}
      </p>
    </>
  );
}

function HorizonCard({ locale, mine, onViewHorizon, owned = false }) {
  const recorded = placeHorizonRecorded(mine);
  return (
    <section
      className="places-horizon"
      aria-label={flow(locale, "viewHorizon")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="places-icon"
      >
        <path d="m3 17 5-6 4 4 4-8 5 7" />
      </svg>
      <div>
        <strong>
          {message(
            locale,
            recorded ? "placeHorizonRecorded" : "placeHorizonToRecord",
          )}
        </strong>
        {!mine && <p>{message(locale, "placeHorizonAfterAdding")}</p>}
        {owned && recorded && <p>{message(locale, "placeHorizonMaskSaved")}</p>}
        {recorded && mine && (
          <HorizonMap
            locale={locale}
            mine={mine}
            onOpen={onViewHorizon ? () => onViewHorizon(mine) : null}
          />
        )}
        {recorded && onViewHorizon && (
          // A lone button, with nothing full-width above it, stands on the
          // right of the card's content.
          <div className="places-horizon-actions">
            <button
              type="button"
              // In the sheet of one of my places the horizon card's action is a
              // tertiary; on a suggestion it stays a link.
              className={owned ? "btn-tertiary" : "btn-link"}
              onClick={() => onViewHorizon(mine)}
            >
              {flow(locale, "viewHorizon")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * "À savoir" of a suggestion, or, for a place of mine linked to a record of
 * OpenStreetMap (`osm`: `{ id, onDetach }`), the section "Fiche OpenStreetMap"
 * what the source says (when it could be read, else `place` is `null`),
 * the source's credit (its licence is in it), "Voir sur OpenStreetMap" and
 * "Détacher" — two links of one zone, the second in the destructive tint
 *: the place and its type stay.
 */
function Facts({ locale, place, osm = null }) {
  const notProvided = message(locale, "placeNotProvided");
  const title = message(locale, osm ? "placeOsmTitle" : "placeFacts");
  return (
    <section
      className="places-facts"
      data-testid={osm ? "place-osm-section" : undefined}
      aria-label={title}
    >
      <h3>{title}</h3>
      {place?.description && (
        // What the source says of the place, as it writes it (not
        // translated), at the head of the card.
        <p
          className="places-description"
          data-testid="place-detail-description"
        >
          {place.description}
        </p>
      )}
      {place && (
        <dl>
          <div>
            <dt>{message(locale, "placeFactType")}</dt>
            <dd>{placeKindLabel(locale, place.type)}</dd>
          </div>
          <div>
            <dt>{message(locale, "placeFactWebsite")}</dt>
            <dd>
              {place.website ? (
                <a
                  className="btn-link"
                  href={place.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${message(locale, "placeOpenSite")} ${message(locale, "placesNewTab")}`}
                >
                  {message(locale, "placeOpenSite")}
                  <PlaceExternalIcon />
                </a>
              ) : (
                notProvided
              )}
            </dd>
          </div>
          <div>
            <dt>{message(locale, "placeFactHours")}</dt>
            <dd>{place.openingHours || notProvided}</dd>
          </div>
          <div>
            <dt>{message(locale, "placeFactAccess")}</dt>
            <dd>
              {place.access ? accessLabel(locale, place.access) : notProvided}
            </dd>
          </div>
          <div>
            <dt>{message(locale, "placeFactFee")}</dt>
            <dd>{place.fee ? feeLabel(locale, place.fee) : notProvided}</dd>
          </div>
        </dl>
      )}
      {place && (
        <PlaceCaution framed>{message(locale, "placeUnverified")}</PlaceCaution>
      )}
      <PlaceAttribution locale={locale} source />
      {osm && (
        <>
          <div className="places-osm-actions">
            <a
              className="btn-link"
              data-testid="place-osm-open"
              href={`https://www.openstreetmap.org/${osm.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${message(locale, "placeOsmSeeOn")} ${message(locale, "placesNewTab")}`}
            >
              {message(locale, "placeOsmSeeOn")}
              <PlaceExternalIcon />
            </a>
            {osm.onDetach && (
              <button
                type="button"
                className="btn-link is-destructive"
                data-testid="place-osm-detach"
                onClick={osm.onDetach}
              >
                {message(locale, "placeOsmDetach")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The foot of the sheet. "Itinéraire" (tertiary, its own width, the glyph of
 * "Trajet" on the cards) on the left, the action of the foot on the right
 * taking the rest of the line: "Ajouter à mes lieux" (primary, the "+" of
 * the cards) or, for a place already saved, "Retirer de mes lieux"
 * (tertiary, destructive tint) under the status line "Déjà dans vos lieux".
 * A line alone in its zone has no equal parts; a lone "Itinéraire" (a saved
 * place opened from "Mes lieux") stays on the right; when the two do not fit
 * they stack, the strongest first (rule 9).
 */
export function PlaceDetailFooter({
  locale,
  mode,
  mine,
  place,
  adding = false,
  useMode = false,
  onAdd,
  onUse = () => {},
  onRemove,
}) {
  const state = useMode
    ? "use"
    : mode === "linked"
      ? "linked"
      : mine
        ? "saved"
        : "add";
  return (
    <footer className="places-detail-footer" data-footer={state}>
      {state === "saved" && (
        <p className="places-already">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
          {message(locale, "placesAlreadyMine")}
        </p>
      )}
      <div className="places-detail-footer-buttons">
        <a
          className="btn-secondary places-route"
          href={itineraryUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${message(locale, "placeItinerary")} ${message(locale, "placesNewTab")}`}
        >
          <PlaceRouteIcon />
          {message(locale, "placeItinerary")}
        </a>
        {state === "use" && (
          <button type="button" className="btn-primary" onClick={onUse}>
            {message(locale, "placesUse")}
          </button>
        )}
        {state === "add" && (
          <button
            type="button"
            className="btn-primary"
            disabled={adding}
            onClick={onAdd}
          >
            <PlacePlusIcon />
            {message(locale, "placeAddToMine")}
          </button>
        )}
        {state === "saved" && onRemove && (
          <button
            type="button"
            className="btn-secondary is-destructive"
            onClick={onRemove}
          >
            {message(locale, "placeRemoveFromMine")}
          </button>
        )}
      </div>
    </footer>
  );
}

/**
 * The confirmation of "Retirer de mes lieux": the primary of its dialog in
 * the destructive tint, "Annuler" a link, and the sentence that says what
 * stays.
 */
export function PlaceRemoveDialog({ locale, name, onCancel, onConfirm }) {
  return (
    <WebDialog
      className="planner-confirmation-dialog"
      ariaLabel={message(locale, "placeRemoveDialogLabel")}
      title={placesText(locale, "placeRemoveConfirmTitle", { place: name })}
      titleAs="h3"
      closeLabel={message(locale, "placePickerClose")}
      closeOnBackdrop
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-link" onClick={onCancel}>
            {message(locale, "plannerCancel")}
          </button>
          <button
            type="button"
            className="btn-primary is-destructive"
            onClick={onConfirm}
          >
            {message(locale, "placeRemoveFromMine")}
          </button>
        </>
      }
    >
      <p>{message(locale, "placeRemoveConfirmBody")}</p>
    </WebDialog>
  );
}

/**
 * "Utilisé par N plans": the plans that name this place, the ones to execute
 * first; each row opens the plan. Nothing for a place no plan uses.
 */
export function PlaceUsageCard({ locale, usage, onOpenPlan }) {
  const plans = [...(usage?.pendingPlans ?? []), ...(usage?.pastPlans ?? [])];
  if (!plans.length) return null;
  return (
    <section
      className="places-usage"
      aria-label={message(locale, "placeUsageLabel")}
    >
      <h3>
        {placesText(
          locale,
          plans.length === 1 ? "placeUsedByOne" : "placeUsedByMany",
          { count: plans.length },
        )}
      </h3>
      <ul>
        {plans.map((plan) => (
          <li key={plan.planId}>
            <button
              type="button"
              className="places-usage-row"
              disabled={!onOpenPlan}
              onClick={() => onOpenPlan?.(plan.planId)}
            >
              <strong>{usagePlanLabel(locale, plan)}</strong>
              <small>
                {[plan.name, usagePlanStatusLabel(locale, plan.status)]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              <PlaceChevron />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The person's own words about the place (500 signs), never copied into a plan. */
export function PlaceNoteCard({ locale, note }) {
  if (!note) return null;
  return (
    <section
      className="places-note"
      aria-label={message(locale, "placeNoteTitle")}
    >
      <h3>{message(locale, "placeNoteTitle")}</h3>
      <p>{note}</p>
    </section>
  );
}

/**
 * The actions of the sheet of a place, at the top right on one line
 *: "Éditer ce lieu" is the secondary (the action
 * of a zone that has no primary), "En faire le lieu par défaut" a tertiary,
 * absent for the default place, "Retirer de mes lieux" a tertiary in the
 * destructive tint, last (rule 4).
 */
export function PlaceOwnedActions({ locale, isDefault, actions }) {
  return (
    <div className="places-owned-actions">
      <button type="button" className="btn-secondary" onClick={actions.onEdit}>
        {flow(locale, "editPlace")}
      </button>
      {!isDefault && (
        <button
          type="button"
          className="btn-tertiary"
          onClick={actions.onMakeDefault}
        >
          {message(locale, "placeActionMakeDefault")}
        </button>
      )}
      <button
        type="button"
        className="btn-tertiary is-destructive"
        onClick={actions.onDelete}
      >
        {message(locale, "placeDeleteAction")}
      </button>
    </div>
  );
}

/**
 * The confirmation of "Retirer de mes lieux" (primary in the destructive tint,
 * "Annuler" a link, on the right: rules 4 and 9) and, when plans to execute
 * still use the place, the refusal that names them (rows that open the plan,
 * "Fermer" alone).
 */
export function PlaceDeleteDialog({
  locale,
  name,
  pendingPlans = null,
  onCancel,
  onConfirm,
  onOpenPlan,
}) {
  if (pendingPlans) {
    return (
      <WebDialog
        className="planner-confirmation-dialog places-in-use-dialog"
        ariaLabel={message(locale, "placeInUseTitle")}
        title={message(locale, "placeInUseTitle")}
        titleAs="h3"
        closeLabel={message(locale, "placePickerClose")}
        closeOnBackdrop
        onClose={onCancel}
        footer={
          <button type="button" className="btn-link" onClick={onCancel}>
            {message(locale, "placePickerClose")}
          </button>
        }
      >
        <p>
          {placesText(
            locale,
            pendingPlans.length === 1
              ? "placeInUseBodyOne"
              : "placeInUseBodyMany",
            { place: name, count: pendingPlans.length },
          )}
        </p>
        <ul className="places-usage-list">
          {pendingPlans.map((plan) => (
            <li key={plan.planId}>
              <button
                type="button"
                className="places-usage-row"
                disabled={!onOpenPlan}
                onClick={() => onOpenPlan?.(plan.planId)}
              >
                <strong>{usagePlanLabel(locale, plan)}</strong>
                <small>{plan.name}</small>
                <PlaceChevron />
              </button>
            </li>
          ))}
        </ul>
      </WebDialog>
    );
  }
  return (
    <WebDialog
      className="planner-confirmation-dialog"
      ariaLabel={message(locale, "placeDeleteDialogLabel")}
      title={placesText(locale, "placeDeleteTitle", { place: name })}
      titleAs="h3"
      closeLabel={message(locale, "placePickerClose")}
      closeOnBackdrop
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-link" onClick={onCancel}>
            {message(locale, "plannerCancel")}
          </button>
          <button
            type="button"
            className="btn-primary is-destructive"
            onClick={onConfirm}
          >
            {message(locale, "placeDeleteAction")}
          </button>
        </>
      }
    >
      <p>{message(locale, "placeDeleteBody")}</p>
    </WebDialog>
  );
}

/**
 * The screen, from what it needs: [place] in the shape of a suggestion;
 * [mine] the personal place it is (or links to); [mode] `"suggested"` (the
 * suggestion's) or `"linked"` ("Détails du lieu" of a personal place);
 * [reference] what the distance and the sky are compared with.
 */
export function PlaceDetailView({
  locale,
  mode = "suggested",
  place,
  mine = null,
  reference = null,
  referenceSky = null,
  sky: estimate = null,
  measures = { status: "none" },
  failure = null,
  keptAt = null,
  loading = false,
  adding = false,
  owned = null,
  useMode = false,
  onBack,
  onAdd,
  onUse,
  onRemove,
  onViewHorizon,
  onConditions = null,
}) {
  const gone = failure === "gone";
  // A suggestion keeps the model's estimate; one of my places shows its
  // measured or typed value first.
  const { sky, brightness } = shownPlaceSky({
    place: mode === "linked" ? mine : null,
    estimate,
    measures: mode === "linked" ? measures : { status: "none" },
  });
  const comparison = compareSky(sky?.sqm, referenceSky?.sqm);
  const linked = mode === "linked";
  return (
    <article
      className="places-detail"
      aria-label={message(
        locale,
        linked ? "placeLinkedTitle" : "placeSuggestedTitle",
      )}
    >
      <header className="places-detail-header">
        <button type="button" className="btn-link places-back" onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="places-icon"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
          {message(locale, "placesBack")}
        </button>
        {!owned && (
          <h2>
            {message(
              locale,
              linked ? "placeLinkedTitle" : "placeSuggestedTitle",
            )}
          </h2>
        )}
      </header>
      <div className={owned ? "places-detail-headline" : undefined}>
        <div className="places-detail-heading">
          {!gone && (place.type || !owned) && (
            <p className="places-kind-tag">
              {place.type && (
                <PlaceKindBadge locale={locale} kind={place.type} />
              )}
              {owned?.isDefault && (
                <PlaceTag tone="gold">
                  {message(locale, "placesDefault")}
                </PlaceTag>
              )}
            </p>
          )}
          {!gone && !place.type && owned?.isDefault && (
            <p className="places-kind-tag">
              <PlaceTag tone="gold">
                {message(locale, "placesDefault")}
              </PlaceTag>
            </p>
          )}
          {owned ? (
            <h2 className="places-detail-name">{place.name}</h2>
          ) : (
            <h3 className="places-detail-name">{place.name}</h3>
          )}
        </div>
        {owned?.actions && (
          <PlaceOwnedActions
            locale={locale}
            isDefault={owned.isDefault}
            actions={owned.actions}
          />
        )}
      </div>
      {gone ? (
        <PlaceCaution framed>{message(locale, "placeGone")}</PlaceCaution>
      ) : linked && failure ? (
        <PlaceCaution framed>
          {keptAt
            ? placesText(locale, "placeDetailsKept", {
                date: placesDateLabel(locale, keptAt),
              })
            : message(locale, "placeDetailsUnavailable")}
        </PlaceCaution>
      ) : null}
      <SkyCard
        locale={locale}
        sky={sky}
        brightness={brightness}
        reference={reference}
        referenceSky={referenceSky}
        comparison={comparison}
        place={place}
      />
      <Figures
        locale={locale}
        place={place}
        reference={reference}
        owned={owned}
      />
      {onConditions ? (
        // "Conditions", a full-width secondary after "Trajet"; the body zone holds
        // this one secondary.
        <button
          type="button"
          className="btn-secondary places-conditions"
          data-testid="place-detail-conditions"
          onClick={() => onConditions(mine || place)}
        >
          {message(locale, "conditionsOpen")}
        </button>
      ) : null}
      {owned && (
        <PlaceUsageCard
          locale={locale}
          usage={owned.usage}
          onOpenPlan={owned.onOpenPlan}
        />
      )}
      <HorizonCard
        locale={locale}
        mine={mine}
        owned={Boolean(owned)}
        onViewHorizon={onViewHorizon}
      />
      {owned && <PlaceNoteCard locale={locale} note={owned.note} />}
      {loading && (
        <LoadingState className="places-loading" layout="inline">
          {message(locale, "placesSearching")}
        </LoadingState>
      )}
      {owned?.linked && owned.osm ? (
        <Facts
          locale={locale}
          osm={owned.osm}
          place={!gone && !(linked && failure) && !loading ? place : null}
        />
      ) : !gone &&
        !(linked && failure) &&
        !loading &&
        !(owned && !owned.linked) ? (
        <Facts locale={locale} place={place} />
      ) : owned && !owned.linked ? null : (
        // The OpenStreetMap source credit belongs to what the source gave: a
        // place of mine with no link to a known place shows none.
        <PlaceAttribution locale={locale} source />
      )}
      {!owned?.actions && (
        <PlaceDetailFooter
          locale={locale}
          mode={mode}
          mine={mine}
          place={place}
          adding={adding}
          useMode={useMode}
          onAdd={onAdd}
          onUse={onUse}
          onRemove={onRemove}
        />
      )}
    </article>
  );
}

/**
 * The detail of a suggestion (`suggestion`) or of a personal place linked to a
 * known place (`linked`): reads what it shows, adds the suggestion on demand.
 * `onAdd` answers the place added (or `null`); in `pickMode` it is handed to
 * `onPicked` to be chosen. `onRemove(id)` removes a saved place from my places
 * once confirmed; a screen that gives none (the place picker) offers no
 * removal.
 */
export function PlaceSuggestedDetail({
  locale,
  client,
  suggestion = null,
  linked = null,
  places,
  reference = null,
  pickMode = false,
  owned = null,
  useMode = false,
  onOpenPlan = null,
  onBack,
  onAdd,
  onUse = () => {},
  onPicked = () => {},
  onRemove = null,
  onViewHorizon,
  onConditions = null,
}) {
  const [known, setKnown] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [addFailed, setAddFailed] = useState(false);
  const linkId = linked ? knownPlaceLinkOf(linked)?.id : null;
  useEffect(() => {
    setKnown(null);
    if (!linkId) return undefined;
    const controller = new AbortController();
    client
      .known(linkId, { locale, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setKnown(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setKnown({ place: null, fetchedAt: null, failure: "source" });
      });
    return () => controller.abort();
  }, [client, linkId, locale]);
  const referenceSky = usePlaceSky(reference);
  const measures = usePlaceSkyMeasuresOfPage();
  const ownSky = usePlaceSky(
    linked && !known?.place?.sky
      ? linked
      : suggestion && !suggestion.sky
        ? suggestion
        : null,
  );

  if (linked) {
    const details = known?.place ?? null;
    const place = {
      id: details?.id ?? (linkId ? `osm:${linkId}` : linked.id),
      name: placeLabel(linked) || details?.name || "",
      // The type the person gave the place (or the suggestion's), else the
      // source's, else "private".
      type: owned
        ? placeKindOf(linked)
        : (details?.type ?? knownPlaceLinkOf(linked)?.type ?? "viewpoint"),
      latitude: Number(linked.latitude),
      longitude: Number(linked.longitude),
      ...(details?.website ? { website: details.website } : {}),
      ...(details?.openingHours ? { openingHours: details.openingHours } : {}),
      ...(details?.access ? { access: details.access } : {}),
      ...(Number.isFinite(details?.elevation)
        ? { elevation: details.elevation }
        : Number.isFinite(Number(linked.elevation)) && linked.elevation !== ""
          ? { elevation: Math.round(Number(linked.elevation)) }
          : {}),
    };
    return (
      <PlaceDetailView
        locale={locale}
        mode="linked"
        place={place}
        mine={linked}
        reference={reference}
        referenceSky={referenceSky}
        sky={details?.sky ?? ownSky}
        measures={measures}
        failure={known?.failure ?? null}
        keptAt={null}
        loading={Boolean(linkId) && known === null}
        owned={
          owned
            ? {
                ...owned,
                timeZone: linked.timeZone || "",
                note: linked.note || "",
                linked: Boolean(linkId),
                osm: linkId
                  ? { id: linkId, onDetach: owned.actions?.onDetach }
                  : null,
              }
            : null
        }
        onBack={onBack}
        onViewHorizon={onViewHorizon}
        onConditions={onConditions}
      />
    );
  }

  const mine = alreadyMinePlace(suggestion, places);
  const add = async () => {
    setAdding(true);
    setAddFailed(false);
    let added = null;
    try {
      added = await onAdd(suggestion);
    } finally {
      setAdding(false);
    }
    if (!added) setAddFailed(true);
    else if (pickMode) onPicked(added);
  };
  return (
    <>
      {addFailed && (
        <p className="places-notice is-error" role="alert">
          {message(locale, "placesAddFailed")}
        </p>
      )}
      <PlaceDetailView
        locale={locale}
        mode="suggested"
        place={suggestion}
        mine={mine}
        reference={reference}
        referenceSky={referenceSky}
        sky={suggestion.sky ?? ownSky}
        adding={adding}
        useMode={useMode}
        onBack={onBack}
        onAdd={add}
        onUse={() => onUse(suggestion)}
        onRemove={onRemove && mine ? () => setRemoving(true) : undefined}
        onViewHorizon={onViewHorizon}
        onConditions={onConditions}
      />
      {removing && mine && (
        <PlaceRemoveDialog
          locale={locale}
          name={placeLabel(mine) || suggestion.name}
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            setRemoving(false);
            // A place a plan to execute uses cannot leave my places: the same
            // refusal as "Retirer de mes lieux", naming the plans.
            const answer = await onRemove(mine.id);
            if (answer?.inUse) setRefusal(answer.pendingPlans);
          }}
        />
      )}
      {refusal && mine && (
        <PlaceDeleteDialog
          locale={locale}
          name={placeLabel(mine) || suggestion.name}
          pendingPlans={refusal}
          onCancel={() => setRefusal(null)}
          onOpenPlan={onOpenPlan ?? owned?.onOpenPlan}
        />
      )}
    </>
  );
}
