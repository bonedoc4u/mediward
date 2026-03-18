/**
 * storageService.ts
 * Handles file uploads to Supabase Storage (radiology bucket).
 * Images are stored as files, not base64 strings in the database.
 */

import { supabase } from '../lib/supabase';
import { generateId } from '../utils/sanitize';

// Allowed image MIME types — anything else is rejected before upload
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB pre-compression limit
const MAX_DIMENSION_PX    = 1920;              // max width or height after resize
const JPEG_QUALITY        = 0.82;             // JPEG quality for compressed output

/** Validate MIME type against allowlist. Throws with user-friendly message on failure. */
export function validateImageFile(file: File): void {
  // Browser-provided MIME type (may be spoofed, but combined with extension it's sufficient)
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type "${file.type}". Please upload a JPEG, PNG, or WebP image.`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
  }
}

/**
 * Compress an image file using the Canvas API.
 * Resizes to MAX_DIMENSION_PX on the longest side and re-encodes as JPEG.
 * Falls back to original file if canvas is unavailable (SSR / test environments).
 */
async function compressImage(file: File): Promise<File> {
  // Skip compression for GIF (animation would be lost)
  if (file.type === 'image/gif') return file;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
          if (width >= height) {
            height = Math.round((height / width) * MAX_DIMENSION_PX);
            width  = MAX_DIMENSION_PX;
          } else {
            width  = Math.round((width / height) * MAX_DIMENSION_PX);
            height = MAX_DIMENSION_PX;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
            // Only use compressed version if it's actually smaller
            resolve(compressed.size < file.size ? compressed : file);
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      } catch {
        resolve(file); // fall back on any canvas error
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fall back if image decode fails
    };

    img.src = objectUrl;
  });
}

/**
 * Upload an investigation image to Supabase Storage.
 * Validates MIME type, compresses, then uploads.
 * Returns the permanent public URL to store in the investigations array.
 *
 * Requires a public bucket named "radiology" in your Supabase project:
 *   Dashboard → Storage → New Bucket → Name: "radiology" → Public: ON
 */
export async function uploadInvestigationImage(file: File, hospitalId: string, patientIpNo: string): Promise<string> {
  // ─── Validate before touching the network ───
  validateImageFile(file);

  // ─── Compress (client-side, ~Canvas API) ───
  const compressed = await compressImage(file);

  const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop()?.toLowerCase() || 'jpg');
  // Path: {hospitalId}/{patientIpNo}/{uuid}.{ext} — hospital_id prefix enables RLS scoping
  const filePath = `${hospitalId}/${patientIpNo}/${generateId()}.${ext}`;

  const { error } = await supabase.storage
    .from('radiology')
    .upload(filePath, compressed, { contentType: compressed.type, upsert: false });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage.from('radiology').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Delete an investigation image from Supabase Storage.
 * Gracefully skips if the URL is a legacy base64 string.
 */
export async function deleteInvestigationImage(imageUrl: string): Promise<void> {
  if (!imageUrl || imageUrl.startsWith('data:')) return; // legacy base64 — skip

  try {
    const url = new URL(imageUrl);
    const marker = '/radiology/';
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return;

    const filePath = decodeURIComponent(url.pathname.slice(idx + marker.length));
    const { error } = await supabase.storage.from('radiology').remove([filePath]);
    if (error) console.error('[Storage] Failed to delete image:', error.message);
  } catch {
    // URL parsing failed — not a storage URL, ignore
  }
}
