"use client";

import { useEffect, useRef } from "react";
import { message } from "portal/i18n.js";

/**
 * The progression player of the viewer, one code for the catalogue's page
 * (`DetailPage.js`, `DetailsPanel.js`, `ImageViewer.js`) and the page of a
 * capture in the galleries (`PublicCapturePage.js`):
 *
 * - `ProgressionHistory`: the panel's section, its title, the playback
 *   interval (fast 1.4 s, normal 2.6 s, slow 4.2 s), the round ▶ / ❚❚ and
 *   one button per milestone (on a phone the row follows the milestone
 *   playing);
 * - `useProgressionPlayback`: while playing, the next milestone every
 *   `interval` milliseconds, back to the first after the last -- never
 *   before its picture is there (it is fetched while the previous one is
 *   shown, `preloadImage`), so the player never shows the loader alone;
 *   playing starts from the first milestone (`firstStepToPlay`);
 * - `useProgressionPlayingClass`: `body.progression-playing` while playing;
 * - `ProgressionPlaybackStatus`: « Lecture de la progression · … » over the
 *   image while playing;
 * - `ImagePagination`: the dots under the image, gold in the progression,
 *   with « ← Retour aux images » there.
 */

export const PLAYBACK_INTERVALS = [
  { value: 1400, label: "fast" },
  { value: 2600, label: "normal" },
  { value: 4200, label: "slow" },
];
export const DEFAULT_PLAYBACK_INTERVAL = 2600;

const preloaded = new Map();

/**
 * Fetches and decodes the picture at `url` once (a resolved promise for any
 * later call, and for a picture that cannot be fetched: the player then shows
 * what it has instead of waiting for ever). Nothing for `null`.
 */
export function preloadImage(url) {
  if (!url || typeof Image === "undefined") return Promise.resolve();
  let known = preloaded.get(url);
  if (!known) {
    known = new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = "async";
      probe.src = url;
      if (typeof probe.decode === "function")
        probe.decode().then(resolve, resolve);
      else {
        probe.onload = () => resolve();
        probe.onerror = () => resolve();
      }
    });
    preloaded.set(url, known);
  }
  return known;
}

/** The milestone the ▶ starts from: always the first (night 1). */
export const firstStepToPlay = (stepIds) => stepIds[0] ?? null;

/**
 * One tick of the playback: after `interval` milliseconds, the milestone that
 * follows `activeId` (the first after the last) is shown -- but only once its
 * picture is there: it is fetched at once, while the current one is shown,
 * and a slow picture delays the tick instead of showing the loader alone.
 * Returns the function that stops it.
 */
export function playNextStep({
  stepIds,
  activeId,
  interval,
  sourceOf = null,
  preload = preloadImage,
  onStep,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
}) {
  let stopped = false;
  const index = Math.max(0, stepIds.indexOf(activeId));
  const nextId = stepIds[(index + 1) % stepIds.length];
  const ready = Promise.resolve(preload(sourceOf ? sourceOf(nextId) : null));
  const timer = schedule(() => {
    ready.then(() => {
      if (!stopped) onStep(nextId);
    });
  }, interval);
  return () => {
    stopped = true;
    cancelSchedule(timer);
  };
}

/** « 1.4 s », « 1,4 s »: the interval in the language's own writing. */
const seconds = (value, locale) =>
  `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 1000)} s`;

/**
 * `steps`: `[{ id, primary, secondary, title }]`, from the first milestone
 * to the last; `activeId` the one shown (none outside the progression).
 */
