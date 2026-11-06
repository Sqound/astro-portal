"use client";
import { createElement } from "react";
import { getPlannerExtensions } from "portal/planner/extensions.js";

// The one place where the planner of the open core meets the offers of a
// shell: the extension point `planner.offers`. The core draws nothing that
// sells; wherever a locked place of the planner has something to show for
// the capability it holds back, it renders one of the components below, and
// each of them renders (with plain `createElement` calls: the file needs no
// JSX transform) the component the shell registered under the same name
// at `planner.offers` (`components`), or nothing. A server that registered no
// offers (the open-source composition, a private server) draws none of it, and
// the planner keeps the neutral sentences of `capability-gates.js`.
//
// What a shell registers at `planner.offers`:
//
//  - `gateCopy(locale)`, `browserPlanHeld(locale)`, `href({ locale, signedIn })`
//    and `price(locale, offer)`: the words that name what a capability held
//    back belongs to, and the way to them (read where a refusal is said);
//  - `copy(locale, key, values)`: any other sentence of its offers, by key;
//  - `lockedHref(locale, offer, feature)`: the address of the offers for a
//    locked place, with the name of the feature the person came from;
//  - `lightMapRowLabel(locale, offer)`: the spoken label of the labelled row
//    of « Lieux » while the light-pollution map is held back;
//  - `components`: the pieces below (`LockedChip`, `LockedFields`,
//    `LockedCard`, `PurchaseBoxDialog`, `LockedCardDialog`,
//    `NightsOfferDialog`, `TrendLocked`, `HeldChip`, `PurchasePrimary`,
//    `PlanExistsOffersCard`) and `SessionProvider`, a context provider that
//    says who is looking (`{ signedIn, signInHref }`).

/** What the shell registered at `planner.offers`, or `null`. */
const registered = () => getPlannerExtensions("planner.offers")[0] ?? null;

/** Did a shell register its offers? Nothing below draws without them. */
export const offersRegistered = () => registered() !== null;

/**
 * A sentence of the shell's offers, or an empty string where it has none (or
 * registered no offers).
 */
export function offersCopy(locale, key, values = {}) {
  const copy = registered()?.copy;
  return typeof copy === "function" ? copy(locale, key, values) : "";
}

/**
 * The way to the offers from a locked place, carrying the name of the
 * feature the person came from; `null` where no offers are registered.
 */
export function lockedOffersHref(locale, offer, feature) {
  const href = registered()?.lockedHref;
  return typeof href === "function" ? href(locale, offer, feature) : null;
}

/** The spoken label of the labelled row of « Lieux » (map held back). */
export function lightMapRowLabel(locale, offer = "planning") {
  const label = registered()?.lightMapRowLabel;
  return typeof label === "function" ? label(locale, offer) : "";
}

function slot(name) {
  function OffersSlot(props) {
    const Component = registered()?.components?.[name];
    return Component ? createElement(Component, props) : null;
  }
  OffersSlot.displayName = `OffersSlot(${name})`;
  return OffersSlot;
}

/** The tag of an offer on a locked feature; it opens the box of the feature. */
export const LockedChip = slot("LockedChip");
/** The purchase box of a locked feature, in a dialog. */
export const PurchaseBoxDialog = slot("PurchaseBoxDialog");
/** The lock card of a place, inline. */
export const LockedCard = slot("LockedCard");
/** The lock card of a place, in a dialog titled with the feature. */
export const LockedCardDialog = slot("LockedCardDialog");
/** What a multi-night gesture opens without the right. */
export const NightsOfferDialog = slot("NightsOfferDialog");
/** The locked inset of the weather trend of a place. */
export const TrendLocked = slot("TrendLocked");
/** The tag of an offer, as a plain chip (no gesture). */
export const HeldChip = slot("HeldChip");
/** The primary that buys a feature of a subscription. */
export const PurchasePrimary = slot("PurchasePrimary");
/** The card of the offers among those of a plan that already exists. */
export const PlanExistsOffersCard = slot("PlanExistsOffersCard");

const LockedFieldsSlot = slot("LockedFields");

/**
 * Fields held back by a capability. Where offers are registered they lead to
 * the box of the feature; otherwise they are only greyed.
 */
export function LockedFields(props) {
  if (!offersRegistered())
    return createElement(
      "div",
      { className: "locked-fields is-inert" },
      props.children,
    );
  return createElement(LockedFieldsSlot, props);
}

/**
 * Who is looking, for the boxes the offers draw: `value` is
 * `{ signedIn, signInHref }`. Nothing but `children` where no offers are
 * registered.
 */
export function OffersSession({ value, children }) {
  const Provider = registered()?.components?.SessionProvider;
  return Provider ? createElement(Provider, { value }, children) : children;
}
