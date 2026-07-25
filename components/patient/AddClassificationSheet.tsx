/**
 * AddClassificationSheet.tsx — assigns one classification to an existing
 * fracture. Offered systems: the region's own eponymous systems, plus
 * Gustilo-Anderson (always, for open fractures), plus AO/OTA (always).
 * AO/OTA is a structured bone+segment+type+group picker for the four
 * classic long bones (region.aoOtaBone set) and a free-text field
 * everywhere else — see the design spec's AO/OTA scope boundary.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';
import {
  FractureRegionDef, GUSTILO_ANDERSON, AO_OTA_TYPES, AO_OTA_GROUPS, buildAoOtaCode,
} from '../../utils/fractureClassifications';

interface Props {
  region: FractureRegionDef;
  onSave: (entry: { system: string; grade: string }) => void;
  onClose: () => void;
}

const AO_OTA = 'AO/OTA';

const AddClassificationSheet: React.FC<Props> = ({ region, onSave, onClose }) => {
  const [system, setSystem] = useState('');
  const [grade, setGrade] = useState('');
  const [aoType, setAoType] = useState('');
  const [aoGroup, setAoGroup] = useState('');
  const [aoFreeText, setAoFreeText] = useState('');

  const systemOptions = [
    ...region.systems.map(s => ({ value: s.name, label: s.name })),
    { value: GUSTILO_ANDERSON.name, label: GUSTILO_ANDERSON.name },
    { value: AO_OTA, label: AO_OTA },
  ];

  const selectedEponymous = region.systems.find(s => s.name === system);
  const gradeOptions = selectedEponymous?.grades ?? (system === GUSTILO_ANDERSON.name ? GUSTILO_ANDERSON.grades : []);

  const isAoOta = system === AO_OTA;
  const isStructuredAoOta = isAoOta && !!region.aoOtaBone;

  const canSave = system.length > 0 && (
    isStructuredAoOta ? (aoType.length > 0 && aoGroup.length > 0)
      : isAoOta ? aoFreeText.trim().length > 0
        : grade.length > 0
  );

  const handleSave = () => {
    const finalGrade = isStructuredAoOta
      ? buildAoOtaCode(region.aoOtaBone!, aoType, aoGroup)
      : isAoOta ? aoFreeText.trim() : grade;
    onSave({ system, grade: finalGrade });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add classification</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          System
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Classification system"
            value={system}
            options={systemOptions}
            onChange={val => { setSystem(val); setGrade(''); setAoType(''); setAoGroup(''); setAoFreeText(''); }}
            placeholder="Select system…"
          />
        </div>

        {isStructuredAoOta && (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Type
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="AO/OTA type"
                value={aoType}
                options={AO_OTA_TYPES.map(t => ({ value: t, label: t }))}
                onChange={setAoType}
                placeholder="A / B / C…"
              />
            </div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Group
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="AO/OTA group"
                value={aoGroup}
                options={AO_OTA_GROUPS.map(g => ({ value: g, label: g }))}
                onChange={setAoGroup}
                placeholder="1 / 2 / 3…"
              />
            </div>
          </>
        )}

        {isAoOta && !isStructuredAoOta && (
          <>
            <label htmlFor="ao-ota-free-text" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              AO/OTA code
            </label>
            <input
              id="ao-ota-free-text"
              type="text"
              value={aoFreeText}
              onChange={e => setAoFreeText(e.target.value)}
              placeholder="e.g. 62-B1"
              className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
            />
          </>
        )}

        {!isAoOta && system.length > 0 && (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Grade
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="Grade"
                value={grade}
                options={gradeOptions.map(g => ({ value: g, label: g }))}
                onChange={setGrade}
                placeholder="Select grade…"
              />
            </div>
          </>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save classification
        </button>
      </div>
    </div>
  );
};

export default AddClassificationSheet;
