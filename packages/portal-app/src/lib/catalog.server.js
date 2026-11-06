import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import {
  imageExtensions,
  imagesDir,
  metadataDir,
  mimeTypes,
  plateSolveDir,
  redactLocations,
  stellariumPreviewsDir,
} from "./config.server.js";
import { fileExists, safePath } from "./filesystem.server.js";
import { plateSolve, wcsSummary } from "./plate-solving.server.js";
import { normalizeSkyQuality } from "portal/sky-quality.js";
import { captureQualityMap } from "./capture-quality.server.js";
import {
  canonicalObjectType,
  taxonomyLabel,
} from "astro-core/catalog-taxonomy.js";
import { publicCaptureEquipment } from "portal/capture-equipment.js";
import { targetKnowledgeFor } from "./target-library.server.js";
import { equipmentReader, operatorSpaceId } from "./equipment-reader.server.js";
import { redactPrivateLocationFields } from "./location-redaction.js";

const moonReferenceNewMoon = Date.parse("2000-01-06T18:14:00Z");
const synodicMonthMs = 29.53058867 * 86400000;

function moonIllumination(date) {
  const elapsed =
    (((Date.parse(date) - moonReferenceNewMoon) % synodicMonthMs) +
      synodicMonthMs) %
    synodicMonthMs;
  const phase = elapsed / synodicMonthMs;
  return Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function localizedRecord(
  record,
  locale = "en",
  applicationDefault = "en",
) {
  const content = record.content || {};
  const selected =
    content[locale] ||
    content[record.defaultLocale] ||
    content[applicationDefault] ||
    {};
  const localizedObject = (key) =>
    selected[key] ? { ...(record[key] || {}), ...selected[key] } : record[key];
  const stellarium = localizedObject("stellarium");
  if (stellarium?.frameNote && !selected.stellarium?.frameNote) {
    const notes = {
      "Cible centrée ; champ du 50P d’environ 3,34°.": {
        en: "Target centred; the 50P field is about 3.34°.",
        ja: "対象を中央に配置。50P の視野は約 3.34°です。",
      },
      "Soleil centré avec un champ d’un degré ; Stellarium ne peut pas tracer le cadre du capteur dans un lien public.":
        {
          en: "Sun centred in a one-degree field; Stellarium cannot draw the sensor frame in a public link.",
          ja: "太陽を 1 度の視野の中央に配置。Stellarium は公開リンク上でセンサー枠を描画できません。",
        },
    };
    stellarium.frameNote =
      notes[stellarium.frameNote]?.[locale] || stellarium.frameNote;
  }
  const relatedLinks =
    selected.relatedLinks ||
    (record.relatedLinks || []).map((link) => {
      if (!/^Voir la publication AstroBin$/.test(link.label || "")) return link;
      return {
        ...link,
        label:
          locale === "ja"
            ? "AstroBin の投稿を見る"
            : locale === "en"
              ? "View the AstroBin post"
              : link.label,
      };
    });
  const rawSkyTarget = localizedObject("skyTarget");
  const skyTarget = rawSkyTarget
    ? {
        ...rawSkyTarget,
        typeKey: canonicalObjectType(rawSkyTarget.type),
        constellationKey: rawSkyTarget.constellation,
        type: taxonomyLabel(rawSkyTarget.type, locale),
        constellation: taxonomyLabel(rawSkyTarget.constellation, locale),
      }
    : rawSkyTarget;
  return {
    ...record,
    categoryKey: record.category,
    category: taxonomyLabel(record.category, locale),
    skyTarget,
    skyMap: localizedObject("skyMap"),
    stellarium,
    relatedLinks,
    title: selected.title || record.title || record.objects?.[0] || record.id,
    description: selected.description || record.description || [],
    technicalDescription:
      selected.technicalDescription || record.technicalDescription || [],
    localizedAliases: [
      ...new Set([...(selected.aliases || []), ...(record.aliases || [])]),
    ],
  };
}

export async function scanImagePairs(directory = imagesDir) {
  const pairs = new Map();
  async function visit(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (!imageExtensions.has(extension)) continue;
      const folder = relative(imagesDir, current).split(sep).join("/");
      const baseName = entry.name.slice(0, -extension.length);
      const key = `${folder}/${baseName}`;
      const pair = pairs.get(key) || {
        baseName,
        folder: folder === "." ? "" : folder,
      };
      const relativePath = `${pair.folder ? `${pair.folder}/` : ""}${entry.name}`;
      if (extension === ".tif" || extension === ".tiff")
        pair.tiff = relativePath;
      else if (
        !pair.png ||
        [".png", ".webp", ".jpg", ".jpeg", ".avif", ".svg"].indexOf(extension) <
          [".png", ".webp", ".jpg", ".jpeg", ".avif", ".svg"].indexOf(
            extname(pair.png).toLowerCase(),
          )
      )
        pair.png = relativePath;
      pairs.set(key, pair);
    }
  }
  await visit(directory);
  return [...pairs.values()].filter((pair) => pair.png || pair.tiff);
}

