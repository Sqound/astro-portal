import { isWriteRefused } from "portal/capabilities/provider.js";
import { createProjectRepository } from "./repository.js";
import {
  isUuid,
  normalizeProjectWrite,
  ProjectValidationError,
} from "./validation.js";

/**
 * The projects service — the multi-night plans — of the open core. The
 * routes (`/api/v1/projects`) authenticate the caller and hand it the space,
 * the person and the request; every answer of the contract
 * (`project.schema.json`, api/v1.md « Projects ») is decided here.
 *
 * The server never restricts the multi-night plans by itself: without an
 * entitlement provider — a private server — every write is open, always. A
 * composition that gates them hands its provider (through the
 * `planner.projects` extension): writing then needs `planner.mosaic`, the
 * capability of the mosaics (the capability list the API serves stays the
 * same). Reading never needs it, and archiving does not either — a space that
 * lost the capability keeps every project it made and may still tidy them.
 * In a read-only window (`writeAccessFor`) a write stays open when
 * `planner.mosaic` is one the account still holds (`isWriteRefused`);
 * archiving, which asks for no right, was never closed.
 *
 * Every refusal is a `ProjectRequestError` carrying its HTTP `status` and
 * its contractual `body`.
 */
export const PROJECTS_CAPABILITY = "planner.mosaic";

export class ProjectRequestError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "ProjectRequestError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const notFound = () =>
  new ProjectRequestError("project_not_found", "The project was not found.", {
    status: 404,
  });

function requiredIdentifier(value, label) {
  const result = String(value ?? "").trim();
  if (!result)
    throw new ProjectRequestError("invalid_request", `${label} is required.`);
  return result;
}

/** A project id is a UUID; anything else names no project. */
function projectIdentifier(value, { forWrite }) {
  const result = String(value ?? "").trim();
  if (isUuid(result)) return result;
  if (forWrite)
    throw new ProjectRequestError(
      "invalid_request",
      "A project id must be a UUID.",
    );
  throw notFound();
}

function parseIfMatch(value, { creation }) {
  if (value === null || value === undefined || value === "")
    throw new ProjectRequestError(
      "precondition_required",
      "If-Match is required for a project write.",
      { status: 428 },
    );
  const match = /^"(0|[1-9]\d*)"$/.exec(String(value).trim());
  const revision = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(revision) || (!creation && revision === 0))
    throw new ProjectRequestError(
      "invalid_if_match",
      creation
        ? "If-Match must be one quoted non-negative project revision."
        : "If-Match must be one quoted positive project revision.",
    );
  return revision;
}

function outcome(result) {
  if (result.kind === "missing") throw notFound();
  if (result.kind === "conflict")
    throw new ProjectRequestError(
      "project_conflict",
      "The project changed on another surface.",
      { status: 409, project: result.project },
    );
  if (result.kind === "taken")
    throw new ProjectRequestError(
      "invalid_creation_revision",
      "A project already exists at this id.",
      { status: 409 },
    );
  return result;
}

function storageFailure(error) {
  if (error instanceof ProjectRequestError) return error;
  if (error instanceof ProjectValidationError)
    return new ProjectRequestError(error.code, error.message, {
      status: error.status,
    });
  return new ProjectRequestError(
    "project_storage_unavailable",
    "Project storage is unavailable.",
    { status: 503 },
  );
}

/**
 * `entitlementProvider` (optional): `{ capabilitiesFor, writeAccessFor? }`,
 * the gate a composition hands through the `planner.projects` extension;
 * `null` on a private server, which never restricts the multi-night plans.
 *
 * Methods:
 * - list({ tenantId }) -> { projects }
 * - get({ tenantId, projectId }) -> project
 * - write({ tenantId, userId, projectId, ifMatch, body, ... })
 *   -> { resource, created }
 * - archive({ tenantId, userId, projectId, ifMatch, ... })
 *   -> { archived: true, project }
 */
export async function createProjectService({
  driver,
  dialect,
  entitlementProvider = null,
  repository = null,
  now = () => new Date().toISOString(),
}) {
  if (entitlementProvider && !entitlementProvider.capabilitiesFor)
    throw new Error("An entitlement provider answers capabilitiesFor.");
  const store =
    repository || (await createProjectRepository({ driver, dialect }));

  /**
   * A read-only window: nothing the space holds is changed, an archive
   * included. A write that a capability the account still holds authorizes
   * goes through (`isWriteRefused`).
   */
  async function requireWindowClosed(userId) {
    if (!entitlementProvider) return;
    const access = entitlementProvider.writeAccessFor
      ? await entitlementProvider.writeAccessFor(userId)
      : { readOnly: false };
    // The capability asked by the writes is the mosaics' one: holding it
    // keeps the write open in the window.
    if (isWriteRefused(access, PROJECTS_CAPABILITY))
      throw new ProjectRequestError(
        "entitlement_read_only",
        "This space's subscription has ended: multi-night plans stay readable, and can no longer be changed.",
        { status: 403 },
      );
  }

  async function requireWriteRights(userId) {
    if (!entitlementProvider) return;
    const capabilities = await entitlementProvider.capabilitiesFor(userId);
    if (capabilities?.[PROJECTS_CAPABILITY] !== true)
      throw new ProjectRequestError(
        "capability_required",
        "Multi-night plans need another capability.",
        { status: 403, capability: PROJECTS_CAPABILITY },
      );
    await requireWindowClosed(userId);
  }

  return {
    async list({ tenantId }) {
      try {
        return {
          projects: await store.list({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
          }),
        };
      } catch (error) {
        throw storageFailure(error);
      }
    },

    async get({ tenantId, projectId }) {
      try {
        const project = await store.get({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          projectId: projectIdentifier(projectId, { forWrite: false }),
        });
        if (!project) throw notFound();
        return project;
      } catch (error) {
        throw storageFailure(error);
      }
    },

    async write({
      tenantId,
      userId,
      projectId,
      ifMatch,
      body,
      originDeviceId = null,
      originClientInstanceId = null,
    }) {
      try {
        const space = requiredIdentifier(tenantId, "Tenant id");
        const person = requiredIdentifier(userId, "User id");
        await requireWriteRights(person);
        const id = projectIdentifier(projectId, { forWrite: true });
        const expectedRevision = parseIfMatch(ifMatch, { creation: true });
        const { status, fields } = normalizeProjectWrite(body);
        const result = outcome(
          await store.write({
            tenantId: space,
            userId: person,
            projectId: id,
            expectedRevision,
            status,
            fields,
            originDeviceId,
            originClientInstanceId,
            timestamp: now(),
          }),
        );
        return { resource: result.project, created: result.created };
      } catch (error) {
        throw storageFailure(error);
      }
    },

    async archive({
      tenantId,
      userId,
      projectId,
      ifMatch,
      originDeviceId = null,
      originClientInstanceId = null,
    }) {
      try {
        const space = requiredIdentifier(tenantId, "Tenant id");
        const person = requiredIdentifier(userId, "User id");
        // An archive is a change: refused in the read-only window, like a
        // write (it asks no capability, as before).
        await requireWindowClosed(person);
        const id = projectIdentifier(projectId, { forWrite: false });
        const expectedRevision = parseIfMatch(ifMatch, { creation: false });
        const result = outcome(
          await store.archive({
            tenantId: space,
            userId: person,
            projectId: id,
            expectedRevision,
            originDeviceId,
            originClientInstanceId,
            timestamp: now(),
          }),
        );
        return { archived: true, project: result.project };
      } catch (error) {
        throw storageFailure(error);
      }
    },
  };
}
