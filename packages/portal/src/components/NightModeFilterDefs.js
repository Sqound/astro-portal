import {
  nightModeBootScript,
  nightModeDefaultRelativeLuminance,
  nightModeFilterId,
  nightModeFilterValues,
  nightModeMatrixId,
} from "portal/night-mode.js";

// The red night mode's filter, rendered once at the very start of the root
// layout's `<body>`: the SVG filter that holds the colour matrix, then the
// script that reads this browser's setting and, when the mode is on, sets
// `data-night-mode` on `<html>` (and the matrix of the chosen intensity)
// before the first paint, so that the page never flashes white. The style
// sheet applies the filter to `<html>` — the root, which unlike any other
// element does not become the containing block of the `position: fixed`
// elements it holds, nor displace the `position: sticky` ones — so it covers
// the header, every page, the maps and the control's own popover while the
// sticky and fixed bars stay where they are. Native modal dialogs and their
// backdrops paint in the top layer: CSS reuses this same SVG matrix on
// `:modal`, while non-modal fallbacks stay under `<html>`.
//
// `color-interpolation-filters="sRGB"`: the web's colour space is sRGB, the
// space the matrix works in; the filter's default (linear RGB) would
// give another luminance.
//
// The matrix and the attribute are changed from outside React (the script
// here, then `applyNightMode`), hence `suppressHydrationWarning`.
export function NightModeFilterDefs() {
  return (
    <>
      <svg
        className="night-mode-filter-defs"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <filter id={nightModeFilterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            id={nightModeMatrixId}
            type="matrix"
            values={nightModeFilterValues(nightModeDefaultRelativeLuminance)}
            suppressHydrationWarning
          />
        </filter>
      </svg>
      <script dangerouslySetInnerHTML={{ __html: nightModeBootScript }} />
    </>
  );
}
