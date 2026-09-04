/**
 * AppContext.tsx
 * Composition root that nests Config → Auth → Patient → UI providers in dependency order.
 *
 * Individual hooks (recommended for new code — avoids unnecessary re-renders):
 *   import { useAuth }     from './AuthContext';    // only auth state
 *   import { usePatients } from './PatientContext'; // only patient state
 *   import { useUI }       from './UIContext';      // only nav/notifications
 *   import { useConfig }   from './ConfigContext';  // wards + lab types
 *
 * Backward-compatible hook (existing components unchanged):
 *   import { useApp } from './AppContext'; // merges all three
 */

import React from 'react';
import { ConfigProvider } from './ConfigContext';
import { AuthProvider, useAuth } from './AuthContext';
import { PatientProvider, usePatients } from './PatientContext';
import { UIProvider, useUI } from './UIContext';

// ─── Re-export granular hooks so consumers can import from one place ───
export { useAuth }     from './AuthContext';
export { usePatients } from './PatientContext';
export { useUI }       from './UIContext';
export { useConfig }   from './ConfigContext';

/**
 * useApp — backward-compatible hook that merges all contexts.
 * Prefer the granular hooks above for components that only use a subset,
 * so React can skip re-renders when unrelated state changes.
 */
export function useApp() {
  const auth     = useAuth();
  const patients = usePatients();
  const ui       = useUI();
  return { ...auth, ...patients, ...ui };
}

/**
 * AppProvider — wraps the entire app.
 * Order: Config (no deps) → Auth → Patient (needs auth) → UI (needs both).
 */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <ConfigProvider>
      <PatientProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </PatientProvider>
    </ConfigProvider>
  </AuthProvider>
);
