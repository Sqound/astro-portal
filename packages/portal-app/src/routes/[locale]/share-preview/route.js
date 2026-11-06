import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { ImageResponse } from "next/og";
import {
  catalog,
  imagesDir,
  mimeTypes,
  safePath,
} from "../../../lib/catalog.server.js";
import { portalConfig } from "../../../lib/config.server.js";

const previewSize = { width: 1200, height: 630 };
const maximumSourceBytes = 25 * 1024 * 1024;
const renderableExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function galleryPreviewImage(locale, applicationDefault) {
  const targets = await catalog({
    canDownload: false,
    locale,
    applicationDefault,
  });
  const asset = targets
    .map((target) => target.featured || target.reference)
    .find((candidate) => {
      const extension = extname(candidate?.png || "").toLowerCase();
      return candidate?.png && renderableExtensions.has(extension);
    });
  if (!asset) return null;

  const path = safePath(imagesDir, asset.png);
  if (!path) return null;
  try {
    const info = await stat(path);
    const extension = extname(path).toLowerCase();
    const contentType = mimeTypes[extension];
    if (
      !info.isFile() ||
      info.size > maximumSourceBytes ||
      !renderableExtensions.has(extension) ||
      !contentType
    )
      return null;
    const content = await readFile(path);
    return `data:${contentType};base64,${content.toString("base64")}`;
  } catch {
    return null;
  }
}

function PreviewCard({ image, productName }) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "#070a08",
        color: "#f4f1ea",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {image ? (
        <img
          alt=""
          src={image}
          style={{
            height: "100%",
            objectFit: "cover",
            opacity: 0.84,
            position: "absolute",
            width: "100%",
          }}
        />
      ) : null}
      <div
        style={{
          alignItems: "center",
          backgroundColor: "rgba(7, 10, 8, 0.88)",
          bottom: 0,
          display: "flex",
          left: 0,
          padding: "34px 52px",
          position: "absolute",
          right: 0,
        }}
      >
        <div
          style={{
            border: "6px solid #d7a24e",
            borderRadius: "50%",
            height: 48,
            marginRight: 24,
            width: 48,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#d7a24e",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.22em",
            }}
          >
            {productName.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginTop: 7,
            }}
          >
            ASTROPHOTOGRAPHY GALLERY
          </div>
        </div>
      </div>
    </div>
  );
}

export async function GET(_request, { params }) {
  const { locale } = await params;
  const configuration = await portalConfig();
  if (!configuration.supportedLocales.includes(locale))
    return new Response("Not found", { status: 404 });
  const image = await galleryPreviewImage(locale, configuration.defaultLocale);
  return new ImageResponse(
    <PreviewCard image={image} productName={configuration.productName} />,
    {
      ...previewSize,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
