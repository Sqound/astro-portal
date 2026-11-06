"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The width in CSS pixels of the element the returned ref is put on,
 * followed as it changes (ResizeObserver), so a chart draws its SVG at its
 * real size: its text stays legible at 390 px instead of shrinking with a
 * fixed viewBox. `fallback` until the element is measured (the server's
 * render, a test). A callback ref: an element the page replaces is measured
 * and followed again. The width is the layout's (`clientWidth`), whatever
 * transform an ancestor wears while it animates.
 */
export function useChartWidth(fallback = 1000) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef(null);
  const ref = useCallback((node) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const measure = () => {
      // The layout width, never the painted one: an entering animation that
      // scales the page (a transform) must not shrink the chart for good —
      // a ResizeObserver does not hear a transform end.
      const next = Math.round(node.clientWidth || node.offsetWidth || 0);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === "function") {
      observer.current = new ResizeObserver(measure);
      observer.current.observe(node);
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
