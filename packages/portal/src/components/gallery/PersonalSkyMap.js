"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { message } from "portal/i18n.js";
import { coordinateForTarget } from "astro-core/sky-coordinates.js";
import {
  loadStellariumTranslations,
  translateStellariumLabel,
} from "portal/stellarium-translations.js";
import {
  SKY_MAP_PLACE,
  groupsKey,
  markerChanges,
  nightInstantFor,
} from "./sky-map-night.js";

const engineUrl = "/vendor/stellarium/stellarium-web-engine.js";
const engineWasmUrl = "/vendor/stellarium/stellarium-web-engine.wasm";
const skyDataUrl = "/vendor/stellarium/skydata/";
let engineLoader;

function loadEngine() {
  if (!engineLoader)
    engineLoader = import(/* webpackIgnore: true */ engineUrl).then(
      (module) => module.default,
    );
  return engineLoader;
}

function configureConstellationLayers(core, constellationArtVisible = true) {
  // A sky culture resets these settings when it is attached.  Lines and art
  // are separate layers: keeping the former enabled must not depend on art.
  core.constellations.lines_visible = true;
  core.constellations.labels_visible = true;
  core.constellations.images_visible = constellationArtVisible;
  core.skycultures.name_format_style = 0;
}

// The sky is always a night sky: the place and the instant are the map's own
// (`sky-map-night.js`), set whenever the view is configured, and the clock is
// stopped so that a map left open does not drift into the dawn.
function configureSky(stel, night) {
  const { core } = stel;
  core.observer.longitude = SKY_MAP_PLACE.longitude * stel.D2R;
  core.observer.latitude = SKY_MAP_PLACE.latitude * stel.D2R;
  core.observer.utc = stel.date2MJD(night.instant);
  core.time_speed = 0;
  core.observer.yaw = 0;
  core.observer.pitch = 30 * stel.D2R;
  core.fov = 120 * stel.D2R;
  core.bortle_index = 4;
  core.atmosphere.visible = false;
  configureConstellationLayers(core);
  core.stars.hints_visible = false;
  core.dsos.hints_visible = false;
}

function addSkyData(stel, locale) {
  const { core } = stel;
  core.stars.addDataSource({ url: `${skyDataUrl}stars` });
  core.skycultures.addDataSource({
    url:
      locale === "en"
        ? `${skyDataUrl}skycultures/western`
        : `/api/stellarium/skyculture/${locale}/western`,
    key: "western",
  });
  core.dsos.addDataSource({ url: `${skyDataUrl}dso` });
  core.milkyway.addDataSource({ url: `${skyDataUrl}surveys/milkyway` });
}

// One engine per canvas, whatever the number of times the page asks for it
// (a development build runs every effect twice, a filter re-renders the page).
// A second engine on the same canvas draws over the first with the engine's
// own defaults: its atmosphere and « now ».
const enginesByCanvas = new WeakMap();

function engineOf(canvas, locale, night, onChange) {
  let engine = enginesByCanvas.get(canvas);
  if (!engine) {
    engine = Promise.all([
      loadEngine(),
      loadStellariumTranslations(locale),
    ]).then(
      ([StelWebEngine, translations]) =>
        new Promise((resolve, reject) => {
          Promise.resolve(
            StelWebEngine({
              wasmFile: engineWasmUrl,
              canvasElement: canvas,
              translateFn(domain, label) {
                return translateStellariumLabel(translations, domain, label);
              },
              onReady(stel) {
                configureSky(stel, night);
                addSkyData(stel, locale);
                configureConstellationLayers(stel.core);
                const layer = stel.createLayer({
                  id: "astro-portal-captures",
                  z: 8,
                  visible: true,
                });
                stel.change((_, attribute) => onChange(stel, attribute));
                canvas.dataset.skyInstant = night.instant.toISOString();
                resolve({ stel, layer, night, markers: new Map() });
              },
            }),
          ).catch(reject);
        }),
    );
    engine.catch(() => enginesByCanvas.delete(canvas));
    enginesByCanvas.set(canvas, engine);
  }
  return engine;
}

function thumbnailUrl(targetId) {
  return `/map-thumbnails/${encodeURIComponent(targetId)}.png`;
}

