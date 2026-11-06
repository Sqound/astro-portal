"use client";

// The best period and the period to avoid, at the top of [COND] "Conditions
// à {lieu}": two lines, a mini-band of the twelve months, a caption and the
// ⓘ dialog, at the width of the page's column.
//
// The trend is a paid addition ("Planification avancée", `planner.mosaic`): the
// service answers `403 capability_required` to a space without it, and the card
// is then its locked inset: the same card faded to 34 % with sample data,
// "Inclus dans Planification avancée" over it, the grey sentence "Données
// d’exemple, non réelles" under the graph, one target for the whole thing
// (Enter and Space like a click) that opens the purchase box in a dialog.
// Nothing at all where no offers are registered and for a visitor without a
// session.
//
// The states: reading (nothing yet), computing (the first reading of a place,
// a few seconds), the trend (three kinds: distinct, flat, none), unreachable
// with "Réessayer", locked, absent. The browser's last read, kept a year,
// is drawn as any other (no notice). The reading itself is
// `portal/planner/place-climate-trend-client.js`.
import { useEffect, useState } from "react";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { readPlaceClimateTrend } from "portal/planner/place-climate-trend-client.js";
import {
  SAMPLE_CONDITIONS_TREND,
  conditionsTrendModel,
  trendFlatWords,
  trendMonthInitial,
  trendMonthName,
  trendNoDarkWords,
  trendPercent,
  trendRangeWords,
} from "../conditions-trend.js";
import { TrendLocked, offersRegistered } from "../offers-slot.js";

/**
 * The state of the trend of `place`: `{ status }` (see
 * `readPlaceClimateTrend`, plus `loading` before any answer) and the function
 * that asks again. `read` is the reader (a test passes its own).
 */
export function useConditionsTrend(place, read = readPlaceClimateTrend) {
  const [state, setState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    read(
      { latitude, longitude },
      {
        signal: controller.signal,
        onComputing: () => {
          if (!controller.signal.aborted) setState({ status: "computing" });
        },
      },
    )
      .then((answer) => {
        if (!controller.signal.aborted) setState(answer);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "unreachable" });
      });
    return () => controller.abort();
  }, [latitude, longitude, attempt, read]);
  return [state, () => setAttempt((count) => count + 1)];
}

/** "Meilleure période : **de mai à août**": the range in bold. */
function Labelled({ text, range }) {
  const [before, after = ""] = text.split("{range}");
  return (
    <span className="conditions-trend-label">
      {before}
      <strong>{range}</strong>
      {after}
    </span>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.2 2.8 2.8L16 9.5" />
  </svg>
);
const Minus = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
);

