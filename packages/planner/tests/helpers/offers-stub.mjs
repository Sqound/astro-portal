import { createElement } from "react";
import { registerPlannerExtension } from "portal/planner/extensions.js";

// What a shell that sells registers at `planner.offers`, reduced to the one
// piece these tests look at: the greyed tag of an offer on a held entry, as a
// chip draws it. The real pieces are the hosted service's (the commercial
// planner package, private); the open planner only reaches them through
// `planner/offers-slot.js`.
export function registerHeldChipOffers() {
  registerPlannerExtension("planner.offers", {
    gateCopy: () => ({}),
    href: () => "/fr/offers",
    price: () => "34,99 €",
    components: {
      HeldChip: ({ offer }) =>
        createElement(
          "span",
          { className: "advanced-chip-wrap" },
          createElement(
            "span",
            {
              className: "advanced-chip is-locked",
              role: "img",
              "aria-label": "Planification avancée",
              "data-advanced-chip": offer,
            },
            "Planification avancée",
          ),
        ),
    },
  });
}
