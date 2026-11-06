"use client";

import { useEffect, useRef, useState } from "react";
import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import {
  formatDeclination,
  formatDuration,
  formatRightAscension,
} from "portal/format.js";
import { message } from "portal/i18n.js";
import {
  formatNightMonths,
  publicCaptureTitle,
} from "portal/captures/public-capture-format.js";
import { shownImages } from "portal/captures/image-names.js";
import { publicQualityRows } from "portal/captures/public-capture-quality.js";
import { CaptureDownloadLink } from "./CaptureDownloadLink.js";
import {
  CaptureImageArrows,
  CaptureImageBand,
  CaptureImageLoading,
  imagePositionLabel,
  useImageSwap,
} from "./CaptureImageCarousel.js";
import {
  DEFAULT_PLAYBACK_INTERVAL,
  ImagePagination,
  ProgressionHistory,
  ProgressionPlaybackStatus,
  firstStepToPlay,
  preloadImage,
  useProgressionPlayback,
  useProgressionPlayingClass,
  useProgressionPreload,
} from "./ProgressionPlayer.js";
import {
  AnnotatedImage,
  MagnitudeSelect,
  SkyAnnotationsButton,
  annotationTarget,
  useCaptureAnnotations,
} from "../plate-solving/SkyAnnotationControls.js";
import { ImageIcon } from "../gallery/gallery-icons.js";
import { detailLabel } from "./DetailsPanel.js";
import { ImageZoomButton, useImageZoom } from "./ImageZoom.js";
import { ViewerTip } from "./ViewerTip.js";
import { KnowledgeStory } from "./KnowledgeStory.js";
import { CaptureQuality, SessionTelemetry } from "../quality/CaptureQuality.js";

/**
 * The detail page of a public capture, `/{locale}/gallery/{captureId}`, drawn
 * with the parts and the classes of the gallery's detail page
 * (`DetailPage.js`, `ImageViewer.js`, `DetailsPanel.js`) and fed by the view
 * model of the public gallery (`gallery.schema.json`, `#/$defs/capture`). In
 * this order: « Retour à la galerie », « Ouvrir dans Stellarium Web »,
 * « Afficher l’image seule », the image and its caption (the month · the
 * pixel size), « Masquer les informations », the title, the signature (the
 * space's « Nom public », nothing without it), « Cible », « Acquisition » —
 * with « Qualité du ciel » and « Mois de la nuit », never « Lieu » —,
 * « Équipement », « À propos de la cible », « Liens connexes ». A row with no
 * value is not drawn.
 *
 * The viewer's round button « Afficher les annotations du ciel » is drawn
 * only for an image whose view carries `skySolution` — the service writes it
 * only while the image has a sky solution and its owner's switch is on — and
 * shows or hides the annotations (`PlateOverlay`, the magnitude selector of
 * the catalogue's viewer). Without it the page is the one of before: no
 * button, no message, nothing that names a solution or Astro Sync.
 *
 * With a public variant, the images are drawn like the catalogue's viewer
 * (`CaptureImageCarousel.js`): an arrow on each side of the image, the dots
 * under it, and a dark band under the image with the name of the image shown,
 * the caption and its description. The main image comes first, then the
 * public variants. While another image loads, the old one is hidden and the
 * portal's star stands in its place. The band is as wide as the image, so the
 * image stays centred whatever its description. Without a public variant the
 * band carries the caption and the description only. A draft is in no
 * gallery's list; its owner opens it by its address and reads there every
 * image of the capture. In the owner's private gallery every variant is
 * drawn, a private one with the badge « privée » after its name; a visitor
 * of the private gallery or of the public gallery is given the public
 * variants only.
 *
 * The statistics are shown on the private and the public gallery alike, with a
 * switch for each: after « Traitement », « Qualité »
 * says what Astro Sync measured on the image shown (the FWHM of the stars,
 * the eccentricity, the stars measured, on what, by which tool, when). It is
 * drawn when the view carries `quality` for that image — the service writes
 * it only while the owner's switch of the gallery is on — and it follows the
 * image shown.
 *
 * The progression of the capture — the milestones Astro Sync stacked —
 * is drawn with the capture, without a switch, by the catalogue's player
 * (`ProgressionPlayer.js`): the section « Progression de la nuit » after
 * « Acquisition » (« Progression de l’empilement » for the image of a
 * multi-night plan, each milestone « Après la nuit N »), its interval and its
 * ▶; a milestone shown puts the viewer in the progression: the gold dots,
 * « ← Retour aux images », « Lecture de la progression · … » while playing.
 *
 * After « Qualité », « La nuit » (« Les nuits ») and « Guidage » say what
 * Astro Sync read of the nights the capture combines, under the same switch
 * as « Qualité »: above, the catalogue's charts of what moves through the
 * night (`qualityCharts`: the sky background, the FWHM and the eccentricity
 * frame after frame; the guiding trace, its RMS band, the meridian flips and
 * the night's events), drawn only where the data exists; under them, the
 * values that do not move (`nights`: the medians, the RMS, the flips).
 *
 * « Signaler »: a service that takes reports gives its link (`ReportLink`,
 * the component, and `reportPath`, where it sends the report): beside the
 * signature for the public name, and at the end of the panel for the
 * capture, for anyone but the capture's owner (`reportable`, decided on the
 * server). Without them nothing is drawn.
 *
 * The same code serves the private gallery and the public gallery (the public
 * gallery being the reference): this is also
 * the page of a capture of a private gallery. That page gives the capture in
 * the shape above, its files through the gallery's gate
 * (`private-gallery/public-shape.js`), and three things this page does not
 * decide: `backHref`, where the round ✕ leads (the home gallery by default),
 * `galleryLabel`, the name of that place for the ✕'s tooltip, and
 * `reportPath`, where « Signaler » sends the report. No address of a private
 * gallery is written here. The viewer zooms to 100 % of the screen's pixels
 * (`ImageZoom.js`).
 */

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

