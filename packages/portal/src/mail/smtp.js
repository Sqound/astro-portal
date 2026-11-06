import nodemailer from "nodemailer";
import { MailDeliveryError } from "./errors.js";
import { parseSmtpUrl } from "./smtp-settings.js";

/**
 * The `smtp` sender: the messages of the sign-in handed to a mail server of
 * the owner's choosing (a provider's submission server with an application
 * password, or a relay of the local network), through nodemailer.
 *
 * - `smtps://…:465`: TLS from the first byte; `smtp://…:587`: STARTTLS,
 *   required — a server that does not offer it receives nothing — unless
 *   `allowInsecure` (ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1), which also accepts
 *   a certificate that cannot be verified.
 * - A failure never repeats the address of the server (it holds the
 *   password), nor what the server answered: only the error's code and the
 *   SMTP status, as a MailDeliveryError. The request for a code then fails
 *   and nothing is counted as sent.
 * - nodemailer reads no file and no address of its own for a message
 *   (`disableFileAccess`, `disableUrlAccess`): the message is made of the
 *   strings the service wrote.
 */
export function createSmtpSender({
  url,
  from,
  allowInsecure = false,
  timeoutMs = 15_000,
  createTransport = nodemailer.createTransport,
}) {
  const server = parseSmtpUrl(url);
  if (!from) throw new Error("ASTRO_PORTAL_MAIL_FROM is required by smtp.");
  const transport = createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    ...(server.user ? { auth: { user: server.user, pass: server.pass } } : {}),
    requireTLS: !server.secure && !allowInsecure,
    ...(allowInsecure ? { tls: { rejectUnauthorized: false } } : {}),
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return {
    kind: "smtp",
    host: server.host,
    port: server.port,
    async send({ to, subject, text, html }) {
      try {
        await transport.sendMail({
          from,
          to,
          subject,
          text,
          html,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
      } catch (error) {
        const code = typeof error?.code === "string" ? error.code : "error";
        const status = Number.isInteger(error?.responseCode)
          ? ` ${error.responseCode}`
          : "";
        throw new MailDeliveryError(
          `The mail server refused the message or could not be reached (${code}${status}).`,
        );
      }
      return { accepted: true };
    },
    /** Closes the connections a pooled transport may keep (tests). */
    close() {
      transport.close?.();
    },
  };
}
