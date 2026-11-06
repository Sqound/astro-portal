"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { normalized } from "portal/format.js";
import { message } from "portal/i18n.js";

export const magnitudes = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10, 99];

const greekLetters = {
  Alp: "α",
  Bet: "β",
  Gam: "γ",
  Del: "δ",
  Eps: "ε",
  Zet: "ζ",
  Eta: "η",
  The: "θ",
  Iot: "ι",
  Kap: "κ",
  Lam: "λ",
  Mu: "μ",
  Nu: "ν",
  Xi: "ξ",
  Omi: "ο",
  Pi: "π",
  Rho: "ρ",
  Sig: "σ",
  Tau: "τ",
  Ups: "υ",
  Phi: "φ",
  Chi: "χ",
  Psi: "ψ",
  Ome: "ω",
};
const superscripts = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const catalogueKey = (value) => normalized(value).replace(/[\s._-]/g, "");
const distance = (left, right) =>
  Math.hypot(left.pixelx - right.pixelx, left.pixely - right.pixely);
const overlaps = (left, right, gap) =>
  !(
    left.x + left.width + gap <= right.x ||
    right.x + right.width + gap <= left.x ||
    left.y + left.height + gap <= right.y ||
    right.y + right.height + gap <= left.y
  );

function formatStarLabel(value) {
  const label = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  const match = label.match(
    /^(\d+)?(Alp|Bet|Gam|Del|Eps|Zet|Eta|The|Iot|Kap|Lam|Mu|Nu|Xi|Omi|Pi|Rho|Sig|Tau|Ups|Phi|Chi|Psi|Ome)(\d*)?([A-Z][a-z]{2})$/,
  );
  if (!match) return label;
  const [, flamsteed = "", greek, component = "", constellation] = match;
  const suffix = [...component]
    .map((digit) => superscripts[Number(digit)] || digit)
    .join("");
  return [flamsteed, `${greekLetters[greek]}${suffix}`, constellation]
    .filter(Boolean)
    .join(" ");
}

function uniqueByLabel(items, labelFor, compare) {
  const unique = new Map();
  for (const item of items) {
    const key = catalogueKey(labelFor(item));
    if (!key) continue;
    const previous = unique.get(key);
    if (!previous || compare(item, previous) < 0) unique.set(key, item);
  }
  return [...unique.values()];
}

