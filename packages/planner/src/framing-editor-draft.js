// The framing editor across « Définir mon matériel ». The link leaves the
// planner in the same tab (so that the way back can pick the piece just
// declared); before it goes, the editor notes what is not saved yet — what it
// edits (a new framing, or which one), its equipment, its frame settings, the
// frame's angle, the target the search put forward and the view of the map
// (the frame's centre and the field) — in the tab's session storage. When the
// planner loads again, it reopens the editor on that note, and the piece
// brought back goes into the editor's equipment. The note is read once and
// then forgotten; the editor closed, or still open (a page the browser kept),
// it is forgotten too. Pure functions over a `Storage` (getItem, setItem,
// removeItem).

/** The key of the note in the tab's session storage. */
export const framingEditorDraftKey = "astro-portal.framing-editor-draft";

/** A note older than this is forgotten unread (a return the next day). */
export const framingEditorDraftMaxAgeMs = 6 * 60 * 60 * 1000;

const EDITOR_KEYS = Object.freeze([
  "mode",
  "forPlanId",
  "editingResourceId",
  "editingRevision",
  "editingTarget",
]);

// FRAMING-FROM-PREVIEW-01: the equipment the editor opened on is the app's
// default one (the pill says so). Kept only when it is; « Ce soir » hands the
// editor to the planner through this same note.
const FLAG_KEYS = Object.freeze(["initialDefaultEquipment"]);

const editorOf = (editor) => ({
  ...Object.fromEntries(EDITOR_KEYS.map((key) => [key, editor?.[key] ?? null])),
  ...Object.fromEntries(
    FLAG_KEYS.filter((key) => editor?.[key] === true).map((key) => [key, true]),
  ),
});

const MODES = Object.freeze(["create", "editFree", "editCopy"]);

const plain = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** The view of the map a note may carry: `{ center: { ra, dec }, fovDegrees }`. */
function viewOf(value) {
  if (!plain(value) || !plain(value.center)) return null;
  const { ra, dec } = value.center;
  if (!finite(ra) || !finite(dec)) return null;
  return {
    center: { ra, dec },
    fovDegrees: finite(value.fovDegrees) ? value.fovDegrees : null,
  };
}

/**
 * Note the editor before « Définir mon matériel » leaves the page: `editor`
 * is what the planner opened it on (`mode`, `forPlanId`,
 * `editingResourceId`, `editingRevision`, `editingTarget`), then the
 * editor's own `equipmentSelection`, `frameSurface`, `angleDegrees`,
 * `highlightedTarget` and `view`. Whether the note was written.
 */
export function rememberFramingEditorDraft(
  storage,
  {
    editor = {},
    equipmentSelection = null,
    frameSurface = null,
    angleDegrees = 0,
    highlightedTarget = null,
    view = null,
  } = {},
  now = Date.now(),
) {
  if (!plain(equipmentSelection)) return false;
  const kept = editorOf(editor);
  try {
    storage?.setItem(
      framingEditorDraftKey,
      JSON.stringify({
        at: now,
        editor: kept,
        equipmentSelection,
        frameSurface: frameSurface ?? null,
        angleDegrees: finite(angleDegrees) ? angleDegrees : 0,
        highlightedTarget: highlightedTarget ?? null,
        view: viewOf(view),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Forget the note (the editor closed, or still open). */
export function forgetFramingEditorDraft(storage) {
  try {
    storage?.removeItem(framingEditorDraftKey);
  } catch {
    // A storage that refuses: nothing to forget.
  }
}

/**
 * The note left by the editor, read once (it is forgotten), or `null`: none,
 * too old, or not one the editor wrote.
 */
export function takeFramingEditorDraft(storage, now = Date.now()) {
  let note = null;
  try {
    note = JSON.parse(storage?.getItem(framingEditorDraftKey) ?? "null");
  } catch {
    note = null;
  }
  forgetFramingEditorDraft(storage);
  if (!plain(note) || !finite(note.at)) return null;
  if (now - note.at > framingEditorDraftMaxAgeMs || now < note.at) return null;
  if (!plain(note.editor) || !MODES.includes(note.editor.mode)) return null;
  if (!plain(note.equipmentSelection)) return null;
  if (note.editor.mode !== "create" && !plain(note.editor.editingTarget))
    return null;
  return {
    editor: editorOf(note.editor),
    equipmentSelection: note.equipmentSelection,
    frameSurface: plain(note.frameSurface) ? note.frameSurface : null,
    angleDegrees: finite(note.angleDegrees) ? note.angleDegrees : 0,
    highlightedTarget: plain(note.highlightedTarget)
      ? note.highlightedTarget
      : null,
    view: viewOf(note.view),
  };
}

/**
 * The state the planner reopens its framing editor on from a note
 * (`takeFramingEditorDraft`): what the editor was opened on, with its
 * equipment, its frame settings, its angle, its highlighted target and its
 * view as they were left.
 */
export function framingEditorStateFromDraft(draft) {
  return {
    ...draft.editor,
    initialFrameSurface: draft.frameSurface,
    initialEquipmentSelection: draft.equipmentSelection,
    initialAngleDegrees: draft.angleDegrees,
    initialHighlightedTarget: draft.highlightedTarget,
    initialView: draft.view,
  };
}
