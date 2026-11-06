const nasaMediaUsageUrl =
  "https://www.nasa.gov/nasa-brand-center/images-and-media/";

// A crop the import applies to the downloaded picture: `left-half` keeps the
// left half of a comparison board (two views side by side, a white rule
// between them), without the rule.
type SolarSystemImageCrop = "left-half";

type SolarSystemImageSource = {
  targetId: string;
  nasaId: string;
  title: string;
  file?: string;
  assetVariant?: string;
  crop?: SolarSystemImageCrop;
};
type SolarSystemImageReference = {
  file: string;
  source: string;
  sourceUrl: string;
  assetUrl: string;
  title: string;
  credit: string;
  license: string;
  licenseUrl: string;
  crop?: SolarSystemImageCrop;
};

// NASA Image and Video Library records are kept as data. The files they
// describe ship with the code in `examples/target-library-images/` (beside
// their CREDITS.md and SOURCES.json, which a test keeps equal to these
// records); `npm run import:solar-system-images` downloads them again, into a
// portal's runtime folder or, with `--bundle`, into that shipped folder.
export const solarSystemImageSources: readonly SolarSystemImageSource[] = [
  {
    targetId: "solar-system-sun",
    nasaId: "GSFC_20171208_Archive_e002069",
    title: "SDO AIA full-disk view of a launching filament",
  },
  {
    targetId: "solar-system-moon",
    nasaId: "GSFC_20171208_Archive_e001861",
    title: "Full Moon — Lunar Reconnaissance Orbiter visualization",
  },
  {
    targetId: "solar-system-mercury",
    nasaId: "PIA16853",
    title: "Colors of the innermost planet",
  },
  {
    targetId: "solar-system-venus",
    nasaId: "PIA23791",
    title: "Venus",
    // PIA23791 is a comparison board: the natural view on the left, the
    // contrast-enhanced one on the right, a white rule between them.
    crop: "left-half",
  },
  {
    targetId: "solar-system-earth",
    file: "solar-system-earth-blue-marble.jpg",
    nasaId: "PIA18033",
    title: "Blue Marble Earth",
  },
  {
    targetId: "solar-system-mars",
    nasaId: "PIA00407",
    title: "Mars",
  },
  {
    targetId: "solar-system-jupiter",
    nasaId: "PIA01509",
    title: "Jupiter",
    assetVariant: "thumb",
  },
  {
    targetId: "solar-system-saturn",
    nasaId: "PIA02225",
    title: "Saturn",
  },
  {
    targetId: "solar-system-uranus",
    nasaId: "PIA18182",
    title: "Uranus",
  },
  {
    targetId: "solar-system-neptune",
    nasaId: "PIA01492",
    title: "Neptune",
  },
  {
    targetId: "solar-system-pluto",
    nasaId: "PIA19952",
    title: "The rich color variations of Pluto",
  },
];

export function solarSystemImageFor(
  targetId: string,
): SolarSystemImageReference | null {
  const source = solarSystemImageSources.find(
    (entry) => entry.targetId === targetId,
  );
  if (!source) return null;
  const variant = source.assetVariant || "small";
  return {
    file: source.file || `${source.targetId}.jpg`,
    source: "NASA Image and Video Library",
    sourceUrl: `https://images.nasa.gov/details/${source.nasaId}`,
    assetUrl: `https://images-assets.nasa.gov/image/${source.nasaId}/${source.nasaId}~${variant}.jpg`,
    title: source.title,
    credit: "NASA",
    license: "NASA media usage guidelines",
    licenseUrl: nasaMediaUsageUrl,
    ...(source.crop ? { crop: source.crop } : {}),
  };
}
