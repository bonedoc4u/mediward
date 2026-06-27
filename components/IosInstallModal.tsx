/**
 * IosInstallModal.tsx
 * Step-by-step guide for installing MediWard as a PWA on iOS Safari.
 * Shown automatically on iOS if not already installed as standalone.
 */
import React from 'react';
import { X, Share, Plus, LayoutGrid } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const IosInstallModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[450] flex items-end justify-center bg-slate-900/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-sm rounded-t-2xl shadow-2xl pb-safe">
        {/* Handle bar */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-4" />

        <div className="px-6 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src="/icon-72.png" alt="" className="w-10 h-10 rounded-xl" />
              <div>
                <h2 className="font-bold text-slate-900 text-base">Install MediWard</h2>
                <p className="text-xs text-slate-500">For the best clinical experience</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close install guide">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="space-y-4">
            {[
              {
                icon: <Share className="w-5 h-5 text-teal-600" />,
                step: '1',
                title: 'Tap Share',
                desc: 'Tap the Share button at the bottom of Safari (the box with an arrow pointing up)',
              },
              {
                icon: <Plus className="w-5 h-5 text-teal-600" />,
                step: '2',
                title: 'Add to Home Screen',
                desc: 'Scroll down in the share menu and tap "Add to Home Screen"',
              },
              {
                icon: <LayoutGrid className="w-5 h-5 text-teal-600" />,
                step: '3',
                title: 'Open MediWard',
                desc: 'Tap Add, then open MediWard from your home screen — it works offline',
              },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-blue-700">{s.step}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{s.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button onClick={onClose}
            className="mt-6 w-full py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm min-h-[44px]">
            Got it
          </button>

          <p className="text-center text-xs text-slate-400 mt-3">Works on iOS 16.4+ with offline support</p>
        </div>
      </div>
    </div>
  );
};

export default IosInstallModal;
