import { v1Json } from "./response.js";

// The synthetic sessions of a private server: the nights
// of the operator's catalogue that match no session are listed by
// `GET /v1/journal` as read-only sessions of origin `import`, under an opaque
// identifier of the form `catalogue:<date>:<target key>`.
// `GET /v1/sessions/{id}` reads them; nothing else touches them.

/** Whether `id` is the identifier of a catalogue night (never a UUID). */
export function isSyntheticSessionId(id) {
  return typeof id === "string" && id.startsWith("catalogue:");
}

/**
 * The refusal every other route gives a catalogue night, or `null` for a real
 * session: a write is `409 session_read_only`, a read of anything but the
 * session itself `404 session_not_found`.
 */
export function syntheticSessionRefusal(id, { write }) {
  if (!isSyntheticSessionId(id)) return null;
  return write
    ? v1Json(
        {
          error: {
            code: "session_read_only",
            message: "This night comes from the catalogue and is read only.",
          },
        },
        { status: 409 },
      )
    : v1Json(
        {
          error: {
            code: "session_not_found",
            message: "The session was not found.",
          },
        },
        { status: 404 },
      );
}
