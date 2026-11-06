import { MailDeliveryError } from "./errors.js";
import { createFileSender } from "./file.js";
import { registeredMailSender } from "./registry.js";
import { createSmtpSender } from "./smtp.js";
import { withTestInbox } from "./test-inbox.js";

export { MailDeliveryError };

/**
 * The sender chosen by ASTRO_PORTAL_MAIL_SENDER (settings.js): `file` (the
 * fake mailbox), `smtp`, a sender registered by an extension, or
 * `disabled`. `null` when no message can be sent
 * (disabled or incomplete settings): the request for a code then answers
 * `sign_in_unavailable` before anything is written.
 *
 * This module loads the mail library; the service's start (server.mjs)
 * reads the settings only (settings.js) and never imports it.
 */
export function createMailSender(configuration, options = {}) {
  const sender = createRealMailSender(configuration, options);
  // Test deployments only (test-inbox.js): the addresses of the reserved test domain
  // are written to a directory, every other message goes to `sender` as it
  // is. Never with a setting the start refuses.
  return configuration.testInbox?.active &&
    !configuration.testInboxProblems?.length
    ? withTestInbox(sender, configuration.testInbox, options)
    : sender;
}

function createRealMailSender(configuration, options) {
  switch (configuration.mailSender) {
    case "file":
      // Codes written on disk: refused in production unless allowed
      // explicitly (settings.js `mailFileAllowed`).
      if (!configuration.mailFileAllowed) return null;
      return createFileSender({
        directory: configuration.mailFileDir,
        ...(options.clock ? { clock: options.clock } : {}),
      });
    case "smtp":
      if (!configuration.smtpUrl || !configuration.mailFrom) return null;
      try {
        return createSmtpSender({
          url: configuration.smtpUrl,
          from: configuration.mailFrom,
          allowInsecure: configuration.smtpAllowInsecure,
          ...(options.smtp || {}),
        });
      } catch {
        // A malformed address: no message can leave.
        return null;
      }
    default: {
      const registered = registeredMailSender(configuration.mailSender);
      return registered ? registered.create(configuration, options) : null;
    }
  }
}
