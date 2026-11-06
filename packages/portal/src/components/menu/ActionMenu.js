"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { menuPlacement } from "./menu-placement.js";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The ⋯ menu of a card or of a row: the web has no swipe, so a plan card and a session
 * row carry one icon button that opens a menu of actions — the ones that keep first, then a separator, then the
 * ones that remove, in the destructive tint (`is-danger`). An item is a
 * menu item (a button, or a link with `href`), never one of the four levels of
 * buttons; the trigger is an icon button. Keyboard: the
 * trigger opens with Enter, Space or ArrowDown; the arrows, Home and End move
 * between the items, Escape and Tab close it, and the focus goes back to the
 * trigger.
 *
 * `items`: `{ key, label, onSelect?, href?, destructive?, separatorBefore? }`.
 * The menu is not drawn inside the card: a card may clip what overflows it
 * (`overflow: hidden` rounds its corners), and a menu opened at the foot of a
 * card or of the window would be cut. It is a portal into `document.body` (into
 * the open `<dialog>` when the trigger stands in one, whose top layer hides the
 * body), placed in the window's coordinates under the trigger at its right
 * edge, over it when there is no room below, and followed while the page scrolls
 * or is resized.
 */
export function ActionMenu({ label, items, className = "", testId = null }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const menuId = `action-menu-${useId().replace(/[^\w-]/g, "")}`;
  const entries = items.filter(Boolean);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    // Measured at its natural height: the cut of an earlier placement is lifted.
    const cut = list.style.maxHeight;
    list.style.maxHeight = "none";
    const view = {
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
    };
    const next = menuPlacement(
      trigger.getBoundingClientRect(),
      { width: list.offsetWidth, height: list.scrollHeight },
      view,
    );
    list.style.maxHeight = cut;
    setPlacement((current) =>
      current &&
      current.top === next.top &&
      current.left === next.left &&
      current.maxHeight === next.maxHeight &&
      current.above === next.above
        ? current
        : next,
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }
    place();
    window.addEventListener("resize", place);
    // Any scroll, of the page or of a block around the card.
    window.addEventListener("scroll", place, true);
    const view = window.visualViewport;
    view?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      view?.removeEventListener("resize", place);
    };
  }, [open, place]);

  // The focus enters the menu once it is placed (a hidden list takes none).
  const placed = placement !== null;
  useEffect(() => {
    if (!open || !placed) return undefined;
    const itemsOf = () => [
      ...(listRef.current?.querySelectorAll('[role="menuitem"]') ?? []),
    ];
    itemsOf()[0]?.focus({ preventScroll: true });
    const outside = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !listRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, placed]);

  if (!entries.length) return null;

  const onMenuKey = (event) => {
    const nodes = [...listRef.current.querySelectorAll('[role="menuitem"]')];
    const index = nodes.indexOf(document.activeElement);
    const move = (to) => {
      event.preventDefault();
      nodes[(to + nodes.length) % nodes.length]?.focus({ preventScroll: true });
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(nodes.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div
      className={`action-menu ${className}`.trim()}
      ref={rootRef}
      // The card around the menu opens on a click: the menu keeps its own.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        ref={triggerRef}
        className="action-menu-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18.5" cy="12" r="1.8" />
        </svg>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="action-menu-list"
              role="menu"
              id={menuId}
              aria-label={label}
              ref={listRef}
              data-placement={
                placement ? (placement.above ? "above" : "below") : null
              }
              style={
                placement
                  ? {
                      top: placement.top,
                      left: placement.left,
                      ...(placement.maxHeight != null
                        ? { maxHeight: placement.maxHeight }
                        : {}),
                    }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
              // The card around the menu opens on a click: the menu keeps its own
              // (the click crosses the portal in React's tree).
              onClick={(event) => event.stopPropagation()}
              onKeyDown={onMenuKey}
            >
              {entries.map((entry) => (
                <div key={entry.key} className="action-menu-entry" role="none">
                  {entry.separatorBefore ? (
                    <hr className="action-menu-separator" role="separator" />
                  ) : null}
                  {entry.href ? (
                    <a
                      role="menuitem"
                      tabIndex={-1}
                      href={entry.href}
                      data-action={entry.key}
                      className={entry.destructive ? "is-danger" : undefined}
                      onClick={() => close(false)}
                    >
                      {entry.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      data-action={entry.key}
                      className={entry.destructive ? "is-danger" : undefined}
                      onClick={() => {
                        close(false);
                        entry.onSelect?.();
                      }}
                    >
                      {entry.label}
                    </button>
                  )}
                </div>
              ))}
            </div>,
            triggerRef.current?.closest("dialog[open]") ?? document.body,
          )
        : null}
    </div>
  );
}
