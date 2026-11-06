"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";

export function FullImagePage({ targetId, assetId, locale = "en" }) {
  const [record, setRecord] = useState(null);
  useEffect(() => {
    // A run of this effect that was left (React's development double run,
    // another image or language) applies nothing of its late answer.
    let runIsCurrent = true;
    fetch(
      `/api/catalog?all=1&knowledge=1&locale=${encodeURIComponent(locale)}&target=${encodeURIComponent(targetId)}`,
    )
      .then((response) => response.json())
      .then((data) => {
        if (!runIsCurrent) return;
        const target = data.targets.find((item) => item.id === targetId);
        const asset =
          target &&
          [...target.variants, ...target.history].find(
            (item) => item.assetId === assetId,
          );
        setRecord(target && asset ? { target, asset } : false);
      });
    return () => {
      runIsCurrent = false;
    };
  }, [targetId, assetId, locale]);
  if (record === false)
    return (
      <main className="focus-page">
        <p>{message(locale, "imageNotFound")}</p>
      </main>
    );
  if (!record)
    return (
      <main className="focus-page">
        <p>{message(locale, "loading")}</p>
      </main>
    );
  return (
    <main className="focus-page">
      <a
        href={`/${locale}/image/${encodeURIComponent(targetId)}/${encodeURIComponent(assetId)}`}
        aria-label={message(locale, "backToDetails")}
      >
        ×
      </a>
      <img
        src={record.asset.imageUrl}
        alt={`${record.target.title} — ${record.asset.variant}`}
      />
    </main>
  );
}
