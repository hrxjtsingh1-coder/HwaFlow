/**
 * Panel compression.
 *
 * Mirrors `lib/series-cover.ts` in shape, with a different target: a cover is
 * 480×720 at 120 KB, a raw manhwa panel is up to 1600 px on its longest edge at
 * 400 KB. The cap is driven by batching — ten panels ride in one multipart
 * request, so ten × 400 KB ≈ 4 MB, which fits a 4.5 MB function body. Ten panels
 * at 2000 px would be ~10 MB and simply would not send.
 *
 * Resolution is what OCR quality is bought with, so if extraction starts
 * misreading small lettering the fix is `PANEL_BATCH_MAX = 5` **and** 2000 px,
 * never one without the other (see docs/core-functionality.md §5.5).
 *
 * Swap point: replace the body of `compressPanel` with a Supabase Storage upload
 * to a `pages` bucket and return the same shape. Consumers only see blobs.
 */

export const MAX_PANEL_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_PANEL_BYTES = 400 * 1024;
export const MAX_PANEL_EDGE = 1600;

const PRIMARY_QUALITY = 0.75;
const FALLBACK_QUALITY = 0.62;

export type CompressedPanel = {
  blob: Blob;
  width: number;
  height: number;
  byteSize: number;
};

export class PanelImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanelImageError";
  }
}

type DrawableSource = {
  width: number;
  height: number;
  source: CanvasImageSource;
  release: () => void;
};

async function loadDrawable(file: File): Promise<DrawableSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path — some browsers reject certain formats.
    }
  }

  return new Promise<DrawableSource>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
        release: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new PanelImageError(
          "We couldn't read that image. Try a PNG, JPG, or WebP file."
        )
      );
    };
    image.src = url;
  });
}

/** Scales the longest edge down to the cap; never upscales. */
export function panelTargetSize(width: number, height: number): {
  width: number;
  height: number;
} {
  const longest = Math.max(width, height);
  if (longest <= MAX_PANEL_EDGE) return { width, height };
  const scale = MAX_PANEL_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new PanelImageError("This browser can't compress images right now.")
          );
      },
      "image/webp",
      quality
    );
  });
}

export async function compressPanel(file: File): Promise<CompressedPanel> {
  if (!file.type.startsWith("image/")) {
    throw new PanelImageError("That file isn't an image. Pick a PNG, JPG, or WebP.");
  }
  if (file.size > MAX_PANEL_SOURCE_BYTES) {
    throw new PanelImageError("That image is too large. Pick one under 10 MB.");
  }

  const drawable = await loadDrawable(file);

  try {
    const target = panelTargetSize(drawable.width, drawable.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new PanelImageError("This browser can't process images right now.");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      drawable.source,
      0,
      0,
      drawable.width,
      drawable.height,
      0,
      0,
      target.width,
      target.height
    );

    let blob = await toBlob(canvas, PRIMARY_QUALITY);
    if (blob.size > MAX_PANEL_BYTES) {
      blob = await toBlob(canvas, FALLBACK_QUALITY);
    }
    if (blob.size > MAX_PANEL_BYTES) {
      throw new PanelImageError(
        "That panel is still too large after compression."
      );
    }

    return {
      blob,
      width: target.width,
      height: target.height,
      byteSize: blob.size,
    };
  } finally {
    drawable.release();
  }
}
