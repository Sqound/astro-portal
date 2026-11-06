// Taking the plans of a browser into the space its person signed in to (the
// rules are in `browser-plans.js`). The network and the two stores are given,
// so that the same code runs on the page, against the real service in the
// tests, and against a store that fails at the worst moment.
//
// The order of what is written is what makes a cut harmless:
//
//   1. the service takes the plans (one transaction: all, or none);
//   2. the space's copy is written with them;
//   3. only then do they leave the browser's store.
//
// A cut between 1 and 3 leaves the plans in the browser and in the space: the
// next launch sees plans of the browser that the space already holds (same
// id), lets them leave the browser and sends nothing — no duplicate, and
// nothing lost. A cut before 1 changes nothing on either side.
import {
  browserDocumentWithout,
  buildCarryDocument,
  planBrowserCarry,
} from "./browser-plans.js";
import { planStatus } from "./planner.js";

const isPending = (plan) => planStatus(plan) === "pending";

/**
 * What became of the browser's plans, for a space (`space`, the document read
 * from the service) whose profile is `capabilities`:
 *
 *  - `{ kind: "none", browser }`: nothing of the browser is left to take;
 *  - `{ kind: "declined", browser }`: the person answered "leave them";
 *  - `{ kind: "ask", browser, count }`: the space holds something, the person
 *    has not answered: the question is theirs to answer;
 *  - `{ kind: "carried", space, browser, taken, limit, waiting }`: taken;
 *    `space` is the space's document now, `limit` the plans that stay because
 *    the profile has no room for them, `waiting` those the service did not
 *    take; `browser` is what the browser's store holds now (`null`: nothing);
 *  - `{ kind: "failed", browser, error }`: nothing was taken, the service or
 *    the network did not answer.
 *
 * `answer` is what the person said (`"accepted"`, `"declined"`, or nothing).
 * `keepBrowser(document | null)` writes the browser's store, `keepSpace(doc)`
 * the space's copy — called in that order (see above).
 */
export async function carryBrowserPlans({
  browser,
  space,
  capabilities,
  answer = null,
  restore,
  listFramings,
  importPlans,
  stamp,
  keepBrowser,
  keepSpace,
}) {
  let held = browser;
  const spacePlans = space?.plans || [];
  const plan = planBrowserCarry({
    browserPlans: held?.plans || [],
    spacePlans,
    capabilities,
  });
  // A plan the space holds already (taken before a cut, or the copy of that
  // space this browser used to keep) leaves the browser: it is never in both.
  if (plan.already.length) {
    held = browserDocumentWithout(
      held,
      plan.already.map((entry) => entry.id),
    );
    keepBrowser(held);
  }
  if (!plan.candidates.length) return { kind: "none", browser: held };
  if (answer === "declined") return { kind: "declined", browser: held };

  if (answer !== "accepted") {
    // "Neuf ou vide": no plan and no framing. A space that has a plan has
    // content, and the library of framings is only read for one that has none.
    let empty = spacePlans.length === 0;
    if (empty)
      try {
        empty = (await listFramings()).length === 0;
      } catch (error) {
        // Not knowing is no reason to take, or to ask: try again later.
        return { kind: "failed", browser: held, error };
      }
    if (!empty)
      return { kind: "ask", browser: held, count: plan.candidates.length };
  }

  const send = async (plans) => {
    const document = stamp(
      buildCarryDocument({
        browser: held,
        plans,
        // The space has one active horizon of its own or takes the browser's.
        activeHorizonProfileId: space?.activeHorizonProfileId
          ? null
          : (held.activeHorizonProfileId ?? null),
      }),
    );
    const response = await importPlans(document);
    const taken = restore(response?.state);
    if (!taken) throw new Error("Planner synchronization failed.");
    return taken;
  };

  let carry = plan.carry;
  let beyond = plan.beyond;
  let now = null;
  if (carry.length)
    try {
      now = await send(carry);
    } catch (error) {
      if (error?.code !== "plan_limit_reached")
        return { kind: "failed", browser: held, error };
      // The service has less room than the screen thought (another device
      // filled the space): no pending plan goes, the others still can.
      beyond = [...beyond, ...carry.filter(isPending)];
      carry = carry.filter((entry) => !isPending(entry));
      if (carry.length)
        try {
          now = await send(carry);
        } catch (second) {
          return { kind: "failed", browser: held, error: second };
        }
    }

  const inSpace = new Set((now?.plans || []).map((entry) => entry.id));
  const taken = carry.filter((entry) => inSpace.has(entry.id));
  const waiting = carry.filter((entry) => !inSpace.has(entry.id));
  if (now) keepSpace(now);
  held = browserDocumentWithout(
    held,
    taken.map((entry) => entry.id),
  );
  if (taken.length) keepBrowser(held);
  return {
    kind: "carried",
    space: now || space,
    browser: held,
    taken: taken.length,
    limit: beyond,
    waiting,
  };
}
