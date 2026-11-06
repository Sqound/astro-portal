// "Laissé": the width, in pixels, of a text written in the name of a block of
// the frise (`.planner-schedule-block strong`: 0.67 rem, bold, the page's own
// family), measured on a canvas. `null` where there is no canvas (a server
// render, a test without a DOM): `scheduleBlockMark` then keeps the older
// rule.
export const scheduleBlockNameRem = 0.67;

export function createScheduleBlockMeasure(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== "function") return null;
  let context = null;
  try {
    context = doc.createElement("canvas").getContext("2d");
  } catch {
    context = null;
  }
  if (!context) return null;
  return (text) => {
    const view = doc.defaultView;
    const root = Number.parseFloat(
      view?.getComputedStyle(doc.documentElement).fontSize ?? "16",
    );
    const family = view?.getComputedStyle(doc.body).fontFamily || "sans-serif";
    context.font = `700 ${scheduleBlockNameRem * (Number.isFinite(root) ? root : 16)}px ${family}`;
    return context.measureText(text).width;
  };
}
