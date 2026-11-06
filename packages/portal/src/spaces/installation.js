import { createHash } from "node:crypto";

/**
 * The device a sign-in describes (sign-in.schema.json `device`): the
 * application, its installation identifier, the name shown in « Mes
 * appareils », the platform, the model and an optional proof that the
 * device is genuine. `null` when it is not a description.
 */
export const APPLICATIONS = ["planner", "sync"];
export const PLATFORMS = ["ios", "android", "macos", "windows", "linux"];
export const NAME_MAX_LENGTH = 120;

/** A name of « Mes appareils »: 1 to 120 characters once trimmed, else `null`. */
export function deviceName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= NAME_MAX_LENGTH ? name : null;
}

/**
 * The proof of a device: a token the platform produced, under the name of
 * its kind (`^[a-z-]{1,40}$`). The core keeps it as it came and never reads
 * it: a server with a rule that rests on a platform's proof verifies the
 * kinds it knows; any other, and a malformed one, is treated as no proof
 * (the proof is optional and a malformed one never stops a sign-in).
 */
export const PROOF_TOKEN_MAX_LENGTH = 16384;
export function deviceProof(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const token = typeof value.token === "string" ? value.token.trim() : "";
  if (
    typeof value.kind === "string" &&
    /^[a-z-]{1,40}$/.test(value.kind) &&
    token &&
    token.length <= PROOF_TOKEN_MAX_LENGTH
  )
    return { kind: value.kind, token };
  return null;
}

export function validDevice(device) {
  if (!device || typeof device !== "object" || Array.isArray(device))
    return null;
  const name = deviceName(device.name);
  if (
    !APPLICATIONS.includes(device.application) ||
    typeof device.installationId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(device.installationId) ||
    !name ||
    !PLATFORMS.includes(device.platform)
  )
    return null;
  return {
    application: device.application,
    installationId: device.installationId,
    installationHash: installationHash(device.installationId),
    name,
    platform: device.platform,
    model:
      typeof device.model === "string" && device.model.trim()
        ? device.model.trim().slice(0, NAME_MAX_LENGTH)
        : null,
    proof: deviceProof(device.proof),
  };
}

/**
 * What the service keeps of an installation identifier: its SHA-256. The
 * identifier itself is sent by the application at sign-in and never kept,
 * listed or logged: whoever knew it could present the phone as theirs.
 * Unkeyed on purpose: the identifier is random (at least 16 characters of
 * 64), and its digest must survive a change of the service's sign-in key.
 */
export function installationHash(installationId) {
  return createHash("sha256")
    .update(`astro-portal-installation\u0000${installationId}`)
    .digest("hex");
}
