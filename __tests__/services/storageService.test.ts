import { describe, it, expect } from 'vitest';
import { validateImageFile, isPdfPath } from '../../services/storageService';

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
