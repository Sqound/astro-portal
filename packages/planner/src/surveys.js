// CTA-FRAM is a colour all-sky survey (PNG HiPS), so it gives the wide-field
// orientation view a continuous photographic backdrop.
export const widePlannerSurveyUrl =
  "https://alasky.cds.unistra.fr/fzu.cz/fzu.cz_P_CTA-FRAM_survey_color/";

// DSS colour has far finer tiles, which remain sharp for a telescope-scale
// view but do not form a useful all-sky image at 120°.
export const detailedPhotographicSurveyUrl =
  "https://alasky.cds.unistra.fr/DSS/DSSColor/";

// The DSS2 red plate survey is monochrome. It keeps the same detailed HiPS
// navigation while offering a much closer visual-observation impression than
// the false-colour composition.
export const detailedVisualSurveyUrl =
  "https://alasky.cds.unistra.fr/DSS/DSS2Merged/";

export function plannerSurveyUrl({
  detailed = false,
  visualMode = false,
} = {}) {
  if (!detailed) return widePlannerSurveyUrl;
  return visualMode ? detailedVisualSurveyUrl : detailedPhotographicSurveyUrl;
}

export function framingSurveyId({ visualMode = false } = {}) {
  return visualMode ? "CDS/P/DSS2/red" : "CDS/P/DSS2/color";
}

// The detailed survey has far finer tiles than the all-sky orientation layer,
// so it is only loaded after the user has meaningfully zoomed into the sky.
export const detailedSurveyFovDegrees = 18;

export function detailedSurveyVisibleAtZoom(zoomDegrees) {
  return zoomDegrees <= detailedSurveyFovDegrees;
}

// The saved framing's preview image, generated once at creation time from the
// survey active in the current observation mode. Extracted from
// `framingPreviewUrl` (`components/PlannerNightSkyMap.js`).
//
// It is the sky under the frame and nothing more (the preview never carries the
// editor's red frame): a survey cutout, never a capture of the map, so no
// frame, panel grid, target or reticle can be inside it.
//
// It covers exactly the field, with no margin around it where a frame could
// be guessed: the smallest square centred on the framing that holds the frame
// -- `field`, the whole surface for a mosaic -- turned by `angleDegrees`
// (N.I.N.A.'s position angle, north towards east; the bounding box is the same
// whichever way the frame turns, and no rotation is asked of the service). A
// square, because `hips2fits` measures `fov` along one side of the picture and
// a picture as wide as it is tall leaves no doubt which one; the card crops it
// to the field's own proportions (`framingPreviewView`, `framings.js`).
export function framingPreviewUrl(
  center,
  field,
  visualMode = false,
  angleDegrees = 0,
) {
  const width = Number(field?.width);
  const height = Number(field?.height);
  if (
    !Number.isFinite(Number(center?.ra)) ||
    !Number.isFinite(Number(center?.dec)) ||
    !(width > 0) ||
    !(height > 0)
  )
    return null;
  const angle = Number(angleDegrees);
  const turn = ((Number.isFinite(angle) ? angle : 0) * Math.PI) / 180;
  const across = Math.abs(Math.cos(turn));
  const down = Math.abs(Math.sin(turn));
  // The frame's bounding box once turned: the picture has to hold all of it.
  const boundsWidth = width * across + height * down;
  const boundsHeight = width * down + height * across;
  const parameters = new URLSearchParams({
    hips: framingSurveyId({ visualMode }),
    ra: Number(center.ra).toFixed(6),
    dec: Number(center.dec).toFixed(6),
    fov: Math.max(boundsWidth, boundsHeight).toFixed(3),
    width: "640",
    height: "640",
    projection: "TAN",
    format: "jpg",
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${parameters}`;
}
