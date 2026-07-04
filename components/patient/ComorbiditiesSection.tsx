/**
 * ComorbiditiesSection.tsx — inline-editable comorbidities and drug allergies.
 * Free-text chips (add via Enter/＋, remove via ✕). Allergies are safety-critical
 * (they gate the medication chart), so they're editable here and audit-logged
 * through PatientContext.updatePatient.
 */
import React, { useEffect, useState } from 'react';
import { HeartPulse, Plus, X } from 'lucide-react';
import { Patient } from '../../types';
import EditableSectionCard from './EditableSectionCard';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
}

const ComorbiditiesSection: React.FC<Props> = ({ patient, canEdit, onUpdate }) => {
  const [comorbidities, setComorbidities] = useState<string[]>(patient.comorbidities);
  const [allergies, setAllergies] = useState<string[]>(patient.drugAllergies ?? []);

  useEffect(() => {
    setComorbidities(patient.comorbidities);
    setAllergies(patient.drugAllergies ?? []);
  }, [patient.ipNo]);

  const handleSave = (): string | null => {
    onUpdate({
      ...patient,
      comorbidities,
      drugAllergies: allergies.length ? allergies : undefined,
    });
    return null;
  };

  const handleCancel = () => {
    setComorbidities(patient.comorbidities);
    setAllergies(patient.drugAllergies ?? []);
  };

  const hasContent = patient.comorbidities.length > 0 || (patient.drugAllergies?.length ?? 0) > 0;

  return (
    <EditableSectionCard
      title="Comorbidities & allergies"
      icon={<HeartPulse className="w-3.5 h-3.5" />}
      canEdit={canEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      view={
        hasContent ? (
          <div className="space-y-2">
            {patient.comorbidities.length > 0 && (
              <ChipRow label="Comorbidities" items={patient.comorbidities} tone="slate" />
            )}
            {(patient.drugAllergies?.length ?? 0) > 0 && (
              <ChipRow label="Drug allergies" items={patient.drugAllergies!} tone="red" />
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">None recorded</p>
        )
      }
      edit={
        <div className="space-y-3">
          <ChipEditor label="Comorbidities" items={comorbidities} onChange={setComorbidities} tone="slate" placeholder="Add comorbidity…" />
          <ChipEditor label="Drug allergies" items={allergies} onChange={setAllergies} tone="red" placeholder="Add drug allergy…" />
        </div>
      }
    />
  );
};

// ── Read-only chip row ──
const TONE = {
  slate: 'bg-slate-100 text-slate-700',
  red: 'bg-red-50 text-red-700 border border-red-200',
} as const;

const ChipRow: React.FC<{ label: string; items: string[]; tone: keyof typeof TONE }> = ({ label, items, tone }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {items.map(c => (
        <span key={c} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${TONE[tone]}`}>{c}</span>
      ))}
    </div>
  </div>
);

// ── Editable chip input ──
const ChipEditor: React.FC<{
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  tone: keyof typeof TONE;
  placeholder: string;
}> = ({ label, items, onChange, tone, placeholder }) => {
  const [text, setText] = useState('');

  const add = () => {
    const v = text.trim();
    if (!v || items.some(i => i.toLowerCase() === v.toLowerCase())) { setText(''); return; }
    onChange([...items, v]);
    setText('');
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {items.map(c => (
          <span key={c} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${TONE[tone]}`}>
            {c}
            <button onClick={() => onChange(items.filter(i => i !== c))} aria-label={`Remove ${c}`} className="hover:text-red-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 min-h-[40px] border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button onClick={add} disabled={!text.trim()} aria-label={`Add to ${label}`} className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ComorbiditiesSection;