// A public capture of the home gallery brings its own position, link,
// image and thumbnail; a target of the operator's file gallery has them
// through its featured asset and the map thumbnails.
const assetOf = (target) => target?.featured || target?.reference || null;
const imageOf = (target) => target?.imageUrl || assetOf(target)?.imageUrl;
const hrefOf = (target, locale) =>
  target.href ||
  `/${locale}/image/${encodeURIComponent(target.id)}/${encodeURIComponent(assetOf(target)?.assetId)}`;

function capturePreview(group) {
  const target = group.targets.find((item) => imageOf(item));
  if (!target) return null;
  return {
    url: target.previewUrl || thumbnailUrl(target.id),
  };
}

function projectCapture(stel, coordinate, width, height) {
  if (!width || !height) return null;
  const view = stel.convertFrame(
    stel.core.observer,
    "ICRF",
    "VIEW",
    stel.s2c(coordinate.ra * stel.D2R, coordinate.dec * stel.D2R),
  );
  const aspect = width / height;
  const fovy =
    aspect < 1
      ? 4 * Math.atan(Math.tan(stel.core.fov / 4) / aspect)
      : stel.core.fov;
  const fovx =
    aspect < 1
      ? stel.core.fov
      : 4 * Math.atan(Math.tan(stel.core.fov / 4) * aspect);
  const x = view[0] / (1 - view[2]) / Math.tan(fovx / 4);
  const y = view[1] / (1 - view[2]) / Math.tan(fovy / 4);
  if (!Number.isFinite(x) || !Number.isFinite(y) || view[2] >= 0) return null;
  if (Math.abs(x) > 1.14 || Math.abs(y) > 1.14) return null;
  return { left: `${(x + 1) * 50}%`, top: `${(1 - y) * 50}%` };
}

