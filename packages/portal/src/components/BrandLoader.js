"use client";

import { useId } from "react";
import {
  BRAND_GEOMETRY,
  brandLoaderCss,
  brandLoaderParts,
} from "portal/brand-mark.js";

// The loading indicator of the portal: the ring of the icon with the star inside it. At each step the
// star turns a quarter turn and swells past the ring, which opens where a
// long branch crosses it, then comes back to rest. Still, at rest and tilted,
// when the person asks for reduced motion. It takes the colour of the text
// (`currentColor`): the gold of the accent where its parent says so, red
// under the night filter like the rest of the page. The figure never leaves
// its box: at the peak (the icon) the tip of a long branch is at 78 of the
// 80 units of a half side.

const G = BRAND_GEOMETRY;
const css = brandLoaderCss();
const LONG = [0, 90, 180, 270];

export function BrandLoader({ className, size = 22 }) {
  const mask = `brand-loader-cut-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="-80 -80 160 160"
      fill="currentColor"
      aria-hidden="true"
      data-brand-loader=""
    >
      <style>{css}</style>
      <mask
        id={mask}
        maskUnits="userSpaceOnUse"
        x="-80"
        y="-80"
        width="160"
        height="160"
      >
        <rect x="-80" y="-80" width="160" height="160" fill="#fff" />
        <g
          className="brand-loader-pose"
          fill="#000"
          stroke="#000"
          strokeWidth={G.cut * 2}
          strokeLinejoin="round"
        >
          {LONG.map((angle) => (
            <path
              key={angle}
              d={brandLoaderParts.long}
              transform={`rotate(${angle})`}
            />
          ))}
        </g>
      </mask>
      <circle
        r={G.ringRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={G.ringStroke}
        mask={`url(#${mask})`}
      />
      <g className="brand-loader-pose">
        {Array.from({ length: 8 }, (_, index) => (
          <path
            key={index}
            d={index % 2 === 0 ? brandLoaderParts.long : brandLoaderParts.short}
            transform={`rotate(${index * 45})`}
          />
        ))}
        <circle r={G.core} />
      </g>
    </svg>
  );
}
