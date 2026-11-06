import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeCaptureQuality } from "./capture-quality.js";
import { aggregateCaptureQuality } from "./capture-quality.js";
import { captureQualityDir } from "./config.server.js";

/** Loads only normalized, display-safe metrics; source paths and file names stay private. */
export async function captureQualityMap() {
  let files = [];
  try {
    files = (await readdir(captureQualityDir)).filter((file) =>
      /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(file),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const entries = await Promise.all(
    files.map(async (file) => {
      try {
        const document = JSON.parse(
          await readFile(join(captureQualityDir, file), "utf8"),
        );
        const quality = normalizeCaptureQuality(document);
        if (!quality) return null;
        const declared = Array.isArray(document.portalAssetBaseNames)
          ? document.portalAssetBaseNames.filter((name) =>
              /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name),
            )
          : [];
        return [
          declared.length ? declared : [file.slice(0, -".json".length)],
          quality,
        ];
      } catch {
        return null;
      }
    }),
  );
  const grouped = new Map();
  for (const entry of entries.filter(Boolean)) {
    const [assetBaseNames, quality] = entry;
    for (const baseName of assetBaseNames)
      grouped.set(baseName, [...(grouped.get(baseName) || []), quality]);
  }
  return new Map(
    [...grouped.entries()].map(([baseName, qualities]) => [
      baseName,
      qualities.length === 1
        ? qualities[0]
        : aggregateCaptureQuality(qualities),
    ]),
  );
}
