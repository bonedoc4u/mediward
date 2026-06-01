/**
 * AdminSettings.tsx
 * Thin tab container. Each tab is a separate lazy-loaded component so only
 * the active panel is parsed and mounted — reducing initial JS on low-end
 * Android tablets from ~88 KB to ~8 KB for this shell.
 */
import React, { lazy, Suspense, useState } from 'react';
import { Building2, BedDouble, FlaskConical, Pill, Settings2 } from 'lucide-react';
import WardSkeleton from './WardSkeleton';

const HospitalSettings    = lazy(() => import('./settings/HospitalSettings'));
const WardSettings        = lazy(() => import('./settings/WardSettings'));
const LabSettings         = lazy(() => import('./settings/LabSettings'));
const MedicationSettings  = lazy(() => import('./settings/MedicationSettings'));
const AdvancedSettings    = lazy(() => import('./settings/AdvancedSettings'));

type Tab = 'hospital' | 'wards' | 'labs' | 'medications' | 'advanced';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'hospital',    label: 'Hospital',    icon: <Building2    className="w-4 h-4" /> },
  { id: 'wards',       label: 'Wards',       icon: <BedDouble    className="w-4 h-4" /> },
  { id: 'labs',        label: 'Labs',        icon: <FlaskConical className="w-4 h-4" /> },
  { id: 'medications', label: 'Medications', icon: <Pill         className="w-4 h-4" /> },
  { id: 'advanced',    label: 'Advanced',    icon: <Settings2    className="w-4 h-4" /> },
];

const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (sessionStorage.getItem('adminSettingsTab') as Tab | null) ?? 'hospital';
  });

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    sessionStorage.setItem('adminSettingsTab', tab);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Active panel — each mounts only when first selected */}
      <Suspense fallback={<WardSkeleton />}>
        {activeTab === 'hospital'    && <HospitalSettings />}
        {activeTab === 'wards'       && <WardSettings />}
        {activeTab === 'labs'        && <LabSettings />}
        {activeTab === 'medications' && <MedicationSettings />}
        {activeTab === 'advanced'    && <AdvancedSettings />}
      </Suspense>
    </div>
  );
};

export default AdminSettings;