export function PersonalSkyMap({ locale, targets, onOpenTarget }) {
  const canvasRef = useRef(null);
  // The engine, its layer, the instant it shows and the markers it holds:
  // built once per canvas, never by a change of the captures shown.
  const skyRef = useRef(null);
  const engineRef = useRef(null);
  const groupsRef = useRef([]);
  const frameRef = useRef(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [atlasState, setAtlasState] = useState("loading");
  const [mapHelpOpen, setMapHelpOpen] = useState(false);
  const [constellationsVisible, setConstellationsVisible] = useState(true);
  const [constellationArtVisible, setConstellationArtVisible] = useState(true);
  const [captureThumbnailsVisible, setCaptureThumbnailsVisible] =
    useState(true);
  const [capturePositions, setCapturePositions] = useState([]);
  const groups = useMemo(() => {
    const values = new Map();
    for (const target of targets) {
      const coordinate = target.coordinate || coordinateForTarget(target);
      if (!coordinate) continue;
      const source = target.stellarium?.source || target.objects?.[0];
      const current = values.get(source) || {
        source,
        coordinate,
        targets: [],
      };
      current.targets.push(target);
      values.set(source, current);
    }
    return [...values.values()].sort((left, right) =>
      left.source.localeCompare(right.source, locale),
    );
  }, [locale, targets]);
  // The gallery hands a new array at every render; what the map draws changes
  // only when this key does.
  const drawnKey = groupsKey(groups);

  useEffect(() => {
    if (!groups.some((group) => group.source === selectedSource))
      setSelectedSource(groups[0]?.source || null);
  }, [groups, selectedSource]);

  // Where the captures stand on the screen: projected by the engine's own
  // view, so read again when the view, the size or the captures change.
  const refreshCapturePositions = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const stel = engineRef.current;
    if (!canvas || !stel) return;
    const { width, height } = canvas.getBoundingClientRect();
    setCapturePositions(
      groupsRef.current.flatMap((group) => {
        const preview = capturePreview(group);
        const position =
          preview && projectCapture(stel, group.coordinate, width, height);
        return position ? [{ ...group, ...preview, position }] : [];
      }),
    );
  }, []);
  const scheduleCapturePositionRefresh = useCallback(() => {
    if (!frameRef.current)
      frameRef.current = requestAnimationFrame(refreshCapturePositions);
  }, [refreshCapturePositions]);

  // A selection made in the sky (a click on a marker) is the selected source.
  const onEngineChange = (stel, attribute) => {
    if (attribute === "selection") {
      const selectedId = stel.core.selection?.id || "";
      const source = [...(skyRef.current?.markers.entries() ?? [])].find(
        ([, marker]) => marker.id === selectedId,
      )?.[0];
      if (source) setSelectedSource(source);
    }
    scheduleCapturePositionRefresh();
  };
  const onEngineChangeRef = useRef(onEngineChange);
  onEngineChangeRef.current = onEngineChange;

  // The sky: one engine per canvas, set to a night sky, and nothing else
  // here depends on the captures.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let active = true;
    setAtlasState("loading");
    engineOf(
      canvas,
      locale,
      nightInstantFor(SKY_MAP_PLACE, new Date()),
      (stel, attribute) => onEngineChangeRef.current(stel, attribute),
    )
      .then((sky) => {
        if (!active) return;
        skyRef.current = sky;
        engineRef.current = sky.stel;
        setAtlasState("ready");
      })
      .catch(() => {
        if (active) setAtlasState("error");
      });
    return () => {
      active = false;
      engineRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setCapturePositions([]);
    };
  }, [locale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (atlasState !== "ready" || !canvas) return undefined;
    const resizeObserver = new ResizeObserver(scheduleCapturePositionRefresh);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [atlasState, scheduleCapturePositionRefresh]);

  // The captures: markers come and go on the layer of the one engine.
  useEffect(() => {
    groupsRef.current = groups;
    const sky = skyRef.current;
    if (atlasState !== "ready" || !sky) return;
    const { stel, layer, markers } = sky;
    const { add, remove } = markerChanges(markers.keys(), groups);
    for (const source of remove) {
      const marker = markers.get(source);
      if (stel.core.selection?.id === marker.id) {
        stel.core.lock = null;
        stel.core.selection = null;
      }
      layer.remove(marker);
      markers.delete(source);
    }
    for (const group of add) {
      const marker = stel.createObj("dso", {
        id: `astro-portal:${group.source}`,
        model_data: {
          ra: group.coordinate.ra,
          de: group.coordinate.dec,
          vmag: -2.5,
          dimx: 14,
          dimy: 14,
        },
        names: [`NAME ${group.source}`],
        types: ["dso"],
      });
      marker.update();
      layer.add(marker);
      markers.set(group.source, marker);
    }
    scheduleCapturePositionRefresh();
    // `groups` is read through `drawnKey`: the same drawing is not drawn twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnKey, atlasState, scheduleCapturePositionRefresh]);

  const selected = groups.find((group) => group.source === selectedSource);
  const mappedCount = groups.reduce(
    (count, group) => count + group.targets.length,
    0,
  );
  const omittedCount = targets.length - mappedCount;

  const zoom = (factor) => {
    const stel = engineRef.current;
    if (!stel) return;
    const nextFov = Math.min(
      Math.PI * 0.98,
      Math.max(0.015, stel.core.fov * factor),
    );
    stel.zoomTo(nextFov, 0.18);
  };

  const resetView = () => {
    const stel = engineRef.current;
    if (!stel) return;
    stel.core.lock = null;
    stel.core.selection = null;
    configureSky(stel, skyRef.current.night);
    setConstellationsVisible(true);
    setConstellationArtVisible(true);
  };

  const toggleConstellations = () => {
    const stel = engineRef.current;
    if (!stel) return;
    const next = !constellationsVisible;
    stel.core.constellations.lines_visible = next;
    stel.core.constellations.labels_visible = next;
    setConstellationsVisible(next);
  };

  const toggleConstellationArt = () => {
    const stel = engineRef.current;
    if (!stel) return;
    const next = !constellationArtVisible;
    stel.core.constellations.images_visible = next;
    setConstellationArtVisible(next);
  };

  const toggleCaptureThumbnails = () => {
    setCaptureThumbnailsVisible((visible) => !visible);
  };

  const focusGroup = (source) => {
    const marker = skyRef.current?.markers.get(source);
    const stel = engineRef.current;
    if (!marker || !stel) return;
    setSelectedSource(source);
    stel.core.selection = marker;
    stel.pointAndLock(marker, 0.35);
    stel.zoomTo(24 * stel.D2R, 0.35);
  };

  return (
    <section
      className="personal-sky-map"
      aria-label={message(locale, "personalSkyMap")}
    >
      <div className="sky-atlas-shell">
        <canvas
          className="sky-atlas"
          key={locale}
          ref={canvasRef}
          role="application"
          aria-label={message(locale, "interactiveSkyMap")}
        />
        {captureThumbnailsVisible && (
          <div className="sky-atlas-capture-overlays">
            {capturePositions.map((capture) => (
              <button
                className="sky-atlas-capture-card"
                key={capture.source}
                type="button"
                style={capture.position}
                onClick={() => focusGroup(capture.source)}
              >
                <img src={capture.url} alt="" />
                <span>{capture.source}</span>
              </button>
            ))}
          </div>
        )}
        <div
          className="sky-atlas-controls"
          aria-label={message(locale, "mapControls")}
        >
          <button
            type="button"
            aria-label={message(locale, "zoomIn")}
            title={message(locale, "zoomIn")}
            onClick={() => zoom(0.66)}
          >
            +
          </button>
          <button
            type="button"
            aria-label={message(locale, "zoomOut")}
            title={message(locale, "zoomOut")}
            onClick={() => zoom(1.5)}
          >
            −
          </button>
          <button
            className={constellationsVisible ? "is-active" : ""}
            type="button"
            aria-pressed={constellationsVisible}
            aria-label={message(locale, "toggleConstellations")}
            title={message(locale, "toggleConstellations")}
            onClick={toggleConstellations}
          >
            ✧
          </button>
          <button
            className={constellationArtVisible ? "is-active" : ""}
            type="button"
            aria-pressed={constellationArtVisible}
            aria-label={message(locale, "toggleConstellationArt")}
            title={message(locale, "toggleConstellationArt")}
            onClick={toggleConstellationArt}
          >
            ♙
          </button>
          <button
            className={captureThumbnailsVisible ? "is-active" : ""}
            type="button"
            aria-pressed={captureThumbnailsVisible}
            aria-label={message(locale, "toggleCaptureThumbnails")}
            title={message(locale, "toggleCaptureThumbnails")}
            onClick={toggleCaptureThumbnails}
          >
            ▧
          </button>
          <button
            type="button"
            aria-label={message(locale, "resetSkyMap")}
            title={message(locale, "resetSkyMap")}
            onClick={resetView}
          >
            ⌂
          </button>
        </div>
        <div className="sky-atlas-footer">
          <span className="sky-atlas-profile">
            {message(locale, "bortle4Profile")}
          </span>
          <div className="sky-map-help">
            <button
              type="button"
              aria-label={message(locale, "skyMapHelp")}
              aria-expanded={mapHelpOpen}
              aria-controls="sky-map-help-content"
              title={message(locale, "skyMapHelp")}
              onClick={() => setMapHelpOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.25" />
                <path d="M12 10.6v5" />
                <path d="M12 7.6h.01" />
              </svg>
            </button>
            {mapHelpOpen && (
              <div
                className="sky-map-help-popover"
                id="sky-map-help-content"
                role="status"
              >
                <span>
                  {mappedCount} {message(locale, "targetsOnMap")}
                </span>
                <span>{message(locale, "coordinatesJ2000")}</span>
                <span>{message(locale, "captureThumbnailsOnMap")}</span>
                <span>{message(locale, "interactiveSkyMap")}</span>
                {omittedCount > 0 && (
                  <span>
                    {omittedCount} {message(locale, "movingTargetsOmitted")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {atlasState !== "ready" && (
          <div
            className="sky-atlas-status"
            role="status"
            aria-busy={atlasState === "error" ? undefined : "true"}
          >
            {atlasState === "error" ? null : (
              <BrandLoader className="sky-atlas-status-star" size={18} />
            )}
            {message(
              locale,
              atlasState === "error" ? "atlasUnavailable" : "atlasLoading",
            )}
          </div>
        )}
      </div>
      <div
        className="sky-map-sources"
        aria-label={message(locale, "capturedTargets")}
      >
        {groups.map((group) => (
          <button
            className={group.source === selectedSource ? "is-active" : ""}
            key={group.source}
            type="button"
            onClick={() => focusGroup(group.source)}
          >
            {group.source}
          </button>
        ))}
      </div>
      {selected && (
        <div className="sky-map-selection" aria-live="polite">
          <div>
            <p className="eyebrow">{selected.source}</p>
            <h3>{message(locale, "capturedHere")}</h3>
          </div>
          <div className="sky-map-target-list">
            {selected.targets.map((target) => (
              <a
                href={hrefOf(target, locale)}
                key={target.id}
                onClick={onOpenTarget}
              >
                <img src={imageOf(target)} alt="" />
                <span>
                  <strong>{target.title}</strong>
                  <small>
                    {target.telescope ??
                      target.equipment?.Télescope?.split(" - ")[0]}
                  </small>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
