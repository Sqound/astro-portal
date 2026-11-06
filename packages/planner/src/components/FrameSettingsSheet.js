"use client";

import { useId, useState } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { RetainedSentence } from "./RetainedNotice.js";
import { heldCopy } from "../capability-gates.js";
import {
  LockedChip,
  LockedFields,
  PurchaseBoxDialog,
  lockedOffersHref,
} from "../offers-slot.js";

// The settings of a framing, behind "Paramètres" (on the planner's map and
// in the framing editor). A framing of a single field -- a centre and an
// orientation, drawn with the field of the equipment -- needs none of them and
// belongs to every profile; the "Mosaïque" section is the mosaics', which
// `planner.mosaic` holds.
//
// With a surface registered at `planner.framing.surface` and a profile that
// carries `planner.mosaic`, the sheet is that surface's own, with its live
// controls. Otherwise the core draws the section greyed: its controls disabled
// and a line that says why -- in the words of the offers, when a shell
// registered them at `planner.offers` (the chip "Planification avancée" in the
// title's corner, the fields greyed and leading to the offers, no sentence, no
// "Voir les offres" link); in the core's neutral words alone where no offers
// are registered.
export function FrameSettingsSheet({
  locale,
  mosaicAllowed,
  signedIn = false,
  onCancel,
  onConfirm,
  ...surface
}) {
  const lineId = useId();
  // The greyed "Mosaïque" tab opens the purchase box, in a dialog, as
  // the greyed fields and the tag do.
  const [boxOpen, setBoxOpen] = useState(false);
  const [surfaceModel = null] = getPlannerExtensions("planner.framing.surface");
  const [offers = null] = getPlannerExtensions("planner.offers");
  if (surfaceModel && mosaicAllowed)
    return (
      <surfaceModel.Sheet
        {...surface}
        locale={locale}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  const copy = offers?.gateCopy(locale) || heldCopy(locale);
  const mosaicLabel = message(locale, "plannerMosaicModeMosaic");
  const offersHref = lockedOffersHref(locale, "planning", "mosaic");
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog planner-mosaic-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onCancel}
      title={message(locale, "plannerMosaicSettings")}
      titleAs="h3"
      headerActions={
        offersHref ? <LockedChip locale={locale} feature="mosaic" /> : null
      }
      footer={
        <button className="btn-link" type="button" onClick={onCancel}>
          {flow(locale, "close")}
        </button>
      }
    >
      <div
        className="planner-mosaic-mode-switch"
        role="tablist"
        aria-label={message(locale, "plannerMosaicSettings")}
      >
        <button
          aria-selected="true"
          className="is-active"
          role="tab"
          type="button"
        >
          {message(locale, "plannerMosaicModeSingle")}
        </button>
        <button
          aria-describedby={offersHref ? undefined : lineId}
          data-disabled-capability="planner.mosaic"
          aria-selected="false"
          {...(offersHref
            ? {
                "aria-disabled": "true",
                onClick: () => setBoxOpen(true),
              }
            : { disabled: true })}
          role="tab"
          type="button"
        >
          {mosaicLabel}
        </button>
      </div>
      {boxOpen && (
        <PurchaseBoxDialog
          locale={locale}
          offer="planning"
          feature="mosaic"
          onClose={() => setBoxOpen(false)}
        />
      )}
      {offersHref ? (
        <LockedFields locale={locale} feature="mosaic">
          <HeldMosaicFields locale={locale} legend={mosaicLabel} />
        </LockedFields>
      ) : (
        <fieldset
          aria-describedby={lineId}
          className="planner-mosaic-held"
          data-disabled-capability="planner.mosaic"
          disabled
        >
          <legend>
            <span>{mosaicLabel}</span>
          </legend>
          <RetainedSentence className="planner-mosaic-held-line" id={lineId}>
            {copy.mosaic}
          </RetainedSentence>
          <HeldMosaicBody locale={locale} />
        </fieldset>
      )}
    </WebDialog>
  );
}

// The greyed body of the "Mosaïque" section: the same fields either way.
function HeldMosaicBody({ locale }) {
  return (
    <div className="planner-mosaic-settings-body is-disabled">
      <div className="planner-mosaic-settings-grid">
        <label>
          <span>{message(locale, "plannerFramingMosaicWidth")}</span>
          <input type="number" readOnly value={2} />
        </label>
        <span className="planner-mosaic-times" aria-hidden="true">
          ×
        </span>
        <label>
          <span>{message(locale, "plannerFramingMosaicHeight")}</span>
          <input type="number" readOnly value={2} />
        </label>
      </div>
      <label className="planner-mosaic-overlap">
        <span>{message(locale, "plannerMosaicOverlap")}</span>
        <input type="range" min="0" max="90" readOnly value={15} />
        <output>15%</output>
      </label>
    </div>
  );
}

// Sold here: the same greyed section, as one target that opens the offers.
function HeldMosaicFields({ locale, legend }) {
  return (
    <fieldset
      className="planner-mosaic-held"
      data-disabled-capability="planner.mosaic"
      disabled
    >
      <legend>
        <span>{legend}</span>
      </legend>
      <HeldMosaicBody locale={locale} />
    </fieldset>
  );
}
