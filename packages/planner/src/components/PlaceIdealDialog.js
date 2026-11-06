"use client";

import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { useState } from "react";
import { PlaceSuggestedDetail } from "./PlaceSuggestedDetail.js";
import {
  PlacesSuggestedPane,
  initialPlacesSettings,
} from "./PlacesSuggestedPane.js";
import { usePlacesPositionRead } from "./PlacesParts.js";

// "Trouver un lieu idéal": the very panel of the "Lieux suggérés"
// tab, in a dialog above the editor of a place. From here each card offers
// "Utiliser" — it fills the editor's point, name and type, and creates
// nothing — and the detail of a card ends with "Utiliser" too. The editor
// (a portal component) receives this one as a slot, `IdealPlaces`.

/**
 * `places` are mine (the "Autour de" choices), `defaultPlaceId` the default
 * one, `client` the service's reads; `onUse(suggestion)` answers a choice and
 * `onClose` leaves the dialog.
 */
export function PlaceIdealDialog({
  locale,
  places,
  defaultPlaceId = null,
  client,
  onUse,
  onClose,
}) {
  const [settings, setSettings] = useState(() => initialPlacesSettings());
  const [detail, setDetail] = useState(null);
  const {
    position,
    pending: positionPending,
    failed: positionFailed,
    locate,
  } = usePlacesPositionRead();
  // "Depuis ma position" is the only read of the position.
  const askPosition = () => {
    setSettings((current) => ({ ...current, around: "position" }));
    locate();
  };
  return (
    <WebDialog
      className="places-ideal-dialog"
      title={message(locale, "placesTabSuggested")}
      closeLabel={message(locale, "placePickerClose")}
      onClose={onClose}
      closeOnBackdrop
    >
      {detail ? (
        <PlaceSuggestedDetail
          locale={locale}
          client={client}
          suggestion={detail.suggestion}
          places={places}
          reference={detail.reference ?? null}
          useMode
          onBack={() => setDetail(null)}
          onUse={onUse}
        />
      ) : (
        <PlacesSuggestedPane
          locale={locale}
          places={places}
          defaultPlaceId={defaultPlaceId}
          position={position}
          positionPending={positionPending}
          positionFailed={positionFailed}
          onLocate={askPosition}
          settings={settings}
          onSettings={setSettings}
          useMode
          client={client}
          onUse={onUse}
          onOpen={(suggestion, reference) =>
            setDetail({ suggestion, reference })
          }
        />
      )}
    </WebDialog>
  );
}
