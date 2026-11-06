"use client";

import { createContext, useContext } from "react";

/**
 * The equipment pickers of the planner (search, « Marque » and « Type »,
 * « Mon matériel » first, « Définir mon matériel ») for « Ma configuration
 * par défaut »; `portal` does not import the planner, so the shell that does
 * hands them down here (`planner/components/ManageTargetsProvider.js`):
 * `{ Picker, DefineLink }`. Absent (a test), the dialog keeps its plain
 * grouped selects.
 */
const EquipmentPickerContext = createContext(null);

export const EquipmentPickerProvider = EquipmentPickerContext.Provider;

/** `{ Picker, DefineLink }`, or `null`. */
export const useEquipmentPicker = () => useContext(EquipmentPickerContext);
