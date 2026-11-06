/**
 * The points where a composition can add to the core's application (the
 * routes and pages of `portal-app`). The open-source composition registers
 * none: every point then answers what a single-owner server does.
 *
 * The list is closed: registering or reading an unknown point throws.
 *
 * - `entitlements.provider`: `{ enabled(env), provider(driver),
 *   visitorCapabilities(), serviceAdministrator?({ driver, userId }) }` —
 *   the `EntitlementProvider` of every resource service when `enabled()`.
 *   Absent or disabled: the open-source profile
 *   (`lib/v1/entitlement-provider.js`).
 * - `entitlements.read`: `{ enabled(env), read({ userId }) }`, `read`
 *   answering `{ purchases, capabilities, serviceAdministrator? }` — the
 *   body of `GET /api/v1/entitlements` when `enabled()`. Absent or
 *   disabled: no purchase and the capabilities of the entitlement provider.
 * - `spaces.signIn`: `{ enabled(env), handlers() }` — the handlers of the
 *   sign-in by e-mail code when `enabled()`. Absent or disabled: the
 *   single-owner handlers (`lib/space-sign-in.server.js`).
 * - `spaces.pageSettings`: `(locale) => ({ termsUrl, privacyUrl }) | null` —
 *   the links of the sign-in page, in the language of `locale`.
 * - `devices.anonymous`: `{ enabled(env), owns(headers), authenticate(headers) }`
 *   — the devices that use the service with no space, which read nothing
 *   personal. `owns` says by the form of `Authorization` alone whether the
 *   bearer is theirs; `authenticate` resolves to the device
 *   (`{ id, platform, createdAt }`) or rejects with an error carrying its
 *   HTTP `status` and `code`. Absent or disabled: no bearer is theirs, and
 *   every route answers one as the unknown bearer of a space's device
 *   (`lib/v1/access.js`).
 * - `footer.link`: `{ enabled(env), element({ requestHeaders,
 *   fallbackLocale }) }`, `element` resolving to an element (or `null`) that
 *   the footer of every page draws after « Code source » — the link of the
 *   composition, with its own words. Absent or disabled: no link.
 * - `layout.overlay`: `{ enabled(env), element({ requestHeaders,
 *   fallbackLocale, version }) }`, `element` resolving to an element (or
 *   `null`) that the root layout draws after the page's content, on every
 *   page — what the composition says to the people who browse (a client
 *   component that asks its own service, and draws its own dialog), with
 *   `version` the running service's. Absent or disabled: nothing.
 * - `sessions.erasure`: `{ enabled(env), footprint(executor, { tenantId,
 *   sessionId }), erase(transaction, { tenantId, sessionId }) }` — what the
 *   composition keeps about a night beyond the core's own tables: `footprint`
 *   resolves to the counts it adds to the answer of the erasure of a session
 *   (`{ deviceJournalLines }`), `erase` deletes those rows in the same
 *   transaction. Absent or disabled: the core's rows alone, and the counts
 *   the contract requires are `0`.
 * - `gallery.moderation`: `{ enabled(env), nameRefusal({ driver, names }),
 *   report }` — what a service with a team checking the galleries adds to
 *   them. `nameRefusal` resolves to `{ field, word }` when a name the owner
 *   saves (`{ publicName?, portalName? }`) holds a word the team forbids,
 *   else `null` (the name is then refused, `422 name_forbidden`). `report`
 *   is `{ loadReportLink(), publicPath(captureId), galleryPath(token,
 *   captureId), canReportPublic({ captureId, viewer }) }`: the component of
 *   « Signaler » (`loadReportLink` resolves to it), where it sends a report
 *   of a public capture and of a capture of a private gallery, and whether
 *   a viewer may report a public capture. `captureRemoved(transaction,
 *   { tenantId, captureId })`, optional, is called in the transaction that
 *   deletes a capture, to delete the rows the team keeps about it (even
 *   when the team is switched off). Absent or
 *   disabled: no team — a capture the automatic check does not class « sky »
 *   asks its owner's confirmation before it is public (and is never refused),
 *   no name is checked against a dictionary, no « Signaler » is drawn.
 * - `gallery.audience`: `{ enabled(env), mode({ driver, provider,
 *   offersSold }), guest(searchParams), guestNotice({ locale, guest }),
 *   guestNext(locale, guest), arrival({ locale, publicName }), gate({
 *   locale, kind, signInHref }), refusal(outcome) }` — the gallery reserved
 *   to the people a composition lets in by name, which a private server (one
 *   person) does not have. `mode` answers the mode the private gallery's
 *   gate adds (`extraMode` of `createPrivateGalleryService`); `guest`
 *   resolves, from the query of the sign-in page, to the person a link of
 *   the composition brings (`{ email, language, publicName, portalToken }`,
 *   or `null`), `guestNotice` and `arrival` to the elements drawn above the
 *   sign-in form and above the gallery, `guestNext` to where the page goes
 *   after the code, `gate` to the page of a refusal (`sign_in` or
 *   `no_access`) and `refusal` to its JSON (`{ code, message, status }`).
 *   Absent or disabled: the gallery is the owner's, or whoever holds its
 *   address in `link`; every other gate is « not found ».
 * - `planner.projects`: `{ enabled(env), service({ driver, dialect,
 *   entitlementProvider }) }`, `service` resolving to the projects service
 *   (`list`, `get`, `write` and `archive`, whose refusals carry their HTTP
 *   `status` and `body`) that `/api/v1/projects` delegates to when
 *   `enabled()` (`lib/v1/project-resource-service.js`). Absent or
 *   disabled: the core's own projects service.
 * - `appLogs.incidents`: `{ enabled(env), check(entry), record({ token,
 *   entries, now }) }` — what a composition adds to the device incidents the
 *   application's error logs carry (`POST /api/v1/app-logs`, entries
 *   `device.incident`). `check(entry)` answers the names of the rules an
 *   entry still breaks by the composition's own, stricter reading (empty when
 *   clean): the route asks it of every entry after the core's check and
 *   before anything is kept, and refuses the whole batch at the first
 *   (`422 app_log_unredacted`, as the core's). `record` resolves once the
 *   entries are kept in « Journaux »; its failure is logged and never fails
 *   the answer. Absent or disabled: the incidents are kept with their entries
 *   in « Journaux » alone.
 *
 * The registry lives on `globalThis` under a registered symbol: Next.js
 * loads a module once per compilation layer, and `server.mjs` loads its own
 * copy, so a module-level map would be empty in the other copies.
 */
