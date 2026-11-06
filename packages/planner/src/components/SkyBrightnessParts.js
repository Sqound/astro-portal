"use client";

import {
  InfoButton,
  InfoGlyph,
  InfoSources,
} from "portal/components/dialog/InfoButton.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  bortleWords,
  loadPlaceSkyMeasures,
  placeSkyBrightness,
  readKeptPlaceSkyMeasures,
  skyBackgroundWords,
  skyBrightnessPill,
  skyBrightnessWords,
} from "../sky-brightness.js";
import { skyBrightnessScaleGradient } from "../sky-scale.js";

// The observer's sky background on the web: the pill beside a sky value
// ("mesuré", "saisi", "estimation"), its info button and the dialog it opens.
// The measured values are read once per page for a signed-in person and shared
// through `PlaceSkyMeasuresContext`.

const browserStorage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** The measured values of the page (`{ status, list, fetchedAt }`). */
export const PlaceSkyMeasuresContext = createContext({ status: "none" });

/** The values kept in this browser at once, then the route's answer. */
export function usePlaceSkyMeasures(enabled) {
  const [measures, setMeasures] = useState({ status: "none" });
  useEffect(() => {
    if (!enabled) {
      setMeasures({ status: "none" });
      return undefined;
    }
    const storage = browserStorage();
    setMeasures(readKeptPlaceSkyMeasures(storage) ?? { status: "loading" });
    const controller = new AbortController();
    loadPlaceSkyMeasures({ storage, signal: controller.signal })
      .then((read) => {
        if (!controller.signal.aborted) setMeasures(read);
      })
      .catch(() => {
        // Aborted: the page went away.
      });
    return () => controller.abort();
  }, [enabled]);
  return measures;
}

/** The page's measured values (`{ status: "none" }` outside a provider). */
export function usePlaceSkyMeasuresOfPage() {
  return useContext(PlaceSkyMeasuresContext);
}

/**
 * The sky-brightness rule for one of my places from its modelled [estimate]
 * (`{ bortle, sqm }`): `{ brightness, sky }`, `sky` being the value shown in
 * the places' own shape (`{ bortle, sqm }`), or the estimate itself.
 * [measures] defaults to the page's.
 */
export function shownPlaceSky({ place, estimate, measures }) {
  const brightness = placeSkyBrightness({ place, model: estimate, measures });
  const shown = brightness.choice?.shown;
  return {
    brightness,
    source: brightness.choice?.source ?? null,
    sky:
      shown && Number.isFinite(shown.sqm)
        ? { bortle: shown.bortleClass, sqm: shown.sqm }
        : estimate,
  };
}

/** The pill beside a sky value: "mesuré", "saisi", "estimation". */
export function SkyBrightnessPill({ locale, source, className = "" }) {
  return (
    <span
      className={`sky-brightness-pill ${className}`.trim()}
      data-source={source ?? "model"}
    >
      {skyBrightnessPill(locale, source)}
    </span>
  );
}

/** The dialog's content (what the tests read). */
export function SkyBrightnessDialogBody({
  words,
  locale = "en",
  action = null,
}) {
  return (
    <>
      <p className="sky-brightness-shown">{words.shown}</p>
      <SkyBrightnessTiles words={words} />
      {/* « Voir sur la carte », under the three values. */}
      {action}
      {words.scale ? <SkyBrightnessScale scale={words.scale} /> : null}
      {words.about ? (
        <section className="sky-brightness-section" data-kind="about">
          <h3>{words.about.title}</h3>
          <p>{words.about.text}</p>
        </section>
      ) : null}
      <SkyBrightnessSections words={words} locale={locale} />
    </>
  );
}

function SkyBrightnessTiles({ words }) {
  return (
    <ul className="sky-brightness-tiles">
      {words.tiles.map((tile) => (
        <li
          key={tile.kind}
          className={`sky-brightness-tile${tile.chosen ? " is-chosen" : ""}`}
          data-kind={tile.kind}
          aria-current={tile.chosen ? "true" : undefined}
        >
          <span className="sky-brightness-pill">{tile.pill}</span>
          <strong>{tile.value}</strong>
          <small>{tile.detail}</small>
        </li>
      ))}
    </ul>
  );
}

