import { message } from "../../i18n.js";
import { ViewerTip } from "./ViewerTip.js";

/**
 * « Télécharger »: the icon of the viewer's top
 * bar, beside « Afficher l'image seule », that saves the image shown — the
 * shared copy, without location, 4096 px at most (never the original). An
 * icon only: the word is the label of the link for a screen reader and its
 * tooltip.
 */
export function captureDownloadName(title, nightMonth) {
  const stem = [title, nightMonth]
    .filter(Boolean)
    .join(" ")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "capture"}.jpg`;
}

export function CaptureDownloadLink({ href, title, nightMonth, locale }) {
  const label = message(locale, "downloadImage");
  return (
    <ViewerTip label={label}>
      {(tip) => (
        <a
          className="image-download"
          href={href}
          download={captureDownloadName(title, nightMonth)}
          aria-label={label}
          {...tip}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
          </svg>
        </a>
      )}
    </ViewerTip>
  );
}
