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

    // Lazy-load all patients when entering views that need the full list
    if (view === 'master' || view === 'discharge') {
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
