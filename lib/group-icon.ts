/**
 * Group icon pipeline.
 *
 * Icons are compressed in the browser and stored as data URLs inside the
 * groups store. That is deliberately the only coupling point: consumers read
 * `group.iconDataUrl` and never care where it came from.
 *
 * Swap point: replace the body of `uploadGroupIcon` with a Supabase Storage
 * upload to the `group-icons` bucket and return the public URL. Nothing else
 * in the app needs to change.
 */

export const MAX_GROUP_ICON_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_GROUP_ICON_BYTES = 100 * 1024;

const ICON_SIZE = 256;

export class GroupIconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupIconError";
  }
}

/** Approximate decoded size of a data URL's base64 payload. */
export function groupIconByteSize(dataUrl: string): number {
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
        new GroupIconError(
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
    throw new GroupIconError("This browser can't process images right now.");
  }

  const scale = Math.max(
    ICON_SIZE / drawable.width,
    ICON_SIZE / drawable.height
  );
  const width = drawable.width * scale;
  const height = drawable.height * scale;

  context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    drawable.source,
    (ICON_SIZE - width) / 2,
    (ICON_SIZE - height) / 2,
    width,
    height
  );
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  // Browsers without WebP encoding fall back to PNG, still under the cap for
  // a 256×256 icon in practice.
  return canvas.toDataURL("image/png");
}

export async function uploadGroupIcon(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new GroupIconError("Pick an image file — PNG, JPG, or WebP.");
  }
  if (file.size > MAX_GROUP_ICON_SOURCE_BYTES) {
    throw new GroupIconError("That image is over 5 MB. Pick a smaller file.");
  }

  const drawable = await loadDrawable(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    drawCover(drawable, canvas);

    let dataUrl = encode(canvas, 0.85);
    if (groupIconByteSize(dataUrl) > MAX_GROUP_ICON_BYTES) {
      dataUrl = encode(canvas, 0.7);
    }
    if (groupIconByteSize(dataUrl) > MAX_GROUP_ICON_BYTES) {
      throw new GroupIconError(
        "That icon is still over 100 KB after compression. Try a simpler image."
      );
    }

    return dataUrl;
  } finally {
    drawable.release();
  }
}
