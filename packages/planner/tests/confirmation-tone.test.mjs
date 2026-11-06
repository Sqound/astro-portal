import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// A confirmation that erases or removes something
// keeps its level, the primary of its dialog, and takes the destructive tint;
// one that keeps things stays a plain primary. `WebConfirmDialog` is
// destructive by default, and the planner's `ConfirmationDialog` passed
// `tone="danger"` for every use — so abandoning, archiving or restoring a plan
// (the plan is kept, in another state) and changing the place of a night (the
// plans are recalculated, targets and intervals kept) were drawn in the dark
// red of an erasure. Now: destructive for what erases, and for that alone.
//
// What erases or removes, and is destructive: a plan (deleted), a framing
// (deleted, or removed from the pending plans and deleted), a saved place
// (removed), the pairing of a device (revoked). What keeps things: abandoning,
// archiving, restoring a plan, archiving a framing, changing the place of a
// night, comparing two versions of a plan.

const page = await readFile(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
// "Retirer de mes lieux" is confirmed in the place's sheet: the
// confirmation of the saved place's removal is PlaceDeleteDialog.
const placeDialog = await readFile(
  new URL("../src/components/PlaceSuggestedDetail.js", import.meta.url),
  "utf8",
);
const account = await readFile(
  new URL(
    "../../../packages/portal/src/components/account/AccountPage.js",
    import.meta.url,
  ),
  "utf8",
);

/** The JSX of the element that opens at [open] (a `<Name` position) up to its `/>`. */
function element(source, open) {
  return source.slice(open, source.indexOf("/>", open) + 2);
}

test("the planner's confirmation is a plain primary unless it is told it erases", () => {
  const start = page.indexOf("function ConfirmationDialog(");
  const body = page.slice(start, page.indexOf("function PlanExportDialog"));
  assert.match(body, /destructive = false/);
  assert.match(body, /tone=\{destructive \? "danger" : "primary"\}/);
  assert.doesNotMatch(body, /tone="danger"/);
});

test("of the four actions of the plan library only the deletion is destructive", () => {
  const open = page.indexOf(
    "<ConfirmationDialog",
    page.indexOf("actionCopy.title") - 200,
  );
  const usage = element(page, open);
  assert.match(usage, /destructive=\{confirmation\.action === "delete"\}/);
});

test("the removal of a plan from its tabs is destructive; the change of a night's place is not", async () => {
  const removal = element(
    page,
    page.indexOf(
      "<ConfirmationDialog",
      page.indexOf(
        "plannerPlanDeleteTitle",
        page.indexOf("planDeleteConfirmation &&"),
      ) - 200,
    ),
  );
  assert.match(removal, /\bdestructive\b/);
  // The change of a night's place is PlaceFarDialog, whose "Remplacer le lieu"
  // is a plain gold primary.
  const change = element(
    page,
    page.indexOf("<PlaceFarDialog", page.indexOf("{placeChange && (")),
  );
  assert.match(change, /^<PlaceFarDialog/);
  assert.doesNotMatch(change, /destructive/);
  const farDialog = await readFile(
    new URL(
      "../../../packages/portal/src/components/planner/PlaceFarDialog.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(farDialog, /className="btn-primary"/);
  assert.doesNotMatch(farDialog, /is-destructive|btn-danger|tone="danger"/);
});

test("removing a saved place and revoking a device are destructive", () => {
  const removal = placeDialog.slice(
    placeDialog.indexOf("export function PlaceDeleteDialog"),
  );
  const at = removal.indexOf("onClick={onConfirm}");
  assert.match(removal.slice(at - 120, at), /btn-primary is-destructive/);
  const revoke = account.slice(account.indexOf("{revokeCandidate && ("));
  assert.match(revoke.slice(0, revoke.indexOf("/>")), /tone="danger"/);
});

test("the merge screen's two confirmations keep everything: plain primaries", () => {
  assert.equal((page.match(/tone="primary"/g) || []).length >= 2, true);
});
