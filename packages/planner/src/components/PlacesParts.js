"use client";

import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { requestPlannerSkyQuality } from "portal/planner/sky-quality.js";
import { useEffect, useRef, useState } from "react";
import {
  accessLabel,
  feeLabel,
  placeKindLabel,
  placesSkyValuesLabel,
  placesText,
  skyDeltaBadgeLabel,
  skyDeltaExplanation,
  skyDeltaChipLabel,
  skyDeltaTitle,
} from "../places-copy.js";
import {
  formatMagnitude,
  normalizeSkyEstimate,
  placeKindTones,
  placesAttributionCredit,
  placesAttributionUrl,
  skyDeltaTone,
  skyScalePosition,
} from "../places-rules.js";
import { skyBrightnessPill } from "../sky-brightness.js";

// The small parts the places screens share: the icon of a kind, the sky line,
// the tags, the caution and the attribution — and the two reads they make of
// the browser, the sky of a position and the position itself.

const strokeProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

/** The icon of a kind of place: binoculars, a tent, a tree, a table. */
export function PlaceKindIcon({ kind }) {
  return (
    <svg {...strokeProps} className="places-icon">
      {kind === "private" ? (
        <>
          <path d="m4 11 8-7 8 7" />
          <path d="M6 10v9h12v-9" />
          <path d="M10 19v-5h4v5" />
        </>
      ) : kind === "campsite" ? (
        <>
          <path d="M3 19 12 5l9 14Z" />
          <path d="M10 19l2-5 2 5" />
        </>
      ) : kind === "park" ? (
        <>
          <path d="m12 3-5 7h3l-4 6h12l-4-6h3Z" />
          <path d="M12 16v5" />
        </>
      ) : kind === "picnic" ? (
        <>
          <path d="M4 10h16M7 10l-2 9M17 10l2 9M9 14h6" />
        </>
      ) : (
        <>
          <circle cx="7" cy="15" r="3.5" />
          <circle cx="17" cy="15" r="3.5" />
          <path d="M9 12 10 6h4l1 6M10.5 6.5h3" />
        </>
      )}
    </svg>
  );
}

