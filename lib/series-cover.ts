/**
 * Series cover pipeline.
 *
 * Covers are compressed in the browser and stored as data URLs inside the
 * series store. That is deliberately the only coupling point: consumers read
 * `series.coverDataUrl` and never care where it came from.
 *
 * Swap point: replace the body of `uploadSeriesCover` with a Supabase Storage
 * upload to the `covers` bucket and return the public URL. Nothing else in the
 * app needs to change.
 */

export const MAX_SERIES_COVER_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_SERIES_COVER_BYTES = 120 * 1024;

const COVER_WIDTH = 480;
const COVER_HEIGHT = 720;

export class SeriesCoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeriesCoverError";
  }
}

/** Approximate decoded size of a data URL's base64 payload. */
export function seriesCoverByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const payload = dataUrl.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
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
        new SeriesCoverError(
          "We couldn't read that image. Try a PNG, JPG, or WebP file."
        )
      );
    };
    image.src = url;
  });
}

function drawCover(
  drawable: DrawableSource,
  canvas: HTMLCanvasElement
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new SeriesCoverError(
      "This browser can't process images right now."
    );
  }

  const scale = Math.max(
    COVER_WIDTH / drawable.width,
    COVER_HEIGHT / drawable.height
  );
  const width = drawable.width * scale;
  const height = drawable.height * scale;

  context.clearRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    drawable.source,
    (COVER_WIDTH - width) / 2,
    (COVER_HEIGHT - height) / 2,
    width,
    height
  );
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  // Browsers without WebP encoding fall back to PNG; the cap check catches
  // anything too large for localStorage.
  return canvas.toDataURL("image/png");
}

export async function uploadSeriesCover(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new SeriesCoverError("Pick an image file — PNG, JPG, or WebP.");
  }
  if (file.size > MAX_SERIES_COVER_SOURCE_BYTES) {
    throw new SeriesCoverError("That image is over 5 MB. Pick a smaller file.");
  }

  const drawable = await loadDrawable(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = COVER_WIDTH;
    canvas.height = COVER_HEIGHT;
    drawCover(drawable, canvas);

    let dataUrl = encode(canvas, 0.82);
    if (seriesCoverByteSize(dataUrl) > MAX_SERIES_COVER_BYTES) {
      dataUrl = encode(canvas, 0.65);
    }
    if (seriesCoverByteSize(dataUrl) > MAX_SERIES_COVER_BYTES) {
      throw new SeriesCoverError(
        "That cover is still over 120 KB after compression. Try a simpler image."
      );
    }

    return dataUrl;
  } finally {
    drawable.release();
  }
}
