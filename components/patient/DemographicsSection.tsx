/**
 * DemographicsSection.tsx — inline-editable demographics & admission details.
 * These fields previously required opening the full add/edit modal.
 * Saves route through the caller's onUpdate (PatientContext.updatePatient).
 */
import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { Patient, Gender, AdmissionSource } from '../../types';
import { validateName, validateAge, validateMobile } from '../../utils/patientValidation';
import EditableSectionCard from './EditableSectionCard';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
}

const INPUT =
  'w-full px-3 py-2.5 min-h-[44px] border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

interface Draft {
  name: string;
  age: string;
  gender: Gender;
  mobile: string;
  modeOfInjury: string;
  admissionSource: AdmissionSource | '';
}

const toDraft = (p: Patient): Draft => ({
  name: p.name,
  age: String(p.age ?? ''),
  gender: p.gender,
  mobile: p.mobile ?? '',
  modeOfInjury: p.modeOfInjury ?? '',
  admissionSource: p.admissionSource ?? '',
});

const DemographicsSection: React.FC<Props> = ({ patient, canEdit, onUpdate }) => {
  const [draft, setDraft] = useState<Draft>(() => toDraft(patient));

  // Reset the draft when a different patient is shown (sheet reuse / navigation).
  useEffect(() => { setDraft(toDraft(patient)); }, [patient.ipNo]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const handleSave = (): string | null => {
    const err = validateName(draft.name) ?? validateAge(draft.age) ?? validateMobile(draft.mobile);
    if (err) return err;
    onUpdate({
      ...patient,
      name: draft.name.trim(),
      age: parseInt(draft.age, 10),
      gender: draft.gender,
      mobile: draft.mobile.trim(),
      modeOfInjury: draft.modeOfInjury.trim() || undefined,
      admissionSource: draft.admissionSource || undefined,
    });
    return null;
  };

  return (
    <EditableSectionCard
      title="Demographics & admission"
      icon={<User className="w-3.5 h-3.5" />}
      canEdit={canEdit}
      onSave={handleSave}
      onCancel={() => setDraft(toDraft(patient))}
      view={
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field label="Name" value={patient.name} />
          <Field label="Age / sex" value={`${patient.age}y · ${patient.gender}`} />
          <Field label="Mobile" value={patient.mobile || '—'} />
          <Field label="Admission source" value={patient.admissionSource || '—'} />
          {patient.modeOfInjury && (
            <div className="col-span-2">
              <Field label="Mode of injury" value={patient.modeOfInjury} />
            </div>
          )}
        </div>
      }
      edit={
        <>
          <input className={INPUT} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Patient name" />
          <div className="grid grid-cols-2 gap-2">
            <input className={INPUT} type="number" inputMode="numeric" value={draft.age} onChange={e => set('age', e.target.value)} placeholder="Age" />
            <select className={INPUT} value={draft.gender} onChange={e => set('gender', e.target.value as Gender)}>
              {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <input className={INPUT} type="tel" inputMode="tel" value={draft.mobile} onChange={e => set('mobile', e.target.value)} placeholder="Mobile (optional)" />
          <input className={INPUT} value={draft.modeOfInjury} onChange={e => set('modeOfInjury', e.target.value)} placeholder="Mode of injury (optional)" />
          <select className={INPUT} value={draft.admissionSource} onChange={e => set('admissionSource', e.target.value as AdmissionSource | '')}>
            <option value="">Admission source (optional)</option>
            <option value="OPD">OPD</option>
            <option value="Casualty">Casualty</option>
          </select>
        </>
      }
    />
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
  </div>
);

export default DemographicsSection;
