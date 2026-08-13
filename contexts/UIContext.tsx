/**
 * UIContext.tsx
 * Owns navigation, mobile menu, transitions, and notifications.
 * Isolated so UI state changes (e.g. navigating views) don't re-render
 * patient-list or auth consumers.
 */

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo,
} from 'react';
import { ViewMode, AppNotification } from '../types';
import { generateNotifications } from '../utils/calculations';
import { useAuth } from './AuthContext';
import { usePatients } from './PatientContext';

// ─── Context Shape ───
interface UIContextType {
  currentView: ViewMode;
  navigateTo: (view: ViewMode, params?: Record<string, string>) => void;
  navParams: Record<string, string>;
  isTransitioning: boolean;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  refreshNotifications: () => void;
}

// Views whose patient list must be complete, not just the fast paginated
// first page: every ward-grouped/tabbed view (dashboard, pending, wenthome)
// needs to know about ALL active patients to bucket them into the correct
// ward and show accurate per-ward counts — a patient who happens to fall
// outside the most-recently-created page would otherwise silently vanish
// from their own ward's tab. Master/Discharge/Admissions need the same for
// historical completeness (see the comment where this is used).
function needsFullPatientList(view: ViewMode): boolean {
  return view === 'dashboard' || view === 'pending' || view === 'wenthome'
    || view === 'master' || view === 'discharge' || view === 'admissions';
}

const UIContext = createContext<UIContextType | null>(null);

export function useUI(): UIContextType {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}

// ─── Provider ───
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { patients, loadAllPatients } = usePatients();

  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    return (hash as ViewMode) || 'dashboard';
  });
  const [navParams, setNavParams]             = useState<Record<string, string>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications]     = useState<AppNotification[]>([]);

  // ─── Hash-based Routing ───
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      const [view, ...paramParts] = hash.split('/');
      if (view) {
        setCurrentView(view as ViewMode);
        if (paramParts.length > 0) setNavParams({ id: paramParts[0] });
        else setNavParams({});
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ─── Full patient list on direct landing ───
  // currentView's initializer reads the URL hash directly, bypassing
  // navigateTo entirely — the common case of opening the app straight to
  // the dashboard (or reloading while already there) would otherwise only
  // ever get the fast paginated first page, with no navigation event to
  // trigger the full-list load below.
  useEffect(() => {
    if (needsFullPatientList(currentView)) {
      loadAllPatients().catch(err => console.error('[UI] Failed to load all patients:', err));
    }
    // Intentionally mount-only — subsequent view changes are covered by
    // navigateTo's own trigger, not by re-running this on every render.

  }, []);

  // ─── Notifications: regenerate when patients or user changes ───
  const refreshNotifications = useCallback(() => {
    setNotifications(generateNotifications(patients));
  }, [patients]);

  useEffect(() => {
    if (user) refreshNotifications();
  }, [user, refreshNotifications]);

  // ─── Navigation ───
  const navigateTo = useCallback((view: ViewMode, params?: Record<string, string>) => {
    setIsTransitioning(true);
    setIsMobileMenuOpen(false);
    setNavParams(params || {});
    window.location.hash = params?.id ? `#/${view}/${params.id}` : `#/${view}`;
    setCurrentView(view);

    // Lazy-load all patients when entering views that need the full list —
    // see needsFullPatientList for why the ward-grouped views need this too,
    // not just the historical-record ones.
    if (needsFullPatientList(view)) {
      loadAllPatients().catch(err => console.error('[UI] Failed to load all patients:', err));
    }

    setTimeout(() => setIsTransitioning(false), 200);
  }, [loadAllPatients]);

  // ─── Notification Helpers ───
  const unreadCount = useMemo(() =>
    notifications.filter(n => !n.read).length,
  [notifications]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const value = useMemo<UIContextType>(() => ({
    currentView,
    navigateTo,
    navParams,
    isTransitioning,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
    refreshNotifications,
  }), [
    currentView, navigateTo, navParams, isTransitioning,
    isMobileMenuOpen, notifications, unreadCount,
    markNotificationRead, markAllRead, refreshNotifications,
  ]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
