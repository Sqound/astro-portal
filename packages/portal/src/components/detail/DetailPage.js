"use client";

import { useEffect, useMemo, useState } from "react";
import { orderedAssets } from "portal/format.js";
import { DetailsPanel } from "portal/components/detail/DetailsPanel.js";
import { ImageViewer } from "portal/components/detail/ImageViewer.js";
import { message } from "portal/i18n.js";
import {
  DEFAULT_PLAYBACK_INTERVAL,
  firstStepToPlay,
  useProgressionPlayback,
  useProgressionPlayingClass,
  useProgressionPreload,
} from "portal/components/detail/ProgressionPlayer.js";

export function DetailPage({ targetId, initialAssetId, locale = "en" }) {
  const [target, setTarget] = useState(null),
    [assetId, setAssetId] = useState(initialAssetId),
    [collapsed, setCollapsed] = useState(false),
    [playing, setPlaying] = useState(false),
    [interval, setIntervalValue] = useState(DEFAULT_PLAYBACK_INTERVAL),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    // A run of this effect that was left (React's development double run,
    // another target or language) applies nothing of its late answer.
    let runIsCurrent = true;
    fetch(
      `/api/catalog?locale=${encodeURIComponent(locale)}&all=1&knowledge=1&target=${encodeURIComponent(targetId)}`,
    )
      .then((response) => response.json())
      .then((data) => {
        if (!runIsCurrent) return;
        setTarget(data.targets.find((item) => item.id === targetId) || false);
      });
    return () => {
      runIsCurrent = false;
    };
  }, [targetId, locale]);
  useEffect(() => {
    setCollapsed(
      sessionStorage.getItem("astro-portal:details-collapsed") === "true",
    );
  }, []);
  useEffect(() => {
    const query = matchMedia("(max-width:850px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const sync = () =>
      setAssetId(
        decodeURIComponent(
          location.pathname.split("/").at(-1) || initialAssetId,
        ),
      );
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, [initialAssetId]);
  useProgressionPlayingClass(playing);
  const assets = useMemo(() => (target ? orderedAssets(target) : []), [target]);
  const allAssets = useMemo(
    () => (target ? [...assets, ...(target.history || [])] : []),
    [assets, target],
  );
  const asset =
    allAssets.find((item) => item.assetId === assetId) || target?.featured;
  const progressionMode = asset?.kind === "progression";
  const viewerAssets = progressionMode ? target.history : assets;
  const select = (nextId) => {
    setAssetId(nextId);
    history.pushState(
      {},
      "",
      `/${locale}/image/${encodeURIComponent(targetId)}/${encodeURIComponent(nextId)}`,
    );
  };
  const historyIds = (target?.history || []).map((item) => item.assetId);
  const sourceOfStep = (id) =>
    (target?.history || []).find((item) => item.assetId === id)?.imageUrl ??
    null;
  // The next milestone's picture is fetched while the current one is shown,
  // and the playback waits for it.
  useProgressionPlayback({
    playing,
    interval,
    stepIds: historyIds,
    activeId: assetId,
    onStep: select,
    sourceOf: sourceOfStep,
  });
  useProgressionPreload({
    stepIds: historyIds,
    activeId: assetId,
    sourceOf: sourceOfStep,
  });
  if (target === false)
    return (
      <main>
        <p>{message(locale, "notFound")}</p>
      </main>
    );
  if (!target || !asset)
    return (
      <main>
        <p>{message(locale, "loading")}</p>
      </main>
    );
  const toggle = () =>
    setCollapsed((value) => {
      sessionStorage.setItem("astro-portal:details-collapsed", String(!value));
      return !value;
    });
  // ▶ always starts from the first night, wherever the viewer was.
  const togglePlay = () => {
    const first = firstStepToPlay(historyIds);
    if (!playing && first && asset.assetId !== first) select(first);
    setPlaying((value) => !value);
  };
  const exitProgression = () => {
    setPlaying(false);
    select(target.featured.assetId);
  };
  const chevron = mobile
    ? collapsed
      ? "m5 14.5 7-7 7 7"
      : "m5 9.5 7 7 7-7"
    : collapsed
      ? "m14.5 5-7 7 7 7"
      : "m9.5 5 7 7-7 7";
  return (
    <main id="viewer">
      <div className={`viewer${collapsed ? " details-collapsed" : ""}`}>
        <ImageViewer
          target={target}
          asset={asset}
          assets={viewerAssets}
          onSelect={select}
          playing={playing}
          progressionMode={progressionMode}
          onExitProgression={exitProgression}
          locale={locale}
        />
        {collapsed && (
          <button
            className="details-toggle details-reopen"
            onClick={toggle}
            aria-label={message(locale, "details")}
          >
            <svg viewBox="0 0 24 24">
              <path d={chevron} />
            </svg>
          </button>
        )}
        <DetailsPanel
          target={target}
          asset={asset}
          assets={viewerAssets}
          onSelect={select}
          playing={playing}
          onTogglePlay={togglePlay}
          interval={interval}
          onInterval={setIntervalValue}
          collapsed={collapsed}
          onToggleDetails={toggle}
          toggleChevron={chevron}
          locale={locale}
        />
      </div>
    </main>
  );
}
