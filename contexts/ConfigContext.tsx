/**
 * ConfigContext.tsx
 * Provides dynamic ward and lab-type configuration fetched from the database.
 *
 * Cache strategy: localStorage cache is served immediately on first render,
 * then refreshed from Supabase in the background (same pattern as PatientContext).
 *
 * Admin mutations (add/update/delete) are only available to users with the
 * 'admin' role — enforced at the component layer via `can(user, 'team:manage')`.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { WardConfig, LabTypeConfig, HospitalConfig } from '../types';
import {
  fetchWards, createWard, updateWard, deleteWard,
  fetchLabTypes, createLabType, updateLabType, deleteLabType,
  fetchHospitalConfig, upsertHospitalConfig,
} from '../services/configService';
import { saveToStorage, loadFromStorage } from '../services/persistence';
import { toast } from '../utils/toast';

// ─── localStorage cache keys ───
const WARD_CACHE_KEY          = 'config_wards';
const LAB_CACHE_KEY           = 'config_lab_types';
const UNIT_CHIEFS_CACHE_KEY   = 'config_unit_chiefs';
const HOSPITAL_CONFIG_CACHE_KEY = 'config_hospital';

const DEFAULT_HOSPITAL_CONFIG: HospitalConfig = {
  hospitalName: 'GOVT MEDICAL COLLEGE, KOZHIKODE',
  department: 'DEPARTMENT OF ORTHOPAEDICS',
  units: ['OR1', 'OR2', 'OR3', 'OR4', 'OR5'],
};

// ─── Fallback defaults (used when DB is unreachable and no cache exists) ───
const DEFAULT_WARDS: WardConfig[] = [
  { id: 'default-icu',  name: 'Ortho ICU', sortOrder: 0, isIcu: true,  active: true },
  { id: 'default-w24',  name: 'Ward 24',   sortOrder: 1, isIcu: false, active: true },
  { id: 'default-w10',  name: 'Ward 10',   sortOrder: 2, isIcu: false, active: true },
];
const DEFAULT_LAB_TYPES: LabTypeConfig[] = [
  { id: 'default-fbs',  name: 'FBS',  unit: 'mg/dL', alertHigh: 126, category: 'Diabetes',  sortOrder: 0, active: true },
  { id: 'default-ppbs', name: 'PPBS', unit: 'mg/dL', alertHigh: 200, category: 'Diabetes',  sortOrder: 1, active: true },
  { id: 'default-esr',  name: 'ESR',  unit: 'mm/hr', alertHigh: 20,  category: 'Infection', sortOrder: 0, active: true },
  { id: 'default-crp',  name: 'CRP',  unit: 'mg/L',  alertHigh: 10,  category: 'Infection', sortOrder: 1, active: true },
];

// ─── Context Shape ───
interface ConfigContextType {
  wards: WardConfig[];
  labTypes: LabTypeConfig[];
  isLoadingConfig: boolean;
  /** Names of all ICU wards (for ICU-specific styling). */
  icuWardNames: Set<string>;
  /** Lab types grouped by category, preserving sort order. */
  labTypesByCategory: Map<string, LabTypeConfig[]>;

  /** Unit → surgeon name mapping for OT list auto-fill. */
  unitChiefs: Record<string, string>;
  setUnitChief: (unit: string, name: string) => void;

  /** Hospital name (used in PDF/Excel exports). */
  hospitalName: string;
  /** Department name (used in PDF/Excel exports). */
  department: string;
  /** Available clinical units (e.g. ["OR1","OR2","OR3","OR4","OR5"]). */
  unitOptions: string[];
  /** Persist updated hospital config to DB + cache. */
  saveHospitalConfig: (config: HospitalConfig) => Promise<void>;

  // Admin CRUD — wards
  addWard:    (name: string, isIcu: boolean, unit?: string[]) => Promise<void>;
  saveWard:   (ward: WardConfig) => Promise<void>;
  removeWard: (id: string) => Promise<void>;

  // Admin CRUD — lab types
  addLabType:    (name: string, unit: string, alertHigh: number | null, category: string) => Promise<void>;
  saveLabType:   (lab: LabTypeConfig) => Promise<void>;
  removeLabType: (id: string) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

export function useConfig(): ConfigContextType {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}

