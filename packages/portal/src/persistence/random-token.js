import { randomBytes } from "node:crypto";

/**
 * An unguessable public identifier: 18 random bytes, which encode to exactly
 * 24 base64url characters with no padding (over the floor of 22 the
 * addresses of the service hold to). Never derived from anything the owner
 * chose or from an identifier of the database; the caller stores it under a
 * unique index and mints a new one only on request. The private gallery of
 * a space (`organizations.portal_token`) takes its address from here, and
 * so does a composition's link to it.
 */
export function generateRandomToken() {
  return randomBytes(18).toString("base64url");
}
