import { defaultLocale } from "./locales.js";
import { isLegalAddressTemplate, legalAddressFor } from "./legal-links.js";

/**
 * The public service identity (`GET /v1/service`).
 *
 * A client that is about to address a portal it has never talked to — the
 * mobile app validating a self-hosted address before saving it, or probing
 * whether the configured service answers at all — calls this route first.
 * It needs no credential and touches no database: it only says "this is an
 * Astro portal, speaking API version N". This module is the one place,
 * shared between the server (which builds the body) and a client (which
 * checks it), that decides what counts as a valid answer.
 *
 * Nothing sensitive rides this body: no configured product name, no host
 * name, no account or device data — only the fixed service marker, the
 * integer API version and the software version string.
 */

/** The fixed marker every Astro portal answers with. */
export const SERVICE_IDENTITY_NAME = "astro-portal";

/** The API version this contract describes (`/api/v1`). */
export const SERVICE_API_VERSION = 1;

/** The API versions a client built against this contract can talk to. */
export const SUPPORTED_SERVICE_API_VERSIONS: readonly number[] = [
  SERVICE_API_VERSION,
];

/**
 * How a person signs in to the service (`signIn`, additive; see
 * `schemas/api/service.schema.json`):
 * - `email-code`: an e-mail address, then a six-digit code received by
 *   e-mail. Where spaces are open to any e-mail address, an address without
 *   a space gets one (`spaceCreation: "open"`); on a private server only its owner's address
 *   signs in, to its one space (`spaceCreation: "closed"`);
 * - `pairing`: a private server signing in by password — a QR code or an
 *   eight-character code shown by the server; also what an absent `signIn`
 *   means;
 * - `none`: the private API is switched off.
 */
export type SpaceCreation = "open" | "closed";

export interface EmailCodeSignIn {
  readonly method: "email-code";
  readonly spaceCreation: SpaceCreation;
  readonly codeLength: 6;
  /**
   * The terms of use, in the default language when the service names a page
   * per language (`ASTRO_PORTAL_TERMS_URL` holding `{lang}`).
   */
  readonly termsUrl?: string;
  readonly privacyUrl?: string;
  /**
   * Additive: the address template (`https://…/{lang}/terms/`) behind
   * `termsUrl`, present only when the service names a page per language. A
   * client that knows it replaces `{lang}` with the tag of the language it
   * is shown in (`legalAddressFor`); an older one keeps `termsUrl`.
   */
  readonly termsUrlTemplate?: string;
  readonly privacyUrlTemplate?: string;
}

export type SignInAnnouncement =
  | EmailCodeSignIn
  | { readonly method: "pairing" }
  | { readonly method: "none" };

export interface ServiceIdentity {
  readonly service: typeof SERVICE_IDENTITY_NAME;
  readonly apiVersion: number;
  readonly version: string;
  readonly signIn?: SignInAnnouncement;
}

const httpAddress = (value: unknown): string | null =>
  typeof value === "string" && /^https?:\/\/\S+$/.test(value.trim())
    ? value.trim()
    : null;

/** An http(s) address that holds the language placeholder, else `null`. */
const httpTemplate = (value: unknown): string | null => {
  const address = httpAddress(value);
  return address !== null && isLegalAddressTemplate(address) ? address : null;
};

/**
 * The `email-code` announcement: a service whose spaces are open to any
 * e-mail address (`open`, the default) or a private server's (`closed`). A terms or privacy address that is not
 * an http(s) address is left out rather than announced empty.
 */
export function emailCodeSignIn({
  termsUrl = null,
  privacyUrl = null,
  spaceCreation = "open",
}: {
  termsUrl?: string | null;
  privacyUrl?: string | null;
  spaceCreation?: SpaceCreation;
} = {}): EmailCodeSignIn {
  const termsTemplate = httpTemplate(termsUrl);
  const privacyTemplate = httpTemplate(privacyUrl);
  // `termsUrl` stays an address any client opens: a template is announced
  // resolved for the default language, and as itself beside it.
  const terms = legalAddressFor(httpAddress(termsUrl), defaultLocale());
  const privacy = legalAddressFor(httpAddress(privacyUrl), defaultLocale());
  return {
    method: "email-code",
    spaceCreation: spaceCreation === "closed" ? "closed" : "open",
    codeLength: 6,
    ...(terms ? { termsUrl: terms } : {}),
    ...(privacy ? { privacyUrl: privacy } : {}),
    ...(termsTemplate ? { termsUrlTemplate: termsTemplate } : {}),
    ...(privacyTemplate ? { privacyUrlTemplate: privacyTemplate } : {}),
  };
}

