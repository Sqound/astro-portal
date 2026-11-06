// The public gallery of a running service, read as any visitor reads it:
// every page of `GET /api/v1/gallery`, each capture's
// `GET /api/v1/gallery/{id}`, and both files it serves (the image and its
// thumbnail). No credential, no write. Each answer goes through the rules of
// `public-checks.mjs`; the findings say which capture, where and which rule.

import { galleryJsonFindings, imageFindings } from "./public-checks.mjs";

const PAGE = 48;

export async function checkPublicGallery({
  base,
  fetchImpl = fetch,
  forbid = [],
  points = [],
  signature = null,
  log = () => {},
}) {
  const findings = [];
  const add = (where, list) =>
    findings.push(...list.map((finding) => ({ where, ...finding })));
  const get = async (path, kind) => {
    const response = await fetchImpl(`${base}${path}`, {
      headers: { accept: kind === "json" ? "application/json" : "*/*" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `GET ${path.replace(/\?.*$/, "")} answered ${response.status}.`,
      );
    return kind === "json"
      ? response.json()
      : Buffer.from(await response.arrayBuffer());
  };

  const items = [];
  let variantCount = 0;
  let solutionCount = 0;
  for (let offset = 0, page = 0; offset !== null && page < 200; page += 1) {
    const list = await get(
      `/api/v1/gallery?limit=${PAGE}&offset=${offset}`,
      "json",
    );
    add(
      `page ${page + 1}`,
      galleryJsonFindings(list, { forbid, points, signature }),
    );
    items.push(...(list.captures || []));
    offset = Number.isInteger(list.nextOffset) ? list.nextOffset : null;
  }
  log(`${items.length} public capture(s)`);
  for (const [index, item] of items.entries()) {
    const where = `capture ${index + 1} (${item.id})`;
    const detail = await get(
      `/api/v1/gallery/${encodeURIComponent(item.id)}`,
      "json",
    );
    add(where, galleryJsonFindings(detail, { forbid, points, signature }));
    // The files the capture serves: its own, then each public variant's
    // (`variants[].media`), and the annotations drawn from a sky solution
    // (`skySolution.annotations`), image by image.
    const files = [
      ["image", detail?.media?.image],
      ["thumbnail", detail?.media?.thumbnail],
      ...(Array.isArray(detail?.variants) ? detail.variants : []).flatMap(
        (variant, at) => [
          [`variant ${at + 1} image`, variant?.media?.image],
          [`variant ${at + 1} thumbnail`, variant?.media?.thumbnail],
        ],
      ),
    ];
    variantCount += Array.isArray(detail?.variants)
      ? detail.variants.length
      : 0;
    const solutions = [
      ["annotations", detail?.skySolution?.annotations],
      ...(Array.isArray(detail?.variants) ? detail.variants : []).map(
        (variant, at) => [
          `variant ${at + 1} annotations`,
          variant?.skySolution?.annotations,
        ],
      ),
    ];
    for (const [name, path] of solutions) {
      if (path === undefined) continue;
      solutionCount += 1;
      if (typeof path !== "string" || !path.startsWith("/api/v1/gallery/")) {
        add(where, [{ path: name, rule: "media-not-the-gallery's" }]);
        continue;
      }
      add(
        `${where} ${name}`,
        galleryJsonFindings(await get(path, "json"), {
          forbid,
          points,
          signature,
        }),
      );
    }
    for (const [name, path] of files) {
      if (typeof path !== "string" || !path.startsWith("/api/v1/gallery/")) {
        add(where, [
          { path: `media.${name}`, rule: "media-not-the-gallery's" },
        ]);
        continue;
      }
      add(`${where} ${name}`, imageFindings(await get(path, "bytes")));
    }
  }
  return {
    captures: items.length,
    variants: variantCount,
    solutions: solutionCount,
    findings,
  };
}
