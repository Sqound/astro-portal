"use client";

import { createContext, useContext } from "react";

/**
 * The target search with its labelled rows (preview, designation and name,
 * type · constellation; the space's own targets first) is the planner's
 * `NightTargetsPicker`; `portal` does not import the planner, so the shell
 * that does hands it down here (`planner/components/ManageTargetsProvider.js`)
 * to the places of « Mon espace › Captures » that choose a target: the add box
 * and the owner's detail. Absent (a test), those places say so and offer no
 * search.
 */
const TargetsPickerContext = createContext(null);

export const TargetsPickerProvider = TargetsPickerContext.Provider;

/** The picker component to draw, or `null`. */
export const useTargetsPicker = () => useContext(TargetsPickerContext);
