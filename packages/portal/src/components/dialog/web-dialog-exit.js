// A web dialog leaves the way it came — a
// 200 ms fade and an 8 px fall, its backdrop fading with it — and nothing
// moves under `prefers-reduced-motion`. The entry is pure CSS
// (`.web-dialog[open]` in `portal.css`). The exit cannot be: the owner of a
// `WebDialog` removes it from the tree, and React takes its `<dialog>` out of
// the document at once. So, while the dialog is still there, a still copy of
// its panel is laid in the top layer (a manual popover: no focus moved,
// nothing made inert) and plays the exit, then goes.
//
// The copy lives in a shadow root, with the document's own rules adopted
// into it: it looks exactly like the dialog it replaces, yet no
// `querySelector`, text search or click of the page (or of a test) can ever
// reach it — the live page never holds a second, dead copy of a dialog.

/** The length of the exit (and of the entry, in `portal.css`). */
export const WEB_DIALOG_MOTION_MS = 200;

/** How far the panel falls as it fades. */
export const WEB_DIALOG_MOTION_PX = 8;

let adopted = null;

/**
 * The document's rules as one constructed sheet, built once (and again when
 * the document's sheets change); `null` when the browser cannot adopt one.
 */
function documentSheet(env) {
  const { document } = env;
  const Sheet = env.CSSStyleSheet;
  if (!document?.styleSheets || typeof Sheet !== "function") return null;
  const sheets = [...document.styleSheets];
  const signature = sheets.length;
  if (adopted?.document === document && adopted.signature === signature)
    return adopted.sheet;
  let text = "";
  for (const sheet of sheets) {
    try {
      for (const rule of sheet.cssRules) text += `${rule.cssText}\n`;
    } catch {
      // A sheet of another origin cannot be read; the dialogs' own rules
      // are in the portal's sheet.
    }
  }
  try {
    const sheet = new Sheet();
    sheet.replaceSync(text);
    adopted = { document, signature, sheet };
    return sheet;
  } catch {
    return null;
  }
}

/** Whether the person asked the system for reduced motion. */
export function reducesMotion(env = globalThis) {
  try {
    return Boolean(
      env.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    );
  } catch {
    return false;
  }
}

/**
 * Builds the document's sheet ahead of the first exit (from an idle moment
 * after a dialog opens), so the exit itself costs nothing.
 */
export function prepareWebDialogExit(env = globalThis) {
  if (reducesMotion(env)) return;
  const run = () => documentSheet(env);
  if (typeof env.requestIdleCallback === "function")
    env.requestIdleCallback(run);
  else run();
}

/**
 * What `cloneNode` leaves behind and the eye would miss for 200 ms: where
 * each scrolled box stood, what was typed or ticked.
 */
function keepState(panel, copy) {
  const from = [panel, ...panel.querySelectorAll("*")];
  const to = [copy, ...copy.querySelectorAll("*")];
  for (let index = 0; index < from.length && index < to.length; index += 1) {
    const source = from[index];
    const target = to[index];
    try {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(source.tagName || "")) {
        if (source.type !== "file") target.value = source.value;
        if (typeof source.checked === "boolean")
          target.checked = source.checked;
      }
      if (source.scrollTop) target.scrollTop = source.scrollTop;
      if (source.scrollLeft) target.scrollLeft = source.scrollLeft;
    } catch {
      // A copy a little less faithful, never a broken close.
    }
  }
}

/**
 * Plays the exit of the dialog whose panel is [panel], still in the
 * document. Answers whether an exit plays: never under reduced motion, nor
 * where the browser has no popover, no shadow root or no adoptable sheet.
 */
export function playWebDialogExit(panel, env = globalThis) {
  const { document } = env;
  if (!panel || !document?.body || reducesMotion(env)) return false;
  const host = document.createElement("div");
  if (
    typeof host.showPopover !== "function" ||
    typeof host.attachShadow !== "function" ||
    typeof host.animate !== "function"
  )
    return false;
  const sheet = documentSheet(env);
  if (!sheet) return false;
  host.className = "web-dialog-exit";
  host.setAttribute("popover", "manual");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("inert", "");
  const root = host.attachShadow({ mode: "closed" });
  root.adoptedStyleSheets = [sheet];
  const frame = document.createElement("div");
  frame.setAttribute(
    "style",
    "display:grid;place-items:center;box-sizing:border-box;width:100%;height:100%;padding:1rem;",
  );
  const copy = panel.cloneNode(true);
  frame.append(copy);
  root.append(frame);
  document.body.append(host);
  try {
    host.showPopover();
  } catch {
    host.remove();
    return false;
  }
  keepState(panel, copy);
  const timing = {
    duration: WEB_DIALOG_MOTION_MS,
    easing: "ease-in",
    fill: "forwards",
  };
  copy.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: `translateY(${WEB_DIALOG_MOTION_PX}px)` },
    ],
    timing,
  );
  const fade = host.animate([{ opacity: 1 }, { opacity: 0 }], timing);
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    host.remove();
  };
  if (fade?.finished?.then) fade.finished.then(remove, remove);
  // Whatever becomes of the animation, the copy never outlives its exit.
  env.setTimeout?.(remove, WEB_DIALOG_MOTION_MS + 100);
  return true;
}
