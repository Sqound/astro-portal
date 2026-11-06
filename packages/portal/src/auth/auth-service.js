import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { clientIdentityOf } from "../api/client-identity.js";
import { clientOrigin, clientOriginSettings } from "../api/client-origin.js";
import {
  createAuthenticationRepository,
  insertOwnerAccount,
} from "../persistence/authentication-repository.js";
import { databaseDriver } from "../persistence/database.js";
import { keyedDigest } from "../spaces/codes.js";
import { isValidEmail, normalizeEmail } from "../spaces/email.js";
import { SignInRefusal, refuse } from "../spaces/refusal.js";
import {
  AUTH_MODES,
  EMAIL_CODE_MODE,
  PASSWORD_MODE,
  authMode,
  authModeProblem,
} from "./modes.js";
import { createPasswordGate } from "./password-sign-in.js";
import { noteClientState } from "./client-state-sink.js";
import { signInExtension } from "./sign-in-extension.js";

/**
 * The authentication of the portal (docs/PRIVATE_NOTEBOOK_AUTH.md): web sessions and their CSRF tokens, device tokens, and a
 * private server's own sign-in.
 *
 * - `password`: its owner signs in with their address and a password of 14
 *   characters or more (scrypt), under the locks of password-sign-in.js;
 *   devices are paired with a code shown on the account page.
 * - `email-code`: its owner signs in with a code received by e-mail
 *   (spaces/), and devices sign in by themselves the same way. An extension
 *   may take this mode over: the extension then decides who administers, and the private
 *   server's installation, recovery codes and pairing do not exist.
 *
 * In both private modes the installation (`/auth/bootstrap`, the bootstrap
 * secret) creates the one account and shows ten recovery codes once; a
 * recovery code signs in whatever the mode — the way back when the e-mail
 * no longer leaves, or when the password is lost — and, in the `password`
 * mode, sets a new password.
 */
const scrypt = promisify(scryptCallback);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const secureEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};
const authFailure = (message, code, status) =>
  Object.assign(new Error(message), { code, status });

export const PASSWORD_MIN_LENGTH = 14;
export const RECOVERY_CODE_COUNT = 10;
/**
 * An authenticated request is the activity of its space. The stamp is written at most once an hour
 * (`touchSpaceActivity`), and this process skips the database while the one it
 * wrote is less than an hour old. Never the reason a request fails.
 */
const spaceActivityKey = Symbol.for("astro-portal.space-activity");
const SPACE_ACTIVITY_STEP_MS = 60 * 60_000;
async function markSpaceActive(repo, tenantId, at = Date.now()) {
  if (!tenantId || typeof repo?.touchSpaceActivity !== "function") return;
  const seen = (globalThis[spaceActivityKey] ||= new Map());
  const last = seen.get(tenantId);
  if (last !== undefined && at - last < SPACE_ACTIVITY_STEP_MS) return;
  try {
    await repo.touchSpaceActivity(tenantId, new Date(at));
    seen.set(tenantId, at);
    if (seen.size > 10_000) seen.delete(seen.keys().next().value);
  } catch {
    // The stamp is a count of time, not a gate.
  }
}

const DEFAULT_ORGANIZATION = "Personal observatory";

const crockfordBase32Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const pairingCodePattern = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const pairingCode = () =>
  Array.from(randomBytes(8), (byte) => crockfordBase32Alphabet[byte & 31]).join(
    "",
  );
const normalizePairingCode = (value) =>
  typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]/g, "")
    : "";
