import {
  CAPABILITY_UNLIMITED,
  type Capabilities,
} from "astro-contracts/capabilities";

/**
 * The profile of a self-hosted server (the core). **The server never
 * restricts**: every capability the
 * server itself serves is open — several plans, the mosaics and saved
 * framings, the multi-night plans (`planner.mosaic`), the private gallery,
 * the analysis of the logs and its display, the progression and the stacking
 * — and its resources are those of the person who hosts it: plans,
 * captures, capture variants, file size, storage and history carry no cap
 * (`CAPABILITY_UNLIMITED`).
 *
 * Two keys stay false, and neither is a restriction. `pointing.solve` is a
 * right of the phone application (the aiming screen), which a server never
 * grants. `portal.invitations` is false, and nothing withholds it: a private
 * server has one account, its owner's, and no one to share a gallery with by
 * name.
 *
 * Several plans and no plan limit are by design. Reversible.
 */
export const OPEN_SOURCE_PROFILE: Capabilities = {
  "planner.multiple": true,
  "planner.mosaic": true,
  "pointing.solve": false,
  "sync.plan_limit": CAPABILITY_UNLIMITED,
  "gallery.private": true,
  // One account on a private server: no one to share the gallery with by
  // name (the key is part of the contract the applications read).
  "portal.invitations": false,
  "capture.variant_limit": CAPABILITY_UNLIMITED,
  // The core stays unlimited, and a capture may be made public.
  "capture.count_limit": CAPABILITY_UNLIMITED,
  "capture.public": true,
  // Everything is open on a private server — the analysis of the logs, the
  // progression and the stacking (which follows `analysis.progression`: no key
  // of its own).
  "analysis.logs": true,
  "analysis.progression": true,
  "storage.max_file_bytes": CAPABILITY_UNLIMITED,
  "storage.quota_bytes": CAPABILITY_UNLIMITED,
  "history.retention_days": CAPABILITY_UNLIMITED,
};
