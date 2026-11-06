/**
 * A refusal of the sign-in by e-mail code, in the v1 error envelope: `code`,
 * `message`, the HTTP `status`, and the extra fields that sit beside
 * `error` (`attemptsRemaining`, `retryAt`, `attachment`,
 * `currentSpaceEmail`). `http.js` turns it into a response.
 */
export class SignInRefusal extends Error {
  constructor(code, message, status, extra = {}) {
    super(message);
    this.name = "SignInRefusal";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export const refuse = (code, message, status, extra) =>
  new SignInRefusal(code, message, status, extra);
