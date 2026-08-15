import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Search, X, AlertTriangle } from 'lucide-react';
import { Patient } from '../types';
import EmergencyPatientView from './EmergencyPatientView';
import { toast } from '../utils/toast';

const GlobalSearch: React.FC = () => {
  const { patients, navigateTo, user, fetchEmergencyPatient } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Emergency (break-glass) access ───
  // Only relevant for unit-scoped users — admin/ICU (no unit) already see
  // every patient in the normal search above. Offered as a fallback once
  // normal search comes up empty, not as a general-purpose second search
  // bar: this is for a specific known IP number, not fishing.
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);
  const [emergencyIpNo, setEmergencyIpNo] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyPatient, setEmergencyPatient] = useState<Patient | null>(null);
  const [emergencyPatientReason, setEmergencyPatientReason] = useState('');

  const resetEmergencyForm = () => {
    setShowEmergencyForm(false);
    setEmergencyIpNo('');
    setEmergencyReason('');
  };

  const handleEmergencyLookup = async () => {
    if (!emergencyIpNo.trim() || !emergencyReason.trim()) return;
    setEmergencyLoading(true);
    try {
      const found = await fetchEmergencyPatient(emergencyIpNo.trim(), emergencyReason.trim());
      if (!found) {
        toast.error(`No patient found with IP number "${emergencyIpNo.trim()}" in this hospital.`);
        return;
      }
      setEmergencyPatientReason(emergencyReason.trim());
      setEmergencyPatient(found);
      setIsOpen(false);
      setQuery('');
      resetEmergencyForm();
    } catch {
      toast.error('Emergency lookup failed. Please try again.');
    } finally {
      setEmergencyLoading(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        resetEmergencyForm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();

    return patients
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ipNo.includes(q) ||
        p.bed.includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        (p.procedure || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, patients]);

  const handleSelect = (ipNo: string) => {
    navigateTo('patient', { id: ipNo });
    setIsOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 hover:bg-white/10 md:hover:bg-white/80 rounded-xl transition-all md:glass-effect flex items-center gap-2"
        title="Search (⌘K)"
        aria-label="Search patients"
      >
        <Search className="w-5 h-5 text-white md:text-slate-600" />
        <span className="hidden lg:inline text-xs text-slate-400">⌘K</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setIsOpen(false); setQuery(''); resetEmergencyForm(); }} />

          <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search patients by name, IP No, bed, diagnosis..."
                className="flex-1 text-sm outline-none placeholder:text-slate-400"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {query.length >= 2 && results.length === 0 && !showEmergencyForm && (
                <div className="p-6 text-center text-slate-400 text-sm space-y-3">
                  <p>No patients match "{query}" in your unit.</p>
                  {/* Break-glass fallback — only relevant for unit-scoped users;
                      admin/ICU (no unit) already see everyone in the search above. */}
                  {user?.unit && (
                    <button
                      onClick={() => { setShowEmergencyForm(true); setEmergencyIpNo(query); }}
                      className="flex items-center gap-2 mx-auto text-xs font-semibold text-amber-700 hover:text-amber-800 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Not finding them? Emergency access — search all patients in this hospital
                    </button>
                  )}
                </div>
              )}

              {showEmergencyForm && (
                <div className="p-4 space-y-3 bg-amber-50 border-y border-amber-200">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Emergency Access
                  </p>
                  <p className="text-xs text-amber-700">
                    This looks up a patient outside your unit, read-only, and is logged with the reason you give below.
                  </p>
                  <input
                    type="text"
                    placeholder="Patient IP number"
                    className="w-full text-sm p-2.5 border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    value={emergencyIpNo}
                    onChange={(e) => setEmergencyIpNo(e.target.value)}
                  />
                  <textarea
                    placeholder="Reason for access (required)"
                    rows={2}
                    className="w-full text-sm p-2.5 border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={resetEmergencyForm}
                      className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEmergencyLookup}
                      disabled={!emergencyIpNo.trim() || !emergencyReason.trim() || emergencyLoading}
                      className="flex-1 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                    >
                      {emergencyLoading ? 'Looking up…' : 'Access record'}
                    </button>
                  </div>
                </div>
              )}

              {results.map(p => (
                <button
                  key={p.ipNo}
                  onClick={() => handleSelect(p.ipNo)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-50"
                >
                  <div className="bg-slate-800 text-white w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                    {p.bed}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                      <span className="text-xs text-slate-400">IP: {p.ipNo}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{p.diagnosis}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {p.ward}
                  </span>
                </button>
              ))}

              {query.length < 2 && (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Type at least 2 characters to search
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {emergencyPatient && (
        <EmergencyPatientView
          patient={emergencyPatient}
          reason={emergencyPatientReason}
          onClose={() => setEmergencyPatient(null)}
        />
      )}
    </>
  );
};

export default GlobalSearch;
