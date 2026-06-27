/**
 * ReferralLetter.tsx
 * Generate inter-department and inter-hospital referral letters with PDF export.
 */
import React, { useState } from 'react';
import { X, Send, Download, FileText } from 'lucide-react';
import { Patient } from '../types';

interface Props {
  patient: Patient;
  hospitalName: string;
  referringDoctor: string;
  onClose: () => void;
}

type Urgency = 'routine' | 'urgent' | 'emergency';

const ReferralLetter: React.FC<Props> = ({ patient, hospitalName, referringDoctor, onClose }) => {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const [toDept, setToDept] = useState('');
  const [toDoctor, setToDoctor] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('routine');
  const [reason, setReason] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState(
    `${patient.name}, ${patient.age}Y/${patient.gender}, IP No: ${patient.ipNo}\n` +
    `Admitted: ${patient.doa}\nDiagnosis: ${patient.diagnosis}\n` +
    (patient.comorbidities?.length ? `Comorbidities: ${patient.comorbidities.join(', ')}\n` : '') +
    (patient.procedure ? `Procedure: ${patient.procedure}\n` : '')
  );
  const [specificRequests, setSpecificRequests] = useState('');
  const [saving, setSaving] = useState(false);

  const handleDownload = async () => {
    setSaving(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const lm = 20; let y = 20;
      const line = (txt: string, size = 11, bold = false) => {
        doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(txt, 170);
        doc.text(lines, lm, y); y += lines.length * (size * 0.5) + 2;
      };
      const gap = (n = 4) => { y += n; };

      line('REFERRAL LETTER', 16, true); gap();
      line(`Date: ${today}`, 10); gap(2);
      line(`From: Dr. ${referringDoctor}`, 10);
      line(`Department: ${patient.ward ?? 'Ward'}`, 10);
      line(`Hospital: ${hospitalName}`, 10); gap();
      line(`To: Dr. ${toDoctor || '[Consultant]'}`, 10);
      line(`Department: ${toDept || '[Department]'}`, 10); gap();
      line(`URGENCY: ${urgency.toUpperCase()}`, 12, true); gap(2);
      line('REASON FOR REFERRAL', 11, true);
      line(reason || '(Please complete)', 10); gap();
      line('CLINICAL SUMMARY', 11, true);
      line(clinicalSummary, 10); gap();
      if (specificRequests) {
        line('SPECIFIC REQUESTS', 11, true);
        line(specificRequests, 10); gap();
      }
      gap(8);
      line(`Dr. ${referringDoctor}`, 11, true);
      line('Referring Physician', 10);
      doc.save(`referral_${patient.ipNo}_${Date.now()}.pdf`);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-slate-900">Referral Letter</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close referral letter">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">To Department *</label>
              <input value={toDept} onChange={e => setToDept(e.target.value)} placeholder="e.g. Cardiology"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">To Doctor</label>
              <input value={toDoctor} onChange={e => setToDoctor(e.target.value)} placeholder="e.g. Dr. Sharma"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[44px]" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Urgency</label>
            <div className="mt-1 flex gap-2">
              {(['routine', 'urgent', 'emergency'] as Urgency[]).map(u => (
                <button key={u} onClick={() => setUrgency(u)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-colors min-h-[44px] ${urgency === u
                    ? u === 'emergency' ? 'bg-red-600 text-white border-red-600'
                      : u === 'urgent' ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-teal-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200'}`}>{u}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Reason for Referral *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="Specific reason for referral..."
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Clinical Summary</label>
            <textarea value={clinicalSummary} onChange={e => setClinicalSummary(e.target.value)} rows={5}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none font-mono text-xs" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Specific Requests / Questions</label>
            <textarea value={specificRequests} onChange={e => setSpecificRequests(e.target.value)} rows={2}
              placeholder="Please evaluate, advise on management, arrange..."
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium min-h-[44px]">Cancel</button>
          <button onClick={handleDownload} disabled={saving || !toDept || !reason}
            className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 min-h-[44px]">
            <Download className="w-4 h-4" />
            {saving ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralLetter;
