import { autoFillNight } from "./auto-fill.js";

// The suggestion API extends the existing auto-fill engine. Older callers
// retain their original JSON result until they opt into suggestion inputs.
//
// `takenByOtherPlans` lists the targets another plan of the night holds (they
// are also in `excluded`, which is what keeps them out of the list). When the
// proposal is empty and the same request without those targets would not be,
// the proposal says so (`takenByOtherPlans: true`): the dialog then tells the
// person that the other plans took every target, not that the sky holds none.
export function suggestNight(options = {}) {
  const { takenByOtherPlans = [], ...rest } = options;
  const request = { count: 6, ...rest };
  const proposal = autoFillNight(request);
  const taken = new Set((takenByOtherPlans || []).map(String));
  if (!proposal || !taken.size || proposal.items?.length) return proposal;
  const without = autoFillNight({
    ...request,
    excluded: (request.excluded || []).filter((id) => !taken.has(String(id))),
  });
  return without?.items?.length
    ? { ...proposal, takenByOtherPlans: true }
    : proposal;
}
