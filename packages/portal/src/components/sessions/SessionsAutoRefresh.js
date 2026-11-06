"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CHANGE_SIGNAL_EVENT,
  startChangeSubscription,
} from "portal/planner/change-subscription.js";

/**
 * The sessions journal (portal-app/routes/[locale]/sessions/page.js) is a
 * force-dynamic server component rendered once per navigation: a night
 * debriefed on another device or tab never reaches it without a manual
 * reload. Refresh on the signals that
 * reliably mean "the observer is looking at this page again, or something
 * changed" — the tab regaining focus, the document becoming visible again,
 * and the reactive change signal (`GET /api/v1/changes`) — rather than
 * polling on a timer, which would hit the server for an idle, backgrounded
 * tab with nobody watching it. Renders nothing; mount it once per page, with
 * `signedIn` false for a visitor (nothing is read, nothing is subscribed).
 */
export function SessionsAutoRefresh({ signedIn = true }) {
  const router = useRouter();
  useEffect(() => {
    // A visitor has no space: nothing to refresh, and the change channel would
    // only answer 401 in the console.
    if (!signedIn) return undefined;
    const refresh = () => router.refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(CHANGE_SIGNAL_EVENT, refresh);
    const stopChangeSubscription = startChangeSubscription();
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(CHANGE_SIGNAL_EVENT, refresh);
      stopChangeSubscription();
    };
  }, [router, signedIn]);
  return null;
}
