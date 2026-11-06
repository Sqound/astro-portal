import { join, resolve } from "node:path";
import {
  CORE_MAIL_SENDERS,
  registeredMailSender,
  registeredMailSenders,
} from "./registry.js";
import { smtpProblems, smtpSettings } from "./smtp-settings.js";
import { testInboxProblems, testInboxSettings } from "./test-inbox.js";

/**
 * The settings of the sending of the messages of the sign-in, read from the
 * environment, without loading any sender: the service checks them at start
 * (docs/PRIVATE_NOTEBOOK_AUTH.md).
 *
 * - ASTRO_PORTAL_MAIL_SENDER: `smtp`, `file` (the fake mailbox), a sender
 *   registered by an extension, or `disabled`
 *   (the default: nothing can be sent).
 * - ASTRO_PORTAL_MAIL_FROM: the sender address of every message.
 * - ASTRO_PORTAL_MAIL_FILE_DIR, ASTRO_PORTAL_MAIL_FILE_ALLOWED: the fake
 *   mailbox, refused in production unless allowed explicitly: it writes
 *   the codes on disk.
 * - ASTRO_PORTAL_TEST_INBOX_DOMAIN, ASTRO_PORTAL_TEST_INBOX_DIR,
 *   ASTRO_PORTAL_TEST_INBOX_RETENTION_DAYS, ASTRO_PORTAL_ENVIRONMENT: the
 *   test inbox of a test deployment (test-inbox.js), refused anywhere else.
 * - ASTRO_PORTAL_PRODUCTION_HOSTS: the host names of the production
 *   deployment, which the test inbox and the re-run of the sky check refuse
 *   (test-inbox.js).
 * - the settings of `smtp` (smtp-settings.js) and of every registered
 *   sender (`settings(env)`).
 */
const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Every value ASTRO_PORTAL_MAIL_SENDER may take in this process. */
export function mailSenderNames() {
  return [
    ...CORE_MAIL_SENDERS,
    ...registeredMailSenders().map((sender) => sender.kind),
    "disabled",
  ];
}

export function mailSettings(env = process.env, { runtime }) {
  const sender = (
    text(env.ASTRO_PORTAL_MAIL_SENDER) || "disabled"
  ).toLowerCase();
  return {
    mailSender: mailSenderNames().includes(sender) ? sender : "invalid",
    mailFrom: text(env.ASTRO_PORTAL_MAIL_FROM),
    // A path of the runtime, never of the source: kept out of the bundler's
    // file tracing, as portal-app/lib/config.server.js does for its own.
    mailFileDir: resolve(
      /* turbopackIgnore: true */ text(env.ASTRO_PORTAL_MAIL_FILE_DIR) ||
        join(runtime, "mailbox"),
    ),
    // The fake mailbox writes codes on disk: in production only when the
    // operator says so explicitly.
    mailFileAllowed:
      env.NODE_ENV !== "production" ||
      text(env.ASTRO_PORTAL_MAIL_FILE_ALLOWED) === "1",
    // Test deployments only: the addresses of a reserved `.test` domain are written to
    // a directory instead of being sent (test-inbox.js).
    testInbox: testInboxSettings(env),
    testInboxProblems: testInboxProblems(env),
    ...smtpSettings(env),
    ...Object.assign(
      {},
      ...registeredMailSenders().map((registered) => registered.settings(env)),
    ),
  };
}

/** What keeps the chosen sender from sending, by setting name. */
export function mailSettingsProblems(configuration) {
  return [
    ...(configuration.testInboxProblems || []),
    ...senderProblems(configuration),
  ];
}

function senderProblems(configuration) {
  switch (configuration.mailSender) {
    case "invalid":
      return [`ASTRO_PORTAL_MAIL_SENDER (${mailSenderNames().join(", ")})`];
    case "disabled":
      return ["ASTRO_PORTAL_MAIL_SENDER is disabled"];
    case "file":
      return configuration.mailFileAllowed
        ? []
        : [
            "ASTRO_PORTAL_MAIL_SENDER=file is refused in production (ASTRO_PORTAL_MAIL_FILE_ALLOWED=1 allows it)",
          ];
    case "smtp":
      return smtpProblems(configuration);
    default:
      return (
        registeredMailSender(configuration.mailSender)?.problems(
          configuration,
        ) ?? [`ASTRO_PORTAL_MAIL_SENDER (${mailSenderNames().join(", ")})`]
      );
  }
}
