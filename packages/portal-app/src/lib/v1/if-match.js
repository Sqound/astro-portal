import {
  InvalidIfMatch,
  parseIfMatch,
} from "portal/captures/capture-revision.js";
import { v1Error } from "./response.js";

/**
 * The `If-Match` header of an owner write of a capture — the revision the
 * client read, quoted (`"7"`). Absent: `{ ifMatch: null }` (the write is
 * applied, the revision moves). Not a quoted positive integer: the
 * `400 invalid_if_match` response. A revision the capture never had is
 * refused by the service (it knows the capture).
 */
export function ifMatchOf(request) {
  try {
    return { ifMatch: parseIfMatch(request.headers.get("if-match")) };
  } catch (error) {
    if (!(error instanceof InvalidIfMatch)) throw error;
    return {
      response: v1Error(error, {
        code: "invalid_if_match",
        message: error.message,
        status: 400,
      }),
    };
  }
}
