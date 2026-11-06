export const CAPABILITY_NAMES = [
  "planner.multiple",
  "planner.mosaic",
  "pointing.solve",
  "sync.plan_limit",
  "gallery.private",
  "portal.invitations",
  "capture.variant_limit",
  "capture.count_limit",
  "capture.public",
  "analysis.logs",
  "analysis.progression",
  "storage.max_file_bytes",
  "storage.quota_bytes",
  "history.retention_days",
] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

/**
 * What a server does by itself: read
 * from the server's environment, and kept **outside**
 * the capability map above, whose readers are strict (Astro Sync's bridge
 * and the mobile apps refuse an unknown key):
 * `GET /v1/capabilities` keeps its fourteen keys. Carried by the owner's
 * captures (`GET /v1/manage/captures[/{id}]`, `serverFeatures`).
 *
 * - `sky.solve_on_server`: a private server whose operator installed
 *   astrometry.net solves a capture's image on demand (« Résoudre sur ce
 *   serveur », `POST /v1/manage/captures/{id}/sky-solution/solve`, 404
 *   where false). The sky solutions otherwise come from Astro Sync.
 */
export const SERVER_FEATURE_NAMES = ["sky.solve_on_server"] as const;

export type ServerFeatureName = (typeof SERVER_FEATURE_NAMES)[number];

export type ServerFeatures = Record<ServerFeatureName, boolean>;

/**
 * The value of a numeric capability that sets no cap: the resources of a
 * self-hosted server are those of the person who hosts it (contract 0.2.0).
 *
 * It is `Number.MAX_SAFE_INTEGER` (2^53 - 1), a plain integer rather than
 * `null` or a negative number, so every reader of the map keeps comparing
 * integers: the mobile applications (which require non-negative integers)
 * and Astro Sync (`u64`) read it as a cap that is
 * never reached, with no change. `0` keeps its meaning for each capability:
 * "no allowance at all" for `storage.*`, `capture.variant_limit`,
 * `capture.count_limit` and `history.retention_days`, "no numeric cap" for `sync.plan_limit` (its
 * historical reading).
 */
export const CAPABILITY_UNLIMITED = Number.MAX_SAFE_INTEGER;

/** Whether a numeric capability value is the unlimited value. */
export function isUnlimitedCapability(value: number): boolean {
  return value === CAPABILITY_UNLIMITED;
}

export type Capabilities = {
  /**
   * Whether a profile may hold several plans for the same night date,
   * whatever their place: without it a night holds one plan, pending or
   * already run (executed, partial); an abandoned or archived plan frees the
   * night. Other nights remain available independently of this capability.
   * The numeric synchronized-plan guard (pending plans only) is checked
   * separately.
   */
  "planner.multiple": boolean;
  "planner.mosaic": boolean;
  /**
   * The aiming screen of the mobile application: full-screen plate solving
   * with its arrow and reticle, the lens screen, and what later builds on
   * them (the axis calibration, the polar alignment by plate solving, the
   * satellite phone). Never a pointing-safety check (horizon mask, zenith
   * exclusion, the Sun by day, STOP): those stay free and outside this
   * capability, and so does the solver's own development probe.
   */
  "pointing.solve": boolean;
  /**
   * The numeric guard on all pending synchronized plans, or the unlimited
   * sentinel.
   *
   * `undefined`, `0`, or any value `<= 0` means unlimited, and so does
   * `CAPABILITY_UNLIMITED` (a cap no count reaches). A `plans` count only ever includes
   * plans in their active/editable lifecycle state: an executed or
   * archived plan is historical evidence and never counts toward this
   * cap, however many of those a profile holds.
   *
   * The server applies this convention in
   * `packages/portal/src/persistence/planner-state-repository.js`
   * (`writePlanResource`'s `planLimit`, counting the portal's own
   * live/editable plan status); the clients apply it as well.
   */
  "sync.plan_limit": number;
  /**
   * The statistics of the gallery by target and by instrument of the Journal;
   * the year, the months and the nights of the Journal are not gated by it.
   * It gates nothing else: the private gallery of a space has its two modes
   * (« Partagé avec personne », « Accessible à tous par son adresse »).
   */
  "gallery.private": boolean;
  /**
   * A third mode of the private gallery, for named people, and the
   * invitations by e-mail that go with it: what a service that opens spaces
   * grants to some of them. False where the server does not grant it (the
   * mode is then shown locked) and on a private server (one account, its
   * owner's: no one to share a gallery with by name).
   */
  "portal.invitations": boolean;
  /**
   * The images a capture may hold beyond its main one: `0` no allowance,
   * `CAPABILITY_UNLIMITED` no cap. Every profile of the hosted service is
   * unlimited (the free account since 2026-10-29): the storage quota and
   * the size of a file are the variants' only limits.
   */
  "capture.variant_limit": number;
  /**
   * How many captures a space may hold at a time: `0` no allowance,
   * `CAPABILITY_UNLIMITED` no cap, as `storage.*`. A private server has no
   * cap. A space over its limit keeps every capture and only cannot add one.
   */
  "capture.count_limit": number;
  /**
   * Whether a capture of this space may be made public. True on every
   * profile today; the guard exists so that a server can withdraw it.
   * Separate from the block on publishing, which is a state of
   * the person, not a capability.
   */
  "capture.public": boolean;
  "analysis.logs": boolean;
  /**
   * The progressions of a night: the intermediate stackings Astro Sync sends
   * at regular intervals, and nothing else. The stacking is local and never
   * gated: no capability names it, every account, a private server and no
   * account at all stack in Astro Sync.
   */
  "analysis.progression": boolean;
  /** `0`: no allowance; `CAPABILITY_UNLIMITED`: no cap. */
  "storage.max_file_bytes": number;
  /** `0`: no allowance; `CAPABILITY_UNLIMITED`: no cap. */
  "storage.quota_bytes": number;
  /** `0`: no allowance; `CAPABILITY_UNLIMITED`: no cap. */
  "history.retention_days": number;
};
