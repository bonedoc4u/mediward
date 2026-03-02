/**
 * storageService.ts
 * Handles file uploads to Supabase Storage (radiology bucket).
 * Images are stored as files, not base64 strings in the database.
 */

import { supabase } from '../lib/supabase';
import { generateId } from '../utils/sanitize';

/**
 * Upload an investigation image to Supabase Storage.
 * Returns the permanent public URL to store in the investigations array.
 *
 * Requires a public bucket named "radiology" in your Supabase project:
 *   Dashboard → Storage → New Bucket → Name: "radiology" → Public: ON
 */
export async function uploadInvestigationImage(file: File, patientIpNo: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `${patientIpNo}/${generateId()}.${ext}`;

  const { error } = await supabase.storage
    .from('radiology')
    .upload(filePath, file, { contentType: file.type, upsert: false });

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