export type ParsedSignIn =
  | {
      readonly method: "email-code";
      /** `closed`: a private server, whose owner alone signs in. */
      readonly spaceCreation: SpaceCreation;
      readonly codeLength: 6;
      readonly termsUrl: string | null;
      readonly privacyUrl: string | null;
      /** The address template of a page per language, else `null`. */
      readonly termsUrlTemplate: string | null;
      readonly privacyUrlTemplate: string | null;
    }
  | { readonly method: "pairing" }
  | { readonly method: "none" }
  /** A method this client does not know: a newer service. */
  | { readonly method: "unsupported" };

/**
 * Reads the `signIn` of an already validated `GET /v1/service` body. Never
 * throws. An absent `signIn` is an older private server: `pairing`.
 */
export function parseSignInAnnouncement(body: unknown): ParsedSignIn {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { method: "pairing" };
  const signIn = (body as Record<string, unknown>).signIn;
  if (signIn === undefined) return { method: "pairing" };
  if (typeof signIn !== "object" || signIn === null || Array.isArray(signIn))
    return { method: "unsupported" };
  const announcement = signIn as Record<string, unknown>;
  switch (announcement.method) {
    case "pairing":
      return { method: "pairing" };
    case "none":
      return { method: "none" };
    case "email-code":
      return announcement.codeLength === 6
        ? {
            method: "email-code",
            spaceCreation:
              announcement.spaceCreation === "closed" ? "closed" : "open",
            codeLength: 6,
            termsUrl: httpAddress(announcement.termsUrl),
            privacyUrl: httpAddress(announcement.privacyUrl),
            termsUrlTemplate: httpTemplate(announcement.termsUrlTemplate),
            privacyUrlTemplate: httpTemplate(announcement.privacyUrlTemplate),
          }
        : { method: "unsupported" };
    default:
      return { method: "unsupported" };
  }
}

export interface ValidServiceIdentity extends ServiceIdentity {
  readonly valid: true;
}

/**
 * Why a body is refused:
 * - `not_astro_service`: the body is not an Astro portal identity at all
 *   (not an object, a missing or different `service` marker, or a malformed
 *   `apiVersion`/`version`) — some other web server answered;
 * - `incompatible_api_version`: an Astro portal, but speaking an API version
 *   this client does not support.
 */
export type ServiceIdentityRefusal =
  "not_astro_service" | "incompatible_api_version";

export interface InvalidServiceIdentity {
  readonly valid: false;
  readonly reason: ServiceIdentityRefusal;
}

export type ParsedServiceIdentity =
  ValidServiceIdentity | InvalidServiceIdentity;

/**
 * Builds the route's body for a given software version and, when given, the
 * service's sign-in announcement.
 */
export function serviceIdentity(
  version: string,
  signIn: SignInAnnouncement | null = null,
): ServiceIdentity {
  return {
    service: SERVICE_IDENTITY_NAME,
    apiVersion: SERVICE_API_VERSION,
    version,
    ...(signIn ? { signIn } : {}),
  };
}

/**
 * Checks an already `JSON.parse`d `GET /v1/service` body. Never throws.
 * Extra fields are tolerated (a newer portal may add some); the marker, an
 * integer `apiVersion` and a non-empty `version` string are required.
 */
export function parseServiceIdentity(
  body: unknown,
  supportedApiVersions: readonly number[] = SUPPORTED_SERVICE_API_VERSIONS,
): ParsedServiceIdentity {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { valid: false, reason: "not_astro_service" };
  }
  const payload = body as Record<string, unknown>;
  const apiVersion = payload.apiVersion;
  const version = payload.version;
  if (
    payload.service !== SERVICE_IDENTITY_NAME ||
    typeof apiVersion !== "number" ||
    !Number.isInteger(apiVersion) ||
    apiVersion < 1 ||
    typeof version !== "string" ||
    version.length === 0
  ) {
    return { valid: false, reason: "not_astro_service" };
  }
  if (!supportedApiVersions.includes(apiVersion)) {
    return { valid: false, reason: "incompatible_api_version" };
  }
  return { valid: true, service: SERVICE_IDENTITY_NAME, apiVersion, version };
}
