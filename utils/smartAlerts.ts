import { Patient, PacStatus } from '../types';

export interface SmartAlert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

export function getSmartAlerts(patient: Patient): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

  if (patient.dos === today && patient.pacStatus === PacStatus.Pending)
    alerts.push({ type: 'critical', message: 'Surgery TODAY — PAC not cleared!' });

  if (patient.dos === tomorrow && patient.pacStatus === PacStatus.Pending)
    alerts.push({ type: 'warning', message: 'Surgery tomorrow — PAC still pending' });

  if ((patient.pod === 0 || patient.pod === 1) && patient.todos.some(t => !t.isDone))
    alerts.push({ type: 'warning', message: `POD ${patient.pod} — overdue orders` });

  if (patient.pod !== undefined && patient.pod >= 5 && !patient.dischargeSummary)
    alerts.push({ type: 'info', message: `POD ${patient.pod} — consider discharge planning` });

  if (patient.pod !== undefined && patient.pod >= 7)
    alerts.push({ type: 'warning', message: `POD ${patient.pod} — extended stay, review needed` });

  return alerts;
}
