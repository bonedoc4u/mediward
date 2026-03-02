import React, { useMemo } from 'react';
import { Patient, PacStatus } from '../types';
import { Scissors, HeartPulse, AlertTriangle, ListChecks, ClipboardList, FileDown } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Props {
  patients: Patient[];
  onFilterSurgeryToday: () => void;
  onFilterPod01: () => void;
  onFilterPacPending: () => void;
  onFilterOverdueTodos: () => void;
  onStartRounds: () => void;
}

interface HandoverCard {
  label: string;
  count: number;
  names: string[];
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  iconBg: string;
  textColor: string;
  borderColor: string;
  onClick: () => void;
}

const HandoverSummary: React.FC<Props> = ({
  patients,
  onFilterSurgeryToday,
  onFilterPod01,
  onFilterPacPending,
  onFilterOverdueTodos,
  onStartRounds,
}) => {
  const today = new Date().toISOString().split('T')[0];

  const exportShiftPDF = (data: { surgeryToday: Patient[]; pod01: Patient[]; pacPending: Patient[]; overdueTodos: Patient[] }) => {
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

    // Today's Surgeries
    section("Today's Surgeries", data.surgeryToday.length);
    if (data.surgeryToday.length === 0) { row('None scheduled'); }
    else { data.surgeryToday.forEach(p => row(`${p.name}  Bed ${p.bed}  —  ${p.procedure ?? p.diagnosis}`)); }
    gap();

    // POD 0-1 Watch
    section('POD 0–1 Watch', data.pod01.length);
    if (data.pod01.length === 0) { row('None'); }
    else { data.pod01.forEach(p => row(`${p.name}  Bed ${p.bed}  —  POD ${p.pod ?? '?'}`)); }
    gap();

    // PAC Pending
    section('PAC Pending', data.pacPending.length);
    if (data.pacPending.length === 0) { row('All patients cleared'); }
    else { data.pacPending.forEach(p => row(`${p.name}  Bed ${p.bed}  —  Admitted ${p.doa}`)); }
    gap();

    // Overdue Orders
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
  };

  const data = useMemo(() => {
    const surgeryToday = patients.filter(p => p.dos === today);
    const pod01 = patients.filter(p => p.pod === 0 || p.pod === 1);
    const pacPending = patients.filter(p => p.pacStatus === PacStatus.Pending);
    const overdueTodos = patients.filter(p => p.todos.some(t => !t.isDone));

    return { surgeryToday, pod01, pacPending, overdueTodos };
  }, [patients, today]);

  const cards: HandoverCard[] = [
    {
      label: "Today's Surgeries",
      count: data.surgeryToday.length,
      names: data.surgeryToday.map(p => p.name.split(' ')[0]).slice(0, 3),
      icon: Scissors,
      bg: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-200',
      onClick: onFilterSurgeryToday,
    },
    {
      label: 'POD 0-1 Watch',
      count: data.pod01.length,
      names: data.pod01.map(p => p.name.split(' ')[0]).slice(0, 3),
      icon: HeartPulse,
      bg: 'bg-green-50',
      iconBg: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-200',
      onClick: onFilterPod01,
    },
    {
      label: 'PAC Pending',
      count: data.pacPending.length,
      names: data.pacPending.map(p => p.name.split(' ')[0]).slice(0, 3),
      icon: AlertTriangle,
      bg: data.pacPending.length > 0 ? 'bg-red-50' : 'bg-slate-50',
      iconBg: data.pacPending.length > 0 ? 'bg-red-100' : 'bg-slate-100',
      textColor: data.pacPending.length > 0 ? 'text-red-800' : 'text-slate-600',
      borderColor: data.pacPending.length > 0 ? 'border-red-200' : 'border-slate-200',
      onClick: onFilterPacPending,
    },
    {
      label: 'Overdue Orders',
      count: data.overdueTodos.length,
      names: data.overdueTodos.map(p => p.name.split(' ')[0]).slice(0, 3),
      icon: ListChecks,
      bg: data.overdueTodos.length > 0 ? 'bg-amber-50' : 'bg-slate-50',
      iconBg: data.overdueTodos.length > 0 ? 'bg-amber-100' : 'bg-slate-100',
      textColor: data.overdueTodos.length > 0 ? 'text-amber-800' : 'text-slate-600',
      borderColor: data.overdueTodos.length > 0 ? 'border-amber-200' : 'border-slate-200',
      onClick: onFilterOverdueTodos,
    },
  ];

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Ward Snapshot</h3>
          <p className="text-xs text-slate-400">{dateLabel} · Click a card to filter</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportShiftPDF(data)}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors shadow-sm border border-slate-200"
            title="Download shift handover as PDF"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
          <button
            onClick={onStartRounds}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <ClipboardList className="w-4 h-4" />
            Start Rounds
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(card => (
          <button
            key={card.label}
            onClick={card.onClick}
            className={`
              flex flex-col items-start p-4 rounded-xl border transition-all duration-200
              hover:shadow-md hover:scale-[1.02] active:scale-[0.98] text-left
              ${card.bg} ${card.borderColor}
            `}
          >
            <div className={`p-2 rounded-lg mb-3 ${card.iconBg}`}>
              <card.icon className={`w-4 h-4 ${card.textColor}`} />
            </div>
            <div className={`text-2xl font-bold leading-none mb-1 ${card.textColor}`}>
              {card.count}
            </div>
            <div className={`text-xs font-semibold mb-1 ${card.textColor}`}>
              {card.label}
            </div>
            {card.names.length > 0 ? (
              <div className="text-[10px] text-slate-500 leading-relaxed">
                {card.names.join(', ')}{card.count > 3 ? ` +${card.count - 3}` : ''}
              </div>
            ) : (
              <div className="text-[10px] text-slate-400">None today</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HandoverSummary;
