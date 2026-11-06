"use client";

import { useState } from "react";

export function usePlateSolve(target, asset) {
  const [annotations, setAnnotations] = useState([]);
  const [state, setState] = useState("idle");
  const clear = () => {
    setAnnotations([]);
    setState("idle");
  };
  const toggle = async () => {
    if (state === "ready") return clear();
    setState("running");
    const endpoint = `/api/plate-solve/${encodeURIComponent(target.id)}/${encodeURIComponent(asset.assetId)}`;
    try {
      let result = await (await fetch(endpoint)).json();
      if (result.state === "failed")
        result = await (await fetch(`${endpoint}?retry=1`)).json();
      while (result.state === "running") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await (await fetch(endpoint)).json();
      }
      if (result.state !== "ready") return setState("failed");
      setAnnotations(
        (await (await fetch(result.annotationsUrl)).json()).annotations || [],
      );
      setState("ready");
    } catch {
      setState("failed");
    }
  };
  return { annotations, state, toggle, clear };
}
