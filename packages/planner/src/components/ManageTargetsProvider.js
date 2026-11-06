"use client";

import { EquipmentPickerProvider } from "portal/components/manage/EquipmentPickerContext.js";
import { TargetsPickerProvider } from "portal/components/manage/TargetsPickerContext.js";
import { ConfigurationEquipmentPicker } from "./ConfigurationEquipmentPicker.js";
import { DefineEquipmentLink } from "./EquipmentPicker.js";
import { NightTargetsPicker } from "./NightTargetsPicker.js";

// "Mon espace" with the planner's target search and its equipment pickers:
// `portal` draws the page and does not import the planner, so the shell that
// does hands them down, as `NightSessionSurface` does for the page of a night.
const equipmentPickers = Object.freeze({
  Picker: ConfigurationEquipmentPicker,
  DefineLink: DefineEquipmentLink,
});

export function ManageTargetsProvider({ children }) {
  return (
    <TargetsPickerProvider value={NightTargetsPicker}>
      <EquipmentPickerProvider value={equipmentPickers}>
        {children}
      </EquipmentPickerProvider>
    </TargetsPickerProvider>
  );
}
