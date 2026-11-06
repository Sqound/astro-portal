"use client";

import { CHANGE_SIGNAL_EVENT } from "portal/planner/change-subscription.js";
import { planStatus } from "../planner.js";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createSpacePlacesClient } from "../places-client.js";
import { createSpacePlacesStore } from "../space-places.js";

/**
 * The places of the signed-in person (`active`), kept in memory from the
 * service: read at launch and at each change signal or return of the network,
 * written at once. `onError(kind, error)` is the planner's one-line notice.
 * Answers the snapshot (`places`, `defaultId`, `loaded`, `offline`) and the
 * store's gestures (`save`, `remove`, `setDefault`).
 */
export function useSpacePlaces({
  active,
  email,
  browserPlacesRef,
  onError,
  client = null,
}) {
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const storeRef = useRef(null);
  if (!storeRef.current)
    storeRef.current = createSpacePlacesStore({
      client: client ?? createSpacePlacesClient(),
      onError: (kind, error) => errorRef.current?.(kind, error),
    });
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    if (active && email)
      store.start({
        email,
        browserPlaces: browserPlacesRef?.current ?? [],
      });
    else store.stop();
  }, [active, email]);
  useEffect(() => {
    if (!active) return undefined;
    const reload = () => store.reload();
    window.addEventListener(CHANGE_SIGNAL_EVENT, reload);
    window.addEventListener("online", reload);
    return () => {
      window.removeEventListener(CHANGE_SIGNAL_EVENT, reload);
      window.removeEventListener("online", reload);
    };
  }, [active]);
  return {
    ...snapshot,
    save: store.save,
    remove: store.remove,
    setDefault: store.setDefault,
  };
}

/**
 * What the plans of this browser say of a place: `{ pendingPlans, pastPlans }`
 * in the shape of the service's `usage` — a plan to execute (status `pending`,
 * `active` for the service) blocks a deletion, any other keeps its own copy.
 * For a visitor, whose places have no `usage` from a service.
 */
export function localPlaceUsage(placeId, plans) {
  const usage = { pendingPlans: [], pastPlans: [] };
  for (const plan of Array.isArray(plans) ? plans : []) {
    if (!placeId || plan?.location?.id !== placeId) continue;
    const status = planStatus(plan);
    (status === "pending" ? usage.pendingPlans : usage.pastPlans).push({
      planId: plan.id,
      name: String(plan.name ?? ""),
      planDate: plan.date ?? null,
      status: status === "pending" ? "active" : status,
    });
  }
  return usage;
}
