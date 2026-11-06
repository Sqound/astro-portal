// The account page's own extension seam, on the exact pattern of
// packages/portal/src/planner/extensions.ts (registerPlannerExtension /
// getPlannerExtensions): the package owns this registry, while the
// application that embeds it decides whether to register an implementation.
// This keeps AccountPage.js -- and every build that registers none -- free of
// any static import of an optional package.
//
// A plain JS copy of the pattern of extensions.ts rather than a shared generic module: the
// account folder already keeps its own files (AccountPage.js,
// pairing-poll.js) separate from the planner's, and this registry is small
// enough that duplicating ~15 lines costs less than introducing a shared
// dependency between the two areas for no other reason.

const extensions = new Map();

export function registerAccountExtension(point, component) {
  const registered = extensions.get(point) || [];
  if (!registered.includes(component))
    extensions.set(point, [...registered, component]);
}

export function getAccountExtensions(point) {
  return extensions.get(point) || [];
}
