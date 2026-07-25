/**
 * FractureClassificationSection.tsx — lists a patient's classified fractures
 * and lets a clinician add a fracture or assign a classification to one.
 * Computes the updated `fractures` array locally and saves it through the
 * generic `onUpdate` (= PatientContext.updatePatient) — same pattern
 * ComorbiditiesSection uses for `comorbidities`, no dedicated context
 * function needed since there's no archive/supersede behavior here.
 */
import React, { useState } from 'react';
import { Bone, Plus, X } from 'lucide-react';
import { Patient, Fracture } from '../../types';
import { FRACTURE_REGIONS } from '../../utils/fractureClassifications';
import { generateId } from '../../utils/sanitize';
import AddFractureSheet from './AddFractureSheet';
import AddClassificationSheet from './AddClassificationSheet';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
}

const regionLabel = (key: string) => FRACTURE_REGIONS.find(r => r.key === key)?.label ?? key;

const FractureClassificationSection: React.FC<Props> = ({ patient, canEdit, onUpdate }) => {
  const [showAddFracture, setShowAddFracture] = useState(false);
  const [classifyingFractureId, setClassifyingFractureId] = useState<string | null>(null);

  const fractures = patient.fractures ?? [];
  if (fractures.length === 0 && !canEdit) return null;

  const saveFractures = (next: Fracture[]) => onUpdate({ ...patient, fractures: next });

  const handleAddFracture = (region: string, side?: 'left' | 'right' | 'bilateral') => {
    saveFractures([...fractures, { id: generateId(), region, side, classifications: [] }]);
  };

  const handleRemoveFracture = (id: string) => {
    saveFractures(fractures.filter(f => f.id !== id));
  };

  const handleAddClassification = (fractureId: string, entry: { system: string; grade: string }) => {
    saveFractures(fractures.map(f =>
      f.id === fractureId ? { ...f, classifications: [...f.classifications, entry] } : f,
    ));
  };

  const handleRemoveClassification = (fractureId: string, index: number) => {
    saveFractures(fractures.map(f =>
      f.id === fractureId ? { ...f, classifications: f.classifications.filter((_, i) => i !== index) } : f,
    ));
  };

  const classifyingFracture = fractures.find(f => f.id === classifyingFractureId);
  const classifyingRegion = classifyingFracture ? FRACTURE_REGIONS.find(r => r.key === classifyingFracture.region) : undefined;

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2 flex items-center gap-1.5">
        <Bone className="w-3.5 h-3.5" /> Fracture classification
      </p>

      {fractures.length > 0 && (
        <ul className="space-y-2.5 mb-3">
          {fractures.map(f => (
            <li key={f.id} className="border border-line rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-ink">
                  {regionLabel(f.region)}{f.side ? ` (${f.side})` : ''}
                </span>
                {canEdit && (
                  <button onClick={() => handleRemoveFracture(f.id)} aria-label={`Remove ${regionLabel(f.region)}`} className="text-ink-faint hover:text-vital-critical-fg">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {f.classifications.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {f.classifications.map((c, i) => (
                    <span key={`${c.system}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-sunken text-ink-muted rounded text-xs">
                      {c.system} {c.grade}
                      {canEdit && (
                        <button onClick={() => handleRemoveClassification(f.id, i)} aria-label={`Remove ${c.system} ${c.grade}`} className="hover:text-vital-critical-fg">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canEdit && (
                <button
                  onClick={() => setClassifyingFractureId(f.id)}
                  className="flex items-center gap-1 text-xs font-bold text-accent-fg hover:text-accent-pressed"
                >
                  <Plus className="w-3 h-3" /> Add classification
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <button
          onClick={() => setShowAddFracture(true)}
          className="flex items-center justify-center gap-1.5 min-h-[44px] w-full px-3 py-2 bg-accent-soft rounded-xl text-xs font-bold text-accent-fg hover:bg-accent hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add fracture
        </button>
      )}

      {showAddFracture && (
        <AddFractureSheet onSave={handleAddFracture} onClose={() => setShowAddFracture(false)} />
      )}

      {classifyingFracture && classifyingRegion && (
        <AddClassificationSheet
          region={classifyingRegion}
          onSave={entry => handleAddClassification(classifyingFracture.id, entry)}
          onClose={() => setClassifyingFractureId(null)}
        />
      )}
    </div>
  );
};

export default FractureClassificationSection;