/** The twelve bars: the height is the share, the tone says the period. */
export function TrendBand({ locale, model, resting = false }) {
  return (
    <ol className="conditions-trend-band" data-testid="conditions-trend-band">
      {model.bars.map((bar) => (
        <li
          key={bar.month}
          className={`is-${resting ? "resting" : bar.tone}`}
          data-month={bar.month}
          aria-label={
            bar.share === null
              ? trendMonthName(locale, bar.month)
              : `${trendMonthName(locale, bar.month)} ${trendPercent(locale, bar.share)}`
          }
        >
          <span
            className="conditions-trend-bar"
            style={
              bar.share === null || resting
                ? undefined
                : { height: `${Math.max(4, Math.min(100, bar.share))}%` }
            }
          />
          <span className="conditions-trend-initial" aria-hidden="true">
            {trendMonthInitial(locale, bar.month)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The ⓘ line under the band: the caption, then the three sentences. */
function TrendFoot({ locale }) {
  const title = message(locale, "conditionsTrendInfoTitle");
  return (
    <InfoLine
      locale={locale}
      className="conditions-trend-foot"
      text={message(locale, "conditionsTrendCaption")}
      label={title}
      title={title}
      testId="conditions-trend-info"
    >
      {message(locale, "conditionsTrendInfoBody")
        .split("\n\n")
        .map((paragraph) => (
          <p className="info-dialog-text" key={paragraph}>
            {paragraph}
          </p>
        ))}
    </InfoLine>
  );
}

/** The card's lines and band for a trend (the real one and the sample). */
export function TrendFigure({ locale, trend }) {
  const model = conditionsTrendModel(trend);
  const share = (period) => trendPercent(locale, period.clearShare);
  return (
    <>
      {model.kind === "distinct" ? (
        <ul className="conditions-trend-lines">
          <li className="is-best" data-testid="conditions-trend-best">
            <Check />
            <Labelled
              text={message(locale, "conditionsTrendBest")}
              range={trendRangeWords(locale, model.best.from, model.best.to)}
            />
            <span className="conditions-trend-share">{share(model.best)}</span>
          </li>
          <li className="is-worst" data-testid="conditions-trend-worst">
            <Minus />
            <Labelled
              text={message(locale, "conditionsTrendWorst")}
              range={trendRangeWords(locale, model.worst.from, model.worst.to)}
            />
            <span className="conditions-trend-share">{share(model.worst)}</span>
          </li>
        </ul>
      ) : (
        <p
          className="conditions-trend-sentence"
          data-testid="conditions-trend-flat"
        >
          {model.kind === "flat"
            ? trendFlatWords(locale, model)
            : message(locale, "conditionsTrendNone")}
        </p>
      )}
      {model.noDark && model.kind !== "none" ? (
        <p
          className="conditions-trend-nodark"
          data-testid="conditions-trend-nodark"
        >
          {trendNoDarkWords(locale, model.noDark)}
        </p>
      ) : null}
      {model.kind === "none" ? null : (
        <TrendBand locale={locale} model={model} />
      )}
    </>
  );
}

function TrendReady({ locale, trend }) {
  const kind = conditionsTrendModel(trend).kind;
  return (
    <section
      className="conditions-trend"
      data-testid="conditions-trend"
      data-trend-state={kind}
    >
      <TrendFigure locale={locale} trend={trend} />
      {kind === "none" ? null : <TrendFoot locale={locale} />}
    </section>
  );
}

function TrendComputing({ locale }) {
  const resting = conditionsTrendModel(SAMPLE_CONDITIONS_TREND);
  return (
    <section
      className="conditions-trend"
      data-testid="conditions-trend"
      data-trend-state="computing"
      role="status"
    >
      <p className="conditions-trend-computing">
        <BrandLoader size={18} />
        <span>{message(locale, "conditionsTrendComputing")}</span>
      </p>
      <TrendBand locale={locale} model={resting} resting />
      <p className="conditions-trend-note">
        {message(locale, "conditionsTrendComputingNote")}
      </p>
    </section>
  );
}

/** The sentence and "Réessayer", which goes to the next line if it must. */
function TrendFailed({ locale, onRetry }) {
  return (
    <section
      className="conditions-trend is-sentence"
      data-testid="conditions-trend"
      data-trend-state="unreachable"
    >
      <p className="conditions-trend-failed">
        <span>{message(locale, "conditionsTrendFailed")}</span>
        <button
          type="button"
          className="btn-link"
          data-testid="conditions-trend-retry"
          onClick={onRetry}
        >
          {flow(locale, "retry")}
        </button>
      </p>
    </section>
  );
}

/**
 * What the card draws for a state of the read (`useConditionsTrend`): pure, so
 * that each state can be looked at without a network.
 */
export function ConditionsTrendView({ locale, state, onRetry }) {
  switch (state.status) {
    case "computing":
      return <TrendComputing locale={locale} />;
    case "ready":
      return <TrendReady locale={locale} trend={state.trend} />;
    case "unreachable":
      return <TrendFailed locale={locale} onRetry={onRetry} />;
    case "locked":
      // Held back and sold here: the inset. Where nothing is sold, nothing.
      return offersRegistered() ? <TrendLocked locale={locale} /> : null;
    default:
      return null;
  }
}

/**
 * The card of [COND]: reads the trend of `place` and draws the state it is
 * in. `read` is the reader (the page's own; a test passes another).
 */
export function ConditionsTrend({ locale, place, read }) {
  const [state, retry] = useConditionsTrend(place, read);
  return <ConditionsTrendView locale={locale} state={state} onRetry={retry} />;
}