function inferAsset(pair, canDownload, locale = "fr") {
  const lower = `${pair.folder}/${pair.baseName}`.toLowerCase();
  const counts = [...pair.baseName.matchAll(/(\d+)[x×](\d+)s/gi)].map(
    (match) => ({ frames: Number(match[1]), seconds: Number(match[2]) }),
  );
  const totalSeconds = counts.reduce(
    (sum, item) => sum + item.frames * item.seconds,
    0,
  );
  const sourceRender =
    lower.includes("natural") || lower.includes("naturel")
      ? "naturel"
      : lower.includes("vespera")
        ? "Vespera"
        : "principal";
  const isPresentationContrast =
    pair.folder.split("/").includes("presentation") ||
    lower.includes("presentationcontrast");
  const labels = {
    en: {
      natural: "Natural rendering",
      vespera: "Vespera rendering",
      presentation: "presentation",
      raw: "raw",
      main: "Main version",
      curve: "colour curve",
    },
    ja: {
      natural: "自然仕上げ",
      vespera: "Vespera 仕上げ",
      presentation: "プレゼンテーション",
      raw: "素のカーブ",
      main: "メインバージョン",
      curve: "カーブ",
    },
    fr: {
      natural: "Rendu naturel",
      vespera: "Rendu Vespera",
      presentation: "de présentation",
      raw: "brute",
      main: "Version principale",
      curve: "courbe",
    },
  }[locale] || {
    natural: "Natural rendering",
    vespera: "Vespera rendering",
    presentation: "presentation",
    raw: "raw",
    main: "Main version",
    curve: "colour curve",
  };
  const renderFamily =
    sourceRender === "naturel"
      ? labels.natural
      : sourceRender === "Vespera"
        ? labels.vespera
        : null;
  const colorCurve = isPresentationContrast ? labels.presentation : labels.raw;
  const kind = pair.folder.split("/").includes("progression")
    ? "progression"
    : isPresentationContrast
      ? "presentation"
      : "reference";
  return {
    ...pair,
    assetId: `${pair.folder ? pair.folder.replaceAll("/", "~") : "racine"}:${pair.baseName}`,
    imageUrl: pair.png ? `/images/${encodePath(pair.png)}` : null,
    downloadUrl:
      canDownload && pair.tiff ? `/download/${encodePath(pair.tiff)}` : null,
    variant: renderFamily
      ? `${renderFamily} — ${labels.curve} ${colorCurve}`
      : labels.main,
    sourceRender,
    isPresentationContrast,
    renderFamily,
    colorCurve,
    processingProfile: null,
    kind,
    integration: counts.length
      ? counts
          .map(({ frames, seconds }) => `${frames} × ${seconds} s`)
          .join(" + ")
      : null,
    totalSeconds,
    date: pair.baseName.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null,
  };
}

