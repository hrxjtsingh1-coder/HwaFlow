/**
 * Panel intake — full resolution, no recompression.
 *
 * The old version shrank every upload to WebP at 1600 px / 400 KB so ten of
 * them would fit in a Gemini request body. HwaFlow no longer runs a site-side
 * Gemini pipeline: XianScan does all translation. So there is no batch body to
 * fit and no reason to throw away pixels. A PNG goes in byte-for-byte as it was
 * drawn; JPEG/WebP inputs are decoded and re-encoded losslessly to PNG at their
 * ORIGINAL dimensions (no downscale, no quality knob).
 *
 * Nothing here resizes. The only rejection is a real platform guard: one page
 * over 10 MiB, or a canvas the browser cannot allocate. Both produce a clear
 * message instead of a silent degradation.
 */

import { MAX_PAGE_BYTES, MAX_PAGE_PIXELS, PAGE_MIME_TYPE } from "./engine-limits";

export const MAX_PANEL_SOURCE_BYTES = MAX_PAGE_BYTES;
export const MAX_PANEL_BYTES = MAX_PAGE_BYTES;
/** Hard browser canvas guard. Not a resize target — we never scale down. */
export const MAX_PANEL_EDGE = 30_000;

export type PreparedPanel = {
  blob: Blob;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  /** Path extension that matches the bytes, not the declared content type. */
  extension: "png" | "jpg" | "webp";
};

/** Kept as an alias so callers written against the old name still compile. */
export type CompressedPanel = PreparedPanel;

export class PanelImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanelImageError";
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type Size = { width: number; height: number };

/**
 * Formats we accept as *input*. Everything in this list is decoded by the
 * browser and re-encoded losslessly to PNG, so the engine only ever sees PNG
 * and nobody has to convert a page by hand first.
 */
const ACCEPTED_SOURCE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/tiff",
]);

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function normaliseType(file: File): string {
  const declared = (file.type || "").toLowerCase();
  if (ACCEPTED_SOURCE_TYPES.has(declared)) return declared === "image/jpg" ? "image/jpeg" : declared;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext];
  return declared;
}

/** PNG IHDR holds the exact dimensions in the first 24 bytes — no decode. */
async function pngSize(file: File): Promise<Size | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (head.length < 24) return null;
    if (!PNG_MAGIC.every((byte, index) => head[index] === byte)) return null;
    const view = new DataView(head.buffer);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0 && height > 0) return { width, height };
  } catch {
    // Fall through to a full decode.
  }
  return null;
}

async function decodeSize(file: File): Promise<{ size: Size; bitmap: ImageBitmap | HTMLImageElement }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { size: { width: bitmap.width, height: bitmap.height }, bitmap };
    } catch {
      // Safari sometimes rejects formats createImageBitmap claims to support.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ size: { width: image.naturalWidth, height: image.naturalHeight }, bitmap: image });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PanelImageError("We couldn't read that image. Try a PNG, JPG, or WebP file."));
    };
    image.src = url;
  });
}

function assertDrawable({ width, height }: Size): void {
  if (width > MAX_PANEL_EDGE || height > MAX_PANEL_EDGE) {
    throw new PanelImageError(
      `That page is ${width} × ${height} px — too tall for a browser canvas. Split it into shorter pages.`
    );
  }
  if (width * height > MAX_PAGE_PIXELS) {
    throw new PanelImageError(
      "That page has too many pixels for the browser to keep at full resolution. Split it into shorter pages."
    );
  }
}

/**
 * Encode straight to PNG bytes through the canvas' own buffer.
 *
 * `canvas.toBlob(..., "image/png")` is the usual route, but it re-snapshots the
 * canvas asynchronously and on some browsers/sizes resolves with `null` — which
 * used to surface as "this browser couldn't write a PNG". `toDataURL` is
 * synchronous and far more widely supported for very tall pages, so try it
 * first and keep `toBlob` as the fallback.
 */
function toPng(source: CanvasImageSource, size: Size): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PanelImageError("This browser can't process images right now.");
  context.drawImage(source, 0, 0, size.width, size.height);

  try {
    const dataUrl = canvas.toDataURL(PAGE_MIME_TYPE);
    const comma = dataUrl.indexOf(",");
    if (comma > 0 && dataUrl.startsWith("data:image/png")) {
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return Promise.resolve(new Blob([bytes], { type: PAGE_MIME_TYPE }));
    }
  } catch {
    // Very large canvases can refuse toDataURL; fall through to toBlob.
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new PanelImageError(
                "This browser couldn't write a PNG for that page. Try a smaller page or a different browser."
              )
            ),
      PAGE_MIME_TYPE
    );
  });
}

/**
 * Full-resolution, lossless intake. PNGs are passed through untouched; other
 * formats become PNG at their original pixel size.
 */
export async function preparePanel(file: File): Promise<PreparedPanel> {
  const type = normaliseType(file);
  if (!ACCEPTED_SOURCE_TYPES.has(type)) {
    throw new PanelImageError(
      "That file isn't an image HwaFlow can read. Use PNG, JPG, WebP, AVIF, BMP, GIF, or TIFF — anything else is converted to a lossless PNG for you."
    );
  }
  if (file.size > MAX_PANEL_SOURCE_BYTES) {
    throw new PanelImageError(
      `That page is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${Math.round(
        MAX_PANEL_SOURCE_BYTES / (1024 * 1024)
      )} MB per page.`
    );
  }

  if (type === "image/png") {
    const size = (await pngSize(file)) ?? null;
    // A PNG with an unreadable header is still handed to the decoder so we can
    // report a real error instead of storing a broken object.
    if (size) {
      assertDrawable(size);
      return {
        blob: file,
        width: size.width,
        height: size.height,
        byteSize: file.size,
        mimeType: PAGE_MIME_TYPE,
        extension: "png",
      };
    }
  }

  const { size, bitmap } = await decodeSize(file);
  try {
    assertDrawable(size);
    const blob = await toPng(bitmap, size);
    if (blob.size > MAX_PANEL_BYTES) {
      throw new PanelImageError(
        `At full resolution that page becomes ${(blob.size / (1024 * 1024)).toFixed(
          1
        )} MB as a lossless PNG (from ${(file.size / (1024 * 1024)).toFixed(
          1
        )} MB ${type.replace("image/", "").toUpperCase()}). The limit is ${Math.round(
          MAX_PANEL_BYTES / (1024 * 1024)
        )} MB per page — split the strip into two shorter pages.`
      );
    }
    return {
      blob,
      width: size.width,
      height: size.height,
      byteSize: blob.size,
      mimeType: PAGE_MIME_TYPE,
      extension: "png",
    };
  } finally {
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) bitmap.close();
  }
}

/** @deprecated Use `preparePanel` — nothing is compressed any more. */
export const compressPanel = preparePanel;

/** @deprecated Intake never scales; kept for callers that only need a size. */
export function panelTargetSize(width: number, height: number): Size {
  return { width, height };
}