// ─── Provider ───
export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wards, setWards] = useState<WardConfig[]>(() => {
    return loadFromStorage<WardConfig[]>(WARD_CACHE_KEY) ?? DEFAULT_WARDS;
  });

  const [labTypes, setLabTypes] = useState<LabTypeConfig[]>(() => {
    return loadFromStorage<LabTypeConfig[]>(LAB_CACHE_KEY) ?? DEFAULT_LAB_TYPES;
  });

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [hospitalConfig, setHospitalConfigState] = useState<HospitalConfig>(
    () => loadFromStorage<HospitalConfig>(HOSPITAL_CONFIG_CACHE_KEY) ?? DEFAULT_HOSPITAL_CONFIG,
  );

  const [unitChiefs, setUnitChiefsState] = useState<Record<string, string>>(
    () => loadFromStorage<Record<string, string>>(UNIT_CHIEFS_CACHE_KEY) ?? {}
  );

  const setUnitChief = useCallback((unit: string, name: string) => {
    setUnitChiefsState(prev => {
      const next = { ...prev, [unit]: name };
      saveToStorage(UNIT_CHIEFS_CACHE_KEY, next);
      return next;
    });
  }, []);

  // Background fetch on mount
  useEffect(() => {
    Promise.all([fetchWards(), fetchLabTypes(), fetchHospitalConfig()])
      .then(([freshWards, freshLabs, freshHospital]) => {
        setWards(freshWards);
        setLabTypes(freshLabs);
        setHospitalConfigState(freshHospital);
        saveToStorage(WARD_CACHE_KEY, freshWards);
        saveToStorage(LAB_CACHE_KEY, freshLabs);
        saveToStorage(HOSPITAL_CONFIG_CACHE_KEY, freshHospital);
      })
      .catch(err => console.error('[Config] Failed to load from Supabase — using cache:', err))
      .finally(() => setIsLoadingConfig(false));
  }, []);

  const saveHospitalConfig = useCallback(async (config: HospitalConfig) => {
    await upsertHospitalConfig(config);
    setHospitalConfigState(config);
    saveToStorage(HOSPITAL_CONFIG_CACHE_KEY, config);
    toast.success('Hospital settings saved');
  }, []);

  // ─── Derived values ───
  const icuWardNames = useMemo(
    () => new Set(wards.filter(w => w.isIcu).map(w => w.name)),
    [wards],
  );

  const labTypesByCategory = useMemo(() => {
    const map = new Map<string, LabTypeConfig[]>();
    for (const lt of labTypes.filter(l => l.active)) {
      const group = map.get(lt.category) ?? [];
      group.push(lt);
      map.set(lt.category, group);
    }
    return map;
  }, [labTypes]);

  // ─── Ward mutations ───
  const addWard = useCallback(async (name: string, isIcu: boolean, unit?: string[]) => {
    const maxOrder = wards.reduce((max, w) => Math.max(max, w.sortOrder), -1);
    const created = await createWard(name, isIcu, maxOrder + 1, unit);
    setWards(prev => {
      const next = [...prev, created];
      saveToStorage(WARD_CACHE_KEY, next);
      return next;
    });
    toast.success(`Ward "${name}" added`);
  }, [wards]);

  const saveWard = useCallback(async (ward: WardConfig) => {
    await updateWard(ward);
    setWards(prev => {
      const next = prev.map(w => w.id === ward.id ? ward : w)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      saveToStorage(WARD_CACHE_KEY, next);
      return next;
    });
    toast.success(`Ward "${ward.name}" updated`);
  }, []);

  const removeWard = useCallback(async (id: string) => {
    await deleteWard(id);
    setWards(prev => {
      const next = prev.filter(w => w.id !== id);
      saveToStorage(WARD_CACHE_KEY, next);
      return next;
    });
    toast.success('Ward removed');
  }, []);

  // ─── Lab Type mutations ───
  const addLabType = useCallback(async (
    name: string, unit: string, alertHigh: number | null, category: string,
  ) => {
    const sameCat = labTypes.filter(l => l.category === category);
    const maxOrder = sameCat.reduce((max, l) => Math.max(max, l.sortOrder), -1);
    const created = await createLabType(name, unit, alertHigh, category, maxOrder + 1);
    setLabTypes(prev => {
      const next = [...prev, created];
      saveToStorage(LAB_CACHE_KEY, next);
      return next;
    });
    toast.success(`Lab type "${name}" added`);
  }, [labTypes]);

  const saveLabType = useCallback(async (lab: LabTypeConfig) => {
    await updateLabType(lab);
    setLabTypes(prev => {
      const next = prev.map(l => l.id === lab.id ? lab : l);
      saveToStorage(LAB_CACHE_KEY, next);
      return next;
    });
    toast.success(`Lab type "${lab.name}" updated`);
  }, []);

  const removeLabType = useCallback(async (id: string) => {
    await deleteLabType(id);
    setLabTypes(prev => {
      const next = prev.filter(l => l.id !== id);
      saveToStorage(LAB_CACHE_KEY, next);
      return next;
    });
    toast.success('Lab type removed');
  }, []);

  const value = useMemo<ConfigContextType>(() => ({
    wards, labTypes, isLoadingConfig,
    icuWardNames, labTypesByCategory,
    unitChiefs, setUnitChief,
    hospitalName: hospitalConfig.hospitalName,
    department: hospitalConfig.department,
    unitOptions: hospitalConfig.units.length > 0 ? hospitalConfig.units : DEFAULT_HOSPITAL_CONFIG.units,
    saveHospitalConfig,
    addWard, saveWard, removeWard,
    addLabType, saveLabType, removeLabType,
  }), [
    wards, labTypes, isLoadingConfig,
    icuWardNames, labTypesByCategory,
    unitChiefs, setUnitChief,
    hospitalConfig, saveHospitalConfig,
    addWard, saveWard, removeWard,
    addLabType, saveLabType, removeLabType,
  ]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};