const registryKey = Symbol.for("astro-portal.service-extensions");

export const SERVICE_EXTENSION_POINTS = Object.freeze([
  "entitlements.provider",
  "entitlements.read",
  "spaces.signIn",
  "spaces.pageSettings",
  "devices.anonymous",
  "footer.link",
  "layout.overlay",
  "sessions.erasure",
  "gallery.moderation",
  "gallery.audience",
  "planner.projects",
  "appLogs.incidents",
]);

function registry() {
  if (!(globalThis[registryKey] instanceof Map))
    globalThis[registryKey] = new Map();
  return globalThis[registryKey];
}

function knownPoint(point) {
  if (!SERVICE_EXTENSION_POINTS.includes(point))
    throw new Error(`Unknown service extension point "${point}".`);
  return point;
}

export function registerServiceExtension(point, extension) {
  if (extension == null)
    throw new Error(`The extension of "${point}" is missing.`);
  registry().set(knownPoint(point), extension);
}

/** The extension registered at this point, or `null`. */
export function serviceExtension(point) {
  return registry().get(knownPoint(point)) ?? null;
}

/**
 * The extension registered at this point when it is on with these settings
 * (`enabled(env)`, absent = always), or `null`.
 */
export function enabledServiceExtension(point, env = process.env) {
  const extension = serviceExtension(point);
  if (!extension) return null;
  return typeof extension.enabled === "function" && !extension.enabled(env)
    ? null
    : extension;
}

/**
 * The team's extension of the galleries when a composition registered one
 * and it is on, else `null`: the service has no team.
 */
export const galleryTeam = (env = process.env) =>
  enabledServiceExtension("gallery.moderation", env);

/** Test support: forget every registration. */
export function clearServiceExtensions() {
  registry().clear();
}
