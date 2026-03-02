import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Search, X, User, Activity, FileImage } from 'lucide-react';

const GlobalSearch: React.FC = () => {
  const { patients, navigateTo } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
        className="p-2 hover:bg-white/80 rounded-xl transition-all glass-effect flex items-center gap-2"
        title="Search (⌘K)"
      >
        <Search className="w-5 h-5 text-slate-600" />
        <span className="hidden lg:inline text-xs text-slate-400">⌘K</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setIsOpen(false); setQuery(''); }} />

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
              {query.length >= 2 && results.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No patients match "{query}"
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
    </>
  );
};

export default GlobalSearch;
