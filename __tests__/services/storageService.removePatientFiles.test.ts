/**
 * Removing all of one patient's image files (erase request, audit DATA-07).
 * Storage reports a refused delete as "nothing removed", not as an error, so
 * the function must look again and fail if a file is still there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ files: new Set<string>(), refuse: false, remove: vi.fn(), list: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ list: h.list, remove: h.remove }) } },
}));

import { removePatientFiles } from '../../services/storageService';

beforeEach(() => {
  vi.clearAllMocks();
  h.refuse = false;
  h.files = new Set([
    'hosp-1/IP1/a.jpg', 'hosp-1/IP1/b.pdf',
    'hosp-1/OLD-IP/c.jpg',          // uploaded before the IP number was corrected
    'hosp-1/OLD-IP/other-patient.jpg',
    'hosp-1/IP2/z.jpg',             // another patient
  ]);
  h.list.mockImplementation(async (folder: string) => ({
    data: [...h.files].filter(p => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes('/'))
      .map(p => ({ id: p, name: p.slice(folder.length + 1) })),
    error: null,
  }));
  h.remove.mockImplementation(async (paths: string[]) => {
    if (!h.refuse) paths.forEach(p => h.files.delete(p));
    return { data: [], error: null };
  });
});

describe('removePatientFiles', () => {
  it('removes the patient\'s folder and the recorded paths, and nothing else', async () => {
    const res = await removePatientFiles('hosp-1', 'IP1', ['hosp-1/OLD-IP/c.jpg', 'hosp-1/IP1/a.jpg']);
    expect(res).toEqual({ removed: 3, skipped: 0 });
    expect([...h.files].sort()).toEqual(['hosp-1/IP2/z.jpg', 'hosp-1/OLD-IP/other-patient.jpg']);
  });

  it('leaves links outside this hospital\'s storage alone and counts them', async () => {
    const res = await removePatientFiles('hosp-1', 'IP1', ['hosp-2/IP9/x.jpg', 'https://example.org/pic.jpg', 'data:image/png;base64,AAAA']);
    expect(res).toEqual({ removed: 2, skipped: 2 });
    expect(h.remove.mock.calls.flat(2)).not.toContain('hosp-2/IP9/x.jpg');
  });

  it('accepts an old full link to this hospital\'s own storage', async () => {
    const res = await removePatientFiles('hosp-1', 'IP1',
      ['https://x.supabase.co/storage/v1/object/public/radiology/hosp-1/OLD-IP/c.jpg']);
    expect(res.removed).toBe(3);
    expect(h.files.has('hosp-1/OLD-IP/c.jpg')).toBe(false);
  });

  it('fails when a file is still there afterwards (a delete refused without an error)', async () => {
    h.refuse = true;
    await expect(removePatientFiles('hosp-1', 'IP1', [])).rejects.toThrow(/2 of 2 image file\(s\) could not be removed/);
  });

  it('fails when storage reports an error', async () => {
    h.remove.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(removePatientFiles('hosp-1', 'IP1', [])).rejects.toThrow(/could not be removed: boom/);
  });

  it('does nothing for a patient with no files', async () => {
    const res = await removePatientFiles('hosp-1', 'IP-NONE', []);
    expect(res).toEqual({ removed: 0, skipped: 0 });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('refuses to run without a hospital or IP number (would list a whole folder tree)', async () => {
    await expect(removePatientFiles('', 'IP1', [])).rejects.toThrow(/required/);
    await expect(removePatientFiles('hosp-1', '', [])).rejects.toThrow(/required/);
  });
});
