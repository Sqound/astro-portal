// The framing editor across « Définir mon matériel »: the link leaves the
// planner in the same tab, so the editor notes its framing not saved yet in
// the tab's session storage; the planner reopens the editor on that note when
// it loads again — what it edited, its equipment, its frame settings, its
// angle, its highlighted target, its view — and the piece brought back goes
// into the editor's equipment, not the plan's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  forgetFramingEditorDraft,
  framingEditorDraftKey,
  framingEditorDraftMaxAgeMs,
  framingEditorStateFromDraft,
  rememberFramingEditorDraft,
  takeFramingEditorDraft,
} from "../src/framing-editor-draft.js";
import { equipmentSelectionWithReturn } from "../src/equipment-return.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
};

const equipmentSelection = {
  mode: "imaging",
  telescopeId: "skywatcher-skymax-127",
  cameraId: null,
  modifierId: "none",
};
const snapshot = {
  editor: {
    mode: "create",
    forPlanId: "plan-1",
    editingResourceId: null,
    editingRevision: null,
    editingTarget: null,
    // Not the note's: the planner's own.
    initialEquipmentSelection: { telescopeId: "old" },
  },
  equipmentSelection,
  frameSurface: { columns: 2, rows: 1, overlapPercent: 15 },
  angleDegrees: 32,
  highlightedTarget: { id: "m31", title: "M31" },
  view: { center: { ra: 10.68, dec: 41.27 }, fovDegrees: 2.5 },
};

test("the note is written before leaving, read once on the way back, and reopens the editor as it was left", () => {
  const storage = memoryStorage();
  assert.equal(rememberFramingEditorDraft(storage, snapshot, 1000), true);
  const written = JSON.parse(storage.getItem(framingEditorDraftKey));
  assert.equal(written.at, 1000);
  assert.equal("initialEquipmentSelection" in written.editor, false);
  const draft = takeFramingEditorDraft(storage, 2000);
  assert.deepEqual(draft, {
    editor: {
      mode: "create",
      forPlanId: "plan-1",
      editingResourceId: null,
      editingRevision: null,
      editingTarget: null,
    },
    equipmentSelection,
    frameSurface: snapshot.frameSurface,
    angleDegrees: 32,
    highlightedTarget: snapshot.highlightedTarget,
    view: snapshot.view,
  });
  // Read once.
  assert.equal(storage.getItem(framingEditorDraftKey), null);
  assert.equal(takeFramingEditorDraft(storage, 2000), null);
  assert.deepEqual(framingEditorStateFromDraft(draft), {
    mode: "create",
    forPlanId: "plan-1",
    editingResourceId: null,
    editingRevision: null,
    editingTarget: null,
    initialFrameSurface: snapshot.frameSurface,
    initialEquipmentSelection: equipmentSelection,
    initialAngleDegrees: 32,
    initialHighlightedTarget: snapshot.highlightedTarget,
    initialView: snapshot.view,
  });
});

test("a framing being edited keeps what it edits; an old, foreign or broken note opens nothing", () => {
  const storage = memoryStorage();
  const editing = {
    ...snapshot,
    editor: {
      mode: "editFree",
      forPlanId: null,
      editingResourceId: "f0e1d2c3-0000-4000-8000-000000000001",
      editingRevision: 3,
      editingTarget: {
        id: "f0e1d2c3-0000-4000-8000-000000000001",
        title: "M31 en mosaïque",
        coordinate: { ra: 10.68, dec: 41.27 },
      },
    },
    view: { center: { ra: "x", dec: 1 } },
  };
  rememberFramingEditorDraft(storage, editing, 0);
  const draft = takeFramingEditorDraft(storage, 10);
  assert.equal(draft.editor.mode, "editFree");
  assert.equal(draft.editor.editingRevision, 3);
  assert.equal(draft.editor.editingTarget.title, "M31 en mosaïque");
  // A view that is not one is left out: the map opens on the framing.
  assert.equal(draft.view, null);

  rememberFramingEditorDraft(storage, snapshot, 0);
  assert.equal(
    takeFramingEditorDraft(storage, framingEditorDraftMaxAgeMs + 1),
    null,
  );
  // Forgotten even when too old.
  assert.equal(storage.getItem(framingEditorDraftKey), null);
  for (const note of [
    "not json",
    JSON.stringify({ at: 0, editor: { mode: "other" }, equipmentSelection }),
    JSON.stringify({ at: 0, editor: { mode: "create" } }),
    JSON.stringify({ at: 0, editor: { mode: "editCopy" }, equipmentSelection }),
  ]) {
    storage.setItem(framingEditorDraftKey, note);
    assert.equal(takeFramingEditorDraft(storage, 1), null, note);
  }
  // Nothing to note without an equipment selection; a refusing storage
  // writes nothing and breaks nothing.
  assert.equal(rememberFramingEditorDraft(storage, {}, 0), false);
  const refusing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(rememberFramingEditorDraft(refusing, snapshot, 0), false);
  assert.equal(takeFramingEditorDraft(refusing, 0), null);
  forgetFramingEditorDraft(refusing);
  forgetFramingEditorDraft(null);
});

