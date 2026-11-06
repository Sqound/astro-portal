"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import { formatDuration } from "portal/format.js";
import {
  formatNightMonths,
  publicCaptureAliases,
  publicCaptureTitle,
} from "portal/captures/public-capture-format.js";
import { ImageIcon } from "./gallery-icons.js";
import { localizedTag } from "./gallery-tags.js";

/**
 * The list of a gallery, one set of components for the public gallery
 * (`GalleryPage.js`, the reference) and the private one
 * (`PrivateGalleryGrid.js`), so that both lists are presented alike: the filter
 * bar with its search, its date sort and
 * its map toggle, the counter line, the card and the grid are drawn here and
 * nowhere else. A gallery gives them what is its own: where a card leads
 * (`href`), the words of a capture without a target (`noTarget`), the tags
 * of its bar, the noun of its counter. Nothing here writes an address: the
 * private gallery's files and pages are the ones its adapter
 * (`private-gallery/public-shape.js`) and its page hand in.
 */

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3.5 6 5.4-2 6.2 2.05L20.5 4v14l-5.4 2-6.2-2.05-5.4 2V6Z" />
      <path d="M8.9 4v13.95M15.1 6.05V20" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="m5.5 17 4.15-4.35 3.1 2.75 2.4-2.5 3.3 4.1M8.25 8.7h.01" />
    </svg>
  );
}

/**
 * A capture as the sky map places it: at its first target's catalogue
 * position, linked to `href`.
 */
export function mapTargetOf(capture, { href, noTarget }) {
  const first = capture.targets?.[0];
  return {
    id: capture.id,
    title: publicCaptureTitle(capture, noTarget),
    objects: first ? [first.designation] : [],
    stellarium: first ? { source: first.designation } : undefined,
    coordinate:
      Number.isFinite(first?.ra) && Number.isFinite(first?.dec)
        ? { ra: first.ra, dec: first.dec }
        : null,
    href,
    imageUrl: capture.media.thumbnail,
    previewUrl: capture.media.thumbnail,
    telescope: capture.telescope,
  };
}

/**
 * One card of a gallery (`HomeGalleryWide`): the capture as the public
 * gallery says it (`public-capture-view.js`).
 */
export function GalleryCaptureCard({
  capture,
  locale,
  noTarget,
  href,
  onOpen,
}) {
  const title = publicCaptureTitle(capture, noTarget);
  const exposure = capture.exposure;
  return (
    <article className="card">
      <a href={href} onClick={onOpen}>
        <span className="card-image">
          {capture.media.thumbnail ? (
            <img src={capture.media.thumbnail} alt="" loading="lazy" />
          ) : (
            // No file yet (no thumbnail made): a neutral placeholder.
            <span className="card-image-placeholder">
              <ImageIcon size={30} />
            </span>
          )}
          {/* G10: the count badge is the number of versions of a capture,
              drawn only above one; a capture has no versions today. */}
        </span>
        <span className="card-copy">
          <span className="card-kicker">
            {[
              capture.tag && localizedTag(capture.tag, locale),
              capture.telescope,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <strong>{title}</strong>
          <small>{publicCaptureAliases(capture)}</small>
          <span className="card-meta">
            {exposure && (
              <>
                {exposure.frames} × {exposure.seconds} s (
                {formatDuration(exposure.totalSeconds, locale)})
                <br />
              </>
            )}
            {formatNightMonths(
              capture.nightMonth,
              capture.nightMonthEnd,
              locale,
            )}
          </span>
          {capture.signature && (
            <span className="card-signature">
              <PersonIcon />
              {capture.signature}
            </span>
          )}
          <span className="card-tags">
            {capture.tags.map((item) => (
              <span key={item}>{localizedTag(item, locale)}</span>
            ))}
          </span>
        </span>
      </a>
    </article>
  );
}

/** The grid of cards (`.gallery`); a gallery's own rows go in `children`. */
export function GalleryGrid({ busy = false, children }) {
  return (
    <section className="gallery" aria-live="polite" aria-busy={busy}>
      {children}
    </section>
  );
}

/**
 * The tools of a gallery: the filter bar (« Toutes » then the tags in
 * `filters`, `[{ value, label }]`), the search, the date sort and the toggle
 * between the cards and the sky map. The search opens and closes here; what
 * is searched, sorted and shown is the gallery's.
 */
export function GalleryTools({
  locale,
  filters,
  activeFilter,
  onFilter,
  query,
  onQuery,
  newestFirst,
  onSort,
  view,
  onView,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="gallery-tools">
      <div className="filters">
        {[{ value: "", label: message(locale, "all") }, ...filters].map(
          (candidate) => (
            <button
              className={`filter-tag${candidate.value === activeFilter ? " is-active" : ""}`}
              key={candidate.value || "all"}
              type="button"
              aria-pressed={candidate.value === activeFilter}
              onClick={() => onFilter(candidate.value)}
            >
              {candidate.label}
            </button>
          ),
        )}
      </div>
      <div className={`search-control${searchOpen ? " is-open" : ""}`}>
        <button
          className="search-toggle"
          type="button"
          aria-label={message(locale, "search")}
          onClick={() => setSearchOpen((value) => !value)}
        >
          ⌕
        </button>
        <input
          aria-label={message(locale, "searchTarget")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={message(locale, "search")}
        />
      </div>
      <button
        className="date-sort"
        type="button"
        aria-label={message(locale, "reverseDate")}
        onClick={onSort}
      >
        {newestFirst ? "↓" : "↑"}
      </button>
      <button
        className="gallery-mode-toggle"
        type="button"
        aria-pressed={view === "map"}
        aria-label={message(
          locale,
          view === "map" ? "showGallery" : "showSkyMap",
        )}
        title={message(locale, view === "map" ? "showGallery" : "showSkyMap")}
        onClick={() => onView(view === "map" ? "gallery" : "map")}
      >
        {view === "map" ? <GalleryIcon /> : <MapIcon />}
      </button>
    </div>
  );
}

/**
 * The line under the tools: the « Mise à jour » status while the list
 * reloads, and « N / N » with the gallery's `noun` (« captures publiques »,
 * « captures ») once it shows results.
 */
export function GalleryFilterSummary({
  locale,
  updating = false,
  count = null,
  total = 0,
  noun,
}) {
  return (
    <div className="gallery-filter-summary">
      {updating && (
        <span className="gallery-filter-status" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 8 8" />
          </svg>
          {message(locale, "galleryUpdating")}
        </span>
      )}
      {count !== null && (
        <output className="gallery-filter-count" aria-live="polite">
          {count} / {total} {noun}
        </output>
      )}
    </div>
  );
}