export function PlateOverlay({
  annotations,
  target,
  imageRef,
  canvasRef,
  magnitude,
  locale = "en",
}) {
  const [geometry, setGeometry] = useState(null);
  useLayoutEffect(() => {
    let frameId;
    const sync = () => {
      const image = imageRef.current,
        canvas = canvasRef.current;
      if (!image?.naturalWidth || !canvas) return;
      const canvasBox = canvas.getBoundingClientRect();
      setGeometry({
        width: canvasBox.width,
        height: canvasBox.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    };
    const scheduleSync = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(sync);
    };
    scheduleSync();
    const observer = new ResizeObserver(scheduleSync);
    if (imageRef.current) observer.observe(imageRef.current);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener("resize", scheduleSync);
    window.visualViewport?.addEventListener("resize", scheduleSync);
    window.visualViewport?.addEventListener("scroll", scheduleSync);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.visualViewport?.removeEventListener("resize", scheduleSync);
      window.visualViewport?.removeEventListener("scroll", scheduleSync);
    };
  }, [imageRef, canvasRef, annotations]);

  const placed = useMemo(() => {
    if (!geometry) return { labels: [], points: [] };
    const scale = geometry.width / geometry.naturalWidth;
    const edgeMargin = 8 / scale;
    const inFrame = annotations.filter(
      (item) =>
        item.pixelx >= edgeMargin &&
        item.pixelx <= geometry.naturalWidth - edgeMargin &&
        item.pixely >= edgeMargin &&
        item.pixely <= geometry.naturalHeight - edgeMargin,
    );
    const wanted = new Set(
      [...(target.objects || []), ...(target.localizedAliases || [])].map(
        catalogueKey,
      ),
    );
    const objects = uniqueByLabel(
      inFrame.filter((item) => item.type === "ngc"),
      (item) => item.name || item.names?.[0],
      (left, right) => (right.radius || 0) - (left.radius || 0),
    );
    const primary = objects.find((item) =>
      item.names?.some((name) => wanted.has(catalogueKey(name))),
    );
    const secondaryObjects = objects
      .filter(
        (item) =>
          item !== primary &&
          (!primary || distance(item, primary) >= 125 / scale),
      )
      .sort((left, right) => (right.radius || 0) - (left.radius || 0))
      .slice(0, 2);
    const shownStars = inFrame
      .filter((item) => item.type === "bright" && item.vmag <= magnitude)
      .filter((item) => !primary || distance(item, primary) >= 100 / scale);
    // The stars with a label (their name or catalogue number) are written
    // brightest first; the others are points. A star whose label repeats one
    // already written, or would touch one, is a point as well: it stays on
    // the image.
    const points = new Set(shownStars.filter((item) => !item.names?.[0]));
    const seen = new Set();
    const stars = [];
    for (const item of shownStars
      .filter((star) => star.names?.[0])
      .sort((left, right) => left.vmag - right.vmag)) {
      const key = catalogueKey(formatStarLabel(item.name || item.names[0]));
      if (!key || seen.has(key)) points.add(item);
      else {
        seen.add(key);
        stars.push(item);
      }
    }
    const candidates = [
      ...(primary ? [{ ...primary, primary: true }] : []),
      ...secondaryObjects,
      ...stars,
    ];
    const offsets = [
      [30, -24],
      [30, 24],
      [-30, -24],
      [-30, 24],
      [42, 0],
      [-42, 0],
      [0, -38],
      [0, 38],
    ];
    const labels = [];
    for (const item of candidates) {
      const label = item.primary
        ? target.objects?.[0] || target.title || item.names?.[0]
        : item.type === "bright"
          ? formatStarLabel(item.name || item.names?.[0])
          : item.name || item.names?.[0] || message(locale, "object");
      if (!label) continue;
      const font = item.primary ? 16 : 12;
      const width = Math.max(
        72 / scale,
        (Array.from(label).length * font * 0.72 + 18) / scale,
      );
      const height = (font + 10) / scale,
        padding = 5 / scale;
      const placement = offsets
        .map(([ox, oy]) => {
          const dx = ox / scale,
            dy = oy / scale;
          return {
            x: dx < 0 ? item.pixelx + dx - width : item.pixelx + dx,
            y: item.pixely + dy - height / 2,
            width,
            height,
          };
        })
        .find(
          (box) =>
            box.x >= padding &&
            box.y >= padding &&
            box.x + box.width <= geometry.naturalWidth - padding &&
            box.y + box.height <= geometry.naturalHeight - padding &&
            !labels.some((placedLabel) =>
              overlaps(box, placedLabel, 8 / scale),
            ),
        );
      if (placement) labels.push({ ...item, label, ...placement });
      else if (item.type === "bright") points.add(item);
    }
    return { labels, points: [...points] };
  }, [annotations, target, magnitude, geometry, locale]);

  if (!geometry) return null;
  const scale = geometry.width / geometry.naturalWidth;
  return (
    <svg
      className="plate-annotations"
      aria-hidden="true"
      viewBox={`0 0 ${geometry.naturalWidth} ${geometry.naturalHeight}`}
      style={{
        "--annotation-stroke": `${2 * Math.min(1.15, Math.max(0.55, geometry.width / 614))}px`,
        "--annotation-text-size": `${12 / scale}px`,
        "--annotation-primary-text-size": `${16 / scale}px`,
      }}
    >
      {placed.points.map((item) => (
        <circle
          className="annotation-star annotation-point"
          key={`point-${item.pixelx}-${item.pixely}`}
          cx={item.pixelx}
          cy={item.pixely}
          r={4 / scale}
        />
      ))}
      {placed.labels.map((item) => {
        const lineX = item.x > item.pixelx ? item.x : item.x + item.width;
        const markerRadius =
          (item.primary ? 13 : item.type === "ngc" ? 8 : 3) / scale;
        return (
          <g
            className={`annotation-${item.primary ? "primary" : "secondary"}`}
            key={`${item.label}-${item.pixelx}-${item.pixely}`}
          >
            <circle
              className={
                item.type === "bright" ? "annotation-star" : "annotation-ring"
              }
              cx={item.pixelx}
              cy={item.pixely}
              r={markerRadius}
            />
            <path
              className="annotation-line"
              d={`M ${item.pixelx} ${item.pixely} L ${lineX} ${item.y + item.height / 2}`}
            />
            <rect
              className="annotation-label"
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              rx="3"
            />
            <text x={item.x + 7 / scale} y={item.y + item.height * 0.7}>
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
