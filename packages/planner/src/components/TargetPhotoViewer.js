"use client";

import { ObjectPictogram } from "portal/components/ObjectPictogram.js";
import { KnowledgeStory } from "portal/components/detail/KnowledgeStory.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { hasChildrenVersion } from "portal/children-version.js";
import { skyPictureViewerUrl } from "portal/sky-pictures.js";
import { useState } from "react";
import {
  ChildrenVersionControl,
  useChildrenVersion,
} from "./ChildrenVersionControl.js";
import { targetPhotoViewerWords } from "../target-photo-viewer-words.js";
import { useTargetKnowledge } from "./use-target-knowledge.js";

// The full-screen photo of a target on the web: in a full-screen `WebDialog`.
// The header holds the pictogram of the target's type, its designation and its
// name, and the dialog's cross — on the right, as every web dialog — which
// closes it, as Escape does; the photo, whole, in the middle; the panel at the
// bottom, which scrolls: the facts as chips, tonight's window, the description
// of the target's card, then "Sources" with the credit last. A click on the
// photo hides or shows the header and the panel; it never closes. There is no
// swipe down (a mouse has none) and the transition is a fade only.

/**
 * The viewer. `url` is the image the thumbnail showed; `window` tonight's
 * window (`{ start, end, maxAltitude, inPlan }`, clock times written in the
 * place's time); `knowledge` the catalogue's card of the target when the
 * caller read it, else it is read here.
 */
export function TargetPhotoViewer({
  target,
  url,
  credit = null,
  window = null,
  knowledge = null,
  locale,
  onClose,
}) {
  const own = targetPhotoViewerWords({
    target,
    knowledge,
    window,
    credit,
    locale,
  });
  // A target with its published page needs no read; the others are read for
  // one (a target that froze a flat text keeps it unless a page comes).
  // A frozen page is read once more for the children's text when the caller
  // gave none.
  const read = useTargetKnowledge(
    target,
    locale,
    Boolean(own.page),
    !own.childrenKnowledge && !hasChildrenVersion(knowledge),
  );
  // "Pour les enfants": the children's paragraphs in place of the page, its
  // sources kept (the web has no voice: the text only).
  const childrenOn = useChildrenVersion();
  const words = targetPhotoViewerWords({
    target,
    knowledge: read || knowledge,
    window,
    credit,
    locale,
    children: childrenOn,
  });
  const [bare, setBare] = useState(false);
  return (
    <WebDialog
      className={`target-photo-viewer${bare ? " is-bare" : ""}`}
      bodyClassName="target-photo-viewer-body"
      closeLabel={words.close}
      onClose={onClose}
      title={
        <span className="target-photo-viewer-title">
          <span className="target-photo-viewer-pictogram" aria-hidden="true">
            <ObjectPictogram target={target} locale={locale} size="70%" />
          </span>
          <span className="target-photo-viewer-names">
            {words.designation}
            {words.name ? (
              <span className="target-photo-viewer-name">
                {words.designation ? ` · ${words.name}` : words.name}
              </span>
            ) : null}
          </span>
        </span>
      }
    >
      {/* The first focus goes to the photo (a reading start, not a
          control), so the cross does not open in its focused look. */}
      <div
        className="target-photo-viewer-photo"
        data-target-photo=""
        data-autofocus=""
        tabIndex={-1}
        onClick={() => setBare((value) => !value)}
      >
        <img
          src={skyPictureViewerUrl(target, url)}
          alt={words.photo}
          referrerPolicy="no-referrer"
        />
      </div>
      <section
        className="target-photo-viewer-panel"
        aria-label={words.panel}
        aria-hidden={bare ? "true" : undefined}
      >
        {words.chips.length ? (
          <ul className="target-photo-viewer-chips">
            {words.chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        ) : null}
        {words.tonight ? (
          <p className="target-photo-viewer-tonight" data-photo="tonight">
            <b>{words.tonight.label}</b> {words.tonight.line}
          </p>
        ) : null}
        {words.paragraphs.length || words.page ? (
          <ChildrenVersionControl
            knowledge={words.childrenKnowledge || read || knowledge}
            locale={locale}
            className="target-photo-viewer-children"
          />
        ) : null}
        {words.page ? (
          // A published page: the page of the detail page, whole.
          <div className="knowledge-story target-photo-viewer-text target-photo-viewer-story">
            <KnowledgeStory
              knowledge={words.page}
              paragraphs={words.paragraphs}
              locale={locale}
            />
          </div>
        ) : (
          words.paragraphs.map((paragraph, index) => (
            <p key={index} className="target-photo-viewer-text">
              {paragraph}
            </p>
          ))
        )}
        {words.sources ? (
          <div className="target-photo-viewer-sources" data-photo="sources">
            <h3>{words.sources.title}</h3>
            {words.sources.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </section>
    </WebDialog>
  );
}

/**
 * The viewer of a page: `open(props)` shows it with those props (`target`,
 * `url`, `credit`, `window`, `knowledge`), `viewer` is the element to
 * render; its cross and Escape close it.
 */
export function useTargetPhotoViewer({ locale }) {
  const [open, setOpen] = useState(null);
  return {
    open: (props) => setOpen(props),
    viewer: open ? (
      <TargetPhotoViewer
        {...open}
        locale={locale}
        onClose={() => setOpen(null)}
      />
    ) : null,
  };
}
