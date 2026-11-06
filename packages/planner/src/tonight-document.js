import { readSpaceReplica } from "./browser-plans.js";

// The planner document "Cette nuit" reads (moved out of `TonightPage.js`
// so the catalogue's statistics dialog reads the very same one): the
// space's for a signed-in person (its copy in this browser without a
// network), else the browser's.

export const tonightBrowserKey = "astro-portal:planner:v1";

export function readBrowserDocument() {
  try {
    return JSON.parse(localStorage.getItem(tonightBrowserKey) || "null");
  } catch {
    return null;
  }
}

export function readStorage(read, fallback) {
  try {
    return read(localStorage);
  } catch {
    return fallback;
  }
}

// The planner document the page reads: the space's for a signed-in person
// (its copy in this browser without a network), else the browser's.
export async function loadTonightDocument() {
  let authenticated = false;
  let email = "";
  // The sign-in status, kept to tell a service made of spaces from a private server
  // (`isHostedService`): the light-pollution button belongs to the former.
  let auth = null;
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    const status = await response.json();
    auth = status;
    authenticated = Boolean(status?.authenticated);
    email = status.email || status.user?.email || "";
  } catch {
    authenticated = false;
  }
  if (!authenticated)
    return { document: readBrowserDocument(), authenticated, auth };
  try {
    const response = await fetch("/api/plans", { cache: "no-store" });
    if (!response.ok) throw new Error("plans unavailable");
    return { document: await response.json(), authenticated, email, auth };
  } catch {
    const replica = readStorage(readSpaceReplica, null);
    return {
      document: replica?.document || readBrowserDocument(),
      authenticated,
      email,
      auth,
    };
  }
}