export function ProgressionHistory({
  title,
  steps,
  activeId = null,
  onSelect,
  playing,
  onTogglePlay,
  interval,
  onInterval,
  locale = "en",
}) {
  const historyRef = useRef(null),
    activeStepRef = useRef(null);
  useEffect(() => {
    if (!playing || !matchMedia("(max-width: 850px)").matches) return;
    const history = historyRef.current,
      activeStep = activeStepRef.current;
    if (!history || !activeStep) return;
    const historyBounds = history.getBoundingClientRect(),
      activeBounds = activeStep.getBoundingClientRect();
    history.scrollTo({
      left: Math.max(
        0,
        history.scrollLeft +
          activeBounds.left -
          historyBounds.left -
          (history.clientWidth - activeStep.clientWidth) / 2,
      ),
      behavior: "smooth",
    });
  }, [activeId, playing]);
  if (!steps.length) return null;
  return (
    <section data-section="progression">
      <div className="section-heading">
        <h3>{title}</h3>
        <div className="progression-controls">
          <select
            aria-label={message(locale, "playbackInterval")}
            value={interval}
            onChange={(event) => onInterval(+event.target.value)}
          >
            {PLAYBACK_INTERVALS.map((option) => (
              <option value={option.value} key={option.value}>
                {message(locale, option.label)} ·{" "}
                {seconds(option.value, locale)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="progression-play"
            onClick={onTogglePlay}
            aria-label={
              playing
                ? message(locale, "stopProgression")
                : message(locale, "playProgression")
            }
          >
            {playing ? "❚❚" : "▶"}
          </button>
        </div>
      </div>
      <div className="history" aria-label={title} ref={historyRef}>
        {steps.map((step) => (
          <button
            type="button"
            className={step.id === activeId ? "is-active" : ""}
            key={step.id}
            onClick={() => onSelect(step.id)}
            aria-current={step.id === activeId ? "step" : undefined}
            title={step.title || undefined}
            ref={step.id === activeId ? activeStepRef : null}
          >
            <strong>{step.primary}</strong>
            {step.secondary ? <span>{step.secondary}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * While `playing`, calls `onStep(id)` with the next milestone every
 * `interval` milliseconds, from the one shown (`activeId`), back to the
 * first after the last; `sourceOf(id)` is the milestone's picture, fetched
 * before its turn comes (`playNextStep`).
 */
export function useProgressionPlayback({
  playing,
  interval,
  stepIds,
  activeId,
  onStep,
  sourceOf = null,
}) {
  const key = stepIds.join("|");
  useEffect(() => {
    if (!playing || !stepIds.length) return;
    return playNextStep({ stepIds, activeId, interval, sourceOf, onStep });
    // `onStep` and `sourceOf` are the caller's; the steps are read through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, interval, key, activeId]);
}

/**
 * Fetches the picture of the milestone that follows the one shown, so that
 * stepping through the progression by hand finds it ready as well.
 */
export function useProgressionPreload({ stepIds, activeId, sourceOf }) {
  const key = stepIds.join("|");
  useEffect(() => {
    const index = stepIds.indexOf(activeId);
    if (index < 0 || stepIds.length < 2) return;
    preloadImage(sourceOf(stepIds[(index + 1) % stepIds.length]));
    // The steps are read through `key`; `sourceOf` is the caller's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activeId]);
}

/** `body.progression-playing` while the progression plays. */
export function useProgressionPlayingClass(playing) {
  useEffect(() => {
    document.body.classList.toggle("progression-playing", playing);
    return () => document.body.classList.remove("progression-playing");
  }, [playing]);
}

export function ProgressionPlaybackStatus({ label, locale = "en" }) {
  return (
    <div className="progression-playback-status">
      {message(locale, "playingProgression")}
      {label ? ` · ${label}` : ""}
    </div>
  );
}

/**
 * The dots under the image (`ids`, the active one `activeId`); in the
 * progression (`progression`) the gold dots and « ← Retour aux images »
 * (`onExit`). `label` is what the dots say to a screen reader.
 */
export function ImagePagination({
  ids,
  activeId,
  label,
  progression = false,
  onExit = null,
  locale = "en",
}) {
  return (
    <div className="asset-pagination-row">
      <div
        className={`asset-pagination${progression ? " progression-pagination" : ""}`}
        role="img"
        aria-label={label}
      >
        {ids.map((id) => (
          <span
            className={`asset-pagination-dot${id === activeId ? " is-active" : ""}`}
            key={id}
          />
        ))}
      </div>
      {progression && onExit ? (
        <button
          type="button"
          className="btn-link progression-exit"
          onClick={onExit}
        >
          ← {message(locale, "backToImages")}
        </button>
      ) : null}
    </div>
  );
}
