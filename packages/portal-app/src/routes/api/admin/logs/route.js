import { adminAuthorization } from "../../../../lib/admin.server.js";
import {
  appLogRepository,
  recordBackendLog,
} from "../../../../lib/app-log.server.js";

function forbidden(access) {
  return Response.json(
    {
      error: "Administration non autorisée depuis cette adresse.",
      ip: access.ip || null,
    },
    { status: 403 },
  );
}

export async function GET(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  try {
    const { searchParams } = new URL(request.url);
    const repository = await appLogRepository();
    const logs = await repository?.listAppLogs({
      limit: searchParams.get("limit"),
      level: searchParams.get("level"),
      source: searchParams.get("source"),
      // The start of the event: `probe.` for the plate-solving probe's
      // entries.
      event: searchParams.get("event"),
      // The search by the address of a person: the lines of the
      // space that address owns.
      address: searchParams.get("address"),
      // The diagnostic token a person handed over: the
      // lines of one installation, `mobile` only.
      token: searchParams.get("token"),
    });
    if (!logs) throw new Error("Logging storage is unavailable.");
    return Response.json(
      { logs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    recordBackendLog({
      level: "error",
      event: "admin.logs.read_failed",
      message: error.message || "Unable to read application logs.",
    });
    return Response.json({ error: error.message }, { status: 503 });
  }
}
