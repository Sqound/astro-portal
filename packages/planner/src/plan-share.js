// « Partager » of a plan: the browser's own share sheet where it has one, else
// the clipboard, else nothing -- and the person is always told which: a share
// that does nothing, with no word, looks broken.
//
// Returns `"shared"` (the share sheet took it), `"copied"` (the clipboard has
// it), `"cancelled"` (the person closed the share sheet: silent) or
// `"unavailable"` (this browser can do neither). `host` is the `navigator`.
export async function sharePlanText(host, { title, text }) {
  if (typeof host?.share === "function") {
    try {
      await host.share({ title, text });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // The share sheet failed for another reason: the clipboard may still do.
    }
  }
  if (typeof host?.clipboard?.writeText === "function") {
    try {
      await host.clipboard.writeText(text);
      return "copied";
    } catch {
      // Refused (permission, an insecure page): nothing was copied.
    }
  }
  return "unavailable";
}
