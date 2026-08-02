import { Project } from '../types';

/**
 * Resolves the image to display as a project's cover. Falls back to the
 * auto-generated thumbnail, then the original image, so every project always
 * has a cover even before the user picks a custom one.
 */
export function getProjectCover(project: Project): string {
  return project.coverDataUrl || project.thumbnailDataUrl || project.imageDataUrl;
}

/**
 * Downscales and re-encodes a user-selected cover image so it stays small in
 * IndexedDB while remaining crisp on project cards.
 */
export async function processCoverImage(dataUrl: string, maxDim = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        const r = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const result = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = 0;
      canvas.height = 0;
      resolve(result);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
