/**
 * Compress an image File to JPEG before upload.
 * - Skips non-image files (PDF, etc.) — returns the original.
 * - Skips files already under maxSizeMB — no quality loss for small images.
 * - Uses createImageBitmap + canvas: no external library dependency.
 */
export async function compressImage(file: File, maxSizeMB = 1): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const limitBytes = maxSizeMB * 1024 * 1024;
  if (file.size <= limitBytes) return file;

  const img = await createImageBitmap(file);
  const scale = Math.min(1, Math.sqrt(limitBytes / file.size));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(img.width  * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Canvas compression failed')); return; }
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.82);
  });
}
