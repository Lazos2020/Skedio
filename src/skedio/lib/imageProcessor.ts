import { ImageAdjustments } from '../types';

/**
 * Maximum safe image dimension (longest side, in pixels) for canvas
 * operations on Android. Many WebView/Skia implementations guarantee
 * reliable 2D canvas support up to roughly this size — some devices support
 * much more, but low-end or older WebViews can fail to allocate a canvas (or
 * silently produce a blank/garbled result) well beyond it. Capping imports
 * at this size trades a small amount of resolution on genuinely enormous
 * source photos (e.g. 8K+ camera images) for guaranteed safety against
 * canvas allocation failures and excessive memory pressure.
 */
export const MAX_SAFE_IMAGE_DIMENSION = 4096;

/** Loads a data URL into an HTMLImageElement, resolving `null` instead of
 * throwing if the image is corrupted or unsupported. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Reads just the natural pixel dimensions of a data URL without keeping the
 * decoded image around. Returns null if the image can't be decoded. */
export async function probeImageDimensions(
  src: string
): Promise<{ width: number; height: number } | null> {
  const img = await loadImage(src);
  if (!img) return null;
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}

export interface DimensionCapResult {
  dataUrl: string;
  width: number;
  height: number;
  /** False when the source already fit within maxDim — dataUrl is untouched. */
  wasResized: boolean;
}

/**
 * Re-encodes an image through a canvas so neither side exceeds `maxDim`.
 * If the image already fits, resolves with the original data URL untouched
 * (no unnecessary recompression). Returns null if the image can't be decoded
 * or the canvas 2D context can't be created.
 */
export async function ensureWithinDimensions(
  src: string,
  maxDim: number,
  mimeType = 'image/jpeg',
  quality = 0.9
): Promise<DimensionCapResult | null> {
  const img = await loadImage(src);
  if (!img) return null;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (width <= maxDim && height <= maxDim) {
    return { dataUrl: src, width, height, wasResized: false };
  }
  const ratio = Math.min(maxDim / width, maxDim / height);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL(mimeType, quality);
  // Release canvas backing memory eagerly rather than waiting for GC —
  // meaningful on Android where large canvases hold onto GPU/CPU memory.
  canvas.width = 0;
  canvas.height = 0;
  return { dataUrl, width: w, height: h, wasResized: true };
}

/**
 * Processes an HTMLImageElement through a canvas and applies:
 * Brightness (-100 to +100), Contrast (-100 to +100), and Sobel Edge Detection (0 to 100).
 * Returns a data URL of the processed image.
 */
export function applyImageFilters(
  img: HTMLImageElement,
  adjustments: ImageAdjustments,
  maxDimension = 2048
): string {
  const canvas = document.createElement('canvas');
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  // Scale down high-resolution images for fast real-time preview if needed
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);

  // If no filters are applied besides opacity (which is applied via CSS or globalAlpha), return canvas
  if (adjustments.brightness === 0 && adjustments.contrast === 0 && adjustments.edgeDetection === 0) {
    const result = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return result;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const len = data.length;

  // 1. Precalculate Brightness & Contrast LUT (Look-Up Table) for speed
  const brightness = adjustments.brightness; // -100 to 100
  const contrastFactor =
    adjustments.contrast !== 0
      ? (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast))
      : 1;

  if (brightness !== 0 || adjustments.contrast !== 0) {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let val = i;
      // Contrast
      if (adjustments.contrast !== 0) {
        val = contrastFactor * (val - 128) + 128;
      }
      // Brightness
      val += brightness;
      lut[i] = Math.min(255, Math.max(0, val));
    }

    for (let i = 0; i < len; i += 4) {
      data[i] = lut[data[i]]; // R
      data[i + 1] = lut[data[i + 1]]; // G
      data[i + 2] = lut[data[i + 2]]; // B
    }
  }

  // 2. Adaptive Sobel Edge Detection if edgeDetection > 0
  if (adjustments.edgeDetection > 0) {
    const strength = adjustments.edgeDetection / 100; // 0 to 1
    const gray = new Uint8Array(width * height);

    // Convert to grayscale and calculate adaptive mean brightness
    let totalBrightness = 0;
    for (let i = 0, j = 0; i < len; i += 4, j++) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[j] = g;
      totalBrightness += g;
    }
    const avgBrightness = totalBrightness / (width * height || 1);

    // Adaptive noise suppression kernel (3x3 Box blur pass on grayscale before Sobel)
    const smoothGray = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        smoothGray[idx] = Math.round(
          (gray[idx - width - 1] + gray[idx - width] + gray[idx - width + 1] +
           gray[idx - 1] + gray[idx] * 2 + gray[idx + 1] +
           gray[idx + width - 1] + gray[idx + width] + gray[idx + width + 1]) / 10
        );
      }
    }

    // Seed with the source pixels (not just alpha) so any pixel the Sobel
    // pass below doesn't touch — i.e. the outermost 1px border, which the
    // interior-only loop (y/x = 1..dim-2) never visits — falls back to the
    // original image instead of being left at zero (solid black).
    const outputData = new Uint8ClampedArray(data);

    // Sobel kernels with adaptive gain based on image type
    // If average brightness is very dark or very light, we boost edge sensitivity factor
    const gain = avgBrightness < 80 || avgBrightness > 200 ? 1.35 : 1.1;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = rowOffset + x;

        const tl = smoothGray[idx - width - 1];
        const tc = smoothGray[idx - width];
        const tr = smoothGray[idx - width + 1];
        const ml = smoothGray[idx - 1];
        const mr = smoothGray[idx + 1];
        const bl = smoothGray[idx + width - 1];
        const bc = smoothGray[idx + width];
        const br = smoothGray[idx + width + 1];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

        const mag = Math.min(255, Math.hypot(gx, gy) * gain);

        // Crisp white tracing paper background with dark outline lines
        const edgeLine = 255 - mag;

        const pixIdx = idx * 4;
        const blended = Math.round(data[pixIdx] * (1 - strength) + edgeLine * strength);
        outputData[pixIdx] = blended;
        outputData[pixIdx + 1] = blended;
        outputData[pixIdx + 2] = blended;
      }
    }

    // Write back to imageData
    for (let i = 0; i < len; i++) {
      data[i] = outputData[i];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const result = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

/**
 * Generates a 200x200 thumbnail of a project image with filters
 */
export async function generateThumbnail(imgSrc: string, adjustments: ImageAdjustments): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const filteredUrl = applyImageFilters(img, adjustments, 200);
      resolve(filteredUrl);
    };
    img.onerror = () => resolve(imgSrc);
    img.src = imgSrc;
  });
}