const kindLabels = {
  telescope: "Télescope",
  camera: "Caméra",
  mount: "Monture",
  filter: "Filtre",
};

/**
 * The rows of the panel by section, without the rows that have no value:
 * `[{ section, rows: [[label, value], …] }]`. Pure, so that a test reads
 * what the page draws.
 *
 * `shown` is the image the page shows (its main one by default); the
 * section « Qualité » is its `quality` — the view carries it only while the
 * owner's switch of the gallery (« Afficher la qualité en public » / « … en
 * privé ») is on — and is empty without it.
 */
export function publicCaptureRows(capture, locale = "en", shown = null) {
  const first = capture?.targets?.[0] ?? null;
  const target = first
    ? [
        ["Objet", [first.designation, ...(first.aliases || [])].join(" · ")],
        ["Type", first.type ? taxonomyLabel(first.type, locale) : null],
        [
          "Constellation",
          first.constellation
            ? taxonomyLabel(first.constellation, locale)
            : null,
        ],
        [
          "Coordonnées (J2000)",
          Number.isFinite(first.ra) && Number.isFinite(first.dec)
            ? `${formatRightAscension(first.ra)} · ${formatDeclination(first.dec)}`
            : null,
        ],
      ]
    : [];
  // The calibration and the sensor before the sky quality and the
  // month, the Moon after.
  const meta = capture?.metadata ?? null;
  const sensor = meta?.sensor
    ? [
        Number.isFinite(meta.sensor.temperatureC)
          ? `${String(meta.sensor.temperatureC).replace("-", "−")} °C`
          : null,
        meta.sensor.binning
          ? `binning ${meta.sensor.binning} × ${meta.sensor.binning}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const acquisition = [
    [message(locale, "captureCalibration"), meta?.calibration ?? null],
    [message(locale, "captureSensor"), sensor || null],
    [
      "Qualité du ciel",
      capture?.skyQuality
        ? `${message(locale, "bortle")} ${capture.skyQuality.bortle}`
        : null,
    ],
    // The image of a multi-night plan says the months of its nights.
    [
      capture?.nightMonthEnd ? "Mois des nuits" : "Mois de la nuit",
      formatNightMonths(capture?.nightMonth, capture?.nightMonthEnd, locale),
    ],
    [
      message(locale, "captureMoon"),
      Number.isInteger(meta?.moonIllumination)
        ? message(locale, "captureMoonIlluminated").replace(
            "{percent}",
            String(meta.moonIllumination),
          )
        : null,
    ],
  ];
  const byKind = new Map();
  for (const item of capture?.equipment || [])
    byKind.set(item.kind, [...(byKind.get(item.kind) || []), item.name]);
  // The filter of the capture when the night's equipment names none.
  if (!byKind.has("filter") && meta?.filters?.length)
    byKind.set("filter", meta.filters);
  const equipment = Object.entries(kindLabels).map(([kind, label]) => [
    label,
    byKind.has(kind) ? byKind.get(kind).join(" · ") : null,
  ]);
  const processing = [
    [message(locale, "captureSoftware"), meta?.processing?.software ?? null],
    [message(locale, "captureSteps"), meta?.processing?.steps ?? null],
  ];
  const kept = (rows) => rows.filter(([, value]) => value);
  const quality = publicQualityRows(
    shown ? (shown.quality ?? null) : (capture?.quality ?? null),
    locale,
  );
  return [
    { section: "target", rows: kept(target) },
    { section: "acquisition", rows: kept(acquisition) },
    { section: "equipment", rows: kept(equipment) },
    { section: "processing", rows: kept(processing) },
    { section: "quality", rows: quality },
  ];
}

/**
 * The milestones of the capture's progression for the page:
 * `[{ id, frameCount, image, media, label, primary, secondary }]` — « 98
 * poses », or for the image of a multi-night plan « Après la nuit 2 » and
 * « 187 poses ». Pure, so that a test reads what the page draws.
 */
export function progressionSteps(progression, locale = "en") {
  const steps = Array.isArray(progression?.steps) ? progression.steps : [];
  const frames = (count) =>
    Number.isInteger(count) && count > 0
      ? count === 1
        ? message(locale, "progressionFrame")
        : message(locale, "progressionFrames").replace(
            "{count}",
            groupedNumber(count, locale),
          )
      : null;
  return steps
    .filter((step) => step?.id && step.media?.image)
    .map((step, index) => {
      const count = frames(step.frameCount);
      const night = progression.plan
        ? message(locale, "progressionAfterNight").replace(
            "{night}",
            String(index + 1),
          )
        : null;
      const label =
        [night, count].filter(Boolean).join(" — ") ||
        message(locale, "progressionPosition")
          .replace("{index}", String(index + 1))
          .replace("{count}", String(steps.length));
      return {
        ...step,
        label,
        primary: night ?? count ?? label,
        secondary: night ? count : null,
      };
    });
}

const arcseconds = (value, locale) =>
  `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}″`;
const finiteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The sections « La nuit » (« Les nuits » for several) and « Guidage » of
 * the page, from the view's `nights` (absent while the owner's switch is
 * off): `[{ section, title, nights: [{ key, label, rows }] }]`, a night
 * labelled « Nuit 2 » only when there are several, without the rows that
 * have no value. Pure, so that a test reads what the page draws.
 */
export function publicNightSections(nights, locale = "en") {
  const list = Array.isArray(nights) ? nights : [];
  if (!list.length) return [];
  const several = list.length > 1;
  const label = (index) =>
    several
      ? message(locale, "publicNightLabel").replace(
          "{night}",
          String(index + 1),
        )
      : null;
  const kept = (rows) => rows.filter(([, value]) => value);
  const quality = list
    .map((night, index) => ({
      key: `night-${index}`,
      label: label(index),
      rows: kept([
        [
          message(locale, "qualitySkyBackground"),
          finiteNumber(night.skyBackgroundAdu)
            ? `${groupedNumber(night.skyBackgroundAdu, locale)} ADU`
            : null,
        ],
        [
          message(locale, "qualityFwhm"),
          finiteNumber(night.fwhmArcsec)
            ? arcseconds(night.fwhmArcsec, locale)
            : null,
        ],
        [
          message(locale, "qualityEccentricity"),
          finiteNumber(night.eccentricity)
            ? new Intl.NumberFormat(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(night.eccentricity)
            : null,
        ],
        [
          message(locale, "qualityMeasuredFrames"),
          Number.isInteger(night.measuredFrames) && night.measuredFrames > 0
            ? groupedNumber(night.measuredFrames, locale)
            : null,
        ],
      ]),
    }))
    .filter((night) => night.rows.length);
  const guiding = list
    .map((night, index) => ({
      key: `guiding-${index}`,
      label: label(index),
      rows: kept([
        [
          message(locale, "guidingRmsTotal"),
          finiteNumber(night.guiding?.rmsTotalArcsec)
            ? arcseconds(night.guiding.rmsTotalArcsec, locale)
            : null,
        ],
        [
          message(locale, "guidingRmsRa"),
          finiteNumber(night.guiding?.rmsRaArcsec)
            ? arcseconds(night.guiding.rmsRaArcsec, locale)
            : null,
        ],
        [
          message(locale, "guidingRmsDec"),
          finiteNumber(night.guiding?.rmsDecArcsec)
            ? arcseconds(night.guiding.rmsDecArcsec, locale)
            : null,
        ],
        [
          message(locale, "meridianFlips"),
          night.guiding?.meridianFlips > 0
            ? String(night.guiding.meridianFlips)
            : null,
        ],
      ]),
    }))
    .filter((night) => night.rows.length);
  return [
    ...(quality.length
      ? [
          {
            section: "nights",
            title: message(
              locale,
              several ? "publicNightsTitle" : "publicNightTitle",
            ),
            nights: quality,
          },
        ]
      : []),
    ...(guiding.length
      ? [
          {
            section: "guiding",
            title: message(locale, "guidingTitle"),
            nights: guiding,
          },
        ]
      : []),
  ];
}

/**
 * The acquisition per filter — « Dual-band · 38 × 180 s · 1 h 54 » — and
 * its total; nothing when the capture has no line.
 */
export function AcquisitionTable({ metadata, locale }) {
  const lines = metadata?.acquisition ?? [];
  if (!lines.length) return null;
  return (
    <div className="integration-table">
      <table>
        <thead>
          <tr>
            <th>{message(locale, "filter")}</th>
            <th>{message(locale, "frames")}</th>
            <th>{message(locale, "integration")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td>{line.filter || message(locale, "captureNoFilter")}</td>
              <td>
                {line.frameCount} × {line.exposureSeconds} s
              </td>
              <td>{formatDuration(line.integrationSeconds, locale)}</td>
            </tr>
          ))}
        </tbody>
        {metadata.totalIntegrationSeconds ? (
          <tfoot>
            <tr>
              <th colSpan={2}>{message(locale, "total")}</th>
              <td>
                {formatDuration(metadata.totalIntegrationSeconds, locale)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * The steps of a processing, one per line. Astro Sync writes them in the
 * order they ran, separated by « · », each with its parameters (« level
 * match aperture r=11.5 px scales 1.012/0.998 · weighted_mean 2 nights
 * weights 0.55/0.45 »); the contract keeps them as one text. A text with a
 * single step stays a plain line.
 */
export function processingSteps(text) {
  return String(text ?? "")
    .split(" · ")
    .map((step) => step.trim())
    .filter(Boolean);
}

/** The rows of one section of `publicNightSections`, night after night. */
function NightRows({ section, locale }) {
  if (!section) return null;
  return section.nights.map((night) => (
    <div className="public-capture-night" key={night.key}>
      {night.label ? <h4>{night.label}</h4> : null}
      <Rows rows={night.rows} locale={locale} />
    </div>
  ));
}

function Rows({ rows, locale }) {
  const stepsLabel = message(locale, "captureSteps");
  return (
    <dl>
      {rows.map(([label, value]) => {
        const steps =
          label === stepsLabel && typeof value === "string"
            ? processingSteps(value)
            : [];
        return (
          <span className="definition-row" key={label}>
            <dt>{detailLabel(label, locale)}</dt>
            <dd>
              {steps.length > 1 ? (
                <ol className="processing-steps">
                  {steps.map((step, index) => (
                    <li key={`${index}-${step}`}>{step}</li>
                  ))}
                </ol>
              ) : (
                value
              )}
            </dd>
          </span>
        );
      })}
    </dl>
  );
}

// « 4 096 × 2 730 px », grouped with an ordinary space where the language's
// format puts a narrow one.
const groupedNumber = (value, locale) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    .format(value)
    .replace(/[\u202f\u00a0]/g, " ");

export function PublicCapturePage({
  capture,
  knowledge = null,
  noTarget,
  locale = "en",
  reportable = false,
  backHref = null,
  galleryLabel = null,
  reportPath = null,
  ReportLink = null,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(
        sessionStorage.getItem("astro-portal:details-collapsed") === "true",
      );
    } catch {
      // Storage can be unavailable in a private browsing context.
    }
  }, []);
  useEffect(() => {
    const query = matchMedia("(max-width:850px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const toggle = () =>
    setCollapsed((value) => {
      try {
        sessionStorage.setItem(
          "astro-portal:details-collapsed",
          String(!value),
        );
      } catch {
        // The panel still folds without storage.
      }
      return !value;
    });
  const chevron = mobile
    ? collapsed
      ? "m5 14.5 7-7 7 7"
      : "m5 9.5 7 7 7-7"
    : collapsed
      ? "m14.5 5-7 7 7 7"
      : "m9.5 5 7 7-7 7";
  const { images, several } = shownImages(capture, locale);
  const [shownId, setShownId] = useState(images[0].id);
  const shownIndex = Math.max(
    0,
    images.findIndex((image) => image.id === shownId),
  );
  const shown = images[shownIndex];
  // The progression: the milestone shown (`null`: the images), the timed
  // playback and its interval, as in the catalogue's viewer.
  const steps = progressionSteps(capture.progression, locale);
  const [stepId, setStepId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [interval, setPlaybackInterval] = useState(DEFAULT_PLAYBACK_INTERVAL);
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const step = stepIndex >= 0 ? steps[stepIndex] : null;
  const stepIds = steps.map((entry) => entry.id);
  const sourceOfStep = (id) =>
    steps.find((entry) => entry.id === id)?.media?.image ?? null;
  // The next milestone's picture is fetched while the current one is shown,
  // and the playback waits for it: the loader alone is never what plays.
  useProgressionPlayback({
    playing,
    interval,
    stepIds,
    activeId: stepId,
    onStep: setStepId,
    sourceOf: sourceOfStep,
  });
  useProgressionPreload({
    stepIds,
    activeId: stepId,
    sourceOf: sourceOfStep,
  });
  useProgressionPlayingClass(playing);
  // The first milestone is fetched as soon as the progression is on the page:
  // ▶ finds it there.
  useEffect(() => {
    preloadImage(sourceOfStep(firstStepToPlay(stepIds)));
    // The steps change with the capture only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIds.join("|")]);
  // ▶ always starts from the first night, wherever the viewer was.
  const togglePlay = () => {
    if (!playing && steps[0]) {
      setStepId(firstStepToPlay(stepIds));
      preloadImage(sourceOfStep(stepIds[1] ?? stepIds[0]));
    }
    setPlaying((value) => !value);
  };
  const exitProgression = () => {
    setPlaying(false);
    setStepId(null);
  };
  const shownSource =
    (step
      ? step.media?.image
      : shown.main
        ? capture.media?.image
        : shown.media?.image) || null;
  const shownKey = step ? step.id : shown.id;
  const swap = useImageSwap(shownSource);
  const zoom = useImageZoom({
    imageKey: shownKey,
    enabled: Boolean(shownSource),
  });
  const annotations = useCaptureAnnotations({
    solution: step ? null : (shown.skySolution ?? null),
    imageKey: shownKey,
  });
  // The bar's height (`--viewer-bar-height`, on the area): under 850 px the
  // bar floats over the image, with its selector on a row under the capsules
  // (padding of the bar, hence the border box), so the image's room is what
  // it leaves.
  const barRef = useRef(null);
  useEffect(() => {
    const bar = barRef.current;
    const area = bar?.parentElement;
    if (!bar || !area) return undefined;
    const write = () =>
      area.style.setProperty("--viewer-bar-height", `${bar.offsetHeight}px`);
    write();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(write);
    observer.observe(bar, { box: "border-box" });
    return () => observer.disconnect();
  }, []);
  const shownSize = step
    ? step.image
    : shown.main
      ? capture.image
      : shown.image;
  // The capture's own title, else its targets'.
  const title =
    capture.metadata?.title || publicCaptureTitle(capture, noTarget);
  const source = capture.targets?.[0]?.designation || null;
  const stellarium = source
    ? `https://stellarium-web.org/skysource/${encodeURIComponent(source)}?fov=3.34`
    : null;
  // What the area keeps under the image, so that the image, its band and its
  // dots fit the area: the band's caption, the dots.
  const under = 2.4 + (step || images.length > 1 ? 1.3 : 0);
  const caption = [
    formatNightMonths(capture.nightMonth, capture.nightMonthEnd, locale),
    shownSize
      ? `${groupedNumber(shownSize.width, locale)} × ${groupedNumber(shownSize.height, locale)} px`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
    // A grouped number never breaks across two lines of the band.
    .replace(/(\d) (?=\d)/g, "$1\u00a0");
  const sections = publicCaptureRows(capture, locale, shown);
  // The nights: the charts of what moves through the night above (the
  // catalogue's `CaptureQuality` and `SessionTelemetry`), the values that
  // do not under them.
  const nightSections = publicNightSections(capture.nights, locale);
  const nightsRows =
    nightSections.find((entry) => entry.section === "nights") ?? null;
  const guidingRows =
    nightSections.find((entry) => entry.section === "guiding") ?? null;
  const charts = capture.qualityCharts ?? null;
  const trends = charts?.series?.length > 0;
  const telemetry = charts?.sessionTelemetry ?? [];
  const severalNights =
    (capture.nights?.length ?? 0) > 1 ||
    (charts?.series ?? []).some((point) => point.night > 1);
  const back = message(locale, "backToGallery");
  const backLabel = galleryLabel ? `${back} — ${galleryLabel}` : back;
  const reportAddress = reportPath;
  const rowsOf = (name) =>
    sections.find((entry) => entry.section === name)?.rows || [];
  const paragraphs = (
    Array.isArray(knowledge?.storyParagraphs) &&
    knowledge.storyParagraphs.length
      ? knowledge.storyParagraphs
      : [knowledge?.story]
  ).filter(Boolean);
  return (
    <main id="viewer" data-public-capture="">
      <div className={`viewer${collapsed ? " details-collapsed" : ""}`}>
        <section
          ref={zoom.areaRef}
          data-zoomable={zoom.canZoom ? "" : undefined}
          className={`image-area${annotations.active ? " is-plate-solving" : ""}`}
          style={{ "--capture-under": `${under}rem` }}
        >
          <div className="viewer-bar" ref={barRef}>
            {/* Four groups, one capsule each, in this order: close | display
                (zoom, image only) | annotations (the button and its magnitude
                selector) | out (Stellarium, download). A group with no
                button is not drawn. */}
            <div className="viewer-group" data-viewer-group="close">
              <ViewerTip label={backLabel}>
                {(tip) => (
                  <a
                    className="close"
                    href={backHref ?? `/${locale}`}
                    aria-label={backLabel}
                    {...tip}
                  >
                    <Icon>
                      <path d="M6 6 18 18M18 6 6 18" />
                    </Icon>
                  </a>
                )}
              </ViewerTip>
            </div>
            {(zoom.canZoom || zoom.zoomed || shownSource) && (
              <div className="viewer-group" data-viewer-group="display">
                <ImageZoomButton zoom={zoom} locale={locale} />
                {shownSource && (
                  <ViewerTip label={message(locale, "showImageOnly")}>
                    {(tip) => (
                      <a
                        className="image-fullscreen"
                        href={shownSource}
                        aria-label={message(locale, "showImageOnly")}
                        {...tip}
                      >
                        <Icon>
                          <path d="M8.5 3.5h-5v5M15.5 3.5h5v5M20.5 15.5v5h-5M3.5 15.5v5h5" />
                        </Icon>
                      </a>
                    )}
                  </ViewerTip>
                )}
              </div>
            )}
            {shown.skySolution && shownSource && (
              <div className="viewer-group" data-viewer-group="annotations">
                <SkyAnnotationsButton
                  plate={annotations.plate}
                  locale={locale}
                />
                {annotations.active && (
                  <MagnitudeSelect
                    value={annotations.magnitude}
                    onChange={annotations.setMagnitude}
                    unavailable={!annotations.starsAvailable}
                    locale={locale}
                  />
                )}
              </div>
            )}
            {(stellarium || shownSource) && (
              <div className="viewer-group" data-viewer-group="out">
                {stellarium && (
                  <ViewerTip
                    label={message(locale, "openStellarium")}
                    hint={message(locale, "openInNewTab")}
                  >
                    {(tip) => (
                      <button
                        type="button"
                        className="stellarium-link"
                        onClick={() =>
                          window.open(
                            stellarium,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        aria-label={message(locale, "openStellarium")}
                        {...tip}
                      >
                        <Icon>
                          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                        </Icon>
                      </button>
                    )}
                  </ViewerTip>
                )}
                {shownSource && (
                  <CaptureDownloadLink
                    href={shownSource}
                    title={title}
                    nightMonth={[capture.nightMonth, capture.nightMonthEnd]
                      .filter(Boolean)
                      .join(" ")}
                    locale={locale}
                  />
                )}
              </div>
            )}
          </div>
          {step ? (
            <CaptureImageArrows
              images={steps}
              index={stepIndex}
              onSelect={setStepId}
              locale={locale}
            />
          ) : several ? (
            <CaptureImageArrows
              images={images}
              index={shownIndex}
              onSelect={setShownId}
              locale={locale}
            />
          ) : null}
          <div className="image-frame">
            {shownSource ? (
              <AnnotatedImage
                controls={annotations}
                target={annotationTarget(capture, title)}
                locale={locale}
                canvasRef={zoom.canvasRef}
              >
                {(imageRef) => (
                  <>
                    {playing && step ? (
                      <ProgressionPlaybackStatus
                        label={step.label}
                        locale={locale}
                      />
                    ) : null}
                    <img
                      ref={imageRef}
                      src={swap.drawn}
                      alt={title}
                      draggable={false}
                      className={swap.loading ? "is-loading" : undefined}
                    />
                    {swap.loading ? (
                      <CaptureImageLoading locale={locale} />
                    ) : null}
                  </>
                )}
              </AnnotatedImage>
            ) : (
              <div className="image-placeholder" role="img" aria-label={title}>
                <ImageIcon size={36} />
              </div>
            )}
            <CaptureImageBand
              name={step ? step.label : several ? shown.name : null}
              privateLabel={
                !step && several && shown.private
                  ? message(locale, "imagePrivate")
                  : null
              }
              caption={caption}
            />
            {step ? (
              <ImagePagination
                ids={steps.map((entry) => entry.id)}
                activeId={step.id}
                label={message(locale, "progressionPosition")
                  .replace("{index}", String(stepIndex + 1))
                  .replace("{count}", String(steps.length))}
                progression
                onExit={exitProgression}
                locale={locale}
              />
            ) : several ? (
              <ImagePagination
                ids={images.map((image) => image.id)}
                activeId={shown.id}
                label={imagePositionLabel(shownIndex, images.length, locale)}
                locale={locale}
              />
            ) : null}
          </div>
        </section>
        {collapsed && (
          <button
            type="button"
            className="details-toggle details-reopen"
            onClick={toggle}
            aria-label={message(locale, "details")}
          >
            <span className="details-bar-grip" aria-hidden="true" />
            <span className="details-bar-title" aria-hidden="true">
              {title}
            </span>
            <span className="details-bar-label" aria-hidden="true">
              {message(locale, "details")}
            </span>
            <svg viewBox="0 0 24 24">
              <path d={chevron} />
            </svg>
          </button>
        )}
        <aside className="details">
          {!collapsed && (
            <button
              type="button"
              className="details-toggle details-panel-toggle"
              onClick={toggle}
              aria-label={message(locale, "hideDetails")}
            >
              <svg viewBox="0 0 24 24">
                <path d={chevron} />
              </svg>
            </button>
          )}
          <h2>{title}</h2>
          {capture.signature && (
            <div className="detail-signature-row">
              <p className="detail-signature" data-signature="">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
                </svg>
                {capture.signature}
              </p>
              {reportable && ReportLink && reportAddress && (
                <ReportLink
                  locale={locale}
                  subject="public_name"
                  heading={capture.signature}
                  path={reportAddress}
                />
              )}
            </div>
          )}
          {capture.metadata?.description ? (
            <p className="detail-description">{capture.metadata.description}</p>
          ) : null}
          {!step && shown.description ? (
            <p className="detail-description detail-image-description">
              {several ? <strong>{shown.name}</strong> : null}
              {several ? " · " : null}
              {shown.description}
            </p>
          ) : null}
          {rowsOf("target").length > 0 && (
            <section>
              <h3>{message(locale, "target")}</h3>
              <Rows rows={rowsOf("target")} locale={locale} />
            </section>
          )}
          {(capture.metadata?.acquisition?.length > 0 ||
            rowsOf("acquisition").length > 0) && (
            <section>
              <h3>{message(locale, "acquisition")}</h3>
              <AcquisitionTable metadata={capture.metadata} locale={locale} />
              <Rows rows={rowsOf("acquisition")} locale={locale} />
            </section>
          )}
          <ProgressionHistory
            title={message(
              locale,
              capture.progression?.plan
                ? "progressionStacking"
                : "progressionNight",
            )}
            steps={steps}
            activeId={stepId}
            onSelect={setStepId}
            playing={playing}
            onTogglePlay={togglePlay}
            interval={interval}
            onInterval={setPlaybackInterval}
            locale={locale}
          />
          {rowsOf("equipment").length > 0 && (
            <section>
              <h3>{message(locale, "equipment")}</h3>
              <Rows rows={rowsOf("equipment")} locale={locale} />
            </section>
          )}
          {rowsOf("processing").length > 0 && (
            <section>
              <h3>{message(locale, "captureProcessing")}</h3>
              <Rows rows={rowsOf("processing")} locale={locale} />
            </section>
          )}
          {rowsOf("quality").length > 0 && (
            <section data-section="quality">
              <h3>{message(locale, "publicQualityTitle")}</h3>
              <Rows rows={rowsOf("quality")} locale={locale} />
            </section>
          )}
          {nightsRows || trends ? (
            <section data-section="nights">
              <h3>
                {message(
                  locale,
                  severalNights ? "publicNightsTitle" : "publicNightTitle",
                )}
              </h3>
              {trends ? (
                <CaptureQuality
                  quality={charts}
                  title={null}
                  withTelemetry={false}
                  locale={locale}
                />
              ) : null}
              <NightRows section={nightsRows} locale={locale} />
            </section>
          ) : null}
          {guidingRows || telemetry.length ? (
            <section data-section="guiding">
              <h3>{message(locale, "guidingTitle")}</h3>
              {telemetry.length ? (
                <SessionTelemetry
                  sessions={telemetry}
                  title={null}
                  locale={locale}
                />
              ) : null}
              <NightRows section={guidingRows} locale={locale} />
            </section>
          ) : null}
          {paragraphs.length > 0 && (
            <section>
              <h3>{message(locale, "aboutTarget")}</h3>
              <KnowledgeStory
                knowledge={knowledge}
                paragraphs={paragraphs}
                locale={locale}
              />
            </section>
          )}
          {stellarium && (
            <section>
              <h3>{message(locale, "relatedLinks")}</h3>
              <div className="related-links">
                <a href={stellarium} target="_blank" rel="noreferrer">
                  <strong>{message(locale, "openStellarium")}</strong>
                </a>
              </div>
            </section>
          )}
          {reportable && ReportLink && reportAddress && (
            <div className="detail-report">
              <ReportLink
                locale={locale}
                subject="capture"
                heading={title}
                path={reportAddress}
              />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
