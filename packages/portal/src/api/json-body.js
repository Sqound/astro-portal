/**
 * Reads a JSON request body with a ceiling on its size (isolation audit,
 * "JSON bodies"): a route handler's `request.json()` reads whatever it is
 * sent, and with open sign-up any session or device can send it. The body
 * is streamed and abandoned as soon as it passes `limit` bytes — whatever
 * `Content-Length` announces, or without one.
 *
 * - Too large: throws `{ code: "payload_too_large", status: 413 }`, which
 *   the v1 error envelope (`v1Error`) carries as it is.
 * - Not JSON: throws a `SyntaxError` without `code`/`status`, so each
 *   route's own `invalid_request` answer is unchanged.
 */
export const DEFAULT_JSON_BODY_BYTES = 1024 * 1024;

export class PayloadTooLargeError extends Error {
  constructor(limit) {
    super(`The request body exceeds ${limit} bytes.`);
    this.name = "PayloadTooLargeError";
    this.code = "payload_too_large";
    this.status = 413;
    this.limit = limit;
  }
}

/**
 * The body as bytes, under the same ceiling: what `readBodyText` decodes,
 * and what a route that takes a file as its body (« Importer mes données »)
 * reads as it is.
 */
export async function readBodyBytes(
  request,
  { limit = DEFAULT_JSON_BODY_BYTES } = {},
) {
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > limit)
    throw new PayloadTooLargeError(limit);
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(limit);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** The body as UTF-8 text, under the same ceiling (a signed webhook, a text form). */
export async function readBodyText(request, options) {
  return new TextDecoder("utf-8").decode(await readBodyBytes(request, options));
}

export async function readJsonBody(request, options) {
  return JSON.parse(await readBodyText(request, options));
}
