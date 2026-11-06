import { appVersion } from "../../../../lib/app-version.server.js";
import {
  BackupInProgressError,
  listRestoreRequests,
  listServiceBackups,
  publicBackupSummary,
  pruneServiceBackups,
  serviceBackupSettings,
  takeServiceBackup,
} from "portal/persistence/backup/service.js";
import { adminAuthorization } from "../../../../lib/admin.server.js";
import { recordBackendLog } from "../../../../lib/app-log.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import { readBodyText } from "portal/api/json-body.js";

// The service's own backups (packages/portal/src/persistence/backup/):
// GET lists them with their state and the restore requests seen on the
// share; POST takes one now. Deliberately nothing serves a backup's content:
// a backup leaves the service only through the storage share, by the
// operator's own credentials.

const noStore = { "Cache-Control": "no-store" };

function forbidden(access) {
  return Response.json(
    {
      error: "Administration non autorisée depuis cette adresse.",
      ip: access.ip || null,
    },
    { status: 403, headers: noStore },
  );
}

const postgresBody = {
  backend: "postgres",
  managedOutsideService: true,
  message:
    "PostgreSQL : la sauvegarde est gérée hors du service (hébergeur de la base).",
  backups: [],
  restoreRequests: [],
};

export async function GET(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  const settings = serviceBackupSettings();
  if (settings.backend === "postgres")
    return Response.json(postgresBody, { headers: noStore });
  if (settings.backend !== "sqlite")
    return Response.json(
      { error: "Aucune base de données n'est configurée." },
      { status: 409, headers: noStore },
    );
  try {
    const [backups, restoreRequests] = await Promise.all([
      listServiceBackups(settings.backupDirectory),
      listRestoreRequests(settings.backupDirectory),
    ]);
    return Response.json(
      {
        backend: "sqlite",
        backups: backups.map(publicBackupSummary),
        restoreRequests,
        retention: {
          keepLatest: settings.keepLatest,
          keepDaily: settings.keepDaily,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Lecture des sauvegardes impossible." },
      { status: 503, headers: noStore },
    );
  }
}

export async function POST(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  if (authEnabled()) {
    try {
      await authService().verifyCsrf(request.headers, access.session);
    } catch {
      return Response.json(
        { error: "Jeton CSRF invalide." },
        { status: 403, headers: noStore },
      );
    }
  }
  const settings = serviceBackupSettings();
  if (settings.backend === "postgres")
    return Response.json(
      { ...postgresBody, error: postgresBody.message },
      { status: 409, headers: noStore },
    );
  if (settings.backend !== "sqlite")
    return Response.json(
      { error: "Aucune base de données n'est configurée." },
      { status: 409, headers: noStore },
    );
  let keep = false;
  try {
    const text = await readBodyText(request);
    if (text.trim()) keep = JSON.parse(text)?.keep === true;
  } catch {
    return Response.json(
      { error: "Corps JSON invalide." },
      { status: 400, headers: noStore },
    );
  }
  try {
    const taken = await takeServiceBackup({
      settings,
      kind: "on-demand",
      keep,
      appVersion: appVersion(),
      appBuild: process.env.ASTRO_PORTAL_BUILD_ID || null,
    });
    recordBackendLog({
      event: "backup.on_demand",
      message: `On-demand backup ${taken.id} taken in ${taken.info.durationMs} ms.`,
    });
    let removed = [];
    try {
      removed = (await pruneServiceBackups({ settings })).removed;
    } catch (error) {
      recordBackendLog({
        level: "warning",
        event: "backup.retention",
        message: `Old backups could not be cleaned up (${error.message}).`,
      });
    }
    const [entry] = (await listServiceBackups(settings.backupDirectory)).filter(
      (candidate) => candidate.id === taken.id,
    );
    return Response.json(
      { backup: publicBackupSummary(entry), removed },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    if (
      error instanceof BackupInProgressError ||
      error?.code === "backup_in_progress"
    )
      return Response.json(
        { error: "Une sauvegarde est déjà en cours." },
        { status: 409, headers: noStore },
      );
    recordBackendLog({
      level: "error",
      event: "backup.on_demand_failed",
      message: error.message || "On-demand backup failed.",
    });
    return Response.json(
      { error: error.message || "Sauvegarde impossible." },
      { status: 500, headers: noStore },
    );
  }
}
