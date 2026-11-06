import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { catalog } from "./catalog.server.js";
import { metadataDir } from "./config.server.js";
import { equipmentReader, operatorSpaceId } from "./equipment-reader.server.js";

function dateKey(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function captureRank(asset, target) {
  return (
    (asset.baseName === target.featured?.baseName ? 8 : 0) +
    (asset.sourceRender === "naturel" ? 4 : 0) +
    (asset.kind === "reference" ? 2 : 0) +
    (asset.kind === "presentation" ? 1 : 0)
  );
}

function instrumentFor(target, source) {
  return (
    source?.telescope ||
    target.equipment?.Télescope ||
    target.equipment?.Telescope ||
    target.equipment?.Instrument ||
    null
  );
}

function fallbackInstrumentType(target, source) {
  return source?.telescope ||
    target.equipment?.Télescope ||
    target.equipment?.Telescope
    ? "telescope"
    : "other";
}

function instrumentType(value) {
  const type = String(value || "")
    .trim()
    .toLowerCase();
  return [
    "telescope",
    "guide-scope",
    "camera",
    "eyepiece",
    "lens",
    "filter",
    "mount",
    "controller",
  ].includes(type)
    ? type
    : "other";
}

function compactNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits)).toString();
}

function equipmentDetails(item) {
  const specification = item?.specifications || {};
  if (item?.type === "telescope") {
    const aperture = compactNumber(specification.apertureMm);
    const focalLength = compactNumber(specification.focalLengthMm);
    const focalRatio =
      compactNumber(specification.focalRatio, 1) ||
      (aperture && focalLength
        ? compactNumber(Number(focalLength) / Number(aperture), 1)
        : null);
    return [
      aperture && `${aperture} mm`,
      focalLength && `${focalLength} mm`,
      focalRatio && `f/${focalRatio}`,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (item?.type === "camera") {
    const width = compactNumber(specification.sensorWidthMm);
    const height = compactNumber(specification.sensorHeightMm);
    const pixelSize = compactNumber(specification.pixelSizeUm);
    return [
      width && height && `${width} × ${height} mm`,
      pixelSize && `${pixelSize} µm`,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (item?.type === "lens") {
    const multiplier = compactNumber(specification.multiplier);
    return multiplier ? `${multiplier}×` : "";
  }
  if (item?.type === "filter") {
    const bandpass = String(specification.bandpass || "").trim();
    const bandwidth = compactNumber(specification.bandwidthNm);
    const diameter = compactNumber(specification.diameterMm);
    return [
      bandpass,
      bandwidth && `${bandwidth} nm`,
      diameter && `${diameter} mm`,
    ]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function sessionTimestamp(value) {
  const match = String(value || "").match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}

function qualityWindow(quality) {
  const points = Array.isArray(quality?.series) ? quality.series : [];
  const starts = points
    .map((point) => Date.parse(point.fromUtc || point.dateUtc))
    .filter(Number.isFinite);
  const ends = points
    .map((point) => Date.parse(point.toUtc || point.dateUtc))
    .filter(Number.isFinite);
  return {
    startedAt: starts.length ? Math.min(...starts) : null,
    endedAt: ends.length ? Math.max(...ends) : null,
  };
}

function captureWindow(source, asset, totalSeconds) {
  const sourceStartedAt = sessionTimestamp(
    source?.startedAt || asset.startedAt,
  );
  const recordedEnd = sessionTimestamp(
    source?.finishedAt || source?.endedAt || asset.finishedAt || asset.endedAt,
  );
  const measured = qualityWindow(asset.captureQuality);
  const startedAt = sourceStartedAt ?? measured.startedAt;
  const computedEnd =
    startedAt !== null && Number.isFinite(totalSeconds) && totalSeconds > 0
      ? startedAt + totalSeconds * 1000
      : null;
  return {
    startedAt,
    endedAt: recordedEnd ?? measured.endedAt ?? computedEnd,
    timeZone:
      sourceStartedAt === null && measured.startedAt !== null ? "UTC" : null,
  };
}

async function sessionMetadata() {
  let files = [];
  try {
    files = (await readdir(metadataDir)).filter((file) =>
      file.endsWith(".json"),
    );
  } catch {
    return new Map();
  }
  const documents = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(join(metadataDir, file), "utf8")),
    ),
  );
  return new Map(
    documents
      .flatMap((document) => document.sessions || [])
      .filter((session) => session?.id)
      .map((session) => [session.id, session]),
  );
}

/**
 * Builds public nightly journal entries. Session metadata is optional: an
 * ordinary dated capture still becomes one entry for its target and night.
 */
export function buildObservationNights(
  targets,
  sourceSessions = new Map(),
  captureEquipment = new Map(),
  { includeQuality = true } = {},
) {
  const captures = new Map();
  for (const target of targets) {
    for (const asset of target.assets || []) {
      if (
        !asset.imageUrl ||
        asset.kind === "progression" ||
        asset.kind === "sky-map"
      )
        continue;
      const sessionId = asset.session?.id || null;
      const key = `${target.id}:${sessionId || asset.date || asset.baseName}`;
      const current = captures.get(key);
      if (
        !current ||
        captureRank(asset, target) > captureRank(current.asset, target)
      )
        captures.set(key, { target, asset, sessionId });
    }
  }

  const nights = new Map();
  for (const { target, asset, sessionId } of captures.values()) {
    const source = sessionId ? sourceSessions.get(sessionId) : null;
    const nightDate = dateKey(source?.startedAt || asset.date);
    if (!nightDate) continue;
    const night = nights.get(nightDate) || {
      date: nightDate,
      totalSeconds: 0,
      sessionIds: new Set(),
      instruments: new Set(),
      instrumentTypes: new Map(),
      instrumentSessionCounts: new Map(),
      instrumentDetails: new Map(),
      temperatures: [],
      humidities: [],
      targets: new Map(),
      captureStartedAt: null,
      captureEndedAt: null,
      captureTimeZone: null,
    };
    const fallbackId = `${target.id}:${asset.date || asset.baseName}`;
    const captureId = sessionId || fallbackId;
    if (night.sessionIds.has(captureId)) continue;
    night.sessionIds.add(captureId);
    const totalSeconds = Number(
      source?.totalSeconds || asset.totalSeconds || 0,
    );
    const timing = captureWindow(source, asset, totalSeconds);
    night.totalSeconds += totalSeconds;
    if (
      timing.startedAt !== null &&
      (night.captureStartedAt === null ||
        timing.startedAt < night.captureStartedAt)
    )
      night.captureStartedAt = timing.startedAt;
    if (
      timing.endedAt !== null &&
      (night.captureEndedAt === null || timing.endedAt > night.captureEndedAt)
    )
      night.captureEndedAt = timing.endedAt;
    if (timing.timeZone) night.captureTimeZone = timing.timeZone;
    const assigned = captureEquipment.get(target.id) || [];
    const assignedInstruments = assigned
      .map((item) => ({
        name: item.name,
        details: equipmentDetails(item),
        type: instrumentType(item.type),
      }))
      .filter((item) => item.name);
    const instrumentEntries = assignedInstruments.length
      ? assignedInstruments
      : [instrumentFor(target, source)].filter(Boolean).map((name) => ({
          name,
          type: fallbackInstrumentType(target, source),
        }));
    const instruments = instrumentEntries.map((item) => item.name);
    for (const instrument of instruments) {
      night.instruments.add(instrument);
      night.instrumentSessionCounts.set(
        instrument,
        (night.instrumentSessionCounts.get(instrument) || 0) + 1,
      );
    }
    instrumentEntries.forEach(({ name, details, type }) => {
      const currentType = night.instrumentTypes.get(name);
      if (!currentType || currentType === "other")
        night.instrumentTypes.set(name, type);
      if (details) night.instrumentDetails.set(name, details);
    });
    if (Number.isFinite(source?.temperatureC))
      night.temperatures.push(source.temperatureC);
    if (Number.isFinite(source?.humidityPercent))
      night.humidities.push(source.humidityPercent);
    const targetEntry = night.targets.get(target.id) || {
      id: target.id,
      title: target.title,
      // The catalogue's type, for the pictogram that takes the image's place
      // when it is missing.
      typeKey: target.typeKey || null,
      assetId: asset.assetId,
      imageUrl: asset.imageUrl,
      integration: asset.integration,
      totalSeconds: 0,
      sessionCount: 0,
      captureStartedAt: null,
      captureEndedAt: null,
      captureTimeZone: null,
      instruments: new Set(),
      qualityEntries: new Map(),
      rank: captureRank(asset, target),
    };
    targetEntry.totalSeconds += totalSeconds;
    targetEntry.sessionCount += 1;
    instruments.forEach((instrument) =>
      targetEntry.instruments.add(instrument),
    );
    if (
      timing.startedAt !== null &&
      (targetEntry.captureStartedAt === null ||
        timing.startedAt < targetEntry.captureStartedAt)
    )
      targetEntry.captureStartedAt = timing.startedAt;
    if (
      timing.endedAt !== null &&
      (targetEntry.captureEndedAt === null ||
        timing.endedAt > targetEntry.captureEndedAt)
    )
      targetEntry.captureEndedAt = timing.endedAt;
    if (timing.timeZone) targetEntry.captureTimeZone = timing.timeZone;
    if (asset.captureQuality)
      targetEntry.qualityEntries.set(captureId, {
        id: captureId,
        quality: asset.captureQuality,
        captureStartedAt: timing.startedAt,
        captureEndedAt: timing.endedAt,
        captureTimeZone: timing.timeZone,
        instruments,
      });
    if (captureRank(asset, target) > targetEntry.rank) {
      targetEntry.assetId = asset.assetId;
      targetEntry.imageUrl = asset.imageUrl;
      targetEntry.integration = asset.integration;
      targetEntry.rank = captureRank(asset, target);
    }
    night.targets.set(target.id, targetEntry);
    nights.set(nightDate, night);
  }

  const average = (values) =>
    values.length
      ? Math.round(
          (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
        ) / 10
      : null;
  return [...nights.values()]
    .map((night) => ({
      date: night.date,
      totalSeconds: night.totalSeconds,
      sessionCount: night.sessionIds.size,
      targetCount: night.targets.size,
      captureStartedAt: night.captureStartedAt,
      captureEndedAt: night.captureEndedAt,
      captureTimeZone: night.captureTimeZone,
      instruments: [...night.instruments].sort(),
      instrumentTypes: Object.fromEntries(night.instrumentTypes),
      instrumentDetails: Object.fromEntries(night.instrumentDetails),
      instrumentSessionCounts: Object.fromEntries(
        night.instrumentSessionCounts,
      ),
      temperatureC: average(night.temperatures),
      humidityPercent: average(night.humidities),
      targets: [...night.targets.values()]
        .map(({ rank, instruments, qualityEntries, ...target }) => ({
          ...target,
          instruments: [...instruments].sort(),
          qualityEntryCount: qualityEntries.size,
          ...(includeQuality
            ? {
                qualityEntries: [...qualityEntries.values()].sort(
                  (left, right) =>
                    (left.captureStartedAt || 0) -
                    (right.captureStartedAt || 0),
                ),
              }
            : {}),
        }))
        .sort((left, right) => left.title.localeCompare(right.title)),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

async function privateEquipmentAssignments() {
  const repository = await equipmentReader();
  if (!repository) return new Map();
  try {
    // The operator's space only.
    const tenantId = await operatorSpaceId();
    if (!tenantId) return new Map();
    const byId = new Map(
      (await repository.listEquipment(tenantId)).map((equipment) => [
        equipment.id,
        equipment,
      ]),
    );
    return new Map(
      Object.entries(await repository.equipmentAssignments(tenantId)).map(
        ([captureId, equipmentIds]) => [
          captureId,
          equipmentIds.map((id) => byId.get(id)).filter(Boolean),
        ],
      ),
    );
  } catch {
    return new Map();
  }
}

export async function observationNights(options = {}) {
  const [targets, sessions, equipment] = await Promise.all([
    catalog(options),
    sessionMetadata(),
    privateEquipmentAssignments(),
  ]);
  return buildObservationNights(targets, sessions, equipment, {
    includeQuality: options.includeQuality !== false,
  });
}
