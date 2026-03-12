/**
 * NursingNotes.tsx
 * Nursing shift notes for a single patient.
 * Nurses add shift notes; doctors can view but not delete.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AppContext';
import { NursingNote, NursingShift } from '../types';
import { fetchNursingNotes, addNursingNote } from '../services/nursingNotesService';
import { ClipboardList, Plus, Save, Moon, Sun, Sunset } from 'lucide-react';

const SHIFT_CONFIG: Record<NursingShift, { icon: React.ReactNode; color: string; label: string }> = {
  Morning:   { icon: <Sun className="w-3.5 h-3.5" />,    color: 'bg-amber-50 text-amber-700 border-amber-200',   label: 'Morning' },
  Afternoon: { icon: <Sunset className="w-3.5 h-3.5" />, color: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Afternoon' },
  Night:     { icon: <Moon className="w-3.5 h-3.5" />,   color: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Night' },
};

interface Props {
  patientIpNo: string;
  hospitalId: string;
}

const NursingNotes: React.FC<Props> = ({ patientIpNo, hospitalId }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NursingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [shift, setShift] = useState<NursingShift>('Morning');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNursingNotes(patientIpNo)
      .then(setNotes)
      .finally(() => setLoading(false));
  }, [patientIpNo]);

  const handleAdd = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await addNursingNote({
        hospitalId, patientIpNo, shift,
        note: noteText.trim(),
        createdBy: user?.name ?? user?.email,
      });
      const updated = await fetchNursingNotes(patientIpNo);
      setNotes(updated);
      setNoteText('');
      setShowAdd(false);
    } finally { setSaving(false); }
  };

  // Detect current shift based on time
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 7 && h < 14) setShift('Morning');
    else if (h >= 14 && h < 21) setShift('Afternoon');
    else setShift('Night');
  }, []);

  const grouped = notes.reduce<Record<string, NursingNote[]>>((acc, n) => {
    const date = n.createdAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(n);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-teal-600" />
          <h3 className="font-bold text-slate-800 text-sm">Nursing Notes</h3>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Note
        </button>
      </div>

      {showAdd && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            {(['Morning','Afternoon','Night'] as NursingShift[]).map(s => (
              <button
                key={s}
                onClick={() => setShift(s)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  shift === s ? SHIFT_CONFIG[s].color + ' font-bold' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {SHIFT_CONFIG[s].icon} {s}
              </button>
            ))}
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={4}
            placeholder="Nursing observations, interventions, patient response..."
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-400 outline-none resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !noteText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-slate-400 text-sm">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No nursing notes yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([date, dayNotes]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{date}</p>
              <div className="space-y-2">
                {dayNotes.map(note => {
                  const cfg = SHIFT_CONFIG[note.shift];
                  return (
                    <div key={note.id} className="bg-white border border-slate-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(note.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {note.createdBy && ` · ${note.createdBy}`}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NursingNotes;
