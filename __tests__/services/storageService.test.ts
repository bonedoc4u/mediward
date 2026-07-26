import { describe, it, expect, vi } from 'vitest';

const mockUpload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload }) } },
}));

import { validateImageFile, isPdfPath, uploadInvestigationImage } from '../../services/storageService';

const makeFile = (type: string, sizeBytes: number, name = 'test-file'): File => {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
};

describe('validateImageFile', () => {
  it('accepts a JPEG under the size limit', () => {
    expect(() => validateImageFile(makeFile('image/jpeg', 1024))).not.toThrow();
  });

  it('accepts a PDF under the size limit (culture reports)', () => {
    expect(() => validateImageFile(makeFile('application/pdf', 1024, 'culture-report.pdf'))).not.toThrow();
  });

  it('rejects an unsupported MIME type', () => {
    expect(() => validateImageFile(makeFile('application/zip', 1024))).toThrow(/Unsupported file type/);
  });

  it('rejects a file over 10 MB', () => {
    expect(() => validateImageFile(makeFile('application/pdf', 11 * 1024 * 1024, 'huge.pdf'))).toThrow(/too large/i);
  });
});

describe('isPdfPath', () => {
  it('recognizes a stored PDF path', () => {
    expect(isPdfPath('hospital-1/IP001/abc123.pdf')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPdfPath('hospital-1/IP001/abc123.PDF')).toBe(true);
  });

  it('returns false for image paths', () => {
    expect(isPdfPath('hospital-1/IP001/abc123.jpg')).toBe(false);
  });

  it('returns false for an empty path', () => {
    expect(isPdfPath('')).toBe(false);
  });
});

describe('uploadInvestigationImage', () => {
  it('stores a PDF culture report with a .pdf extension, not .jpg', async () => {
    // Regression coverage for the exact bug shape this feature depends on:
    // if compressImage's PDF bypass or the ext-derivation ternary ever
    // regressed, a culture report would silently get a .jpg path and
    // isPdfPath() would then wrongly treat it as an image everywhere it's read.
    const path = await uploadInvestigationImage(
      makeFile('application/pdf', 1024, 'culture-report.pdf'),
      'hospital-1',
      'IP001',
    );
    expect(path).toMatch(/^hospital-1\/IP001\/.+\.pdf$/);
    expect(isPdfPath(path)).toBe(true);
  });
});
