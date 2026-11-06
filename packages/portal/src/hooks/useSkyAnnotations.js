"use client";

import { useEffect, useRef, useState } from "react";
import {
  batchToDraw,
  starBatchMagnitude,
  starBatchUrl,
} from "../sky-annotations/star-batches.js";

/**
 * The sky annotations of the image a capture's page shows: the round button
 * of the viewer shows them or hides them. They are read from the address the
 * gallery's view gives (`skySolution.annotations`: `{ image, annotations,
 * starsAvailable }`, drawn by the portal alone from the image's sky
 * solution), in the pixels of the copy the page shows. `url` is `null`
 * while the image has no solution (no button then).
 *
 * The stars come in batches by threshold (`star-batches.js`: 3.5, 5.5, 8.5,
 * 10 mag, all): the page asks for the batch of the magnitude the selector
 * stands at (`?magnitude=`), and again when the selector goes to a threshold
 * no batch loaded holds. Meanwhile the annotations already read stay drawn;
 * the overlay keeps the stars that are not fainter than the selector.
 * `starsAvailable` is `false` when the server has no star catalogue: the
 * selector then changes nothing, and the page says so.
 */
export function useSkyAnnotations(url, magnitude = 5.5) {
  const [batches, setBatches] = useState({});
  const [starsAvailable, setStarsAvailable] = useState(true);
  const [state, setState] = useState("idle");
  // What a response belongs to: the page asked for another image, or hid the
  // annotations, since.
  const generation = useRef(0);
  const asked = useRef(new Set());
  const wanted = starBatchMagnitude(magnitude);

  const clear = () => {
    generation.current += 1;
    asked.current = new Set();
    setBatches({});
    setStarsAvailable(true);
    setState("idle");
  };

  /** Reads one batch; `true` once it is kept. */
  async function load(batch) {
    const mine = generation.current;
    asked.current.add(batch);
    try {
      const response = await fetch(starBatchUrl(url, batch), {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      if (mine !== generation.current) return false;
      setBatches((previous) => ({
        ...previous,
        [batch]: Array.isArray(body?.annotations) ? body.annotations : [],
      }));
      setStarsAvailable(body?.starsAvailable !== false);
      return true;
    } catch {
      // A batch that failed is asked for again the next time it is wanted.
      if (mine === generation.current) asked.current.delete(batch);
      return false;
    }
  }

  const toggle = async () => {
    if (!url) return;
    if (state === "ready") return clear();
    setState("running");
    const mine = generation.current;
    const loaded = await load(wanted);
    if (mine !== generation.current) return;
    setState(loaded ? "ready" : "failed");
  };

  // The selector went to a threshold no batch read holds.
  useEffect(() => {
    if (state !== "ready" || !url || !starsAvailable) return;
    if (asked.current.has(wanted)) return;
    void load(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, wanted, url, starsAvailable]);

  // The annotations drawn: the batch of the threshold, else the nearest read.
  const best = batchToDraw(Object.keys(batches).map(Number), wanted);
  const annotations = best === undefined ? [] : batches[best];
  return { annotations, state, starsAvailable, toggle, clear };
}
