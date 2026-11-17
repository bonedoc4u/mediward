/**
 * shiftHandover.ts — the ward snapshot counts and the shift handover PDF.
 *
 * Shared by the snapshot tiles (desktop and phone) and the dashboard's phone
 * "⋯" menu, so both export exactly the same report.
 */
import { Patient, PacStatus } from '../types';
import { needsPac } from './calculations';

/** Post-op day from the surgery date (dos), 1-based: the day of surgery is POD 1.
 *  Undefined if there was no surgery yet or it is in the future. */
export function calcPod(dos: string | undefined, today: string): number | undefined {
  if (!dos) return undefined;
  const diff = Math.round((new Date(today).getTime() - new Date(dos).getTime()) / 86_400_000);
  return diff >= 0 ? diff + 1 : undefined;
}

export interface ShiftSnapshot {
  surgeryToday: Patient[];
  pod01: Patient[];
  pacPending: Patient[];
  overdueTodos: Patient[];
}

export function buildShiftSnapshot(patients: readonly Patient[], today: string): ShiftSnapshot {
  return {
    surgeryToday: patients.filter(p => p.dos === today || p.plannedDos === today),
    // calcPod is 1-based (day of surgery = POD 1), so "POD 0–1" is calcPod 1 or 2.
    pod01: patients.filter(p => { const d = calcPod(p.dos, today); return d === 1 || d === 2; }),
    pacPending: patients.filter(p => needsPac(p) && p.pacStatus === PacStatus.Pending),
    overdueTodos: patients.filter(p => p.todos.some(t => !t.isDone)),
  };
}

export async function exportShiftHandoverPDF(data: ShiftSnapshot, today: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Ward Shift Handover Report', 20, 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${dateStr} at ${timeStr}`, 20, 30);
  doc.setTextColor(0);
  doc.line(20, 34, 190, 34);

  let y = 42;
  const section = (title: string, count: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${title} (${count})`, 20, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };
  const row = (text: string) => {
    doc.text(`• ${text}`, 26, y);
    y += 6;
  };
  const gap = () => { y += 4; };

  section("Today's Surgeries", data.surgeryToday.length);
  if (data.surgeryToday.length === 0) { row('None scheduled'); }
  else { data.surgeryToday.forEach(p => row(`${p.name}  Bed ${p.bed}  —  ${p.procedure ?? p.diagnosis}`)); }
  gap();

  section('POD 0–1 Watch', data.pod01.length);
  if (data.pod01.length === 0) { row('None'); }
  else { data.pod01.forEach(p => row(`${p.name}  Bed ${p.bed}  —  POD ${p.pod ?? '?'}`)); }
  gap();

  section('PAC Pending', data.pacPending.length);
  if (data.pacPending.length === 0) { row('All patients cleared'); }
  else { data.pacPending.forEach(p => row(`${p.name}  Bed ${p.bed}  —  Admitted ${p.doa}`)); }
  gap();

  section('Overdue Orders', data.overdueTodos.length);
  if (data.overdueTodos.length === 0) { row('No pending orders'); }
  else {
    data.overdueTodos.forEach(p => {
      const pending = p.todos.filter(t => !t.isDone).length;
      row(`${p.name}  Bed ${p.bed}  —  ${pending} pending order${pending > 1 ? 's' : ''}`);
    });
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('MediWard — Confidential clinical document. Not for public distribution.', 20, pageH - 10);

  doc.save(`shift-handover-${today}.pdf`);
}
