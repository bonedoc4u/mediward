import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { Patient, PatientStatus, DischargeSummary as DS } from '../types';
import { jsPDF } from 'jspdf';
import {
  ArrowLeft, FileDown, Save, Search, FileText,
  CheckCircle, LogOut, RotateCcw, AlertTriangle,
} from 'lucide-react';

// ─── Auto-generate hospital course from patient data ───
function buildDefaultCourse(patient: Patient): string {
  const parts: string[] = [];
  parts.push(
    `${patient.name} (${patient.age}y / ${patient.gender}) was admitted on ${patient.doa} with ${patient.diagnosis}.`
  );
  if (patient.comorbidities.length > 0) {
    parts.push(`Known comorbidities: ${patient.comorbidities.join(', ')}.`);
  }
  if (patient.procedure) {
    parts.push(
      `${patient.dos ? `On ${patient.dos}, ` : ''}${patient.procedure} was performed under anesthesia. Post-operative course was uneventful.`
    );
  } else {
    parts.push('Patient was managed conservatively.');
  }
  const sortedRounds = [...(patient.dailyRounds || [])]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sortedRounds.length > 0) {
    parts.push('\nPost-operative progress:');
    sortedRounds.slice(-4).forEach(r => {
      if (r.note) parts.push(`${r.date}: ${r.note}`);
    });
  }
  return parts.join(' ');
}

function buildDefaultSummary(patient: Patient): DS {
  return {
    hospitalCourse: buildDefaultCourse(patient),
    conditionAtDischarge: 'Stable, afebrile, vitals within normal limits. Wound healthy.',
    dischargeMedications: '',
    followUpInstructions: 'Review in Orthopaedic OPD.',
    followUpDate: '',
    woundCare: 'Keep wound clean and dry. Change dressing as advised.',
    restrictions: 'No heavy lifting. Weight-bearing as per surgeon advice.',
    attendingDoctor: '',
    residentDoctor: '',
  };
}

// ─── Editable section field ───
const DocField = ({
  label, value, onChange, rows = 3, readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void; rows?: number; readOnly?: boolean;
}) => (
  <div className="mb-5">
    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 border-b border-slate-200 pb-1">
      {label}
    </div>
    {readOnly ? (
      <p className="text-sm text-slate-800 leading-relaxed min-h-[1.5rem]">{value || '—'}</p>
    ) : (
      <textarea
        rows={rows}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className="w-full text-sm text-slate-800 leading-relaxed resize-none border-0 border-b border-dashed border-slate-300 focus:border-blue-400 focus:outline-none bg-transparent py-1 placeholder-slate-300"
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    )}
  </div>
);

