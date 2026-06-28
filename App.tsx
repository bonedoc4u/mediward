import React, { useState, useMemo, useCallback, lazy, Suspense, useEffect } from 'react';
import { useAuth, usePatients, useUI, useConfig } from './contexts/AppContext';
import { Patient, ViewMode } from './types';
import { can } from './utils/permissions';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import HospitalRegisterPage from './components/HospitalRegisterPage';
import SuperAdminPanel from './components/SuperAdminPanel';
import DepartmentPicker from './components/DepartmentPicker';
import UnitPicker from './components/UnitPicker';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationCenter from './components/NotificationCenter';
import GlobalSearch from './components/GlobalSearch';
import WardSkeleton from './components/WardSkeleton';
import ToastContainer from './components/ToastContainer';
import {
  LayoutDashboard, FileImage, Menu, X, Home, ClipboardList, Database,
  Activity, Users, HeartPulse, LogOut, Stethoscope, ListChecks, Syringe,
  Loader2, Shield, Settings
} from 'lucide-react';

// Lazy load heavy components
const WardDashboard = lazy(() => import('./components/WardDashboard'));
const RadiologyComparator = lazy(() => import('./components/RadiologyComparator'));
const LabTrends = lazy(() => import('./components/LabTrends'));
const TeamManagement = lazy(() => import('./components/TeamManagement'));
const AddPatientModal = lazy(() => import('./components/AddPatientModal'));
const DailyRounds = lazy(() => import('./components/DailyRounds'));
const PacManagement = lazy(() => import('./components/PacManagement'));
const AiClinicalAssistant = lazy(() => import('./components/AiClinicalAssistant'));
const OTListManagement = lazy(() => import('./components/OTListManagement'));
const PreOpPrep = lazy(() => import('./components/PreOpPrep'));
const PatientDetail = lazy(() => import('./components/PatientDetail'));
const DischargeSummaryView = lazy(() => import('./components/DischargeSummary'));
const RoundMode = lazy(() => import('./components/RoundMode'));
const AuditLogViewer = lazy(() => import('./components/AuditLogViewer'));
const AdminSettings = lazy(() => import('./components/AdminSettings'));
const StatusPage = lazy(() => import('./components/StatusPage'));
import OfflineBanner from './components/OfflineBanner';
import { NetworkBanner } from './components/NetworkBanner';
import PwaInstallBanner from './components/PwaInstallBanner';
import SwUpdateBanner from './components/SwUpdateBanner';
import IosInstallModal from './components/IosInstallModal';
import ClinicalDisclaimer, { hasAcceptedDisclaimer } from './components/ClinicalDisclaimer';
import ConcurrentEditModal from './components/ConcurrentEditModal';
import LegalPage from './components/LegalPage';

// ─── Lock Screen ─────────────────────────────────────────────────────────────
// Shown when the tab/device is hidden for >60 s. Requires password re-entry
// so the next person who picks up a shared tablet cannot see PHI.
const LockScreen: React.FC<{
  userName: string;
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
}> = ({ userName, onUnlock, onLogout }) => {
  const [password, setPassword] = React.useState('');
  const [error, setError]       = React.useState('');
  const [loading, setLoading]   = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    const result = await onUnlock(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Incorrect password');
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-[9999] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-2">
            <Shield className="w-7 h-7 text-slate-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Session Locked</h2>
          <p className="text-sm text-slate-500">
            Enter your password to continue as <span className="font-medium text-slate-700">{userName}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {error && <p className="text-xs text-red-600 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Verifying…' : 'Unlock'}
          </button>
        </form>
        <button
          onClick={onLogout}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Not you? Log out and switch user
        </button>
      </div>
    </div>
  );
};

// ─── Navigation Config ───
interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.ComponentType<any>;
  section: string;
}

