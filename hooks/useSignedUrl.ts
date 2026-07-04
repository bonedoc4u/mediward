/**
 * useSignedUrl.ts — resolve a Supabase Storage path (or legacy URL) to a signed
 * URL for display, auto-refreshing 49 min in so the image never goes blank
 * during a long session (signed URLs expire at 60 min; cache expires at 50 min).
 * Shared by RadiologyComparator and the patient-detail Radiology panel.
 */
import { useEffect, useState } from 'react';
import { resolveImageUrl, clearImageUrlCache } from '../services/storageService';

export function useSignedUrl(rawUrl: string | undefined): string | undefined {
  const [signed, setSigned] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!rawUrl) { setSigned(undefined); return; }
    let cancelled = false;
    const resolve = () =>
      resolveImageUrl(rawUrl).then(url => { if (!cancelled) setSigned(url ?? undefined); });
    resolve();
    const timer = setTimeout(() => { clearImageUrlCache(rawUrl); resolve(); }, 49 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [rawUrl]);
  return signed;
}
