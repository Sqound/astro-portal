import { message } from "portal/i18n.js";
import { aduText, arcsecText, numberText } from "./night-detail-view.js";

/** One strip: the curve of a measure over the night, as the quality panel draws it. */
function Curve({ values }) {
  if (values.length < 2) return <div className="quality-sparkline is-empty" />;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.05, 1);
  const plot = values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * 100).toFixed(2)},${(26 - ((value - minimum) / spread) * 22).toFixed(2)}`,
    )
    .join(" ");
  return (
    <div className="quality-sparkline-wrap">
      <svg
        className="quality-sparkline"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="quality-sparkline-baseline"
          d="M0 26H100"
          vectorEffect="non-scaling-stroke"
        />
        <polyline points={plot} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * « Qualité des captures » on a card of the Journal (the old journal's panel):
 * three strips — the sky background, the stars' FWHM, the eccentricity — each
 * with the night's median and, when the night's analysis could be read, its
 * curve over the night (the frames of the report, thinned). The medians are the
 * Journal's own (`quality` of the line); a strip without a median is not drawn.
 * Nothing here is a score.
 */
export function JournalQuality({ item, curves = null, locale = "en" }) {
  const quality = item.quality;
  if (!quality) return null;
  const strips = [
    {
      key: "skyBackground",
      label: "qualitySkyBackground",
      value: Number.isFinite(quality.skyBackground)
        ? aduText(quality.skyBackground, locale)
        : null,
    },
    {
      key: "fwhm",
      label: "qualityFwhm",
      value: Number.isFinite(quality.fwhm)
        ? arcsecText(quality.fwhm, locale)
        : curves?.fwhm?.length
          ? `${numberText(median(curves.fwhm), locale, 1)} px`
          : null,
    },
    {
      key: "eccentricity",
      label: "qualityEccentricity",
      value: Number.isFinite(quality.eccentricity)
        ? numberText(quality.eccentricity, locale, 2)
        : null,
    },
  ].filter((strip) => strip.value);
  if (!strips.length) return null;
  return (
    <section className="capture-quality is-compact journal-quality">
      <div className="capture-quality-heading">
        <div>
          <h3>{message(locale, "captureQuality")}</h3>
          {item.frameCount > 0 && (
            <p>
              {new Intl.NumberFormat(locale).format(item.frameCount)}{" "}
              {message(locale, "qualityFramesMeasured")}
            </p>
          )}
        </div>
        <div className="quality-heading-meta">
          <span className="quality-note">
            {message(locale, "journalQualityOverTheNight")}
          </span>
        </div>
      </div>
      <div className="quality-chart-area">
        <div className="quality-charts">
          {strips.map((strip) => (
            <div className="quality-chart" key={strip.key}>
              <div className="quality-chart-value">
                <strong>{strip.value}</strong>
              </div>
              <Curve values={curves?.[strip.key] ?? []} />
              <div className="quality-chart-description">
                <span className="quality-chart-label">
                  {message(locale, strip.label)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