const normalizedDeviceLabel = (value) => {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label && label.length <= 120 ? label : null;
};
const bearerToken = (headers) => {
  const authorization = String(
    headers?.get?.("authorization") || headers?.authorization || "",
  ).trim();
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  return match && Buffer.from(match[1], "base64url").length === 32
    ? match[1]
    : null;
};

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export async function passwordHash(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$32768$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}
export async function verifyPassword(password, stored) {
  const [name, cost, salt, key] = String(stored).split("$");
  if (name !== "scrypt" || cost !== "32768" || !salt || !key) return false;
  const actual = await scrypt(
    String(password),
    Buffer.from(salt, "base64url"),
    64,
    SCRYPT,
  );
  return secureEqual(Buffer.from(actual).toString("base64url"), key);
}
// Compared when no account has the address, so that the answer takes the
// time of a real comparison.
const UNKNOWN_PASSWORD_HASH = `scrypt$32768$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

/** `ABCD-EF01-2345`: 48 random bits, shown once. */
const newRecoveryCode = () =>
  randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-");
const recoveryCodeForm = (code) =>
  String(code || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const cookieValue = (headers, name) =>
  String(headers.get?.("cookie") || headers.cookie || "")
    .split(/;\s*/)
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || null;
/**
 * The names of the web session's cookies. `Secure` cookies carry the
 * `__Host-` prefix: the browser then accepts them only from this very host,
 * over https, for the whole site (`Path=/`, no `Domain`), so that another
 * host of the domain or a page over plain http cannot set a session or a
 * CSRF token in their place. Over plain http (development) a browser
 * refuses a `__Host-` cookie, and the plain names stay. Each setting reads
 * its own names only.
 */
const cookieNames = (secure) =>
  secure
    ? {
        session: "__Host-astro_portal_session",
        csrf: "__Host-astro_portal_csrf",
      }
    : { session: "astro_portal_session", csrf: "astro_portal_csrf" };
const sessionCookie = (value, secure) =>
  `${cookieNames(secure).session}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
const csrfCookie = (value, secure) =>
  `${cookieNames(secure).csrf}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure ? "; Secure" : ""}`;
const expiredCookie = (name, secure, httpOnly = false) =>
  `${name}=; Path=/; Max-Age=0; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure ? "; Secure" : ""}`;

export function authConfiguration(env = process.env) {
  const mode = authMode(env);
  return {
    enabled: mode !== "disabled",
    mode,
    databasePath: env.ASTRO_PORTAL_DATABASE_PATH || null,
    databaseUrl: env.ASTRO_PORTAL_DATABASE_URL || null,
    bootstrapSecret: env.ASTRO_PORTAL_BOOTSTRAP_SECRET || null,
    // The key of a private server's recovery codes and of the counters of
    // its sign-in (password-sign-in.js); the codes sent by e-mail are kept
    // under the same key (spaces/configuration.js).
    signInKey: env.ASTRO_PORTAL_SIGN_IN_KEY || null,
    secureCookies:
      /^(1|true|yes)$/i.test(env.ASTRO_PORTAL_COOKIE_SECURE || "") ||
      env.NODE_ENV === "production",
    // `ASTRO_PORTAL_COOKIE_SECURE=false`, said explicitly: a private server
    // of the local network, opened over plain http and never exposed to the
    // Internet, keeps its web session without https. Honoured by a private
    // server only, never by an extension's service (which keeps
    // `Secure` cookies in production whatever this says); unset, the
    // cookies are `Secure` in production (docs/PRIVATE_NOTEBOOK_AUTH.md).
    insecureCookiesRequested: /^(0|false|no|off)$/i.test(
      String(env.ASTRO_PORTAL_COOKIE_SECURE ?? "").trim(),
    ),
    // Whether an extension takes `email-code` over is read from the
    // settings each time (sign-in-extension.js `enabled`); the shared
    // service is made again when they change.
    hostedSpaces: env.ASTRO_PORTAL_HOSTED_SPACES || null,
    // Where the network origin of a visitor is read (`clientOrigin`).
    ...clientOriginSettings(env),
  };
}

function signInKeyOf(value) {
  const key = Buffer.from(String(value || ""), "base64");
  if (key.length !== 32)
    throw new Error(
      "ASTRO_PORTAL_SIGN_IN_KEY must be a base64-encoded 32-byte key.",
    );
  return key;
}

