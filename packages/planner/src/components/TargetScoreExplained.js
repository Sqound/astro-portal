"use client";

import { useMemo, useRef, useState } from "react";
import { TargetTile } from "portal/components/ObjectPictogram.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { hipsPreviewUrl } from "../recommendations.js";
import { targetScoreChip, targetScoreSheet } from "../target-score-sheet.js";
import { tonightDate } from "../tonight-overview.js";
import { clock } from "../wind-section.js";
import { useTargetPhotoViewer } from "./TargetPhotoViewer.js";
import { TargetKnowledgeDetails } from "./TargetKnowledgeDetails.js";
import {
  TargetCharacteristicsBlock,
  TargetNightBlock,
  TargetSeasonBlock,
  useTargetNight,
  useTargetSeason,
} from "./TargetFactsBlocks.js";
import { TargetPreviewBlock } from "./TargetPreviewBlock.js";

// "Statistiques de la cible": the one dialog of a target's figures, opened from
// a line of "À voir ce soir", from the note of a planner card and from the
// statistics button of a catalogue card. Order A: the head, "Pourquoi cette
// cible ce soir" (the note's total and verdict), "Cette nuit", "Saison",
// "Prévisualiser" (`TargetPreviewBlock.js`), "Caractéristiques", "Détail de
// la note", the link "À propos de la cible". The score is
// `targetTonightScore` (`target-score.js`), the words `target-score-sheet.js`,
// the night, the season and the tiles `target-facts-model.js`. Free: no
// capability is read.

/** The chip of a target card: the score, opening the explanation. */
export function TargetScoreChip({ score, locale, onOpen }) {
  const chip = targetScoreChip(score, locale);
  if (!chip) return null;
  return (
    <button
      type="button"
      className={`btn-tertiary planner-target-score-chip is-${chip.verdict}`}
      aria-label={chip.label}
      title={message(locale, "targetScoreTitle")}
      onClick={onOpen}
    >
      {chip.text}
    </button>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

/**
 * The icon of the statistics button: the season's histogram — four bars of
 * falling height over a baseline, the dashed threshold across them (chosen
 * among three candidates because the others were not easy to read, one looking
 * like a tent).
 */
export function TargetFactsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 21H22" />
      <path className="is-bars" d="M4.5 21V8M9 21V6M13.5 21V10M18 21V15" />
      <path d="M2 13H4M7 13H9M11 13H13M15 13H17M20 13H22" />
    </svg>
  );
}

function placeNameOf(place) {
  return place?.name || place?.locality || "";
}

/**
 * The dialog. `score` is `targetTonightScore`'s result for `card` (absent for
 * the catalogue's version, which has no note); `date` and `placeName` the
 * plan's night; `night`, `{ place, constraints, darkness }`, what the night
 * and the season are judged by (the planner's minimum height from the
 * planner); `onWindSettings` opens "Tolérance au vent" (the link is absent
 * without it).
 *
 * `catalogue` (`{ place, places, darkness, onAddPlace }`) makes it the
 * catalogue's version: no note, under the target "Lieu : … Modifier" — the
 * place of "Cette nuit", changed here from the saved places **for this
 * dialog only** (nothing is written: not the place of "Cette nuit", not a
 * plan) — and, without a saved place, "Ajouter un lieu".
 *
 * The head shows the target's own photo (`TargetTile`), the pictogram of its
 * type only when the image is missing (UI rules
 * "Object pictograms"). Buttons: the links "Modifier" and "À propos de la
 * cible", one tertiary "Ajouter un lieu" in one state; no secondary, no
 * primary.
 */