export function PlaceChevron() {
  return (
    <svg {...strokeProps} className="places-chevron">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function PlaceSearchIcon() {
  return (
    <svg {...strokeProps} className="places-icon">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

export function PlaceLocateIcon() {
  return (
    <svg {...strokeProps} className="places-icon">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

export function PlacePlusIcon() {
  return (
    <svg {...strokeProps} className="places-icon">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PlaceRouteIcon() {
  return (
    <svg {...strokeProps} className="places-icon">
      <path d="M5 17V9a3 3 0 0 1 3-3h8" />
      <path d="m13 3 3 3-3 3" />
      <circle cx="5" cy="19" r="1.6" />
    </svg>
  );
}

export function PlaceExternalIcon() {
  return (
    <svg {...strokeProps} className="places-icon is-small">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
    </svg>
  );
}

/**
 * "Bortle 4 · 20,9 mag/arcsec² · estimation" — "mesuré" or "saisi" for
 * one of my places that has such a value.
 */
export function PlaceSkyLine({ locale, sky, source = null, fine = false }) {
  if (!sky) return null;
  return (
    <p className="places-sky-line" data-source={source ?? "model"}>
      {placesSkyValuesLabel(locale, sky, { fine })}
      <span className="places-estimate">
        {source
          ? skyBrightnessPill(locale, source)
          : message(locale, "placesEstimate")}
      </span>
    </p>
  );
}

/** A tag of a card: the default place, the state of its horizon. */
export function PlaceTag({ tone = "muted", children }) {
  return <span className={`places-tag is-${tone}`}>{children}</span>;
}

/**
 * The type of a place in its tint: a 24 px
 * frame, the pictogram and the name, fill at 12 %, edge at 50 %.
 */
export function PlaceKindBadge({ locale, kind }) {
  return (
    <span
      className="places-kind-badge"
      data-kind={kind}
      style={{ "--tone": placeKindTones[kind] }}
    >
      <PlaceKindIcon kind={kind} />
      {placeKindLabel(locale, kind)}
    </span>
  );
}

/** The frame of a gap badge: "−3,5", "+0,6", "≈ 0" in the gap's tint. */
export function SkyDeltaFrame({
  locale,
  comparison,
  large = false,
  label = skyDeltaBadgeLabel(locale, comparison),
}) {
  return (
    <span
      className={`places-delta-frame${large ? " is-large" : ""}`}
      data-kind={comparison.kind}
      style={{ "--tone": skyDeltaTone(comparison) }}
    >
      {label}
    </span>
  );
}

/**
 * The gap of sky of a place with its reference: a signed badge — the sign and
 * the figure say what the colour says — that opens its explanation, a centred
 * `WebDialog`. `place` is `{ name, sqm }`, `reference` is `{ name, placeId }`
 * and `referenceSky` its `{ sqm }`. The badge is not a button of a zone (like
 * the ⓘ), outside the four levels.
 */
export function SkyDeltaBadge({
  locale,
  comparison,
  place,
  reference,
  referenceSky,
  testId = "places-delta",
}) {
  const [open, setOpen] = useState(false);
  const title = skyDeltaTitle(locale, comparison, reference);
  return (
    <>
      <button
        type="button"
        className="places-delta-button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-label={`${title}. ${message(locale, "placesDeltaExplain")}`}
        onClick={() => setOpen(true)}
      >
        <SkyDeltaFrame
          locale={locale}
          comparison={comparison}
          label={skyDeltaChipLabel(locale, comparison)}
        />
      </button>
      {open && (
        <SkyDeltaDialog
          locale={locale}
          comparison={comparison}
          place={place}
          reference={reference}
          referenceSky={referenceSky}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SkyDeltaDialog({
  locale,
  comparison,
  place,
  reference,
  referenceSky,
  onClose,
}) {
  const close = message(locale, "placesDeltaClose");
  return (
    <WebDialog
      className="places-delta-dialog"
      title={skyDeltaTitle(locale, comparison, reference)}
      closeLabel={close}
      closeOnBackdrop
      onClose={onClose}
      footer={
        <button type="button" className="btn-link" onClick={onClose}>
          {close}
        </button>
      }
    >
      <SkyDeltaDialogBody
        locale={locale}
        comparison={comparison}
        place={place}
        reference={reference}
        referenceSky={referenceSky}
      />
    </WebDialog>
  );
}

/**
 * What the explanation says (the web's `WebDialog` body): the badge enlarged
 * and the place, what was behind the ⓘ of the list's line, the place of both
 * skies on the 18 → 22 scale (the reference in a grey ring, the place in a
 * gold one), their legend and the note on the colour.
 */
export function SkyDeltaDialogBody({
  locale,
  comparison,
  place,
  reference,
  referenceSky,
}) {
  const legend = (tone, name, sqm) => (
    <li>
      <span className="places-delta-ring" style={{ "--tone": tone }} />
      {name} · {formatMagnitude(sqm, locale)} mag/arcsec²
    </li>
  );
  return (
    <div data-testid="places-delta-dialog">
      <div className="places-delta-dialog-head">
        <SkyDeltaFrame locale={locale} comparison={comparison} large />
        <span className="places-muted">{place.name}</span>
      </div>
      <p className="places-delta-explanation">
        {skyDeltaExplanation(locale, reference, referenceSky)}
      </p>
      <div
        className="places-scale"
        role="img"
        aria-label={placesText(locale, "placeSkyScale", {
          sqm: formatMagnitude(place.sqm, locale),
        })}
      >
        <span
          className="places-scale-marker is-reference"
          style={{ left: `${skyScalePosition(referenceSky.sqm) * 100}%` }}
        />
        <span
          className="places-scale-marker"
          style={{ left: `${skyScalePosition(place.sqm) * 100}%` }}
        />
      </div>
      <p className="places-scale-labels" aria-hidden="true">
        <span>{message(locale, "placeSkyScaleLow")}</span>
        <span>{message(locale, "placeSkyScaleHigh")}</span>
      </p>
      <ul className="places-delta-legend">
        {legend("#9ca5a3", reference.name, referenceSky.sqm)}
        {legend("var(--active-gold-text)", place.name, place.sqm)}
      </ul>
      <p className="places-muted">{message(locale, "placesDeltaColourNote")}</p>
    </div>
  );
}

/**
 * The access and the fee of a suggestion on one grey line, when the
 * source gives them; nothing otherwise.
 */
export function PlaceFactsLine({ locale, place }) {
  if (!place.access && !place.fee) return null;
  return (
    <p className="places-source-facts" data-testid="places-source-facts">
      {place.access && (
        <span>
          <svg {...strokeProps} className="places-icon is-small">
            <path d="M7 20V4h6a4.5 4.5 0 0 1 0 9H7" />
          </svg>
          {accessLabel(locale, place.access)}
        </span>
      )}
      {place.fee && (
        <span>
          <svg {...strokeProps} className="places-icon is-small">
            <path d="M4 9a2 2 0 0 0 0 4v3h16v-3a2 2 0 0 1 0-4V6H4zM12 6v10" />
          </svg>
          {feeLabel(locale, place.fee)}
        </span>
      )}
    </p>
  );
}

/** "Accès, horaires et sécurité de nuit non vérifiés." */
export function PlaceCaution({ children, framed = false }) {
  return (
    <p className={`places-caution${framed ? " is-framed" : ""}`} role="note">
      <svg {...strokeProps} className="places-icon">
        <path d="M12 4 3 20h18Z" />
        <path d="M12 10v5M12 17.5v.5" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/**
 * "Lieux : © contributeurs d’OpenStreetMap" — the attribution of the
 * licence (ODbL), on every screen that shows a suggestion or a detail.
 */
export function PlaceAttribution({ locale, source = false }) {
  return (
    <p className="places-attribution">
      {message(locale, source ? "placesSourceLead" : "placesAttributionLead")}
      <a href={placesAttributionUrl} target="_blank" rel="noopener noreferrer">
        {placesAttributionCredit}
      </a>
    </p>
  );
}

/**
 * The kind of a place and, when it is given, its distance: "Camping · 52 km";
 * `lead` stands in front ("Lieu par défaut · Point de vue" in the picker).
 */
export function PlaceKindLine({ locale, kind, distance = null, lead = null }) {
  if (!kind && !distance && !lead) return null;
  return (
    <p className="places-kind-line">
      {kind && <PlaceKindIcon kind={kind} />}
      <span>
        {[lead, kind ? placeKindLabel(locale, kind) : null, distance]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </p>
  );
}

/**
 * The modelled darkness at a position (`{ bortle, sqm }`, an estimate), read
 * from the planner's own request; `null` until it is known or when it cannot
 * be read. Reads again when the position changes.
 */
export function usePlaceSky(coordinates) {
  const [sky, setSky] = useState(null);
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;
  useEffect(() => {
    setSky(null);
    if (
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))
    )
      return undefined;
    const controller = new AbortController();
    requestPlannerSkyQuality(
      { latitude: Number(latitude), longitude: Number(longitude) },
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setSky(normalizeSkyEstimate(value));
      })
      .catch(() => {
        if (!controller.signal.aborted) setSky(null);
      });
    return () => controller.abort();
  }, [latitude, longitude]);
  return sky;
}

/**
 * The browser's position, **on demand only** (N-1): nothing is read when a
 * places screen opens — the reference of the distances is the default place
 * — and the permission prompt shows only when `locate()` is called, by the
 * button "Depuis ma position". The answer is kept in this component's state,
 * so it stands as the reference until the page is left; a refusal, a missing
 * sensor or a slow answer leaves `position` at `null` (`failed`) and the
 * default place as the reference. `pending` says the browser is still
 * answering ("Recherche de votre position…").
 */
export function usePlacesPositionRead() {
  const [read, setRead] = useState(IDLE_POSITION_READ);
  const reader = useRef(null);
  if (reader.current === null)
    reader.current = createPlacesPositionReader({
      onChange: (next) => setRead(next),
    });
  // Nothing is asked here: the hook only keeps the reader alive and drops its
  // answers once the page is left.
  useEffect(() => reader.current.attach(), []);
  return { ...read, locate: reader.current.locate };
}

const IDLE_POSITION_READ = Object.freeze({
  position: null,
  pending: false,
  failed: false,
});

/**
 * The reader behind [usePlacesPositionRead], without React so that it can be
 * tested: it reads **nothing** until `locate()` is called. `onChange` receives
 * `{ position, pending, failed }` at each step; `host` is the object that
 * carries `geolocation` and `permissions` (the browser's `navigator`).
 */
export function createPlacesPositionReader({
  onChange,
  host = typeof navigator === "undefined" ? undefined : navigator,
}) {
  let live = true;
  let state = IDLE_POSITION_READ;
  const emit = (next) => {
    state = next;
    if (live) onChange(next);
  };
  const settle = (position) =>
    emit({ position, pending: false, failed: position === null });
  const locate = async () => {
    if (!host?.geolocation) return settle(null);
    emit({ ...state, pending: true, failed: false });
    try {
      const permission = await host.permissions?.query?.({
        name: "geolocation",
      });
      if (permission?.state === "denied") return settle(null);
    } catch {
      // Geolocation without the Permissions API: ask anyway.
    }
    if (!live) return undefined;
    host.geolocation.getCurrentPosition(
      (fix) =>
        settle({
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
        }),
      () => settle(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
    return undefined;
  };
  return {
    locate,
    /** Answers are delivered while attached (an effect's setup/cleanup). */
    attach() {
      live = true;
      return () => {
        live = false;
      };
    },
  };
}

/**
 * "Depuis ma position" (N-1): the one way the places page reads the
 * browser's position — on demand, a tertiary button. Until it is pressed the
 * distances are measured from the default place; a refusal is said under it.
 */
export function PlacesFromPositionButton({
  locale,
  pending = false,
  failed = false,
  onLocate,
}) {
  return (
    <div className="places-from-position">
      <button
        type="button"
        className="btn-tertiary"
        data-testid="places-from-position"
        disabled={pending}
        onClick={onLocate}
      >
        {message(
          locale,
          pending ? "placesAroundSearching" : "placesFromMyPosition",
        )}
      </button>
      {failed && !pending && (
        <p
          className="places-muted"
          role="status"
          data-testid="places-position-unavailable"
        >
          {message(locale, "placesPositionUnavailable")}
        </p>
      )}
    </div>
  );
}
