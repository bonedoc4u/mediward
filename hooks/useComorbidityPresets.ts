import { useConfig } from '../contexts/ConfigContext';
import { ComorbidityEntry } from '../types';

export const DEFAULT_COMORBIDITY_MAP: ComorbidityEntry[] = [
  { short: 'HTN',               full: 'Hypertension' },
  { short: 'DM',                full: 'Diabetes Mellitus' },
  { short: 'CAD',               full: 'Coronary Artery Disease' },
  { short: 'CKD',               full: 'Chronic Kidney Disease' },
  { short: 'CVA',               full: 'Cerebrovascular Accident' },
  { short: 'Hypothyroid',       full: 'Hypothyroidism' },
  { short: 'Hyperthyroid',      full: 'Hyperthyroidism' },
  { short: 'Asthma',            full: 'Bronchial Asthma' },
  { short: 'COPD',              full: 'COPD' },
  { short: 'TB',                full: 'Tuberculosis' },
  { short: 'Seizure Disorder',  full: 'Seizure Disorder' },
  { short: 'DLP',               full: 'Dyslipidaemia' },
  { short: 'NOCM',              full: 'No Other Co-Morbidities' },
  { short: 'CA',                full: 'Carcinoma' },
  { short: 'RA',                full: 'Rheumatoid Arthritis' },
  { short: 'SVT',               full: 'Supraventricular Tachycardia' },
  { short: 'DCM',               full: 'Dilated Cardiomyopathy' },
  { short: "Parkinson's",       full: "Parkinson's Disease" },
  { short: 'Hyponatremia',      full: 'Hyponatremia' },
  { short: 'Factor VIII Def.',  full: 'Factor VIII Deficiency' },
  { short: 'Sickle Cell',       full: 'Sickle Cell Anaemia' },
  { short: 'Cardioembolism',    full: 'Cardioembolism' },
  { short: 'Pulmon Atresia',    full: 'Pulmonary Atresia' },
  { short: 'RAD',               full: 'Reactive Airway Disease' },
  { short: 'RDD',               full: 'RDD' },
  { short: 'Psy',               full: 'Psychiatric Disorder' },
];

export function useComorbidityPresets() {
  const { comorbidityMap, saveComorbidityMap } = useConfig();
  // Fall back to built-in defaults if the DB hasn't been configured yet
  const effectiveMap = comorbidityMap.length > 0 ? comorbidityMap : DEFAULT_COMORBIDITY_MAP;
  return { comorbidityMap: effectiveMap, saveComorbidityMap };
}