// ─── Discharge Document Form ───
const DischargeForm: React.FC<{
  patient: Patient;
  onUpdate: (p: Patient) => void;
  onBack: () => void;
  onReadmit: (p: Patient) => void;
}> = ({ patient, onUpdate, onBack, onReadmit }) => {
  const { hospitalName, department } = useConfig();
  const [summary, setSummary] = useState<DS>(
    patient.dischargeSummary || buildDefaultSummary(patient)
  );
  const [saved, setSaved] = useState(false);
  const [confirmReadmit, setConfirmReadmit] = useState(false);

  // Reset if patient changes
  useEffect(() => {
    setSummary(patient.dischargeSummary || buildDefaultSummary(patient));
  }, [patient.ipNo]);

  const update = useCallback((key: keyof DS, value: string) => {
    setSummary(s => ({ ...s, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    onUpdate({ ...patient, dischargeSummary: summary });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [patient, summary, onUpdate]);

  const handleExportPdf = useCallback(() => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pw - margin * 2;
    let y = 15;

    const checkPage = (needed: number) => {
      if (y + needed > ph - 15) { doc.addPage(); y = 20; }
    };

    const sectionHeader = (title: string) => {
      checkPage(14);
      doc.setFillColor(240, 242, 245);
      doc.rect(margin, y - 4, contentW, 8, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(title, margin + 2, y + 1);
      doc.setTextColor(0, 0, 0);
      y += 10;
    };

    const bodyText = (text: string, italic = false) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', italic ? 'italic' : 'normal');
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(text || '—', contentW - 4);
      lines.forEach((line: string) => {
        checkPage(6);
        doc.text(line, margin + 2, y);
        y += 5.5;
      });
      y += 2;
    };

    // ── Hospital Header ──
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pw, 28, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(hospitalName.toUpperCase(), pw / 2, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(department.toUpperCase(), pw / 2, 17, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DISCHARGE SUMMARY', pw / 2, 24, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y = 36;

    // ── Patient Info Grid ──
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    const col1 = margin;
    const col2 = pw / 2 + 2;
    const infoRows = [
      ['Name', patient.name, 'Age / Sex', `${patient.age}y / ${patient.gender}`],
      ['IP No', patient.ipNo, 'Ward / Bed', `${patient.ward} / Bed ${patient.bed}`],
      ['Date of Admission', patient.doa, 'Date of Discharge', patient.dod || new Date().toISOString().split('T')[0]],
      ['Consultant', summary.attendingDoctor || '________________', 'Resident', summary.residentDoctor || '________________'],
    ];
    infoRows.forEach(([l1, v1, l2, v2]) => {
      checkPage(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
      doc.text(`${l1}:`, col1, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
      doc.text(v1, col1 + 32, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
      doc.text(`${l2}:`, col2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
      doc.text(v2, col2 + 32, y);
      y += 7;
    });
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pw - margin, y);
    y += 6;

    // Mobile & phone
    if (patient.mobile) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
      doc.text('Contact:', col1, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
      doc.text(patient.mobile, col1 + 32, y);
      y += 8;
    }

    // ── Document Sections ──
    sectionHeader('DIAGNOSIS');
    bodyText(patient.diagnosis);

    if (patient.procedure) {
      sectionHeader('PROCEDURE / OPERATION DONE');
      bodyText(patient.procedure + (patient.dos ? `  (Date: ${patient.dos})` : ''));
    }

    if (patient.comorbidities.length > 0) {
      sectionHeader('COMORBIDITIES');
      bodyText(patient.comorbidities.join(', '));
    }

    sectionHeader('HOSPITAL COURSE');
    bodyText(summary.hospitalCourse);

    sectionHeader('CONDITION AT DISCHARGE');
    bodyText(summary.conditionAtDischarge);

    sectionHeader('DISCHARGE MEDICATIONS');
    bodyText(summary.dischargeMedications);

    sectionHeader('WOUND CARE');
    bodyText(summary.woundCare);

    sectionHeader('ACTIVITY RESTRICTIONS');
    bodyText(summary.restrictions);

    sectionHeader('FOLLOW-UP INSTRUCTIONS');
    bodyText(summary.followUpInstructions);
    if (summary.followUpDate) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(`Follow-Up Date: `, margin + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.text(summary.followUpDate, margin + 35, y);
      y += 8;
    }

    // ── Signature area ──
    checkPage(30);
    y += 8;
    doc.setDrawColor(150, 150, 150);
    doc.line(margin + 5, y, margin + 55, y);
    doc.line(pw - margin - 55, y, pw - margin - 5, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
    doc.text('Consultant Signature', margin + 5, y);
    doc.text('Resident Signature', pw - margin - 55, y);

    doc.save(`DischargeSummary_${patient.ipNo}_${patient.dod || 'draft'}.pdf`);
  }, [patient, summary]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> All Discharged Patients
        </button>
        <div className="flex items-center gap-2">
          {/* Readmit — inline confirm so it can't be triggered accidentally */}
          {confirmReadmit ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-800">Readmit to ward?</span>
              <button
                onClick={() => { setConfirmReadmit(false); onReadmit(patient); }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded transition-colors"
              >
                Yes, readmit
              </button>
              <button
                onClick={() => setConfirmReadmit(false)}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReadmit(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Readmit to Ward
            </button>
          )}
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Discharged badge */}
      {patient.patientStatus === PatientStatus.Discharged && patient.dod && (
        <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 border border-teal-100 rounded-lg text-sm text-teal-700">
          <CheckCircle className="w-4 h-4 text-teal-500" />
          Patient discharged on <span className="font-bold">{patient.dod}</span>
          &nbsp;• {Math.floor((Date.now() - new Date(patient.doa).getTime()) / (1000 * 60 * 60 * 24))} days admitted
        </div>
      )}

      {/* ── Document ── */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden max-w-4xl mx-auto">
        {/* Document Header */}
        <div className="bg-slate-800 text-white text-center py-5 px-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-300 mb-0.5">
            {hospitalName}
          </p>
          <p className="text-sm font-medium text-slate-200">{department}</p>
          <h1 className="text-xl font-bold tracking-wide mt-2">DISCHARGE SUMMARY</h1>
        </div>

        <div className="p-6 md:p-8">
          {/* Patient Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mb-6 pb-5 border-b border-slate-200 text-sm">
            {[
              ['Name', patient.name],
              ['Age / Sex', `${patient.age}y / ${patient.gender}`],
              ['IP No', patient.ipNo],
              ['Ward / Bed', `${patient.ward} / Bed ${patient.bed}`],
              ['Date of Admission', patient.doa],
              ['Date of Discharge', patient.dod || <span className="text-slate-400 italic">Not yet discharged</span>],
              ['Contact', patient.mobile],
              ['Comorbidities', patient.comorbidities.join(', ') || 'None'],
            ].map(([label, val]) => (
              <div key={String(label)}>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                <span className="text-slate-800 font-medium">{val}</span>
              </div>
            ))}
          </div>

          {/* Doctor fields — inline editable */}
          <div className="grid grid-cols-2 gap-4 mb-6 pb-5 border-b border-slate-200">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Consultant / Attending Doctor</label>
              <input
                type="text"
                value={summary.attendingDoctor}
                onChange={e => update('attendingDoctor', e.target.value)}
                placeholder="Dr. ..."
                className="w-full text-sm border-0 border-b border-dashed border-slate-300 focus:border-blue-400 focus:outline-none bg-transparent py-1 text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Resident Doctor</label>
              <input
                type="text"
                value={summary.residentDoctor}
                onChange={e => update('residentDoctor', e.target.value)}
                placeholder="Dr. ..."
                className="w-full text-sm border-0 border-b border-dashed border-slate-300 focus:border-blue-400 focus:outline-none bg-transparent py-1 text-slate-800"
              />
            </div>
          </div>

          {/* Fixed: Diagnosis & Procedure */}
          <DocField label="Diagnosis" value={patient.diagnosis} readOnly />
          {patient.procedure && (
            <DocField
              label={`Procedure / Operation Done${patient.dos ? ` (Date: ${patient.dos})` : ''}`}
              value={patient.procedure}
              readOnly
            />
          )}

          {/* Editable sections */}
          <DocField
            label="Hospital Course"
            value={summary.hospitalCourse}
            onChange={v => update('hospitalCourse', v)}
            rows={6}
          />
          <DocField
            label="Condition at Discharge"
            value={summary.conditionAtDischarge}
            onChange={v => update('conditionAtDischarge', v)}
            rows={2}
          />
          <DocField
            label="Discharge Medications"
            value={summary.dischargeMedications}
            onChange={v => update('dischargeMedications', v)}
            rows={5}
          />
          <DocField
            label="Wound Care"
            value={summary.woundCare}
            onChange={v => update('woundCare', v)}
            rows={2}
          />
          <DocField
            label="Activity Restrictions"
            value={summary.restrictions}
            onChange={v => update('restrictions', v)}
            rows={2}
          />
          <DocField
            label="Follow-Up Instructions"
            value={summary.followUpInstructions}
            onChange={v => update('followUpInstructions', v)}
            rows={2}
          />
          <div className="mb-5">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1 border-b border-slate-200 pb-1">
              Follow-Up Appointment Date
            </label>
            <input
              type="date"
              value={summary.followUpDate}
              onChange={e => update('followUpDate', e.target.value)}
              className="text-sm border-0 border-b border-dashed border-slate-300 focus:border-blue-400 focus:outline-none bg-transparent py-1 text-slate-800"
            />
          </div>

          {/* Signature area */}
          <div className="grid grid-cols-2 gap-8 mt-10 pt-5 border-t-2 border-slate-300">
            <div className="text-center">
              <div className="h-12 border-b-2 border-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Consultant Signature</p>
              {summary.attendingDoctor && (
                <p className="text-xs text-slate-500 mt-0.5">{summary.attendingDoctor}</p>
              )}
            </div>
            <div className="text-center">
              <div className="h-12 border-b-2 border-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Resident Signature</p>
              {summary.residentDoctor && (
                <p className="text-xs text-slate-500 mt-0.5">{summary.residentDoctor}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Discharged Patient List ───
const DischargedList: React.FC<{
  patients: Patient[];
  onSelect: (id: string) => void;
  onReadmit: (p: Patient) => void;
}> = ({ patients, onSelect, onReadmit }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    patients.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.ipNo.includes(search) ||
      p.diagnosis.toLowerCase().includes(search.toLowerCase())
    ),
    [patients, search]
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, IP No, diagnosis..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center text-slate-400">
          <LogOut className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">{patients.length === 0 ? 'No discharged patients yet.' : 'No results found.'}</p>
        </div>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="sm:hidden space-y-3">
            {filtered.map(patient => {
              const stayDays = patient.dod && patient.doa
                ? Math.round((new Date(patient.dod).getTime() - new Date(patient.doa).getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const hasSummary = !!patient.dischargeSummary;
              return (
                <div key={patient.ipNo} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{patient.name}</p>
                      <p className="text-xs text-slate-500">{patient.age}y / {patient.gender} · IP: {patient.ipNo}</p>
                      <p className="text-xs text-slate-400">{patient.ward} / Bed {patient.bed}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {stayDays !== null && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-medium">{stayDays}d</span>
                      )}
                      {hasSummary
                        ? <span className="text-xs text-teal-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Done</span>
                        : <span className="text-xs text-amber-500">Pending</span>}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2">{patient.diagnosis}</p>
                  <div className="text-xs text-slate-400 flex gap-3">
                    <span>Admitted: {patient.doa}</span>
                    <span>Discharged: {patient.dod || '—'}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => onReadmit(patient)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" /> Readmit
                    </button>
                    <button
                      onClick={() => onSelect(patient.ipNo)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold bg-slate-800 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" /> {hasSummary ? 'Edit Summary' : 'Create Summary'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Patient</th>
                    <th className="px-5 py-3">Diagnosis</th>
                    <th className="px-5 py-3 whitespace-nowrap">Admission</th>
                    <th className="px-5 py-3 whitespace-nowrap">Discharge</th>
                    <th className="px-5 py-3">Stay</th>
                    <th className="px-5 py-3">Summary</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(patient => {
                    const stayDays = patient.dod && patient.doa
                      ? Math.round((new Date(patient.dod).getTime() - new Date(patient.doa).getTime()) / (1000 * 60 * 60 * 24))
                      : null;
                    const hasSummary = !!patient.dischargeSummary;
                    return (
                      <tr key={patient.ipNo} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{patient.name}</div>
                          <div className="text-xs text-slate-500">{patient.age}y / {patient.gender} • IP: {patient.ipNo}</div>
                          <div className="text-xs text-slate-400">{patient.ward} / Bed {patient.bed}</div>
                        </td>
                        <td className="px-5 py-4 max-w-xs">
                          <p className="text-slate-700 truncate" title={patient.diagnosis}>{patient.diagnosis}</p>
                          {patient.procedure && <p className="text-xs text-slate-400 truncate">{patient.procedure}</p>}
                        </td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{patient.doa}</td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{patient.dod || '—'}</td>
                        <td className="px-5 py-4">
                          {stayDays !== null ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-medium">{stayDays}d</span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          {hasSummary ? (
                            <span className="flex items-center gap-1 text-xs text-teal-600"><CheckCircle className="w-3.5 h-3.5" /> Completed</span>
                          ) : (
                            <span className="text-xs text-amber-500">Pending</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              onClick={() => onReadmit(patient)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Readmit to ward"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Readmit
                            </button>
                            <button
                              onClick={() => onSelect(patient.ipNo)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" /> {hasSummary ? 'Edit Summary' : 'Create Summary'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main View ───
const DischargeSummaryView: React.FC = () => {
  const { patients, navigateTo, navParams, updatePatient } = useApp();

  const dischargedPatients = useMemo(() =>
    patients
      .filter(p => p.patientStatus === PatientStatus.Discharged)
      .sort((a, b) => (b.dod || b.doa).localeCompare(a.dod || a.doa)),
    [patients]
  );

  const selectedPatient = useMemo(() =>
    navParams.id ? patients.find(p => p.ipNo === navParams.id) : null,
    [patients, navParams.id]
  );

  const handleReadmit = useCallback((patient: Patient) => {
    updatePatient({ ...patient, patientStatus: PatientStatus.Fit, dod: undefined });
    navigateTo('dashboard');
  }, [updatePatient, navigateTo]);

  if (selectedPatient) {
    return (
      <DischargeForm
        patient={selectedPatient}
        onUpdate={updatePatient}
        onBack={() => navigateTo('discharge')}
        onReadmit={handleReadmit}
      />
    );
  }

  return (
    <DischargedList
      patients={dischargedPatients}
      onSelect={id => navigateTo('discharge', { id })}
      onReadmit={handleReadmit}
    />
  );
};

export default DischargeSummaryView;
