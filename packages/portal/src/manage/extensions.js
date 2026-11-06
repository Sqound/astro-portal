// The tabs a composition adds to « Mon espace », on the model of
// `portal/account/extensions.js`: the package owns this registry, and the
// application that embeds it registers its tabs, so that SpacePage.js, and
// every build that registers none, imports nothing of an optional package.
//
// A tab is `{ label(locale), Component, after? }`: the label, drawn after the
// core's tab `after` (at the end of the tabs when it is not named), and the
// component drawn in the panel when its tab is open, given
// `{ locale, item, fetcher, csrf, leaves, navigate, spaceEmail, timeZone,
// data }` (`item`: the rest of its address, `/{locale}/manage/<tab>/<item>`;
// `data`: what the composition handed over for this tab, or `null`). Registering a
// tab draws nothing by itself: the page draws it only when its composition
// says, for the request being drawn, that the tab exists (`extraTabs`), so
// that a tab never appears then vanishes.

const tabs = new Map();

export function registerManageTab(tab, extension) {
  if (!/^[a-z][a-z-]{1,30}$/.test(String(tab)))
    throw new Error(
      `A tab of « Mon espace » needs a plain name, not "${tab}".`,
    );
  if (!tabs.has(tab)) tabs.set(tab, extension);
}

/** The registered tab `tab`, or `null`. */
export function getManageTab(tab) {
  return tabs.get(tab) || null;
}

/** The registered tabs, in their order: `[tab, { label, Component }]`. */
export function getManageTabs() {
  return [...tabs.entries()];
}

// The places under a zone of a core's tab where a composition may draw one
// more block, and the only ones: the core draws the zone and reads the slot
// where the block belongs. A server that registers nothing draws nothing
// there.
//
// - `captures.storage`: under the line that says the free space's count in
//   the tab « Captures ». The core asks only where that line is drawn (a
//   space with a count limit, outside its read-only window, on a server that
//   words the count). An extension is `{ shows(context), Component }`:
//   `shows` says whether the block is drawn for this request, `Component`
//   draws it, given `{ locale, offersHref, storage }` (`context` is the
//   same). Where the block is drawn, the core leaves its own link to the
//   offers out of the line above it: the block carries the way itself.
const SLOTS = ["captures.storage"];
const slots = new Map();

export function registerManageSlot(slot, extension) {
  if (!SLOTS.includes(slot))
    throw new Error(`Unknown slot of « Mon espace »: ${slot}`);
  if (
    typeof extension?.shows !== "function" ||
    typeof extension?.Component !== "function"
  )
    throw new Error(`A slot of « Mon espace » needs { shows, Component }.`);
  if (!slots.has(slot)) slots.set(slot, extension);
}

/** The extension registered in `slot`, or `null`. */
export function getManageSlot(slot) {
  return slots.get(slot) || null;
}

/** Forgets every registered slot: for the tests of the core. */
export function clearManageSlots() {
  slots.clear();
}