export function TargetScoreExplained({
  score = null,
  card,
  date,
  locale,
  placeName,
  timeZone,
  onClose,
  onWindSettings,
  visualMode = false,
  night: nightContext = null,
  catalogue = null,
  // "Filtre conseillé : UHC / OIII" for a visual target that needs a filter
  // (`visualFilterAdviceText`); nothing for the others.
  filterAdvice = null,
  // `{ planEquipment, configuration, profiles, sky, skyChoice, skyLoading,
  // skyPlaceName, skyPlaceKey, skyForPlace }` of « Prévisualiser »: the
  // target's plan's raw equipment (null from the catalogue), the default
  // configuration (« Mon matériel »), the planner's profile sets and the sky
  // shown (`previewSkyProps`; `skyForPlace(place)` gives the same for a place
  // picked in the catalogue's dialog); without them the section shows the
  // example equipment.
  preview = null,
}) {
  const photo = useTargetPhotoViewer({ locale });
  const aboutRef = useRef(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  // The catalogue's place is the dialog's own state: kept until it closes.
  const [chosenPlace, setChosenPlace] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const place = catalogue ? chosenPlace || catalogue.place || null : null;
  const context = useMemo(() => {
    if (!catalogue)
      return nightContext
        ? { ...nightContext, date: nightContext.date || date }
        : null;
    return {
      place,
      // The night judged is tonight's, at the place chosen here.
      date: place ? tonightDate({ place }) : "",
      constraints: { minAltitude: 30 },
      darkness: catalogue.darkness,
    };
  }, [catalogue, nightContext, date, place]);
  const effectiveZone = catalogue ? place?.timeZone : timeZone;
  const night = useTargetNight({ card, context, locale });
  const sheet = targetScoreSheet({
    score,
    card,
    locale,
    timeZone: effectiveZone,
    placeName: catalogue ? "" : placeName,
    date: catalogue ? "" : date,
    // The note's angle is the line "Écart avec la Lune" of the night below,
    // never a third figure.
    moonSeparation:
      night.state === "ready" ? (night.moon?.separation ?? null) : null,
  });
  const season = useTargetSeason({ card, context, locale });
  // The popover of the "i" exists when the target has a story to tell.
  const aboutAvailable = Boolean(
    (card?.target?.knowledge || card?.target)?.story ||
    card?.target?.knowledge?.id,
  );
  const onAddPlace = catalogue?.onAddPlace || null;
  // « Prévisualiser » is seen under the sky of the dialog's place: from the
  // catalogue, the one picked here, when the page can say its sky.
  const previewWithSky =
    catalogue && chosenPlace && preview?.skyForPlace
      ? { ...preview, ...preview.skyForPlace(chosenPlace) }
      : preview;
  // « Créer un cadrage »: this dialog is a modal one, in the browser's top
  // layer, so it closes first — the editor opens over the page.
  const previewForBlock =
    previewWithSky && typeof previewWithSky.onCreateFraming === "function"
      ? {
          ...previewWithSky,
          onCreateFraming: (seed) => {
            onClose?.();
            previewWithSky.onCreateFraming(seed);
          },
        }
      : previewWithSky;
  const places = catalogue?.places || [];
  return (
    <WebDialog
      className="planner-target-score-dialog"
      bodyClassName="planner-target-score-body planner-target-facts-body"
      closeLabel={sheet.close}
      focusTitle
      title={sheet.title}
      onClose={onClose}
    >
      <div className="planner-target-score-target">
        <TargetTile
          className="planner-target-score-tile"
          target={card?.target}
          previewUrl={hipsPreviewUrl(card)}
          locale={locale}
          visualMode={visualMode}
          openLabel={message(locale, "planTargetSheetPhoto").replace(
            "{target}",
            card?.target?.designation || sheet.name,
          )}
          onOpen={({ url, credit }) =>
            photo.open({
              target: card?.target,
              url,
              credit,
              // A target of "À voir ce soir" or of the planner: its best
              // window of the night.
              window:
                card?.usableStart && card?.usableEnd
                  ? {
                      start: clock(card.usableStart, locale, effectiveZone),
                      end: clock(card.usableEnd, locale, effectiveZone),
                      maxAltitude: card.maxAltitude,
                    }
                  : null,
            })
          }
        />
        <div>
          <p className="planner-target-score-name">{sheet.name}</p>
          {sheet.facts && (
            <p className="planner-target-score-muted">{sheet.facts}</p>
          )}
          {sheet.night && (
            <p className="planner-target-score-muted">{sheet.night}</p>
          )}
          {filterAdvice && (
            <p
              className="planner-target-score-muted"
              data-testid="target-score-filter-advice"
            >
              {filterAdvice}
            </p>
          )}
        </div>
      </div>
      {catalogue && place ? (
        <div className="planner-target-facts-place" data-testid="facts-place">
          <p>
            {message(locale, "targetFactsPlace").replace(
              "{place}",
              placeNameOf(place),
            )}
          </p>
          {places.length ? (
            <button
              type="button"
              className="btn-link"
              aria-expanded={choosing}
              onClick={() => setChoosing((open) => !open)}
            >
              {message(locale, "targetFactsPlaceChange")}
            </button>
          ) : null}
        </div>
      ) : null}
      {catalogue && choosing ? (
        <ul
          className="planner-target-facts-place-list"
          role="listbox"
          aria-label={message(locale, "targetFactsPlace").replace(
            "{place}",
            "",
          )}
        >
          {places.map((entry) => (
            <li key={entry.id || `${entry.latitude},${entry.longitude}`}>
              <button
                type="button"
                role="option"
                aria-selected={
                  entry.id
                    ? entry.id === place?.id
                    : entry.latitude === place?.latitude &&
                      entry.longitude === place?.longitude
                }
                onClick={() => {
                  setChosenPlace(entry);
                  setChoosing(false);
                }}
              >
                {placeNameOf(entry)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {score ? (
        <section
          className="planner-target-facts-section"
          aria-labelledby="target-facts-why"
        >
          <h3 id="target-facts-why">{sheet.whyTitle}</h3>
          <p
            className="planner-target-score-place-note"
            data-testid="place-note-why"
          >
            {message(locale, "targetFactsPlaceDependent")}
          </p>
          <div className="planner-target-score-total">
            <p className="planner-target-score-number">
              <span>{sheet.total}</span>
              <span className="planner-target-score-muted">{sheet.outOf}</span>
            </p>
            <div>
              <p className="planner-target-score-verdict">{sheet.verdict}</p>
              {sheet.shortWindow ? (
                <p
                  className="planner-target-score-short"
                  data-testid="target-score-short-window"
                >
                  {sheet.shortWindow}
                </p>
              ) : null}
              <p className="planner-target-score-muted">{sheet.sum}</p>
            </div>
          </div>
        </section>
      ) : null}
      <TargetNightBlock locale={locale} night={night} onAddPlace={onAddPlace} />
      <TargetSeasonBlock
        locale={locale}
        season={season}
        onAddPlace={onAddPlace}
      />
      <TargetPreviewBlock
        locale={locale}
        card={card}
        preview={previewForBlock}
        visualMode={visualMode}
        date={context?.date || date || null}
        timeZone={effectiveZone || null}
      />
      <TargetCharacteristicsBlock locale={locale} card={card} />
      {score ? (
        <section
          className="planner-target-facts-section"
          aria-labelledby="target-facts-detail"
        >
          <h3 id="target-facts-detail">{sheet.detail}</h3>
          <p
            className="planner-target-score-place-note"
            data-testid="place-note-detail"
          >
            {message(locale, "targetFactsPlaceDependent")}
          </p>
          <ul className="planner-target-score-rows" aria-label={sheet.detail}>
            {sheet.rows.map((row) => (
              <li
                key={row.key}
                data-criterion={row.key}
                className={`is-${row.tone}${row.available ? "" : " is-unavailable"}`}
              >
                <div className="planner-target-score-row-head">
                  <span>{row.label}</span>
                  <span className="planner-target-score-points">
                    {row.points}
                  </span>
                </div>
                <div className="planner-target-score-bar" aria-hidden="true">
                  <div style={{ width: `${row.percent}%` }} />
                </div>
                {row.alert && (
                  <p className="planner-target-score-alert">
                    <AlertIcon />
                    <span>{row.alert}</span>
                  </p>
                )}
                <p className="planner-target-score-muted">{row.sentence}</p>
                {row.windSettings && onWindSettings && (
                  <button
                    type="button"
                    className="btn-link planner-target-score-wind-link"
                    onClick={onWindSettings}
                  >
                    {row.windSettings}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="planner-target-score-estimates">{sheet.estimates}</p>
        </section>
      ) : null}
      {aboutAvailable ? (
        <>
          <button
            ref={aboutRef}
            type="button"
            className="btn-link planner-target-facts-about"
            aria-haspopup="dialog"
            onClick={() => setAboutOpen(true)}
          >
            {sheet.about}
          </button>
          <TargetKnowledgeDetails
            target={card?.target}
            locale={locale}
            visualMode={visualMode}
            forcedOpen={aboutOpen}
            onForcedClose={() => setAboutOpen(false)}
            anchorRef={aboutRef}
          />
        </>
      ) : null}
      {photo.viewer}
    </WebDialog>
  );
}
