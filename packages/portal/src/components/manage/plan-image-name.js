"use client";

import { useEffect, useState } from "react";

// The name of the multi-night plan a plan image belongs to (« Image du plan
// multi-nuits IC 1805 : … »): the capture carries the plan's id only
// (`projectId`), the plan's name is its target's (`GET /v1/projects/{id}`).
// Read once per plan image; `""` while unread, when the capture is no plan
// image or when the plan cannot be read (the origin line then says it without
// a name).
export function usePlanImageName(projectId) {
  const [named, setNamed] = useState({ projectId: null, name: "" });
  useEffect(() => {
    if (!projectId) return undefined;
    let live = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          {
            credentials: "same-origin",
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) return;
        const project = await response.json();
        const name = project?.target?.name ?? project?.target?.targetId ?? "";
        if (live) setNamed({ projectId, name });
      } catch {
        // The origin line is said without a name.
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId]);
  return named.projectId === projectId ? named.name : "";
}