async function loadMetadata() {
  let files = [];
  try {
    files = (await readdir(metadataDir)).filter((file) =>
      file.endsWith(".json"),
    );
  } catch {
    return new Map();
  }
  const loaded = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(join(metadataDir, file), "utf8")),
    ),
  );
  const records = loaded
    .flatMap((record) => record.targets || [record])
    .filter((record) => record.id);
  return new Map(records.map((record) => [record.id, record]));
}

function skyQualityMap(entries) {
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    return {};
  return Object.fromEntries(
    Object.entries(entries).flatMap(([key, value]) => {
      const quality = normalizeSkyQuality(value);
      return quality ? [[key, quality]] : [];
    }),
  );
}

async function loadSkyQuality() {
  try {
    const document = JSON.parse(
      await readFile(join(metadataDir, "sky-quality.json"), "utf8"),
    );
    if (document.schemaVersion !== 1) return { targets: {}, assets: {} };
    return {
      targets: skyQualityMap(document.targetQuality),
      assets: Object.fromEntries(
        Object.entries(document.assetQuality || {}).flatMap(
          ([targetId, entries]) => {
            const assets = skyQualityMap(entries);
            return Object.keys(assets).length ? [[targetId, assets]] : [];
          },
        ),
      ),
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { targets: {}, assets: {} };
    throw error;
  }
}

export function ownerMaps(metadata) {
  const exact = new Map();
  const byBaseName = new Map();
  for (const record of metadata.values()) {
    const baseNames = new Set([
      ...(record.assetBaseNames || []),
      ...(record.assetMetadata || []).map((asset) => asset.baseName),
      ...(record.progressions || []).map((asset) => asset.baseName),
    ]);
    for (const baseName of baseNames) byBaseName.set(baseName, record.id);
    for (const path of [
      ...(record.assetPaths || []),
      ...(record.assetMetadata || [])
        .map((asset) => asset.path)
        .filter(Boolean),
    ])
      exact.set(path.replace(/\.[^.]+$/, ""), record.id);
  }
  return { exact, byBaseName };
}

export function targetForPair(pair, metadata, owners) {
  const relativeBase = `${pair.folder ? `${pair.folder}/` : ""}${pair.baseName}`;
  const declared =
    owners.exact.get(relativeBase) || owners.byBaseName.get(pair.baseName);
  if (declared) return declared;
  return [...metadata.values()].find((record) =>
    (record.matchPatterns || []).some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(relativeBase);
      } catch {
        return false;
      }
    }),
  )?.id;
}

async function skyMapAsset(group, locale) {
  const declaration =
    group.skyMap ||
    (group.stellarium?.previewFile
      ? { fileName: group.stellarium.previewFile }
      : null);
  const candidates = [
    ...(declaration?.fileName ? [declaration.fileName] : []),
    `${group.id}-sky-map.${locale}.png`,
    `${group.id}-sky-map.png`,
  ];
  const fileName = (
    await Promise.all(
      candidates.map(async (name) =>
        (await fileExists(join(stellariumPreviewsDir, name))) ? name : null,
      ),
    )
  ).find(Boolean);
  if (!fileName) return null;
  const labels = {
    en: {
      variant: "Sky map — Stellarium",
      assetLabel: "Context map with constellations",
    },
    ja: {
      variant: "星図 — Stellarium",
      assetLabel: "星座を含む周辺星図",
    },
    fr: {
      variant: "Carte du ciel — Stellarium",
      assetLabel: "Carte de contexte avec les constellations",
    },
  }[locale] || {
    variant: "Sky map — Stellarium",
    assetLabel: "Context map with constellations",
  };
  return {
    assetId: `stellarium-map:${group.id}`,
    baseName: fileName,
    imageUrl: `/stellarium-previews/${encodePath(fileName)}`,
    kind: "sky-map",
    variant: declaration?.variant || labels.variant,
    assetLabel: declaration?.label || labels.assetLabel,
    date: null,
    integration: null,
    totalSeconds: 0,
    sky: group.featured?.sky || null,
  };
}

