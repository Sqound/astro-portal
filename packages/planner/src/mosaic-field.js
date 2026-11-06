// The footprint of a mosaic grid: what the open core needs to show a saved
// mosaic framing (its preview covers the whole area the panels tile, and a
// plan says "N × M panneaux"). Drawing a mosaic on the map, setting one up
// and exporting its panes are additions of a shell that sells them, registered at
// the planner's points (`portal/planner/extensions.js`).

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Stored settings are deliberately small and independent from the map engine.
// The generated J2000 pane centres are saved with the framing, so an exported
// mosaic does not move when equipment profiles or catalogue data later change.
export function normalizeMosaicSettings(value = {}) {
  // The configuration dialog is opened before the observer has chosen any
  // settings. Treat its explicit `null` as the first-use defaults rather than
  // throwing during the client render (notably destructive on iOS Safari).
  value = value && typeof value === "object" ? value : {};
  return {
    columns: Math.round(clamp(number(value.columns, 2), 1, 6)),
    rows: Math.round(clamp(number(value.rows, 2), 1, 6)),
    overlapPercent: Math.round(clamp(number(value.overlapPercent, 15), 0, 50)),
    // Keep this explicit in the portable format: the map can render a visually
    // upright grid or the individually reprojected J2000 panes without moving
    // the saved export coordinates.
    straighten: value.straighten !== false,
  };
}

export function mosaicField(field, settings) {
  const normalized = normalizeMosaicSettings(settings);
  const width = Math.max(0, number(field?.width, 0));
  const height = Math.max(0, number(field?.height, 0));
  const overlap = normalized.overlapPercent / 100;
  return {
    width: width + Math.max(0, normalized.columns - 1) * width * (1 - overlap),
    height: height + Math.max(0, normalized.rows - 1) * height * (1 - overlap),
  };
}
