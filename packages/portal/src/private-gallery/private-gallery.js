import {
  captureMetadata,
  readMetadataInputs,
} from "../captures/capture-metadata-reading.js";
import { createHash } from "node:crypto";
import { captureDetail } from "../captures/capture-detail.js";
import { readCaptureContext } from "../captures/capture-context.js";
import {
  PUBLIC_GALLERY_TAGS,
  nightMonth,
  nightMonthsOf,
  publicEquipment,
  publicGalleryTag,
  publicTarget,
} from "../captures/public-capture-view.js";
import { sharedCopySize } from "../captures/shared-image-size.js";
import { compareCaptureTags } from "../captures/capture-tags.js";
import { arrivalRanks } from "../captures/capture-variants.js";
import {
  generatedTexts,
  generatedTextsOfRow,
} from "../captures/image-texts.js";
import { publicSkySolution } from "../captures/sky-solution.js";
import { galleryQualityOf } from "../captures/gallery-quality.js";
import { galleryNightStatisticsOf } from "../captures/gallery-nights.js";
import {
  galleryProgressionOf,
  galleryProgressionStep,
} from "../captures/gallery-progression.js";
import { createCaptureRepository } from "../persistence/capture-repository.js";
import { createSkySolutionRepository } from "../persistence/sky-solution-repository.js";
import {
  PORTAL_MODES,
  PORTAL_NAME_MAX,
  PUBLIC_NAME_MAX,
  createPortalRepository,
} from "../persistence/portal-repository.js";
import { captureStore } from "../uploads/capture-store.js";
import { ensureSharedCopy } from "../uploads/derived-images.js";
import { captureSessionLiveSql } from "../persistence/capture-session-visibility.js";

/**
 * The private gallery of a space (« Galerie privée » on screen, `portal`
 * in the names of the code, the columns and the routes): its owner's
 * settings (`GET`/`PATCH /api/v1/manage/portal`), and what a viewer of its
 * random address may see (the pages `/{locale}/p/{token}`,
 * `GET /api/v1/portals/{token}` and its media).
 *
 * **One gate** decides who passes, for the pages, the JSON and the media
 * alike — `resolveGalleryAccess` (and its pure core `galleryGate`), the
 * function « Signaler » calls:
 *
 * - the owner, signed in, in every mode;
 * - `link` (« Accessible à tous par son adresse »): anyone;
 * - `none` (« Partagée avec personne », the mode at creation), an unknown
 *   or replaced address → `not_found` (gate 3), one answer whichever it is.
 *
 * A private server has one person, its owner: the gallery is for the owner,
 * and for anyone holding its address in `link`. A composition that opens
 * spaces may add a mode of its own through `extraMode` (a function that
 * answers the composition's seam, or `null`): see `createPrivateGalleryService`.
 *
 * The gallery shows every uploaded capture of the space, private and public,
 * **never one the team refused**, each with its generic tags and the owner's
 * own tags (the public gallery never shows the latter), never the place, and
 * serves **no original**: a capture's thumbnail and its shared copy, the files
 * without metadata (the copy written at the first need, through
 * `ensureSharedCopy`).
 *
 * An administrator of the service who is not the owner and opens a private
 * capture of a gallery in `link` mode (its page or its media) leaves one row
 * in `admin_access_log` (reason `gallery_link`), at most one per
 * administrator, capture and day. No screen reads it.
 *
 * Framework-free: a route adapter gives the viewer (`{ tenantId, userId,
 * email, administrator }` of the web session, or `null`) and turns a
 * `PrivateGalleryError` into the v1 error envelope.
 */
export class PrivateGalleryError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "PrivateGalleryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** The reason key of the administrator's look through a gallery's address. */
export const GALLERY_LINK_ACCESS_REASON = "gallery_link";

/** The availability of a mode the owner may be offered. */
export const MODE_AVAILABLE = "available";

