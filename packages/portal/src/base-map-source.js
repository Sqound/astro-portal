// The dark base map of the web's two geographic maps (the place dialog and the
// light-pollution map): ONE place that says where the base tiles come from,
// what credit they carry and how far they zoom.
//
// Licence terms read on 2026-10-05: CARTO Dark Matter ("dark_all") is free
// up to 1 000 000 tile requests per UTC month, with a CARTO-issued API
// key (https://carto.com/legal/basemap-terms/, 3.b, 8, 12), the
// credit "© OpenStreetMap contributors, © CARTO" visible on the map and not
// behind a click (https://carto.com/attributions), no tile kept on a device
// more than 30 days, no bulk download, no server-side proxy or cache (9.c).
// CARTO may suspend a key at any time (3.c). A key is therefore a deployment
// setting, never a value of the repository: with no key configured the base is
// OpenStreetMap's own standard tiles, darkened by a display filter — no new
// source, no new licence.
//
// The key is read from `NEXT_PUBLIC_CARTO_BASEMAP_KEY` at build time.

export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
export const CARTO_ATTRIBUTION_URL = "https://carto.com/attribution/";

/** OpenStreetMap's standard tiles; the display filter makes them dark. */
export const OSM_DARKENED_SOURCE = Object.freeze({
  id: "osm-darkened",
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  maxNativeZoom: 19,
  darkFilter: true,
  credits: Object.freeze([
    Object.freeze({ text: "OpenStreetMap", href: OSM_COPYRIGHT_URL }),
  ]),
});

/** CARTO Dark Matter, for a key that CARTO issued. */
export function cartoDarkMatterSource(key) {
  return Object.freeze({
    id: "carto-dark-matter",
    urlTemplate: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
    maxNativeZoom: 19,
    darkFilter: false,
    credits: Object.freeze([
      Object.freeze({ text: "OpenStreetMap", href: OSM_COPYRIGHT_URL }),
      Object.freeze({ text: "CARTO", href: CARTO_ATTRIBUTION_URL }),
    ]),
  });
}

/** The source for a key: CARTO Dark Matter with one, else OSM darkened. */
export function baseMapSourceFor(key) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed ? cartoDarkMatterSource(trimmed) : OSM_DARKENED_SOURCE;
}

/** The credit as plain text: « © OpenStreetMap contributors, © CARTO ». */
export function baseMapCreditText(source) {
  const [first, ...rest] = source.credits;
  return [
    `© ${first.text} contributors`,
    ...rest.map((credit) => `© ${credit.text}`),
  ].join(", ");
}

/** The credit as HTML (Leaflet-free, escaped), each name linked. */
export function baseMapCreditHtml(source) {
  const link = (credit) =>
    `<a href="${credit.href}" target="_blank" rel="noopener noreferrer">${credit.text}</a>`;
  const [first, ...rest] = source.credits;
  return [
    `© ${link(first)} contributors`,
    ...rest.map((credit) => `© ${link(credit)}`),
  ].join(", ");
}

/** The CSS class of a tile layer that needs the display filter. */
export const BASE_MAP_DARK_FILTER_CLASS = "base-map-dark-filter";

/** The base the web uses: decided once, at build time. */
export const BASE_MAP_SOURCE = baseMapSourceFor(
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY
    : undefined,
);