// Static nav items — PAC/OT labels are dynamically set inside App using config
const BASE_NAV_ITEMS_LEFT: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard, section: 'Overview' },
  { id: 'pending',   label: 'Pending List', icon: ClipboardList,   section: 'Overview' },
  { id: 'master',    label: 'Master List',  icon: Database,        section: 'Overview' },
  { id: 'discharge', label: 'Discharge',    icon: LogOut,          section: 'Overview' },
  { id: 'wenthome',  label: 'Went Home',   icon: Home,            section: 'Overview' },
  { id: 'rounds',    label: 'Daily Rounds', icon: ListChecks,      section: 'Clinical Tools' },
  { id: 'labs',      label: 'Lab Trends',   icon: Activity,        section: 'Clinical Tools' },
  { id: 'radiology', label: 'Radiology',    icon: FileImage,       section: 'Clinical Tools' },
];
const BASE_NAV_ITEMS_RIGHT: NavItem[] = [
  { id: 'preop',    label: 'Pre-Op Prep',    icon: Syringe,  section: 'Surgical' },
  { id: 'team',     label: 'Team Settings',  icon: Users,    section: 'Admin' },
  { id: 'audit',    label: 'Audit Log',      icon: Shield,   section: 'Admin' },
  { id: 'settings', label: 'Configuration', icon: Settings, section: 'Admin' },
];

// ─── Loading Fallback ───
const ViewLoader = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
  </div>
);

