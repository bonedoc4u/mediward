import { Patient, PacStatus } from '../types';
import { localYmd, todayYmd } from './dates';
import { needsPac } from './calculations';

export interface SmartAlert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

export function getSmartAlerts(patient: Patient): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const today    = todayYmd();
  const tomorrow = localYmd(new Date(Date.now() + 86_400_000));

  if (needsPac(patient) && patient.dos === today && patient.pacStatus === PacStatus.Pending)
    alerts.push({ type: 'critical', message: 'Surgery TODAY — PAC not cleared!' });

  if (needsPac(patient) && patient.dos === tomorrow && patient.pacStatus === PacStatus.Pending)
    alerts.push({ type: 'warning', message: 'Surgery tomorrow — PAC still pending' });

  if ((patient.pod === 1 || patient.pod === 2) && patient.todos.some(t => !t.isDone))
    alerts.push({ type: 'warning', message: `POD ${patient.pod} — overdue orders` });

  // One length-of-stay alert per patient. From POD 7 the amber "extended stay"
  // alert replaces the POD 5 discharge-planning nudge: both used to show at
  // once, saying the same thing in two colours.
  if (patient.pod !== undefined && patient.pod >= 7)
    alerts.push({
      type: 'warning',
      message: patient.dischargeSummary
        ? `POD ${patient.pod} — extended stay, review needed`
        : `POD ${patient.pod} — extended stay. Review and plan discharge`,
    });
  else if (patient.pod !== undefined && patient.pod >= 5 && !patient.dischargeSummary)
    alerts.push({ type: 'info', message: `POD ${patient.pod} — consider discharge planning` });

  return alerts;
}
