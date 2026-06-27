import React from 'react';
import {
  CheckCircle2, Eye, AlertCircle, LogOut, HeartPulse,
} from 'lucide-react';
import { PatientStatus } from '../../types';

interface Props {
  status: PatientStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<PatientStatus, {
  label: string;
  Icon: React.FC<{ className?: string }>;
  classes: string;
}> = {
  [PatientStatus.Fit]: {
    label: 'Fit',
    Icon: CheckCircle2,
    classes: 'bg-green-100 text-green-800 border-green-300',
  },
  [PatientStatus.Review]: {
    label: 'Review',
    Icon: Eye,
    classes: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  [PatientStatus.Critical]: {
    label: 'Critical',
    Icon: AlertCircle,
    classes: 'bg-red-100 text-red-800 border-red-300',
  },
  [PatientStatus.DischargeReady]: {
    label: 'Discharge Ready',
    Icon: HeartPulse,
    classes: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  [PatientStatus.Discharged]: {
    label: 'Discharged',
    Icon: LogOut,
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

/** WCAG 2.1 AA compliant status badge: conveys meaning via icon + text, not colour alone. */
export function PatientStatusBadge({ status, size = 'sm' }: Props) {
  const cfg = CONFIG[status];
  if (!cfg) return null;
  const { label, Icon, classes } = cfg;
  const sz = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';
  const iconSz = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${classes} ${sz}`}
      aria-label={`Status: ${label}`}
    >
      <Icon className={`${iconSz} shrink-0`} aria-hidden="true" />
      {label}
    </span>
  );
}