export function createAuthService({
  repository,
  configuration = authConfiguration(),
  clock = () => new Date(),
} = {}) {
  if (!configuration.enabled)
    return { status: () => ({ enabled: false, authenticated: false }) };
  if (!configuration.databasePath && !configuration.databaseUrl && !repository)
    throw new Error(
      "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required when authentication is enabled.",
    );
  const mode = configuration.mode || PASSWORD_MODE;
  if (!AUTH_MODES.includes(mode))
    throw new Error(
      authModeProblem({ ASTRO_PORTAL_AUTH_MODE: mode }) ||
        `Unknown sign-in mode ${mode}.`,
    );
  // Accepting an injected repository keeps the service independently testable.
  // In a running portal every auth operation shares the one process driver with
  // the other repositories, rather than opening a separate SQLite handle/pool.
  const repositoryPromise = Promise.resolve(
    repository ||
      createAuthenticationRepository({
        databasePath: configuration.databasePath,
        databaseUrl: configuration.databaseUrl,
        driver: databaseDriver({
          ASTRO_PORTAL_DATABASE_PATH: configuration.databasePath,
          ASTRO_PORTAL_DATABASE_URL: configuration.databaseUrl,
        }),
        dialect: configuration.databaseUrl ? "postgres" : "sqlite",
      }),
  );
  const getRepository = () => repositoryPromise;
  // `email-code` may be taken over by an extension;
  // a private server is the core's own, in either mode.
  const extension = mode === EMAIL_CODE_MODE ? signInExtension(mode) : null;
  const privateServer = !extension;
  const pairing = mode === PASSWORD_MODE;
  const secureCookies =
    configuration.secureCookies &&
    !(privateServer && configuration.insecureCookiesRequested === true);
  const names = cookieNames(secureCookies);
  const key = privateServer ? signInKeyOf(configuration.signInKey) : null;
  const notFound = () => authFailure("Not found.", "not_found", 404);
  const recoveryHash = (code) =>
    keyedDigest(key, "recovery", recoveryCodeForm(code));
  const gate = async () =>
    createPasswordGate({
      driver: (await getRepository()).driver,
      key,
      clock,
    });
  const createSession = async (tenantId, userId) => {
    const token = randomBytes(32).toString("base64url"),
      csrfToken = randomBytes(32).toString("base64url");
    await (
      await getRepository()
    ).createSession({
      tenantId,
      userId,
      tokenHash: digest(token),
      csrfHash: digest(csrfToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });
    return {
      token,
      csrfToken,
      cookies: [
        sessionCookie(token, secureCookies),
        csrfCookie(csrfToken, secureCookies),
      ],
    };
  };
  /**
   * The extension's reason for refusing a credential the core does not
   * recognise (e.g. `space_deleted`), as an error to throw,
   * or `null`. A failure to answer is no reason: the core's own refusal
   * stands.
   */
  const extensionRefusal = async (tokenHash) => {
    if (typeof extension?.refusedCredential !== "function") return null;
    try {
      const refusal = await extension.refusedCredential({ tokenHash });
      return refusal?.code
        ? authFailure(refusal.message, refusal.code, refusal.status || 401)
        : null;
    } catch {
      return null;
    }
  };
  const pairingSession = (session) => {
    if (!session?.tenant_id || !session?.user_id)
      throw authFailure(
        "Authentication required.",
        "authentication_required",
        401,
      );
    return session;
  };
  const addressOf = (value) => {
    const email = normalizeEmail(value);
    if (!isValidEmail(email))
      throw refuse("email_invalid", "Enter a valid e-mail address.", 400);
    return email;
  };
  const newPassword = (value) => {
    if (typeof value !== "string" || value.length < PASSWORD_MIN_LENGTH)
      throw refuse(
        "password_too_short",
        `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
        400,
      );
    return value;
  };
  /** The ten recovery codes of a new account, and their digests. */
  const recoveryCodesAndHashes = () => {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    return { codes, hashes: codes.map(recoveryHash) };
  };
  const organizationOf = (value) =>
    String(value || DEFAULT_ORGANIZATION)
      .trim()
      .slice(0, 120) || DEFAULT_ORGANIZATION;
  const signedIn = async (owner, eventType = "auth.logged_in") => {
    const session = await createSession(String(owner.tenant_id), owner.id);
    await (
      await getRepository()
    ).audit({ tenantId: owner.tenant_id, userId: owner.id, eventType });
    return { cookies: session.cookies };
  };

  return {
    mode,
    privateServer,
    async status(headers) {
      const repo = await getRepository();
      const session = await this.session(headers);
      if (!privateServer)
        return {
          enabled: true,
          method: mode,
          signInPath: extension.signInPath,
          initialized: true,
          authenticated: Boolean(session),
          user: session
            ? {
                email: session.email,
                administrator: await this.administrationAllowed(session),
              }
            : null,
        };
      return {
        enabled: true,
        method: mode,
        // A private server holds one space, its owner's: never created by
        // signing in.
        spaceCreation: "closed",
        signInPath: pairing ? "/auth/login" : "/auth/sign-in",
        initialized: (await repo.countUsers()) > 0,
        authenticated: Boolean(session),
        user: session ? { email: session.email, administrator: true } : null,
      };
    },
    /**
     * Whether the person of this web session may use the administration.
     * On a private server every session is its owner's. Under an extension
     * the extension decides.
     */
    async administrationAllowed(session) {
      if (!session) return false;
      if (privateServer) return true;
      return Boolean(await extension.administrationAllowed({ session }));
    },
    /**
     * Opens a web session for a person the caller already proved (a code
     * received by e-mail). The same cookies as every sign-in.
     */
    async openSession({ tenantId, userId }) {
      const session = await createSession(tenantId, userId);
      await (
        await getRepository()
      ).audit({ tenantId, userId, eventType: "auth.logged_in" });
      return { cookies: session.cookies };
    },
    /**
     * A new device bearer credential for the sign-in by e-mail code, which
     * registers the device itself: the token,
     * returned once to the device, and the only thing a `device_tokens` row
     * may keep of it, its hash. The format of both stays defined here,
     * beside `requireDeviceAuth` that reads them.
     */
    newDeviceCredential() {
      const deviceToken = randomBytes(32).toString("base64url");
      return { deviceToken, tokenHash: digest(deviceToken) };
    },
    async session(headers) {
      const token = cookieValue(headers, names.session);
      if (!token) return null;
      const repo = await getRepository();
      const session = await repo.findSession(digest(token));
      if (!session || session.disabled_at) return null;
      await repo.touchSession(session.id);
      await markSpaceActive(repo, session.tenant_id);
      return session;
    },
    async requireSession(headers) {
      const session = await this.session(headers);
      if (session) return session;
      const token = cookieValue(headers, names.session);
      const refusal = token ? await extensionRefusal(digest(token)) : null;
      if (refusal) throw refusal;
      throw new Error("Authentication required.");
    },
    /**
     * Creates an eight-character challenge that can be claimed once in five
     * minutes. Pairing belongs to a private server in the `password` mode:
     * signing in by e-mail code, a device signs in by itself, and a pairing
     * would attach it around that sign-in, so the three pairing calls answer
     * 404 there.
     */
    async createDevicePairing({ session }) {
      if (!pairing) throw notFound();
      const current = pairingSession(session);
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const repo = await getRepository();
      // Collisions are extremely unlikely, but insertion is still conditional
      // so a random collision never overwrites someone else's live challenge.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = pairingCode();
        if (
          await repo.createDevicePairing({
            code,
            tenantId: current.tenant_id,
            userId: current.user_id,
            expiresAt,
          })
        )
          return { code, expiresAt };
      }
      throw authFailure(
        "A pairing code could not be created. Please try again.",
        "pairing_creation_failed",
        503,
      );
    },
    /**
     * The account page's own poll target: has this pairing code been
     * claimed yet? Tenant-scoped through the same `pairingSession` guard
     * every other pairing/device call uses, so one tenant can never probe
     * another tenant's pairing codes by guessing them.
     */
    async pairingStatus({ session, code }) {
      if (!pairing) throw notFound();
      const current = pairingSession(session);
      const normalizedCode = normalizePairingCode(code);
      if (!pairingCodePattern.test(normalizedCode))
        throw authFailure("Pairing code not found.", "pairing_not_found", 404);
      const status = await (
        await getRepository()
      ).findDevicePairingStatus({
        code: normalizedCode,
        tenantId: current.tenant_id,
      });
      if (!status)
        throw authFailure("Pairing code not found.", "pairing_not_found", 404);
      return status;
    },
    /**
     * Exchanges one valid, unclaimed challenge for a device-only bearer
     * credential. The raw token is returned here exactly once and is never
     * persisted or written to the audit trail.
     */
    async claimDevicePairing({ code, label, originClientInstanceId = null }) {
      if (!pairing) throw notFound();
      const normalizedCode = normalizePairingCode(code);
      if (!pairingCodePattern.test(normalizedCode))
        throw authFailure(
          "Pairing code must contain eight Crockford base32 characters.",
          "invalid_pairing_code",
          400,
        );
      const normalizedLabel = normalizedDeviceLabel(label);
      if (!normalizedLabel)
        throw authFailure(
          "Device label must contain between 1 and 120 characters.",
          "invalid_device_label",
          400,
        );
      const deviceToken = randomBytes(32).toString("base64url");
      const device = await (
        await getRepository()
      ).claimDevicePairing({
        code: normalizedCode,
        label: normalizedLabel,
        tokenHash: digest(deviceToken),
        originClientInstanceId,
      });
      if (!device)
        throw authFailure(
          "Pairing code is invalid, expired, or already claimed.",
          "pairing_unavailable",
          409,
        );
      return { deviceToken };
    },
    /**
     * Authenticates a device bearer token without involving browser cookies or
     * CSRF. `synchronize` is deliberately opt-in so account/device-auth-only
     * activity updates last seen but not the synchronization timestamp.
     */
    async requireDeviceAuth(headers, { synchronize = false } = {}) {
      const deviceToken = bearerToken(headers);
      if (!deviceToken)
        throw authFailure(
          "Device authentication required.",
          "device_authentication_required",
          401,
        );
      const tokenHash = digest(deviceToken);
      const repo = await getRepository();
      // Signing in by e-mail code, the token of a device detached from its
      // space — from « Mes appareils », by itself, or by its attachment to
      // another space — answers `device_detached`, on every route, so that
      // the application erases its copy of the space. A private server in
      // the `password` mode keeps its answer to a revoked token.
      // A credential of a deleted space answers `space_deleted` first (the
      // extension says so): its devices are detached too, but the space is
      // gone, not the device.
      const refused = async () =>
        (await extensionRefusal(tokenHash)) ||
        (mode === EMAIL_CODE_MODE &&
        (await repo.isDetachedDeviceToken(tokenHash))
          ? authFailure(
              "This device was detached from its space.",
              "device_detached",
              401,
            )
          : authFailure(
              "Device authentication required.",
              "device_authentication_required",
              401,
            ));
      const device = await repo.findActiveDeviceToken(tokenHash);
      if (!device || !secureEqual(device.token_hash, tokenHash))
        throw await refused();
      // The build the device runs, when its client header names it
      // (`api/client-identity.js`): written with the stamp, never a refusal.
      const touched = await repo.touchDeviceToken(device.id, {
        synchronize,
        client: clientIdentityOf(headers),
      });
      // A revocation between lookup and touch must not leave a request
      // authenticated. touchDeviceToken's conditional update is the race gate.
      if (touched.rowCount !== 1) throw await refused();
      // The state the application reports about itself, for a service that
      // registered a sink (`client-state-sink.js`); never a refusal.
      await noteClientState({ kind: "space", deviceId: device.id, headers });
      await markSpaceActive(repo, device.tenant_id);
      const { token_hash, ...authenticatedDevice } = device;
      return authenticatedDevice;
    },
    async listDevices({ session }) {
      const current = pairingSession(session);
      const devices = await (
        await getRepository()
      ).listDevices(current.tenant_id);
      return {
        devices: devices.map((device) => ({
          id: device.id,
          label: device.label,
          createdAt: device.created_at,
          lastSyncAt: device.last_sync_at,
          revokedAt: device.revoked_at,
        })),
      };
    },
    async revokeDevice({ session, deviceId, originClientInstanceId = null }) {
      const current = pairingSession(session);
      const device = await (
        await getRepository()
      ).revokeDevice({
        tenantId: current.tenant_id,
        deviceId,
        originClientInstanceId,
      });
      if (!device)
        throw authFailure("Device not found.", "device_not_found", 404);
    },

    // ——— A private server's installation ———

    /**
     * Throws unless the installation is still open (no person yet) and
     * `bootstrapSecret` is the one of the settings.
     */
    async assertInstallationOpen(bootstrapSecret) {
      if (!privateServer) throw notFound();
      if ((await (await getRepository()).countUsers()) > 0)
        throw new Error("Bootstrap is already closed.");
      if (
        !configuration.bootstrapSecret ||
        !secureEqual(bootstrapSecret, configuration.bootstrapSecret)
      )
        throw new Error("Invalid bootstrap secret.");
    },
    /**
     * The `password` mode's installation, in one step: the address and a
     * password of 14 characters or more create the account and sign in.
     */
    async installWithPassword({
      bootstrapSecret,
      email: typedEmail,
      password,
      organizationName,
    }) {
      if (!pairing) throw notFound();
      await this.assertInstallationOpen(bootstrapSecret);
      const email = addressOf(typedEmail);
      const hash = await passwordHash(newPassword(password));
      const recovery = recoveryCodesAndHashes();
      const account = await (
        await getRepository()
      ).createOwnerAccount({
        email,
        passwordHash: hash,
        organizationName: organizationOf(organizationName),
        recoveryCodeHashes: recovery.hashes,
      });
      const session = await createSession(account.tenantId, account.userId);
      return { recoveryCodes: recovery.codes, cookies: session.cookies };
    },
    /**
     * The `email-code` mode's account, written by the installation once
     * its first code is proven (auth/installation.js): the codes to show
     * once, and the writer to run in the transaction that uses the code.
     */
    pendingOwner({ organizationName }) {
      if (!privateServer || pairing) throw notFound();
      const recovery = recoveryCodesAndHashes();
      return {
        recoveryCodes: recovery.codes,
        write: (transaction, { email, language }) =>
          insertOwnerAccount(transaction, {
            email,
            passwordHash: null,
            organizationName: organizationOf(organizationName),
            recoveryCodeHashes: recovery.hashes,
            language,
          }),
      };
    },

    // ——— A private server's sign-in ———

    /**
     * `POST /api/auth/login`. With `email` and `password` (the `password`
     * mode), or with a `recoveryCode` (either private mode; in the
     * `password` mode it comes with the `newPassword` it sets, so that a
     * lost password, or a server moved from `email-code`, is replaced at
     * once). Refusals are SignInRefusals with their code and status.
     */
    async login({
      email: typedEmail,
      password,
      recoveryCode,
      newPassword: typedNewPassword,
      headers,
    }) {
      if (!privateServer) throw notFound();
      const repo = await getRepository();
      const origin = clientOrigin(headers, configuration);
      if (recoveryCode !== undefined && recoveryCode !== null) {
        if (!recoveryCodeForm(recoveryCode))
          throw refuse(
            "invalid_request",
            "Type one of your recovery codes.",
            400,
          );
        const replacement = pairing ? newPassword(typedNewPassword) : null;
        const owner = await repo.findOwner();
        if (!owner)
          throw refuse(
            "not_initialized",
            "This portal is not set up yet.",
            409,
            { bootstrapPath: "/auth/bootstrap" },
          );
        await (
          await gate()
        ).checkRecoveryCode({
          email: normalizeEmail(owner.email),
          origin,
          use: () =>
            repo.consumeRecoveryCode(owner.id, recoveryHash(recoveryCode)),
        });
        if (replacement)
          await repo.setPasswordHash(owner.id, await passwordHash(replacement));
        return await signedIn(owner, "auth.recovery_code_used");
      }
      if (!pairing) throw notFound();
      if (typeof password !== "string" || !password)
        throw refuse("invalid_request", "Type your password.", 400);
      const email = addressOf(typedEmail);
      let owner = null;
      await (
        await gate()
      ).checkPassword({
        email,
        origin,
        compare: async () => {
          owner = await repo.findOwnerByEmail(email);
          const matches = await verifyPassword(
            password,
            owner?.password_hash || UNKNOWN_PASSWORD_HASH,
          );
          return Boolean(owner?.password_hash) && matches;
        },
      });
      return await signedIn(owner);
    },
    async logout(headers) {
      const token = cookieValue(headers, names.session);
      if (token) await (await getRepository()).deleteSession(digest(token));
      return {
        cookies: [
          expiredCookie(names.session, secureCookies, true),
          expiredCookie(names.csrf, secureCookies),
        ],
      };
    },
    async verifyCsrf(headers, session = null) {
      const current = session || (await this.requireSession(headers));
      const provided = headers.get?.("x-astro-csrf") || headers["x-astro-csrf"];
      const cookie = cookieValue(headers, names.csrf);
      if (
        !provided ||
        !cookie ||
        !secureEqual(provided, cookie) ||
        !secureEqual(digest(provided), current.csrf_hash)
      )
        throw new Error("Invalid CSRF token.");
      return current;
    },
  };
}

export { SignInRefusal };
