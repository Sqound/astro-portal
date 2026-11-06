import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { metadataDir, portalConfig } from "./config.server.js";
import { ownerMaps, scanImagePairs, targetForPair } from "./catalog.server.js";
import { safePath } from "./filesystem.server.js";

async function readDocuments() {
  let files = [];
  try {
    files = (await readdir(metadataDir)).filter((file) =>
      file.endsWith(".json"),
    );
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (file) => ({
      file,
      data: JSON.parse(await readFile(join(metadataDir, file), "utf8")),
    })),
  );
}

const archiveDirectory = () => join(metadataDir, ".archives");

async function readArchives() {
  let files = [];
  try {
    files = (await readdir(archiveDirectory())).filter((file) =>
      file.endsWith(".json"),
    );
  } catch {
    return [];
  }
  return Promise.all(
    files.map(async (file) => {
      try {
        return JSON.parse(
          await readFile(join(archiveDirectory(), file), "utf8"),
        );
      } catch {
        return null;
      }
    }),
  ).then((entries) => entries.filter(Boolean));
}

async function writeJson(destination, data) {
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, destination);
}

function recordsIn(document) {
  return Array.isArray(document.data.targets)
    ? document.data.targets
    : [document.data];
}

export async function adminCatalogData() {
  const documents = await readDocuments();
  const records = documents
    .flatMap(recordsIn)
    .filter((record) => record?.id)
    .sort((left, right) => left.title.localeCompare(right.title, "fr"));
  const byId = new Map(records.map((record) => [record.id, record]));
  const owners = ownerMaps(byId);
  const assets = (await scanImagePairs()).map((pair) => {
    const { baseName, folder, png, tiff } = pair;
    return {
      baseName,
      folder,
      png,
      tiff,
      ownerId: targetForPair(pair, byId, owners) || null,
      imageUrl: png
        ? `/images/${png.split("/").map(encodeURIComponent).join("/")}`
        : null,
    };
  });
  const archives = (await readArchives())
    .filter((entry) => entry?.record?.id)
    .sort((left, right) =>
      String(right.archivedAt).localeCompare(String(left.archivedAt)),
    );
  return { records, assets, archives };
}

async function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("La fiche doit être un objet JSON.");
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(record.id || ""))
    throw new Error(
      "L’identifiant doit contenir 2 à 80 caractères minuscules, chiffres ou tirets.",
    );
  if (typeof record.title !== "string" || !record.title.trim())
    throw new Error("Le titre est obligatoire.");
  const configuration = await portalConfig();
  const missingTitle = configuration.supportedLocales.find(
    (locale) =>
      !String(
        locale === configuration.defaultLocale
          ? record.title
          : record.content?.[locale]?.title,
      ).trim(),
  );
  if (missingTitle)
    throw new Error(
      `Le titre en ${missingTitle.toUpperCase()} est obligatoire.`,
    );
  if (!Array.isArray(record.assetBaseNames) || !record.assetBaseNames.length)
    throw new Error("Sélectionnez au moins une image.");
  JSON.stringify(record);
}

export async function saveMetadataRecord(record, originalId = null) {
  await validateRecord(record);
  const documents = await readDocuments();
  const occurrences = documents.flatMap((document) =>
    recordsIn(document).map((item) => ({ document, item })),
  );
  const conflict = occurrences.find(
    ({ item }) => item.id === record.id && item.id !== originalId,
  );
  if (conflict) throw new Error(`L’identifiant ${record.id} existe déjà.`);
  const existing = occurrences.find(
    ({ item }) => item.id === (originalId || record.id),
  );
  let file;
  let data;
  if (existing) {
    file = existing.document.file;
    data = Array.isArray(existing.document.data.targets)
      ? {
          ...existing.document.data,
          targets: existing.document.data.targets.map((item) =>
            item.id === existing.item.id ? record : item,
          ),
        }
      : record;
  } else {
    file = `${record.id}.json`;
    data = record;
  }
  await mkdir(metadataDir, { recursive: true });
  const destination = safePath(metadataDir, file);
  if (!destination) throw new Error("Chemin de métadonnées invalide.");
  await writeJson(destination, data);
  return record;
}

export async function archiveMetadataRecord(id) {
  const recordId = String(id || "").trim();
  const documents = await readDocuments();
  const match = documents
    .flatMap((document) =>
      recordsIn(document).map((record) => ({ document, record })),
    )
    .find(({ record }) => record.id === recordId);
  if (!match) throw new Error("La capture est introuvable.");

  const nextData = Array.isArray(match.document.data.targets)
    ? {
        ...match.document.data,
        targets: match.document.data.targets.filter(
          (record) => record.id !== recordId,
        ),
      }
    : null;
  const destination = safePath(metadataDir, match.document.file);
  if (!destination) throw new Error("Chemin de métadonnées invalide.");
  if (nextData) await writeJson(destination, nextData);
  else {
    // Keep the source file private and reversible: a deliberately empty
    // document is ignored by the public catalogue and lets restoration retain
    // its original path without deleting any asset.
    await writeJson(destination, { targets: [] });
  }

  await mkdir(archiveDirectory(), { recursive: true, mode: 0o700 });
  const archivedAt = new Date().toISOString();
  const archive = {
    record: match.record,
    sourceFile: match.document.file,
    archivedAt,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  await writeJson(join(archiveDirectory(), `${recordId}.json`), archive);
  return archive;
}

export async function restoreArchivedMetadataRecord(id) {
  const recordId = String(id || "").trim();
  const archivePath = safePath(archiveDirectory(), `${recordId}.json`);
  if (!archivePath) throw new Error("Archive invalide.");
  let archive;
  try {
    archive = JSON.parse(await readFile(archivePath, "utf8"));
  } catch {
    throw new Error("L’archive est introuvable.");
  }
  if (archive?.record?.id !== recordId || !archive.sourceFile)
    throw new Error("Archive invalide.");
  const destination = safePath(metadataDir, archive.sourceFile);
  if (!destination) throw new Error("Chemin de métadonnées invalide.");
  let existing = null;
  try {
    existing = JSON.parse(await readFile(destination, "utf8"));
  } catch {
    // A missing source is still recoverable as a standalone record.
  }
  const data = Array.isArray(existing?.targets)
    ? {
        ...existing,
        targets: [
          ...existing.targets.filter((record) => record.id !== recordId),
          archive.record,
        ],
      }
    : archive.record;
  await mkdir(metadataDir, { recursive: true });
  await writeJson(destination, data);
  await rename(archivePath, `${archivePath}.restored-${Date.now()}`);
  return archive.record;
}