function SkyBrightnessSections({ words, locale }) {
  return (
    <>
      {words.sections.map((section) => (
        <section
          key={section.kind}
          className="sky-brightness-section"
          data-kind={section.kind}
        >
          <h3>{section.title}</h3>
          {section.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ))}
      <InfoSources
        locale={locale}
        lines={words.sources.lines}
        attributions={words.sources.attributions}
      />
    </>
  );
}

/** The page's one ⓘ (44 px) and the dialog it opens. */
export function SkyBrightnessInfo({
  locale,
  sky,
  className = "",
  action = null,
}) {
  const words = skyBrightnessWords(sky, { locale });
  return (
    <InfoButton
      locale={locale}
      label={words.info}
      title={words.title}
      className={className}
      dialogClassName="sky-brightness-dialog"
      bodyClassName="sky-brightness-body"
    >
      <SkyBrightnessDialogBody words={words} locale={locale} action={action} />
    </InfoButton>
  );
}

/**
 * The continuous scale of the sky background: the gradient from the darkest sky
 * (22,0) to the city sky (17,0) in the light map's colours, the whole
 * figures under it, the value marked by a line and "Ici · 21,0".
 */
export function SkyBrightnessScale({ scale }) {
  const at = `${Math.round(scale.position * 1000) / 10}%`;
  return (
    <figure className="sky-scale" role="img" aria-label={scale.label}>
      <div className="sky-scale-track" aria-hidden="true">
        <span className="sky-scale-here" style={{ left: at }}>
          {scale.here}
        </span>
        <span
          className="sky-scale-bar"
          style={{ backgroundImage: skyBrightnessScaleGradient() }}
        >
          <span className="sky-scale-mark" style={{ left: at }} />
        </span>
        {scale.ticks.map((tick) => (
          <span
            key={tick.figure}
            className="sky-scale-tick"
            style={{ left: `${Math.round(tick.position * 1000) / 10}%` }}
          >
            {tick.figure}
          </span>
        ))}
      </div>
      <figcaption className="sky-scale-ends" aria-hidden="true">
        <span>{scale.darkEnd}</span>
        <span>{scale.brightEnd}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The nine steps of the light map's scale, the class ringed. With `onSelect`
 * the scale is a control (« Ciel de l'aperçu »): a touch or a drag over the
 * steps chooses a class, the arrow keys, Home and End too; the figure is then
 * a slider (`valueText` says the class and its SQM). Without it, a picture.
 */
export function BortleScale({ scale, onSelect = null, valueText = "" }) {
  const stepsRef = useRef(null);
  const chosen = scale.steps.find((step) => step.here)?.bortle ?? null;
  const classAt = (clientX) => {
    const box = stepsRef.current?.getBoundingClientRect();
    if (!box || !(box.width > 0)) return null;
    const share = (clientX - box.left) / box.width;
    return Math.min(9, Math.max(1, Math.floor(share * 9) + 1));
  };
  const choose = (event) => {
    const bortle = classAt(event.clientX);
    if (bortle !== null && bortle !== chosen) onSelect(bortle);
  };
  const keyDown = (event) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? Math.min(9, (chosen ?? 0) + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? Math.max(1, (chosen ?? 2) - 1)
          : event.key === "Home"
            ? 1
            : event.key === "End"
              ? 9
              : null;
    if (next === null) return;
    event.preventDefault();
    if (next !== chosen) onSelect(next);
  };
  const control = typeof onSelect === "function";
  return (
    <figure
      className={`bortle-scale${control ? " is-control" : ""}`}
      role={control ? "slider" : "img"}
      aria-label={scale.label}
      tabIndex={control ? 0 : undefined}
      aria-valuemin={control ? 1 : undefined}
      aria-valuemax={control ? 9 : undefined}
      aria-valuenow={control && chosen !== null ? chosen : undefined}
      aria-valuetext={control && chosen !== null ? valueText : undefined}
      data-testid={control ? "bortle-scale-control" : undefined}
      onKeyDown={control ? keyDown : undefined}
      onPointerDown={
        control
          ? (event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              choose(event);
            }
          : undefined
      }
      onPointerMove={
        control
          ? (event) => {
              if (event.buttons & 1) choose(event);
            }
          : undefined
      }
    >
      <ol
        ref={stepsRef}
        className="bortle-scale-steps"
        aria-hidden={control ? undefined : "true"}
      >
        {scale.steps.map((step) => (
          <li
            key={step.bortle}
            className={step.here ? "is-here" : undefined}
            data-bortle={step.bortle}
          >
            {step.here ? (
              <span className="bortle-scale-here">{scale.here}</span>
            ) : null}
            <span
              className="bortle-scale-step"
              style={{ backgroundColor: step.colour }}
            />
            <span className="bortle-scale-figure">
              {step.labelled ? step.bortle : ""}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="sky-scale-ends" aria-hidden="true">
        <span>{scale.darkEnd}</span>
        <span>{scale.brightEnd}</span>
      </figcaption>
    </figure>
  );
}

/** "Classe de Bortle": the dialog's content (what the tests read). */
export function BortleDialogBody({ words, locale = "en" }) {
  return (
    <>
      <div className="bortle-sheet-head">
        <span className="bortle-sheet-figure">{words.figure}</span>
        <p className="bortle-sheet-sentence">{words.sentence}</p>
      </div>
      {words.scale ? <BortleScale scale={words.scale} /> : null}
      <section className="sky-brightness-section" data-kind="about">
        <h3>{words.about.title}</h3>
        <p>{words.about.text}</p>
      </section>
      {words.how ? (
        <section className="sky-brightness-section" data-kind="how">
          <h3>{words.how.title}</h3>
          <p>{words.how.text}</p>
        </section>
      ) : null}
      <InfoSources
        locale={locale}
        lines={words.sources.lines}
        attributions={words.sources.attributions}
      />
    </>
  );
}

// The cards' icons: a gauge for the sky background, rising bars for Bortle.
function SkyCardIcon({ kind }) {
  return kind === "sqm" ? (
    <>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16l4-5" />
      <path d="M4 19h16" />
    </>
  ) : (
    <path d="M5 19v-3M9 19v-5M13 19v-7M17 19v-9M21 19v-11" />
  );
}

/**
 * "Sky quality" of "Cette nuit": the heading with its icon, then the
 * two cards "Fond de ciel" and "Bortle" drawn like the tiles; each whole
 * card is a button that opens its dialog, the ⓘ in its corner saying so.
 * `words` is `tonightWords(…).skyQuality`; `sky` the value of the
 * sky-brightness rule.
 */
export function SkyQualityCards({ locale, sky, words }) {
  const [open, setOpen] = useState(null);
  const close = message(locale, "infoClose");
  const dialog =
    open === "sqm"
      ? {
          words: skyBackgroundWords(sky, { locale }),
          className: "sky-brightness-dialog",
          kind: "sqm",
        }
      : open === "bortle"
        ? {
            words: bortleWords(sky, { locale }),
            className: "sky-brightness-dialog bortle-dialog",
            kind: "bortle",
          }
        : null;
  return (
    <section
      aria-labelledby="tonight-sky-title"
      className="tonight-sky"
      data-testid="tonight-sky"
    >
      <h2 id="tonight-sky-title" className="tonight-sky-title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" />
          <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
        </svg>
        {words.title}
      </h2>
      <div className="tonight-sky-cards">
        {["sqm", "bortle"].map((kind) => {
          const card = words[kind];
          return (
            <button
              key={kind}
              type="button"
              className="tonight-card tonight-tile tonight-sky-card"
              data-card={kind}
              aria-label={card.name}
              onClick={() => setOpen(kind)}
            >
              <span className="tonight-tile-label">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <SkyCardIcon kind={kind} />
                </svg>
                <span>{card.label}</span>
                <span className="tonight-sky-card-info">
                  <InfoGlyph />
                </span>
              </span>
              <span
                className="tonight-tile-value"
                aria-busy={card.waiting ? "true" : undefined}
              >
                {card.waiting ? (
                  <BrandLoader size={22} />
                ) : (
                  <>
                    {card.value}
                    {card.unit ? (
                      <small className="tonight-sky-card-unit">
                        {" "}
                        {card.unit}
                      </small>
                    ) : null}
                  </>
                )}
              </span>
              <span className="tonight-tile-detail">{card.detail}</span>
            </button>
          );
        })}
      </div>
      {dialog ? (
        <WebDialog
          className={`info-dialog ${dialog.className}`}
          bodyClassName="info-dialog-body sky-brightness-body"
          closeLabel={close}
          closeOnBackdrop
          focusTitle
          ariaLabel={dialog.words.title}
          titleClassName="sky-sheet-title"
          title={
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <SkyCardIcon kind={dialog.kind} />
              </svg>
              {dialog.words.title}
            </>
          }
          onClose={() => setOpen(null)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setOpen(null)}
            >
              {close}
            </button>
          }
        >
          {dialog.kind === "sqm" ? (
            <SkyBrightnessDialogBody words={dialog.words} locale={locale} />
          ) : (
            <BortleDialogBody words={dialog.words} locale={locale} />
          )}
        </WebDialog>
      ) : null}
    </section>
  );
}
