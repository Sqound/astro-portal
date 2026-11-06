import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_FILE_SECURITY_HEADERS,
  activeDocumentKindOf,
  attachmentDisposition,
  rasterImageTypeOf,
  userFileHeaders,
} from "../dist/uploads/media-type.js";

const bytes = (...parts) =>
  Buffer.concat(
    parts.map((part) =>
      typeof part === "string"
        ? Buffer.from(part, "latin1")
        : Buffer.from(part),
    ),
  );

test("raster images are recognised by their signature only", () => {
  assert.equal(
    rasterImageTypeOf(bytes([0xff, 0xd8, 0xff, 0xdb])),
    "image/jpeg",
  );
  assert.equal(
    rasterImageTypeOf(bytes([0x89], "PNG\r\n", [0x1a, 0x0a], "rest")),
    "image/png",
  );
  assert.equal(
    rasterImageTypeOf(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")),
    "image/webp",
  );
  assert.equal(
    rasterImageTypeOf(
      bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0], "mif1miaf"),
    ),
    "image/avif",
  );
  assert.equal(
    rasterImageTypeOf(bytes([0, 0, 0, 0x18], "ftypmif1", [0, 0, 0, 0], "avif")),
    "image/avif",
  );
  // HEIC shares the container, not the format.
  assert.equal(
    rasterImageTypeOf(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1")),
    null,
  );
  assert.equal(rasterImageTypeOf(bytes("II*", [0])), "image/tiff");
  assert.equal(rasterImageTypeOf(bytes("MM", [0], "*")), "image/tiff");
  assert.equal(rasterImageTypeOf(bytes("II+", [0])), "image/tiff");
  // Not shown by the portal: served as files.
  assert.equal(rasterImageTypeOf(bytes("GIF89a")), null);
  assert.equal(rasterImageTypeOf(bytes("SIMPLE  =    T")), null);
  assert.equal(rasterImageTypeOf(bytes("XISF0100")), null);
  assert.equal(rasterImageTypeOf(bytes("<svg")), null);
  assert.equal(rasterImageTypeOf(Buffer.alloc(0)), null);
});

test("SVG and HTML documents are active, whatever their encoding; plain XML is not", () => {
  assert.equal(activeDocumentKindOf(bytes('<svg xmlns="x">')), "svg");
  assert.equal(
    activeDocumentKindOf(
      bytes('<?xml version="1.0"?>\n<!DOCTYPE svg><svg width="1"/>'),
    ),
    "svg",
  );
  assert.equal(activeDocumentKindOf(bytes(" \n\t<!doctype HTML><p>")), "html");
  assert.equal(activeDocumentKindOf(bytes("<html><body>")), "html");
  assert.equal(
    activeDocumentKindOf(bytes("<script>alert(1)</script>")),
    "html",
  );
  assert.equal(
    activeDocumentKindOf(
      bytes(
        '<?xml version="1.0"?><x:script xmlns:x="http://www.w3.org/1999/xhtml">1</x:script>',
      ),
    ),
    "html",
  );
  assert.equal(activeDocumentKindOf(bytes([0xef, 0xbb, 0xbf], "<svg>")), "svg");
  assert.equal(
    activeDocumentKindOf(
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("<svg>", "utf16le"),
      ]),
    ),
    "svg",
  );
  const utf16be = Buffer.from("<html>", "utf16le").swap16();
  assert.equal(
    activeDocumentKindOf(Buffer.concat([Buffer.from([0xfe, 0xff]), utf16be])),
    "html",
  );
  // Files an astrophotographer sends are not documents a browser runs.
  assert.equal(
    activeDocumentKindOf(
      bytes('<?xml version="1.0"?><sequence><t/></sequence>'),
    ),
    null,
  );
  assert.equal(
    activeDocumentKindOf(bytes("XISF0100<xisf version='1.0'>")),
    null,
  );
  assert.equal(activeDocumentKindOf(bytes("SIMPLE  = T <svg")), null);
  assert.equal(activeDocumentKindOf(bytes("Date,Temperature\n1,<html>")), null);
  assert.equal(activeDocumentKindOf(bytes([0xff, 0xd8, 0xff], "<svg>")), null);
});

test("a served file is an image only by its bytes, and always sandboxed", () => {
  const image = userFileHeaders({
    head: bytes([0xff, 0xd8, 0xff]),
    fileName: "page.html",
  });
  assert.equal(image["Content-Type"], "image/jpeg");
  assert.equal(image["Content-Disposition"], undefined);
  const other = userFileHeaders({
    head: bytes("<svg>"),
    fileName: "photo.png",
  });
  assert.equal(other["Content-Type"], "application/octet-stream");
  assert.match(
    other["Content-Disposition"],
    /^attachment; filename="photo\.png"/,
  );
  // An image is kept by the viewer's browser only; a download never.
  assert.equal(image["Cache-Control"], "private, max-age=3600");
  assert.equal(other["Cache-Control"], "private, no-store");
  for (const headers of [image, other]) {
    for (const [name, value] of Object.entries(USER_FILE_SECURITY_HEADERS))
      assert.equal(headers[name], value);
  }
});

test("an attachment's name never breaks its header nor hides its extension", () => {
  const value = attachmentDisposition('evil";\r\nSet-Cookie: a=b‮gnp.exe');
  assert.doesNotMatch(value, /[\r\n]/);
  assert.doesNotMatch(value, /‮/);
  assert.match(value, /^attachment; filename="[^"]*"; filename\*=UTF-8''/);
  assert.equal(
    attachmentDisposition("../../etc/passwd"),
    `attachment; filename="passwd"; filename*=UTF-8''passwd`,
  );
  assert.match(
    attachmentDisposition("星雲.fits"),
    /filename\*=UTF-8''%E6%98%9F/,
  );
  assert.match(attachmentDisposition(""), /filename="file"/);
});
