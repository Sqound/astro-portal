"use client";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { playWebDialogExit, prepareWebDialogExit } from "./web-dialog-exit.js";

// Every web modal follows
// one convention — the close cross sits at the top RIGHT, the actions
// (Cancel / Keep… / Confirm) sit at the BOTTOM. A confirmation opened from inside a
// modal is never drawn inside that modal (where it can end up below the
// fold): it is its own dialog, detached into `document.body`, stacked above
// the first one, with the focus moved into it and handed back on close.
//
// `WebDialog` is that shell. It renders a native `<dialog>` through a portal
// into `document.body` and opens it with `showModal()`, so the browser's top
// layer does the stacking (a dialog opened later is always above one opened
// earlier, whatever z-index the page uses) and makes the rest of the page
// inert while it is open. The `<dialog>` element itself spans the viewport
// and stays transparent; the visible panel is `.web-dialog-panel`, so a
// click that lands on the dialog element itself is always a click outside
// the panel.

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function initialFocusTarget(dialog) {
  return (
    dialog.querySelector("[data-autofocus]") ||
    dialog.querySelector(`.web-dialog-body :is(${focusableSelector})`) ||
    dialog.querySelector(`.web-dialog-footer :is(${focusableSelector})`) ||
    dialog.querySelector(".web-dialog-close")
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * The shared web modal shell (see the file comment).
 *
 * - `title` / `eyebrow`: the heading, left of the header; `titleAs` picks
 *   its element (`h2` by default).
 * - `onClose`: the top-right cross, Escape and — only when
 *   `closeOnBackdrop` — a click outside the panel. A modal whose closing
 *   needs a confirmation passes its "request close" function here.
 * - `footer`: the actions row at the bottom. Each of its buttons takes one
 *   of the four button levels (`btn-link`, `btn-tertiary`,
 *   `btn-secondary`, `btn-primary`, plus `is-destructive`): cancel, close
 *   and back are links, the action of the dialog is the primary.
 * - `headerActions`: extra header buttons, drawn just left of the cross.
 * - `className` / `bodyClassName` / `footerClassName`: per-dialog styling
 *   of the panel, body and footer.
 * - `bodyRef`: the scrolling body element (for dialogs that scroll or
 *   query their own content).
 * - An element marked `data-autofocus` gets the initial focus; otherwise
 *   the first control of the body, then of the footer, then the cross.
 *   `focusTitle` puts it on the title instead — for a long dialog whose
 *   first control is not where reading should start.
 */
export function WebDialog({
  ariaLabel,
  focusTitle = false,
  bodyClassName = "",
  bodyRef = null,
  children,
  className = "",
  closeDisabled = false,
  closeLabel = "Close",
  closeOnBackdrop = false,
  describedBy,
  eyebrow = null,
  footer = null,
  footerClassName = "",
  headerActions = null,
  onClose,
  role = "dialog",
  title = null,
  titleAs: Title = "h2",
  titleClassName = "",
}) {
  const dialogRef = useRef(null);
  const backdropPressRef = useRef(false);
  // The element focused when the dialog was asked for (the button that
  // opened it): read during the first render, before anything inside the
  // dialog can take the focus, and handed the focus back on close.
  const openerRef = useRef(undefined);
  if (openerRef.current === undefined && typeof document !== "undefined")
    openerRef.current = document.activeElement;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = closeDisabled ? null : onClose;
  const titleId = `web-dialog-${useId().replace(/[^\w-]/g, "")}`;

  useIsomorphicLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    initialFocusTarget(dialog)?.focus({ preventScroll: true });
    // The dialog entered with a 200 ms fade (`portal.css`) and leaves the
    // same way back, from a still copy (`web-dialog-exit.js`).
    prepareWebDialogExit();
    return () => {
      if (dialog.open) {
        try {
          playWebDialogExit(dialog.querySelector(".web-dialog-panel"));
        } catch {
          // The exit is a courtesy: the dialog closes whatever happens.
        }
        dialog.close();
      }
      const opener = openerRef.current;
      if (opener?.isConnected && typeof opener.focus === "function")
        opener.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;
  const requestClose = () => onCloseRef.current?.();
  return createPortal(
    <dialog
      ref={dialogRef}
      className="web-dialog"
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-label={ariaLabel || undefined}
      aria-labelledby={title && !ariaLabel ? titleId : undefined}
      aria-describedby={describedBy}
      onKeyDown={(event) => {
        // React also bubbles events from a nested dialog (portalled
        // elsewhere in the DOM) through this one: only this dialog's own
        // content counts.
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          !dialogRef.current?.contains(event.target)
        )
          return;
        // Cancelling the keydown keeps the browser from closing the dialog
        // on its own: whether Escape closes, asks first or does nothing is
        // this component's owner's decision, exactly like the cross.
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onCancel={(event) => {
        if (event.target !== dialogRef.current) return;
        event.preventDefault();
        requestClose();
      }}
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === dialogRef.current;
      }}
      onClick={(event) => {
        const pressedOutside = backdropPressRef.current;
        backdropPressRef.current = false;
        if (
          closeOnBackdrop &&
          pressedOutside &&
          event.target === dialogRef.current
        )
          requestClose();
      }}
    >
      <div className={`web-dialog-panel ${className}`.trim()}>
        <header className="web-dialog-header">
          <div className="web-dialog-heading">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && (
              <Title
                id={titleId}
                className={titleClassName || undefined}
                data-autofocus={focusTitle ? "" : undefined}
                tabIndex={focusTitle ? -1 : undefined}
              >
                {title}
              </Title>
            )}
          </div>
          {headerActions}
          {onClose && (
            <button
              type="button"
              className="web-dialog-close"
              aria-label={closeLabel}
              title={closeLabel}
              disabled={closeDisabled}
              onClick={requestClose}
            >
              <CloseIcon />
            </button>
          )}
        </header>
        <div
          ref={bodyRef}
          className={`web-dialog-body ${bodyClassName}`.trim()}
        >
          {children}
        </div>
        {footer && (
          <footer className={`web-dialog-footer ${footerClassName}`.trim()}>
            {footer}
          </footer>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * A yes/no confirmation on the shared shell: the question as title, an
 * optional description, and Cancel + Confirm at the bottom. The initial
 * focus goes to Cancel (the least destructive choice); Escape and the cross
 * both cancel. Cancel is a link; `tone` picks the Confirm button's look
 * (the primary level, in the destructive tint for "danger", plain for
 * "primary"). `cancelClassName` / `confirmClassName` replace those classes
 * for a caller that has a documented reason to (none does today).
 */
export function WebConfirmDialog({
  busy = false,
  cancelClassName,
  cancelLabel,
  children = null,
  className = "",
  closeLabel,
  confirmClassName,
  confirmLabel,
  description = null,
  eyebrow = null,
  footerClassName = "",
  onCancel,
  onConfirm,
  title,
  titleAs = "h2",
  tone = "danger",
}) {
  const descriptionId = `web-confirm-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <WebDialog
      className={`web-confirm-dialog ${className}`.trim()}
      closeLabel={closeLabel || cancelLabel}
      closeDisabled={busy}
      describedBy={description ? descriptionId : undefined}
      eyebrow={eyebrow}
      footerClassName={footerClassName}
      onClose={onCancel}
      role="alertdialog"
      title={title}
      titleAs={titleAs}
      footer={
        <>
          <button
            type="button"
            className={cancelClassName ?? "btn-link"}
            data-autofocus=""
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              confirmClassName ??
              (tone === "danger" ? "btn-primary is-destructive" : "btn-primary")
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {description && <p id={descriptionId}>{description}</p>}
      {children}
    </WebDialog>
  );
}