// ─── Main App ───
const App: React.FC = () => {
  const {
    isAuthenticated, isRecoveryMode, isLocked, unlock, user, login, logout,
    viewingHospitalId, viewingHospitalName, setViewingHospital,
    selectedDepartment, selectedUnit, setSelectedDepartment, setSelectedUnit, clearWorkspaceSelection,
  } = useAuth();
  const [showRegister, setShowRegister] = useState(
    () => window.location.hash === '#/register',
  );
  const [showStatus, setShowStatus] = useState(
    () => window.location.hash === '#/status',
  );
  const [showPrivacy, setShowPrivacy] = useState(
    () => window.location.hash === '#/privacy',
  );
  const [showTerms, setShowTerms] = useState(
    () => window.location.hash === '#/terms',
  );
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(() => hasAcceptedDisclaimer());
  const [superAdminMode, setSuperAdminMode] = useState(false);
  const {
    patients, isLoadingPatients, updatePatient, addPatient,
    addLabResult, addInvestigation, deleteInvestigation,
    hasMore, isLoadingMore, loadMorePatients, saveRound,
    concurrentEditConflict, resolveConcurrentEdit, realtimeStatus,
  } = usePatients();
  const {
    currentView, navigateTo, navParams,
    isMobileMenuOpen, setIsMobileMenuOpen, isTransitioning,
  } = useUI();
  const { preOpModuleName, procedureListName, department, hospitalName, unitOptions } = useConfig();

  const mobileTabs = useMemo(() => [
    { id: 'dashboard' as ViewMode, label: 'Ward',                icon: LayoutDashboard },
    { id: 'rounds'    as ViewMode, label: 'Rounds',              icon: ListChecks      },
    { id: 'otlist'    as ViewMode, label: procedureListName,     icon: ClipboardList   },
    { id: 'pac'       as ViewMode, label: preOpModuleName,       icon: HeartPulse      },
  ], [preOpModuleName, procedureListName]);

  const navItems = useMemo((): NavItem[] => [
    ...BASE_NAV_ITEMS_LEFT,
    { id: 'pac',    label: preOpModuleName,   icon: HeartPulse,   section: 'Surgical' },
    { id: 'otlist', label: procedureListName, icon: ClipboardList, section: 'Surgical' },
    ...BASE_NAV_ITEMS_RIGHT,
  ], [preOpModuleName, procedureListName]);

  const viewMeta = useMemo(() => ({
    dashboard:    { title: 'Ward Dashboard',        description: 'Managing active In-Patients' },
    pending:      { title: 'Pending List',           description: 'Active patients awaiting procedure (Pre-op)' },
    master:       { title: 'Master Patient List',    description: 'Complete registry of Active and Discharged patients' },
    radiology:    { title: 'Radiology',              description: 'Upload and view X-Rays, CTs and MRI scans' },
    labs:         { title: 'Clinical Lab Trends',    description: 'Track lab results and inflammatory markers' },
    team:         { title: 'Team Settings',          description: 'Manage access controls and team permissions' },
    rounds:       { title: 'Daily Rounds',           description: 'Daily checklist, status updates and orders' },
    pac:          { title: preOpModuleName,           description: 'Pre-operative clearance and fitness assessment' },
    preop:        { title: 'Pre-Op Preparation',     description: 'Pre-Operative Preparation Checklists for Scheduled Cases' },
    otlist:       { title: procedureListName,         description: 'Manage scheduled procedures and surgery lists' },
    patient:      { title: 'Patient Detail',          description: 'Comprehensive patient overview' },
    discharge:    { title: 'Discharge',               description: 'Discharge summaries for all discharged patients' },
    wenthome:     { title: 'Went Home',              description: 'Patients sent home temporarily — not formally discharged' },
    'round-mode': { title: 'Ward Rounds',             description: 'Bedside round mode — swipe through patients' },
    audit:        { title: 'Audit Log',               description: 'System audit trail — all actions logged by user and time' },
    settings:     { title: 'Configuration',            description: 'Hospital settings, department presets, wards, units and lab types' },
  }), [preOpModuleName, procedureListName]);

  // iOS PWA install prompt
  const [showIosInstall, setShowIosInstall] = useState(false);
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true;
    const dismissed = localStorage.getItem('mediward_ios_install_dismissed');
    if (isIos && !isStandalone && !dismissed) {
      // Show after 30 seconds to not be intrusive
      const t = setTimeout(() => setShowIosInstall(true), 30_000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  // Modal State (kept local since it's UI-only)
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const handleSavePatient = useCallback((patient: Patient) => {
    if (editingPatient) {
      updatePatient(patient);
      setEditingPatient(null);
    } else {
      addPatient(patient);
    }
    setIsAddPatientModalOpen(false);
  }, [editingPatient, updatePatient, addPatient]);

  const openAddModal = useCallback(() => {
    setEditingPatient(null);
    setIsAddPatientModalOpen(true);
    setIsMobileMenuOpen(false);
  }, []);

  const openEditModal = useCallback((patient: Patient) => {
    setEditingPatient(patient);
    setIsAddPatientModalOpen(true);
    setIsMobileMenuOpen(false);
  }, []);

  const meta = viewMeta[currentView as keyof typeof viewMeta] ?? viewMeta.dashboard;

  // ─── Capacitor native hooks ───
  useEffect(() => {
    // Set status bar to light text on dark background (matches dark header)
    StatusBar.setStyle({ style: StatusBarStyle.Light }).catch(() => {/* web — no-op */});
    StatusBar.setBackgroundColor({ color: '#1e293b' }).catch(() => {/* web — no-op */}); // Slate 800

    // Android hardware back button handler
    const subscription = CapApp.addListener('backButton', () => {
      // Priority: close overlays first (highest → lowest), then navigate, then exit
      if (concurrentEditConflict) {
        resolveConcurrentEdit('remote'); // dismiss conflict = keep server version
        return;
      }
      if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        return;
      }
      if (isAddPatientModalOpen) {
        setIsAddPatientModalOpen(false);
        return;
      }
      if (currentView !== 'dashboard') {
        navigateTo('dashboard');
        return;
      }
      // On dashboard root — confirm exit
      if (window.confirm('Exit MediWard?')) {
        CapApp.exitApp();
      }
    });

    return () => {
      subscription.then(h => h.remove()).catch(() => {});
    };
  }, [concurrentEditConflict, resolveConcurrentEdit, isMobileMenuOpen, isAddPatientModalOpen, currentView, setIsMobileMenuOpen, navigateTo]);

  // Group nav items by section — filter Team Settings to admin only
  const navSections = useMemo(() => {
    const sections: Record<string, NavItem[]> = {};
    navItems
      .filter(item => (item.id !== 'team' && item.id !== 'audit' && item.id !== 'settings') || can(user, 'team:manage'))
      .forEach(item => {
        if (!sections[item.section]) sections[item.section] = [];
        sections[item.section].push(item);
      });
    return sections;
  }, [user, navItems]);

  // ─── Auth Guard ───
  // Password reset email link — show the reset form regardless of auth state
  if (isRecoveryMode) {
    return (
      <>
        <ResetPasswordPage onDone={() => { window.location.hash = ''; window.location.reload(); }} />
        <ToastContainer />
      </>
    );
  }

  // Lock screen — shown when the device was idle/hidden for >60 s on a shared tablet
  if (isAuthenticated && isLocked) {
    return (
      <LockScreen
        userName={user?.name ?? ''}
        onUnlock={async (password) => {
          const result = await login(user?.email ?? '', password);
          if (result.success) unlock();
          return result;
        }}
        onLogout={logout}
      />
    );
  }

  if (!isAuthenticated) {
    if (showPrivacy) {
      return <LegalPage type="privacy" onBack={() => { setShowPrivacy(false); window.location.hash = ''; }} />;
    }
    if (showTerms) {
      return <LegalPage type="terms" onBack={() => { setShowTerms(false); window.location.hash = ''; }} />;
    }
    if (showStatus) {
      return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>}>
          <StatusPage onBack={() => { setShowStatus(false); window.location.hash = ''; }} />
        </Suspense>
      );
    }
    if (showRegister) {
      return (
        <HospitalRegisterPage
          onBack={() => {
            setShowRegister(false);
            window.location.hash = '#/dashboard';
          }}
        />
      );
    }
    return (
      <LoginPage
        onRegister={() => {
          setShowRegister(true);
          window.location.hash = '#/register';
        }}
        onStatus={() => {
          setShowStatus(true);
          window.location.hash = '#/status';
        }}
        onPrivacy={() => {
          setShowPrivacy(true);
          window.location.hash = '#/privacy';
        }}
        onTerms={() => {
          setShowTerms(true);
          window.location.hash = '#/terms';
        }}
      />
    );
  }

  // ─── Clinical Disclaimer (first login) ───
  if (!disclaimerAccepted) {
    return <ClinicalDisclaimer onAccept={() => setDisclaimerAccepted(true)} />;
  }

  // ─── Department Picker (superadmin must choose a department on every fresh login) ───
  if (user?.role === 'superadmin' && !selectedDepartment) {
    return (
      <>
        <DepartmentPicker
          userName={user.name}
          hospitalName={hospitalName || 'Kozhikode Medical College'}
          onSelect={(dept) => setSelectedDepartment(dept)}
        />
        <ToastContainer />
      </>
    );
  }

  // ─── Unit Picker (admin must choose a unit on every fresh login) ───
  if (user?.role === 'admin' && !selectedUnit) {
    const deptLabel = department || 'Dept. of Orthopaedics';
    return (
      <>
        <UnitPicker
          userName={user.name}
          hospitalName={hospitalName || 'Kozhikode Medical College'}
          departmentName={deptLabel}
          units={unitOptions.length > 0 ? unitOptions : ['OR1', 'OR2', 'OR3', 'OR4', 'OR5']}
          onSelect={(unit) => setSelectedUnit(unit)}
        />
        <ToastContainer />
      </>
    );
  }

  // ─── Super Admin ───
  if (user?.role === 'superadmin' && superAdminMode) {
    return (
      <SuperAdminPanel
        onSwitchToApp={() => setSuperAdminMode(false)}
        onViewWorkspace={(id, name) => { setViewingHospital(id, name); setSuperAdminMode(false); }}
      />
    );
  }

  // ─── Render View ───
  const renderView = () => {
    switch (currentView) {
      case 'discharge':
        return <DischargeSummaryView />;
      case 'round-mode':
        return <RoundMode />;
      case 'audit':
        return <AuditLogViewer />;
      case 'settings':
        return <AdminSettings />;
      case 'status':
        return <StatusPage onBack={() => navigateTo('settings')} />;
      case 'patient':
        return <PatientDetail />;
      case 'radiology':
        return (
          <RadiologyComparator
            patients={patients}
            onAddInvestigation={addInvestigation}
            onDeleteInvestigation={deleteInvestigation}
            initialPatientId={navParams.id || ''}
          />
        );
      case 'labs':
        return <LabTrends patients={patients} onAddResult={addLabResult} initialPatientId={navParams.id || ''} />;
      case 'rounds':
        return <DailyRounds patients={patients} onUpdatePatient={updatePatient} onSaveRound={saveRound} />;
      case 'team':
        return <TeamManagement onOpenSuperAdmin={user?.role === 'superadmin' ? () => { setViewingHospital(null); setSuperAdminMode(true); } : undefined} />;
      case 'pac':
        return <PacManagement patients={patients} onUpdatePatient={updatePatient} />;
      case 'preop':
        return <PreOpPrep patients={patients} onUpdatePatient={updatePatient} />;
      case 'otlist':
        return <OTListManagement patients={patients} onUpdatePatient={updatePatient} />;
      default:
        if (isLoadingPatients) return <WardSkeleton />;
        return (
          <WardDashboard
            patients={patients}
            viewMode={currentView === 'dashboard' ? 'home' : currentView as 'pending' | 'master' | 'wenthome'}
            onAddPatient={can(user, 'patient:add') ? openAddModal : undefined}
            onEditPatient={can(user, 'patient:edit') ? openEditModal : undefined}
            onViewPatient={(ipNo: string) => navigateTo('patient', { id: ipNo })}
            onStartRounds={() => navigateTo('round-mode')}
            onAddLab={async (ipNo, type, value, date) => {
              addLabResult(ipNo, { id: crypto.randomUUID(), date, type, value });
            }}
            onAssignDate={(ipNo, plannedDos) => {
              const patient = patients.find(p => p.ipNo === ipNo);
              if (patient) updatePatient({ ...patient, plannedDos });
            }}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMorePatients}
          />
        );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex flex-col md:flex-row">
      <style>{`
        :root {
          --bottom-nav-height: 56px;
          --safe-area-top: env(safe-area-inset-top, 0px);
          --safe-area-bottom: env(safe-area-inset-bottom, 0px);
          --content-bottom-pad: calc(var(--bottom-nav-height) + var(--safe-area-bottom) + 16px);
          --fab-bottom: calc(var(--bottom-nav-height) + var(--safe-area-bottom) + 16px);
        }
        * { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
        .glass-effect { background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
        .content-fade-in { animation: fadeIn 0.3s ease-out; }
        .content-slide-in { animation: slideInRight 0.25s ease-out; }
        /* Horizontal scroll fade indicator */
        .scroll-x-hint { -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); mask-image: linear-gradient(to right, black 85%, transparent 100%); }
        /* WKWebView: prevent sidebar jitter during momentum scroll on iOS — scoped to aside only */
        aside.sticky { -webkit-transform: translateZ(0); transform: translateZ(0); will-change: transform; }
        /* Print: hide chrome, expand content */
        @media print {
          nav, header, aside, .md\\:hidden, [data-no-print] { display: none !important; }
          main { height: auto !important; overflow: visible !important; padding: 0 !important; }
          body { background: white !important; }
          .shadow-md, .shadow-lg, .shadow-xl { box-shadow: none !important; }
        }
      `}</style>
      <NetworkBanner />
      <OfflineBanner />

      {/* ─── Mobile Header ─── */}
      <header className="md:hidden bg-slate-900 text-white sticky top-0 z-50">
        {/* Safe-area spacer: fills the status-bar height on notched / display-cutout phones.
            On Android with no notch env(safe-area-inset-top) = 0 so this div collapses to zero. */}
        <div style={{ height: 'env(safe-area-inset-top)' }} />
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Stethoscope className="w-5 h-5 text-teal-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold block leading-none">MediWard</span>
              <span className="text-[10px] text-slate-400 truncate block leading-none mt-0.5">{meta.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 hover:bg-slate-800 rounded-lg" aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}>
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Sidebar ─── */}
      <aside className={`
        fixed md:sticky top-0 left-0 h-screen w-72 bg-slate-900 z-[60]
        transform transition-transform duration-300 ease-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        flex flex-col overflow-hidden
      `}>
        {/* Logo */}
        <div className="p-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-teal-500 to-teal-700 p-2.5 rounded-xl shadow-lg shadow-teal-900/40">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-xl tracking-tight">MediWard</h1>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase truncate max-w-[148px]" title={department}>{department || 'Clinical Suite'}</p>
            </div>
          </div>
        </div>

        {/* User Badge */}
        {user && (
          <div className="mx-4 mb-2 px-3 py-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-[10px] text-slate-400 capitalize">{user.role}</p>
          </div>
        )}

        {/* Workspace selector — shows chosen department/unit with a "Change" button */}
        {user?.role === 'superadmin' && selectedDepartment && (
          <div className="mx-4 mb-4 px-3 py-2 bg-teal-900/30 rounded-lg border border-teal-700/30 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-teal-400 uppercase tracking-wider font-semibold">Department</p>
              <p className="text-xs text-teal-200 capitalize truncate">{selectedDepartment}</p>
            </div>
            <button
              onClick={() => clearWorkspaceSelection()}
              className="text-[10px] text-teal-400 hover:text-teal-200 font-semibold shrink-0 px-2 py-1 bg-teal-800/40 hover:bg-teal-700/50 rounded transition-colors"
            >
              Change
            </button>
          </div>
        )}
        {user?.role === 'admin' && selectedUnit && (
          <div className="mx-4 mb-4 px-3 py-2 bg-teal-900/30 rounded-lg border border-teal-700/30 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-teal-400 uppercase tracking-wider font-semibold">Unit</p>
              <p className="text-xs text-teal-200 truncate">
                {selectedUnit === 'all' ? 'All Units' : `Unit ${selectedUnit}`}
              </p>
            </div>
            <button
              onClick={() => clearWorkspaceSelection()}
              className="text-[10px] text-teal-400 hover:text-teal-200 font-semibold shrink-0 px-2 py-1 bg-teal-800/40 hover:bg-teal-700/50 rounded transition-colors"
            >
              Change
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 space-y-1">
          {Object.entries(navSections).map(([section, items]) => (
            <React.Fragment key={section}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-4 mt-5 flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-800"></div>
                <span>{section}</span>
                <div className="h-px flex-1 bg-slate-800"></div>
              </div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { navigateTo(item.id); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                    currentView === item.id
                      ? 'bg-teal-600/10 border border-teal-500/20 text-teal-400 border-l-2 border-l-teal-500'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white border border-transparent'
                  }`}
                >
                  <item.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span className="font-medium text-sm">{item.label}</span>
                  {currentView === item.id && (
                    <div className="ml-auto w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}

          {/* Logout */}
          <div className="pt-3 mt-3 border-t border-slate-800/50 space-y-1">
            {user?.role === 'superadmin' && (
              <button
                onClick={() => { setViewingHospital(null); setSuperAdminMode(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-purple-900/30 text-purple-300 hover:bg-purple-800/40 hover:text-purple-200 transition-all group border border-purple-700/30"
              >
                <Shield className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
                <span className="font-semibold text-sm">Super Admin Console</span>
              </button>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-all group"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="font-medium text-sm">Log Out</span>
            </button>
          </div>
        </nav>

        {/* Footer - Supabase sync indicator */}
        <div className="p-4 shrink-0 border-t border-slate-800/50">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <div className={`w-2 h-2 rounded-full ${
                realtimeStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                realtimeStatus === 'reconnecting' ? 'bg-amber-500 animate-pulse' :
                'bg-red-500'
              }`}></div>
              <span className="font-medium">
                {realtimeStatus === 'connected' ? 'Synced to Cloud' :
                 realtimeStatus === 'reconnecting' ? 'Reconnecting…' :
                 'Disconnected'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Supabase · Real-time sync · Session expires in 8 hours.
            </p>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 p-3 sm:p-4 md:p-8 md:h-screen overflow-y-auto min-w-0" style={{ height: 'calc(100svh - 56px - var(--safe-area-top, env(safe-area-inset-top, 0px)))' }}>
        <div className="max-w-7xl mx-auto" style={{ paddingBottom: 'var(--content-bottom-pad)' }}>

          {/* ─── Superadmin: Viewing another hospital banner ─── */}
          {user?.role === 'superadmin' && viewingHospitalId && (
            <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-purple-700 text-sm font-medium">
                <Shield className="w-4 h-4 shrink-0" />
                Viewing workspace: <span className="font-bold">{viewingHospitalName}</span>
              </div>
              <button
                onClick={() => { setViewingHospital(null); setSuperAdminMode(true); }}
                className="text-xs text-purple-600 hover:text-purple-800 font-bold px-3 py-1 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
              >
                ← Back to Console
              </button>
            </div>
          )}

          {/* Header — desktop only (mobile uses top app bar) */}
          <header className="hidden md:block mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-1">
                  {meta.title}
                </h2>
                <p className="text-slate-600 text-sm">{meta.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <GlobalSearch />
                <NotificationCenter />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Home className="w-4 h-4" />
              <span>/</span>
              <span className="text-teal-600 font-medium">{meta.title}</span>
            </div>
          </header>

          {/* View Content */}
          <div className={`${!isTransitioning
            ? (currentView === 'patient' || currentView === 'round-mode' ? 'content-slide-in' : 'content-fade-in')
            : 'opacity-0'} transition-opacity duration-200`}>
            <ErrorBoundary>
              <Suspense fallback={<ViewLoader />}>
                {renderView()}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </main>

      {/* ─── Add/Edit Patient Modal ─── */}
      <Suspense fallback={null}>
        <AddPatientModal
          isOpen={isAddPatientModalOpen}
          onClose={() => setIsAddPatientModalOpen(false)}
          onSave={handleSavePatient}
          initialData={editingPatient}
        />
      </Suspense>

      {/* ─── AI Assistant ─── */}
      <ErrorBoundary fallbackMessage="AI Assistant encountered an error.">
        <Suspense fallback={null}>
          <AiClinicalAssistant patients={patients} />
        </Suspense>
      </ErrorBoundary>

      {/* ─── Mobile Menu Overlay ─── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ─── Mobile Bottom Tab Bar ─── */}
      <PwaInstallBanner />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'var(--safe-area-bottom)' }}>
        <div className="grid grid-cols-5">
          {mobileTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { navigateTo(tab.id); setIsMobileMenuOpen(false); }}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-3 transition-colors ${
                currentView === tab.id ? 'text-teal-600' : 'text-slate-400 active:text-slate-600'
              }`}
            >
              {currentView === tab.id && (
                <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-teal-600 rounded-full" />
              )}
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
            </button>
          ))}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-3 transition-colors ${
              isMobileMenuOpen ? 'text-teal-600' : 'text-slate-400 active:text-slate-600'
            }`}
          >
            {isMobileMenuOpen && (
              <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-teal-600 rounded-full" />
            )}
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* ─── Concurrent Edit Conflict Modal ─── */}
      {concurrentEditConflict && (
        <ConcurrentEditModal
          conflict={concurrentEditConflict}
          onResolve={resolveConcurrentEdit}
        />
      )}

      {/* ─── iOS Install Guide ─── */}
      {showIosInstall && <IosInstallModal onClose={() => { setShowIosInstall(false); localStorage.setItem('mediward_ios_install_dismissed', '1'); }} />}

      {/* ─── SW Update Banner ─── */}
      <SwUpdateBanner />

      {/* ─── Toast Notifications ─── */}
      <ToastContainer />
    </div>
  );
};

export default App;