test("the piece brought back goes into the editor's equipment", () => {
  assert.deepEqual(
    equipmentSelectionWithReturn(equipmentSelection, { camera: "inv-cam" }),
    { ...equipmentSelection, cameraId: "inv-cam" },
  );
});

test("the planner notes the editor on « Définir mon matériel », reopens it on load, and gives it what comes back", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const dialog = page.slice(
    page.indexOf("function FramingEditorDialog("),
    page.indexOf(
      "return createPortal(",
      page.indexOf("function FramingEditorDialog("),
    ),
  );
  // Every picker of the editor notes the framing before the link leaves.
  assert.match(
    dialog,
    /onNavigate: \(event\) => \{\s*noteBeforeLeaving\(\);\s*props\.define\.onNavigate\?\.\(event\);/,
  );
  assert.match(dialog, /view: mapRef\.current\?\.viewState\?\.\(\) \?\? null,/);
  // Closed, or shown again from the browser's cache, it forgets the note.
  assert.match(
    dialog,
    /if \(event\.persisted\) forgetFramingEditorDraft\(storage\);/,
  );
  assert.match(
    dialog,
    /equipmentSelectionWithReturn\(current, returnedEquipment\.chosen\)/,
  );
  // The planner reopens it once it knows who is there.
  assert.match(
    page,
    /const draft = takeFramingEditorDraft\(tabSessionStorage\(\)\);\s*if \(!draft\) return;\s*const restored = framingEditorStateFromDraft\(draft\);/,
  );
  assert.match(page, /onLeaveForEquipment=\{rememberFramingEditor\}/);
  assert.match(
    page,
    /initialView=\{framingEditorState\.initialView \?\? null\}/,
  );
  assert.match(page, /returnedEquipment=\{framingEditorReturned\}/);
  // The map opens back on the view and says it.
  const map = readFileSync(
    new URL("../src/components/PlannerNightSkyMap.js", import.meta.url),
    "utf8",
  );
  assert.match(map, /initialView = null,/);
  assert.match(map, /viewState: \(\) => \{/);
  assert.match(
    page,
    /autoCenterOnSelected=\{Boolean\(editingTarget\) && !initialView\}/,
  );
});

test("the app's default equipment flag survives the note, for « Créer un cadrage » of the preview", () => {
  const storage = memoryStorage();
  rememberFramingEditorDraft(storage, {
    editor: { mode: "create", initialDefaultEquipment: true },
    equipmentSelection: { mode: "imaging", telescopeId: "seestar-s50" },
    view: { center: { ra: 312.75, dec: 30.72 }, fovDegrees: 4.7 },
  });
  const state = framingEditorStateFromDraft(takeFramingEditorDraft(storage));
  assert.equal(state.initialDefaultEquipment, true);
  assert.equal(state.mode, "create");
  assert.deepEqual(state.initialView, {
    center: { ra: 312.75, dec: 30.72 },
    fovDegrees: 4.7,
  });
  assert.equal(state.initialEquipmentSelection.telescopeId, "seestar-s50");
});