/**
 * The gate, pure: `space` as `spaceByPortalToken` returns it (or `null`) and
 * the `viewer`. Answers `{ outcome }`: `open` (with `role` — `owner` or
 * `visitor` — and whether the viewer may report) or `not_found`. A mode that
 * is not the core's is the composition's to decide (`resolveGalleryAccess`);
 * here it is served as `none`.
 */
export function galleryGate({ space, viewer = null }) {
  if (!space) return { outcome: "not_found" };
  if (viewer?.tenantId && viewer.tenantId === space.tenantId)
    return { outcome: "open", role: "owner", canReport: false };
  if (space.mode === "link")
    return { outcome: "open", role: "visitor", canReport: true };
  return { outcome: "not_found" };
}

/** Trimmed, `null` when empty: the only change made to a typed name. */
function typedName(value, max, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new PrivateGalleryError(
      "invalid_request",
      `${field} is a string.`,
      400,
      { field },
    );
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ([...trimmed].length > max)
    throw new PrivateGalleryError(
      "invalid_request",
      `${field} holds ${max} characters at most.`,
      400,
      { field },
    );
  return trimmed;
}

const dayOf = (iso) => String(iso).slice(0, 10);

export async function createPrivateGalleryService({
  driver,
  dialect = driver?.dialect,
  now = () => new Date().toISOString(),
  sharedCopy = ensureSharedCopy,
  // What a composition that opens spaces adds to the gallery's gate: a
  // function (read at each call, so that a composition's settings can turn
  // it off) answering `null` or `{ mode, offered({ tenantId, userId }),
  // require({ tenantId, userId }), gate({ space, viewer }),
  // firstVisit({ tenantId, viewer }) }` — the name of one more mode of the
  // gallery, whether it is offered to a space (`available`, `locked` or
  // `null`), the refusal of a space it is not offered to (it throws a
  // `PrivateGalleryError`), the gate of a gallery in that mode (`null`:
  // not found), and the first visit of a person it admitted (`{ opened,
  // spaceCreated }`). Absent: a private server's two modes, `none` and
  // `link`.
  extraMode = () => null,
  // Where the files are (`uploads/capture-store.js`).
  captureStore: givenCaptureStore = null,
  // The words a name may not hold, when a service has a team that keeps a
  // dictionary of them: `({ names }) => { field, word } | null` with `names`
  // the `{ publicName?, portalName? }` being saved, the refusal naming the
  // first field and the word. Absent: no name is refused for its words.
  nameRefusal = null,
} = {}) {
  if (!driver) throw new Error("The private gallery needs a database.");
  const db = driver;
  const files = () => givenCaptureStore || captureStore();
  const exists = async (tenantId, sha256, file) =>
    Boolean(
      await files()
        .stat({ tenantId, sha256, file })
        .catch(() => null),
    );
  const portals = await createPortalRepository({ driver, dialect });
  const store = await createCaptureRepository({ driver, dialect });
  const skies = await createSkySolutionRepository({ driver });
  /** The composition's seam when it is on, else `null`. */
  const seam = () => extraMode() ?? null;

  /** The modes the tab offers: each `available` or `locked`, or absent. */
  async function offeredModes(tenantId, userId) {
    const modes = { none: MODE_AVAILABLE, link: MODE_AVAILABLE };
    const more = seam();
    if (more) {
      const offered = await more.offered({ tenantId, userId });
      if (offered) modes[more.mode] = offered;
    }
    return modes;
  }

  const addressOf = (origin, token) =>
    `${String(origin || "").replace(/\/+$/, "")}/p/${token}`;

  async function settings({ tenantId, userId, origin }) {
    const portal = await portals.getPortal(tenantId);
    if (!portal)
      throw new PrivateGalleryError("space_not_found", "Space not found.", 404);
    return {
      address: addressOf(origin, portal.token),
      mode: portal.mode,
      publicName: portal.publicName,
      portalName: portal.portalName,
      modes: await offeredModes(tenantId, userId),
    };
  }

  /**
   * The rows of the gallery: uploaded, never refused by the team, never
   * archived (an archived capture is the owner's alone, in
   * « Mes captures »).
   */
  const shownCaptures = async (tenantId) =>
    (
      await db.query(
        `SELECT * FROM captures
         WHERE tenant_id = ? AND status = 'uploaded' AND stage = 'finalized'
           AND archived_at IS NULL
           AND (admin_check IS NULL OR admin_check <> 'refused')
           AND ${captureSessionLiveSql()}
         ORDER BY created_at DESC, id DESC`,
        [tenantId],
      )
    ).rows;

  /**
   * One capture the gallery shows. The owner opens it by its address even
   * while it is a draft (he sees there all that he made of it, before he
   * finalizes it); a draft stays out of the gallery's list and is never shown
   * to a visitor.
   */
  const shownCapture = async (tenantId, captureId, { owner = false } = {}) =>
    (
      await db.query(
        `SELECT * FROM captures
         WHERE id = ? AND tenant_id = ? AND status = 'uploaded'
           ${owner ? "" : "AND stage = 'finalized'"} AND archived_at IS NULL
           AND (admin_check IS NULL OR admin_check <> 'refused')
           AND ${captureSessionLiveSql()}`,
        [String(captureId ?? ""), tenantId],
      )
    ).rows[0] || null;

  /**
   * The variants of a shown capture the gallery shows after its main image.
   * A visitor reads the rule of the public gallery (`capture-variants.js`,
   * `shownToVisitors`): those its owner made public, of a public capture —
   * newest first. The owner reads all of them, public or not (the
   * private ones carry `private: true`, for the badge « privée »), whatever
   * the state of the capture, a draft included.
   */
  const shownVariants = async (tenantId, captureId, { owner = false } = {}) =>
    (await namedImages(tenantId, captureId))
      .filter(
        (image) => !image.main && (image.shown || (owner && !image.archived)),
      )
      .map((image) => ({ ...image, private: !image.shown }));

  /**
   * Every image of a capture with its owner's title and description and its
   * rank of arrival (counted among every image), the main one first, then
   * the newest; `shown` says whether the gallery shows a variant (public,
   * of a public capture).
   */
  const namedImages = async (tenantId, captureId) => {
    const images = (
      await db.query(
        `SELECT v.id, v.sha256, v.original_name, v.is_main, v.is_public,
                v.width, v.height, v.title, v.description, v.generated_title_json,
                v.generated_description_json, v.created_at, c.visibility,
                v.archived_at
         FROM capture_variants v
         JOIN captures c ON c.id = v.capture_id
         WHERE v.tenant_id = ? AND v.capture_id = ? AND v.role IS NULL
           AND ${captureSessionLiveSql("c")}
         ORDER BY v.is_main DESC, v.created_at DESC, v.id DESC`,
        [tenantId, String(captureId ?? "")],
      )
    ).rows.map((row) => ({
      id: row.id,
      sha256: row.sha256,
      original_name: row.original_name,
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      main: Number(row.is_main) === 1,
      shown:
        Number(row.is_public) === 1 &&
        row.visibility === "public" &&
        !row.archived_at,
      archived: Boolean(row.archived_at),
      title: row.title ?? null,
      description: row.description ?? null,
      ...generatedTextsOfRow(row),
      createdAt: row.created_at,
    }));
    const ranks = arrivalRanks(images);
    return images.map((image) => ({
      ...image,
      arrivalRank: ranks.get(image.id),
    }));
  };

  /** The main image's names, or `null`. */
  const mainImageNames = async (tenantId, captureId) => {
    const main = (await namedImages(tenantId, captureId)).find(
      (image) => image.main,
    );
    return main
      ? {
          id: main.id,
          title: main.title,
          description: main.description,
          ...generatedTexts(main),
          arrivalRank: main.arrivalRank,
        }
      : null;
  };

  /**
   * Where a visitor of the gallery reads the sky annotations of an image of
   * a capture the gallery shows — behind the gallery's own gate, never the
   * public gallery's route (the capture may be private).
   */
  const annotationsPath = (token, captureId, imageId) =>
    `/api/v1/portals/${encodeURIComponent(token)}/annotations/${encodeURIComponent(
      captureId,
    )}${imageId ? `?imageId=${encodeURIComponent(imageId)}` : ""}`;

  /** The gate, read from the database (see `galleryGate`). */
  async function resolveGalleryAccess({ token, viewer = null }) {
    const space = await portals.spaceByPortalToken(token);
    if (!space) return { outcome: "not_found" };
    const owner = viewer?.tenantId === space.tenantId;
    const more = seam();
    // A mode of the composition's: its gate decides, and a gate that does
    // not know the gallery answers like an unknown address.
    const gate =
      !owner && more && space.mode === more.mode
        ? ((await more.gate({ space, viewer })) ?? { outcome: "not_found" })
        : galleryGate({ space, viewer });
    return gate.outcome === "open"
      ? {
          ...gate,
          administrator: Boolean(viewer?.administrator) && !owner,
          mode: gate.mode ?? (space.mode === "link" ? "link" : "none"),
          space: {
            tenantId: space.tenantId,
            portalName: space.portalName,
            publicName: space.publicName,
          },
        }
      : gate;
  }

  /**
   * One row in `admin_access_log` for an administrator who is not the owner
   * and looks at a private capture of a gallery in `link` mode; at most one
   * per administrator, capture and day (the row's id is derived from the
   * three, so two looks at once write one).
   */
  async function logAdministratorLook(access, viewer, capture) {
    if (
      !access.administrator ||
      access.role !== "visitor" ||
      access.mode !== "link" ||
      capture.visibility === "public" ||
      !viewer?.userId
    )
      return false;
    const at = now();
    const id = `${GALLERY_LINK_ACCESS_REASON}:${createHash("sha256")
      .update(`${viewer.userId}\n${capture.id}\n${dayOf(at)}`)
      .digest("hex")
      .slice(0, 40)}`;
    const written = await db.run(
      `INSERT INTO admin_access_log (id, actor_user_id, tenant_id, capture_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        id,
        viewer.userId,
        access.space.tenantId,
        capture.id,
        GALLERY_LINK_ACCESS_REASON,
        at,
      ],
    );
    return written.rowCount === 1;
  }

  /** The first visit of a person the composition's gate admitted. */
  async function visit(access, viewer) {
    const more = seam();
    if (!more?.firstVisit || ["owner", "visitor"].includes(access.role))
      return { opened: false, spaceCreated: false };
    try {
      return (
        (await more.firstVisit({
          tenantId: access.space.tenantId,
          viewer,
        })) || {
          opened: false,
          spaceCreated: false,
        }
      );
    } catch {
      return { opened: false, spaceCreated: false };
    }
  }

  /**
   * The generic tag of a capture, as the public gallery derives it: the
   * object type of its first target (« Grand champ » without a target).
   */
  const genericTagsOf = (targets) => {
    const tag = publicGalleryTag(targets[0]?.type_key, {
      hasTarget: targets.length > 0,
    });
    return tag ? [tag] : [];
  };

  /**
   * The tags of a capture as the gallery draws them. The stored tags
   * (`capture_tags`) hold the capture's default generic tag (its target's
   * type, written at its creation) beside the owner's own: the generic words
   * join the derived one in `tags` (each once, in the public gallery's order),
   * the rest stay in `ownTags`, as typed.
   */
  const tagsOf = (targets, stored) => {
    const generic = new Set([
      ...genericTagsOf(targets),
      ...stored.filter((tag) => PUBLIC_GALLERY_TAGS.includes(tag)),
    ]);
    return {
      tags: PUBLIC_GALLERY_TAGS.filter((tag) => generic.has(tag)),
      ownTags: stored.filter((tag) => !PUBLIC_GALLERY_TAGS.includes(tag)),
    };
  };

  /**
   * The title and month a capture of the gallery is listed with, and its
   * tags for the filter bar: the generic ones, derived from its target's
   * object type as in the public gallery, and the owner's own (`ownTags`,
   * free text, shown here only).
   */
  async function item(tenantId, capture, locale, ownTags = []) {
    const context = await readCaptureContext(db, tenantId, capture);
    const detail = captureDetail(
      { capture, ...context, locale },
      { audience: "visitor" },
    );
    return {
      id: capture.id,
      // The card of the list is the public gallery's, so the item carries
      // what that card draws, in its shape: the targets as the public card
      // reads them (alias, position of the target — never the place's), the
      // month of the night and the night's telescope.
      targets: context.targets.map((entry) => publicTarget(entry, locale)),
      fileName: detail.fileName,
      night: detail.night,
      ...(nightMonthsOf(context.nightDates) ?? {
        nightMonth: nightMonth(detail.night) ?? nightMonth(capture.created_at),
      }),
      telescope: context.telescope?.trim() || null,
      addedAt: detail.addedAt,
      thumbnail: await exists(tenantId, capture.sha256, "thumbnail"),
      ...tagsOf(context.targets, ownTags),
    };
  }

  return {
    async close() {
      await portals.close?.();
      await store.close?.();
    },

    resolveGalleryAccess,

    /**
     * `GET /api/v1/manage/portal`: the gallery of the web session's space —
     * its address (minted at the first read), its mode as stored, the two
     * names, and the modes offered (`none` and `link` always, and the one a
     * composition adds, `available` or `locked`).
     */
    settings,

    /**
     * `PATCH /api/v1/manage/portal`: exactly one of `{ mode }` (with
     * `confirmVerifiers: true` to become `link`), `{ publicName?,
     * portalName? }` (each optional, trimmed, empty = none) or
     * `{ regenerateToken: true }`. Answers the settings.
     */
    async update({ tenantId, userId, changes, origin }) {
      const body = changes && typeof changes === "object" ? changes : {};
      const groups = [
        body.mode !== undefined ? "mode" : null,
        body.publicName !== undefined || body.portalName !== undefined
          ? "names"
          : null,
        body.regenerateToken !== undefined ? "token" : null,
      ].filter(Boolean);
      if (groups.length !== 1)
        throw new PrivateGalleryError(
          "invalid_request",
          "Send exactly one of mode, the names, regenerateToken.",
        );
      const portal = await portals.getPortal(tenantId);
      if (!portal)
        throw new PrivateGalleryError(
          "space_not_found",
          "Space not found.",
          404,
        );
      const [group] = groups;
      if (group === "mode") {
        const more = seam();
        const modes = [...PORTAL_MODES, ...(more ? [more.mode] : [])];
        if (!modes.includes(body.mode))
          throw new PrivateGalleryError(
            "invalid_request",
            `mode is ${modes.slice(0, -1).join(", ")} or ${modes.at(-1)}.`,
          );
        // A mode of the composition's: it says whether this space has it.
        if (more && body.mode === more.mode)
          await more.require({ tenantId, userId });
        // The captures become visible to the verifiers: the owner said yes
        // to it in the dialog, before anything changes.
        if (
          body.mode === "link" &&
          portal.mode !== "link" &&
          body.confirmVerifiers !== true
        )
          throw new PrivateGalleryError(
            "confirmation_required",
            "Making the gallery open to anyone with its address needs confirmVerifiers: true.",
            409,
          );
        if (body.mode !== portal.mode)
          await portals.setMode(tenantId, body.mode, {
            extraModes: more ? [more.mode] : [],
          });
      } else if (group === "names") {
        const names = {};
        if (body.publicName !== undefined)
          names.publicName = typedName(
            body.publicName,
            PUBLIC_NAME_MAX,
            "publicName",
          );
        if (body.portalName !== undefined)
          names.portalName = typedName(
            body.portalName,
            PORTAL_NAME_MAX,
            "portalName",
          );
        // Only a name that changes is written: saving it again does not
        // count as a new name (and keeps the team's refusal notice).
        for (const field of Object.keys(names))
          if (names[field] === portal[field]) delete names[field];
        const refusedName =
          nameRefusal && Object.keys(names).length
            ? await nameRefusal({ names })
            : null;
        if (refusedName)
          throw new PrivateGalleryError(
            "name_forbidden",
            "This name holds a word that is refused.",
            422,
            { field: refusedName.field, word: refusedName.word },
          );
        if (Object.keys(names).length) await portals.setNames(tenantId, names);
      } else {
        if (body.regenerateToken !== true)
          throw new PrivateGalleryError(
            "invalid_request",
            "regenerateToken is true.",
          );
        await portals.regenerateToken(tenantId);
      }
      return await settings({ tenantId, userId, origin });
    },

    /**
     * « Signaler » through a private gallery (the link, the dialog and the
     * route `POST /api/v1/portals/{portalToken}/captures/{captureId}/reports`
     * are elsewhere): the capture a viewer may report,
     * `{ tenantId, captureId, visibility }`, when the gate opens to them as
     * a visitor of a gallery « accessible à tous » (or as the person a
     * composition's gate admitted), and the gallery shows that capture;
     * `null` otherwise — for the owner,
     * for anyone the gate refuses, for a capture the gallery does not show.
     * The gate is the right to see it, hence the right to report it.
     */
    async reportableCapture({ token, captureId, viewer = null }) {
      const access = await resolveGalleryAccess({ token, viewer });
      if (access.outcome !== "open" || !access.canReport) return null;
      const capture = await shownCapture(access.space.tenantId, captureId);
      return capture
        ? {
            tenantId: access.space.tenantId,
            captureId: capture.id,
            visibility: capture.visibility ?? "private",
          }
        : null;
    },

    /**
     * The gallery a viewer opens: `{ access }` — the gate's answer — and,
     * when it is `open`, `view`: its name, the owner's public name, and every
     * capture shown, newest first; `arrival: "created"` at the first visit
     * of a person the composition's gate admitted whose space was created
     * for it.
     */
    async gallery({ token, viewer = null, locale = "en" }) {
      const access = await resolveGalleryAccess({ token, viewer });
      if (access.outcome !== "open") return { access };
      const { tenantId } = access.space;
      const first = await visit(access, viewer);
      const captures = [];
      const tags = await store.tagsByCapture(tenantId);
      for (const capture of await shownCaptures(tenantId))
        captures.push(
          await item(tenantId, capture, locale, tags.get(capture.id) ?? []),
        );
      return {
        access,
        view: {
          portalName: access.space.portalName,
          publicName: access.space.publicName,
          captures,
          arrival: first.opened && first.spaceCreated ? "created" : null,
          // The filter bar: the generic tags present, in the public
          // gallery's order, then the owner's own tags present, in the
          // order of their text.
          tags: PUBLIC_GALLERY_TAGS.filter((tag) =>
            captures.some((entry) => entry.tags.includes(tag)),
          ),
          ownTags: [
            ...new Set(captures.flatMap((entry) => entry.ownTags)),
          ].sort(compareCaptureTags),
        },
      };
    },

    /**
     * One capture of the gallery: `{ access }`, and `view` when the gate
     * opens and the capture is one the gallery shows (else `access` is
     * `not_found`, the same answer as an unknown address). Never the place.
     */
    async capture({ token, captureId, viewer = null, locale = "en" }) {
      const access = await resolveGalleryAccess({ token, viewer });
      if (access.outcome !== "open") return { access };
      const { tenantId } = access.space;
      const owner = access.role === "owner";
      const capture = await shownCapture(tenantId, captureId, { owner });
      if (!capture) return { access: { outcome: "not_found" } };
      await visit(access, viewer);
      await logAdministratorLook(access, viewer, capture);
      const context = await readCaptureContext(db, tenantId, capture, {
        withEquipmentItems: true,
      });
      // The tags of the capture, generic and own, for the page.
      const tags = tagsOf(
        context.targets,
        await store.getCaptureTags(tenantId, capture.id),
      );
      // The sky solution of the image shown — the main one, each variant
      // the gallery shows — only while it exists, is the image's own and
      // the owner's switch « Afficher le plate solving » is on; absent
      // otherwise, so that the page is the one of before.
      const sky = await skies.galleryOf(capture.id);
      // `urlImageId`: the variant the address names (none for the main image).
      const solutionOf = (imageId, sha256, urlImageId) => {
        const stored = imageId ? sky.solutions.get(imageId) : null;
        return stored && stored.sha256 === sha256
          ? publicSkySolution(
              stored.solution,
              annotationsPath(token, capture.id, urlImageId),
            )
          : null;
      };
      const mainSolution = solutionOf(sky.mainImageId, capture.sha256, null);
      // The quality of each image, only while the owner's switch
      // « Afficher la qualité en privé » is on (on by default).
      const quality = await galleryQualityOf(db, capture.id, "private");
      const progression = await galleryProgressionOf(db, capture.id);
      const { nights, qualityCharts } = await galleryNightStatisticsOf(
        db,
        capture.id,
        "private",
      );
      const detail = captureDetail(
        { capture, ...context, locale },
        { audience: "visitor" },
      );
      return {
        access,
        view: {
          portalName: access.space.portalName,
          publicName: access.space.publicName,
          canReport: access.canReport,
          capture: {
            ...detail,
            id: capture.id,
            // The detail page is the public gallery's, so the view carries
            // what it draws, in its shape — the target with its type,
            // constellation and coordinates, the equipment by kind, the month
            // of the night and the pixel size of the shared copy.
            targets: context.targets.map((entry) =>
              publicTarget(entry, locale),
            ),
            equipment: publicEquipment(context.equipmentItems),
            ...(nightMonthsOf(context.nightDates) ?? {
              nightMonth:
                nightMonth(detail.night) ?? nightMonth(capture.created_at),
            }),
            image: await sharedCopySize({
              sharedCopy,
              captureStore: files(),
              tenantId,
              sha256: capture.sha256,
              originalName: capture.original_name,
            }),
            // The generic tags (the French keys, translated by the page) and
            // the owner's own, as the gallery's grid carries them.
            ...tags,
            // The same metadata as the public page (never the place, the
            // notes, an origin).
            metadata: captureMetadata(
              await readMetadataInputs(
                db,
                tenantId,
                capture,
                context.targetIds,
              ),
              { audience: "visitor" },
            ),
            thumbnail: await exists(tenantId, capture.sha256, "thumbnail"),
            // The main image's names (the first image of the page, its
            // description in the band under the image).
            mainImage: await mainImageNames(tenantId, capture.id),
            ...(mainSolution ? { skySolution: mainSolution } : {}),
            ...(quality.main ? { quality: quality.main } : {}),
            // The milestones of the capture, shown with it (no switch of
            // their own); their files go through the gallery's gate
            // (`public-shape.js`).
            ...(progression.steps.length
              ? {
                  progression: {
                    plan: progression.plan,
                    steps: progression.steps.map((step) =>
                      galleryProgressionStep(step, null),
                    ),
                  },
                }
              : {}),
            // The nights' values and charts, under the switch « Afficher
            // la qualité en privé ».
            ...(nights.length ? { nights } : {}),
            ...(qualityCharts ? { qualityCharts } : {}),
            // The main image above, then the variants shown (`?imageId=`
            // of the media route), with their names.
            variants: await Promise.all(
              (await shownVariants(tenantId, capture.id, { owner })).map(
                async (alternative) => {
                  const solution = solutionOf(
                    alternative.id,
                    alternative.sha256,
                    alternative.id,
                  );
                  return {
                    id: alternative.id,
                    // Only the owner is given a variant that is not public.
                    ...(alternative.private ? { private: true } : {}),
                    thumbnail: await exists(
                      tenantId,
                      alternative.sha256,
                      "thumbnail",
                    ),
                    image:
                      Number.isInteger(alternative.width) &&
                      alternative.width > 0 &&
                      Number.isInteger(alternative.height) &&
                      alternative.height > 0
                        ? {
                            width: alternative.width,
                            height: alternative.height,
                          }
                        : null,
                    title: alternative.title,
                    description: alternative.description,
                    ...generatedTexts(alternative),
                    arrivalRank: alternative.arrivalRank,
                    ...(solution ? { skySolution: solution } : {}),
                    ...(quality.byImage.has(alternative.id)
                      ? { quality: quality.byImage.get(alternative.id) }
                      : {}),
                  };
                },
              ),
            ),
          },
        },
      };
    },

    /**
     * The image of a capture the gallery shows (`imageId`: a variant it
     * shows; the main image otherwise), behind the gate, for the sky
     * annotations of the capture's page:
     * `{ tenantId, captureId, image: { id, sha256, originalName } }`, or
     * `null` for anything the gate refuses, a capture or an image the gallery
     * does not show.
     */
    async shownImage({ token, captureId, viewer = null, imageId = null }) {
      const access = await resolveGalleryAccess({ token, viewer });
      if (access.outcome !== "open") return null;
      const { tenantId } = access.space;
      const owner = access.role === "owner";
      const shown = await shownCapture(tenantId, captureId, { owner });
      if (!shown) return null;
      const images = await namedImages(tenantId, shown.id);
      const image = imageId
        ? images.find(
            (entry) =>
              entry.id === imageId &&
              (entry.main || entry.shown || (owner && !entry.archived)),
          )
        : images.find((entry) => entry.main);
      if (!image) return null;
      return {
        tenantId,
        captureId: shown.id,
        image: {
          id: image.id,
          sha256: image.sha256,
          originalName: image.original_name,
        },
      };
    },

    /**
     * Where the file a viewer may receive of one capture is: `variant:
     * "thumbnail"` its thumbnail; otherwise its shared copy (written at the
     * first need), or its thumbnail when the file cannot have one (a FITS).
     * Never the original. `null` for anything the gate refuses, a capture
     * the gallery does not show, or one that has no such file yet.
     */
    async media({
      token,
      captureId,
      viewer = null,
      variant = "image",
      imageId = null,
    }) {
      const access = await resolveGalleryAccess({ token, viewer });
      if (access.outcome !== "open") return null;
      const { tenantId } = access.space;
      const owner = access.role === "owner";
      const shown = await shownCapture(tenantId, captureId, { owner });
      if (!shown) return null;
      // A variant the gallery shows (`imageId`), all of them for the owner.
      let capture = shown;
      if (imageId) {
        // A variant the gallery shows, or a milestone of the capture.
        const alternative =
          (await shownVariants(tenantId, shown.id, { owner })).find(
            (entry) => entry.id === imageId,
          ) ??
          (await galleryProgressionOf(db, shown.id)).steps
            .filter((entry) => entry.id === imageId)
            .map((entry) => ({
              sha256: entry.sha256,
              original_name: entry.originalName,
            }))[0];
        if (!alternative) return null;
        capture = {
          ...shown,
          sha256: alternative.sha256,
          original_name: alternative.original_name,
        };
      }
      const thumbnail = { file: "thumbnail", name: "thumbnail.webp" };
      let file = null;
      if (variant === "thumbnail") {
        if (await exists(tenantId, capture.sha256, "thumbnail"))
          file = thumbnail;
      } else {
        try {
          await sharedCopy({
            tenantId,
            sha256: capture.sha256,
            originalName: capture.original_name,
            captureStore: files(),
          });
          if (await exists(tenantId, capture.sha256, "shared"))
            file = { file: "shared", name: "shared.jpg" };
        } catch {
          file = null;
        }
        if (!file && (await exists(tenantId, capture.sha256, "thumbnail")))
          file = thumbnail;
      }
      if (!file) return null;
      await logAdministratorLook(access, viewer, capture);
      return { ...file, tenantId, sha256: capture.sha256 };
    },
  };
}
