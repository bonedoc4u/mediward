/**
 * modality.ts — shared modality styling for radiology studies (X-Ray/CT/MRI/…).
 * Used by RadiologyComparator and the patient-detail Radiology panel.
 */
import React from 'react';
import { ImageIcon, FileText, Bone, ScanLine, Waves } from 'lucide-react';

export interface ModalityConfig {
  bg: string;
  badge: string;
  Icon: React.FC<{ className?: string }>;
}

export const MODALITY: Record<string, ModalityConfig> = {
  'X-Ray':          { bg: 'bg-slate-900',  badge: 'bg-slate-700 text-slate-200',   Icon: Bone     },
  'CT':             { bg: 'bg-indigo-950', badge: 'bg-indigo-800 text-indigo-200', Icon: ScanLine },
  'MRI':            { bg: 'bg-violet-950', badge: 'bg-violet-800 text-violet-200', Icon: ScanLine },
  'USG':            { bg: 'bg-cyan-950',   badge: 'bg-cyan-800 text-cyan-200',     Icon: Waves    },
  'Report':         { bg: 'bg-amber-950',  badge: 'bg-amber-800 text-amber-200',   Icon: FileText },
  'Culture Report': { bg: 'bg-rose-950',   badge: 'bg-rose-800 text-rose-200',     Icon: FileText },
};

export const getModality = (type: string): ModalityConfig =>
  MODALITY[type] ?? { bg: 'bg-slate-900', badge: 'bg-slate-700 text-slate-200', Icon: ImageIcon };
