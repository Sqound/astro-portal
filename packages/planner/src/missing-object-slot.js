"use client";
import { createContext, createElement, useContext } from "react";
import { getPlannerExtensions } from "portal/planner/extensions.js";

// The one place where the planner of the open core meets "Demander un objet
// manquant": the extension point `planner.missingObject`. The core holds no
// such form; wherever a catalogue search comes up empty, it draws
// `MissingObjectLink`, which draws the `Link` a shell registered, or nothing.
// A server that registered none (the open-source composition, a private
// server) shows nothing under an empty search.
//
// What a shell registers at `planner.missingObject`:
//
//  - `available(auth)`: whether the form exists on this server, given the
//    answer of `GET /api/auth/status`;
//  - `Link`: the component drawn under an empty result, given `{ locale,
//    query, context }` (`context`: `{ signedIn, signInHref, signInLabel }`,
//    what the planner knows of who is looking).

/** What the shell registered at `planner.missingObject`, or `null`. */
const registered = () =>
  getPlannerExtensions("planner.missingObject")[0] ?? null;

/** Is the form offered here? Only where a shell registered it and says so. */
export const missingObjectAvailable = (auth) => {
  const available = registered()?.available;
  return typeof available === "function" && Boolean(available(auth));
};

/** Where the form exists and who may send it, told once by the planner. */
export const MissingObjectContext = createContext({ available: false });

/** The link under an empty search result: the shell's, or nothing. */
export function MissingObjectLink({ locale, query = "" }) {
  const context = useContext(MissingObjectContext);
  const Link = registered()?.Link;
  if (!Link || !context.available) return null;
  return createElement(Link, { locale, query, context });
}
