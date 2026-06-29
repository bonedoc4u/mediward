import { useState, useCallback } from 'react';

export const DEFAULT_COMORBIDITY_PRESETS: string[] = [
  'HTN', 'DM', 'CAD', 'CKD', 'CVA',
  'Hypothyroid', 'Hyperthyroid', 'Asthma', 'COPD', 'TB',
  'Seizure Disorder', 'DLP', 'NOCM', 'CA', 'RA',
  'SVT', 'DCM', "Parkinson's", 'Hyponatremia', 'Factor VIII Def.',
  'Sickle Cell Anemia', 'Cardioembolism', 'Pulmon Atresia', 'RAD', 'RDD', 'Psy',
];

const STORAGE_KEY = 'mediward_comorbidity_presets';

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return DEFAULT_COMORBIDITY_PRESETS;
}

function persist(list: string[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function useComorbidityPresets() {
  const [presets, setPresets] = useState<string[]>(load);

  const addPreset = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setPresets(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      persist(next);
      return next;
    });
  }, []);

  const removePreset = useCallback((term: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p !== term);
      persist(next);
      return next;
    });
  }, []);

  const savePresets = useCallback((next: string[]) => {
    persist(next);
    setPresets(next);
  }, []);

  const resetPresets = useCallback(() => {
    persist(DEFAULT_COMORBIDITY_PRESETS);
    setPresets(DEFAULT_COMORBIDITY_PRESETS);
  }, []);

  return { presets, addPreset, removePreset, savePresets, resetPresets };
}