async function publishedCaptureEquipment() {
  try {
    const repository = await equipmentReader();
    if (!repository) return new Map();
    // The operator's space only.
    const tenantId = await operatorSpaceId();
    if (!tenantId) return new Map();
    const equipmentById = new Map(
      (await repository.listEquipment(tenantId, { includeArchived: true })).map(
        (item) => [item.id, item],
      ),
    );
    return new Map(
      Object.entries(
        await repository.captureEquipmentAssignments(tenantId),
      ).map(([captureId, assignments]) => [
        captureId,
        publicCaptureEquipment(
          assignments
            .map((assignment) => ({
              ...assignment,
              equipment: equipmentById.get(assignment.equipmentId),
            }))
            .filter((assignment) => assignment.equipment),
        ),
      ]),
    );
  } catch {
    // A catalogue stays available if the private inventory runtime is offline.
    // It must never fall back to legacy free-form public equipment fields.
    return new Map();
  }
}

export async function catalog({
  canDownload = true,
  locale = "en",
  applicationDefault = "en",
  includeTargetKnowledge = false,
  knowledgeTargetId = null,
} = {}) {
  const [metadata, skyQuality, captureQuality, captureEquipment] =
    await Promise.all([
      loadMetadata(),
      loadSkyQuality(),
      captureQualityMap(),
      publishedCaptureEquipment(),
    ]);
  const owners = ownerMaps(metadata);
  const hidden = new Set(
    [...metadata.values()].flatMap((record) => record.hiddenBaseNames || []),
  );
  const grouped = new Map();
  for (const pair of await scanImagePairs()) {
    if (hidden.has(pair.baseName)) continue;
    const targetId = targetForPair(pair, metadata, owners);
    if (!targetId) continue;
    let group = grouped.get(targetId);
    if (!group) {
      const {
        skyQuality: declaredSkyQuality,
        equipment: legacyEquipment,
        ...record
      } = localizedRecord(metadata.get(targetId), locale, applicationDefault);
      const targetSkyQuality =
        normalizeSkyQuality(declaredSkyQuality) || skyQuality.targets[targetId];
      // The gallery is a capture browser, not a deep-sky catalogue. Loading
      // the full local target library belongs to an opened image detail only,
      // so knowledge is resolved for the requested target alone.
      const targetKnowledge =
        includeTargetKnowledge &&
        (!knowledgeTargetId || targetId === knowledgeTargetId)
          ? await targetKnowledgeFor(record, locale)
          : null;
      group = {
        ...record,
        ...(targetKnowledge ? { targetKnowledge } : {}),
        equipment: captureEquipment.get(targetId) || {},
        ...(targetSkyQuality ? { skyQuality: targetSkyQuality } : {}),
        assets: [],
      };
    }
    group.assets.push(inferAsset(pair, canDownload, locale));
    grouped.set(targetId, group);
  }

  const targets = await Promise.all(
    [...grouped.values()].map(async (group) => {
      if (group.moonObservationDates?.length) {
        const values = group.moonObservationDates.map(moonIllumination);
        group.acquisition = {
          ...group.acquisition,
          "Lune (illumination calculée)": [...new Set(values)]
            .map((value) => `${value} %`)
            .join(" / "),
        };
      }
      if (group.currentIntegration) {
        group.assets = group.assets.map((asset) =>
          !asset.integration &&
          ["reference", "presentation"].includes(asset.kind)
            ? {
                ...asset,
                integration: group.currentIntegration,
                totalSeconds: group.currentTotalSeconds || asset.totalSeconds,
              }
            : asset,
        );
      }
      const assetMetadata = new Map(
        (group.assetMetadata || []).map((item) => [item.baseName, item]),
      );
      const progressionMetadata = new Map(
        (group.progressions || []).map((item) => [item.baseName, item]),
      );
      group.assets = await Promise.all(
        group.assets.map(async (asset) => {
          const enriched = {
            ...asset,
            ...(assetMetadata.get(asset.baseName) || {}),
            ...(progressionMetadata.get(asset.baseName) || {}),
          };
          const { skyQuality: declaredSkyQuality, ...withoutSkyQuality } =
            enriched;
          const assetSkyQuality =
            normalizeSkyQuality(declaredSkyQuality) ||
            skyQuality.assets[group.id]?.[asset.baseName] ||
            group.skyQuality;
          return {
            ...withoutSkyQuality,
            ...(assetSkyQuality ? { skyQuality: assetSkyQuality } : {}),
            ...(captureQuality.has(withoutSkyQuality.baseName)
              ? {
                  captureQuality: captureQuality.get(
                    withoutSkyQuality.baseName,
                  ),
                }
              : {}),
            sky:
              withoutSkyQuality.sky ||
              (await wcsSummary(group.id, withoutSkyQuality)),
          };
        }),
      );
      group.assets.sort(
        (left, right) =>
          right.totalSeconds - left.totalSeconds ||
          (right.date || "").localeCompare(left.date || ""),
      );
      group.reference =
        group.assets.find(
          (asset) => asset.baseName === group.referenceBaseName,
        ) ||
        group.assets.find(
          (asset) =>
            asset.kind === "reference" && asset.sourceRender === "naturel",
        ) ||
        group.assets.find((asset) => asset.kind === "reference") ||
        group.assets[0];
      group.featured =
        group.assets.find(
          (asset) =>
            asset.baseName === group.featuredBaseName &&
            (!group.featuredFolder || asset.folder === group.featuredFolder),
        ) || group.reference;
      const map = await skyMapAsset(group, locale);
      group.variants = [
        ...group.assets.filter((asset) => asset.kind !== "progression"),
        ...(map ? [map] : []),
      ];
      const capturesByDate = new Map();
      for (const asset of group.variants.filter(
        (item) => item.imageUrl && item.kind !== "sky-map",
      )) {
        const key = asset.date || asset.baseName;
        const existing = capturesByDate.get(key);
        if (
          !existing ||
          (asset.sourceRender === "naturel" &&
            existing.sourceRender !== "naturel")
        )
          capturesByDate.set(key, asset);
      }
      const captures = [...capturesByDate.values()].sort((left, right) =>
        (right.date || "").localeCompare(left.date || ""),
      );
      group.captureCount = captures.length;
      group.latest = captures[0] || group.featured;
      group.history = group.assets
        .filter((asset) => asset.kind === "progression")
        .map((asset) => ({ ...asset }))
        .sort((left, right) => left.totalSeconds - right.totalSeconds);
      return redactLocations ? redactPrivateLocationFields(group) : group;
    }),
  );
  return targets.sort((left, right) =>
    (right.reference?.date || "").localeCompare(left.reference?.date || ""),
  );
}

// The gallery cards and the personal sky map only need their display and
// pointing data. Keep processing variants, histories and editorial target
// research on the detail route where they are actually read.
function catalogueListAsset(asset) {
  if (!asset) return null;
  return {
    assetId: asset.assetId,
    imageUrl: asset.imageUrl,
    integration: asset.integration || null,
    totalSeconds: asset.totalSeconds || 0,
    date: asset.date || null,
  };
}

export function catalogueListItem(target) {
  return {
    id: target.id,
    category: target.category,
    categoryKey: target.categoryKey,
    title: target.title,
    objects: target.objects || [],
    localizedAliases: target.localizedAliases || [],
    tags: target.tags || [],
    skyTarget: target.skyTarget || null,
    skyMap: target.skyMap || null,
    stellarium: target.stellarium || null,
    acquisition: target.acquisition || null,
    location: target.location || null,
    equipment: target.equipment || {},
    featured: catalogueListAsset(target.featured),
    reference: catalogueListAsset(target.reference),
    latest: catalogueListAsset(target.latest),
    captureCount: target.captureCount || 0,
  };
}

export {
  fileExists,
  imagesDir,
  mimeTypes,
  plateSolve,
  plateSolveDir,
  safePath,
  stellariumPreviewsDir,
};
