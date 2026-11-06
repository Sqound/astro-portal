import type { Capabilities } from "astro-contracts/capabilities";

/**
 * Whether an account may currently perform writes that create content or
 * consume storage. This is deliberately separate from `Capabilities`: a
 * numeric/boolean capability profile cannot safely encode "no NEW writes, but
 * everything already there stays readable and exportable" — a
 * `storage.quota_bytes` that still reads as large during a read-only window
 * must not be taken as "still accepting uploads". `reason` is informational
 * only (not part of the HTTP error body). A provider that gives no
 * `writeAccessFor` — every `staticProfile`, so every private server — never
 * opens a window; a composition that does says why in `reason`.
 */
export interface WriteAccess {
  readOnly: boolean;
  reason?: string;
  /**
   * Present only in a read-only window and only when not empty: the
   * capabilities the account still holds whatever the window. It is what lets
   * `isWriteRefused` below keep the writes that they authorize.
   */
  oneTimeCapabilities?: readonly (keyof Capabilities)[];
  /**
   * Optional: the end of the read-only window, as the composition dates it.
   * Absent when it does not (a window with no date).
   */
  readOnlyUntil?: string;
  /**
   * Optional: a screen says why the window opened (the apps' contract
   * carries this flag with the window's end).
   */
  paymentFailed?: true;
}

export interface EntitlementProvider {
  capabilitiesFor(userId: string | null): Promise<Capabilities>;
  /**
   * Optional: a provider that does not implement it — every
   * `staticProfile`, i.e. every self-hosted open-source deployment — never
   * enters a read-only window. Callers never call this directly; they go through `resolveWriteAccess`
   * below so the optionality lives in one place.
   */
  writeAccessFor?(userId: string | null): Promise<WriteAccess>;
  /**
   * Optional: the capabilities of a device with no space. A
   * provider without it (every `staticProfile`) answers a visitor's,
   * `capabilitiesFor(null)`, through `capabilitiesForAnonymousDevice` below.
   */
  capabilitiesForAnonymousDevice?(deviceId: string): Promise<Capabilities>;
}

/**
 * The capabilities of an anonymous device: the provider's own
 * reading when it has one, else a visitor's.
 */
export async function capabilitiesForAnonymousDevice(
  provider: EntitlementProvider,
  deviceId: string,
): Promise<Capabilities> {
  if (provider.capabilitiesForAnonymousDevice)
    return provider.capabilitiesForAnonymousDevice(deviceId);
  return provider.capabilitiesFor(null);
}

export function staticProfile(profile: Capabilities): EntitlementProvider {
  return { capabilitiesFor: async () => profile };
}

/**
 * The single call site every write path (uploads, plan and framing
 * writes/restores) uses to ask "is this account currently read-only?" —
 * defaulting to `{ readOnly: false }` for a provider with no
 * `writeAccessFor` (every `staticProfile`), so `packages/` code never has to
 * know whether the provider it was handed implements the optional method.
 */
export async function resolveWriteAccess(
  provider: EntitlementProvider,
  userId: string | null,
): Promise<WriteAccess> {
  if (!provider.writeAccessFor) return { readOnly: false };
  return provider.writeAccessFor(userId);
}

/**
 * THE rule of a read-only window: a write is
 * refused in the window **only if the capability that authorizes it is not
 * one the account still holds** (`oneTimeCapabilities`).
 * A write that no capability authorizes (an ordinary plan, a media, a place:
 * `authorizedBy` omitted) is refused whenever the window is open. Every
 * write path asks this function; none re-derives the rule.
 */
export function isWriteRefused(
  access: WriteAccess,
  authorizedBy?: keyof Capabilities,
): boolean {
  if (!access?.readOnly) return false;
  if (authorizedBy && access.oneTimeCapabilities?.includes(authorizedBy))
    return false;
  return true;
}

export function can(
  capabilities: Capabilities,
  name: keyof Capabilities,
): boolean {
  const value = capabilities[name];
  return typeof value === "boolean" ? value : value > 0;
}

// Portable capability-plan-limit contract (fixtures/capability-plan-limit*.json),
// mirroring the enforcement guard in persistence/planner-state-repository.js:
// a limit of zero, negative, or absent/non-finite never restricts plan creation.
export function planLimitIsUnlimited(
  limit: number | null | undefined,
): boolean {
  const value = Number(limit);
  return !(Number.isFinite(value) && value > 0);
}

/** The numeric guard on pending synchronized plans; 0 means unlimited. */
export function activePlanLimit(
  capabilities: Partial<Capabilities> | null | undefined,
): number {
  const limit = capabilities?.["sync.plan_limit"];
  return planLimitIsUnlimited(limit) ? 0 : Math.floor(Number(limit));
}

// Only a "pending" plan (the internal spelling for the API's "active") counts
// toward sync.plan_limit; executed/abandoned/archived plans never do.
export function planStatusCountsTowardLimit(status: string): boolean {
  return status === "pending";
}

/**
 * The plans that fill a night under a one-plan profile: the one rule « one plan per
 * night ». A plan that was run -- executed, or partially -- is still the
 * night's plan: counting only the pending ones let a second plan be made for
 * a night already observed. An abandoned or archived plan was put away by the
 * person and frees the night. Unlike the numeric guard ({@link
 * planStatusCountsTowardLimit}), which counts what the service holds to
 * synchronize, this is about the night itself.
 */
export function planStatusCountsTowardNight(status: string): boolean {
  return status === "pending" || status === "executed" || status === "partial";
}

/** Whether a pending plan may join a night, independent of its place.
 * An undated draft waits for the date selection before any refusal.
 * Exclude the plan being edited so it can keep its current date.
 */
export function pendingPlanPermission({
  capabilities,
  plans = [],
  date,
  planId,
}: {
  capabilities?: Partial<Capabilities> | null;
  plans?: { id?: string; date?: string; status: string }[];
  date?: string | null;
  planId?: string;
}): "allowed" | "night" | "guard" {
  if (!date || !capabilities) return "allowed";
  const others = plans.filter((plan) => !planId || plan.id !== planId);
  if (
    capabilities["planner.multiple"] === false &&
    others.some(
      (plan) => planStatusCountsTowardNight(plan.status) && plan.date === date,
    )
  )
    return "night";
  const pending = others.filter((plan) =>
    planStatusCountsTowardLimit(plan.status),
  );
  const limit = activePlanLimit(capabilities);
  return limit > 0 && pending.length >= limit ? "guard" : "allowed";
}
