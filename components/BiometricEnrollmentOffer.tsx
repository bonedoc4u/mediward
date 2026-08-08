import React from 'react';
import { useAuth } from '../contexts/AppContext';
import { Fingerprint } from 'lucide-react';

// ─── Biometric Enrollment Offer ─────────────────────────────────────────────
// Shown once, immediately after a successful password login, on a device
// that supports biometrics and has nothing enrolled yet (see login() in
// AuthContext.tsx). offerBiometricEnrollment flips true a couple of `await`s
// after login() calls setUser() — by which point isAuthenticated is already
// true and LoginPage has already unmounted (state updates don't stay batched
// across an await boundary), so this can't live inside LoginPage.tsx. It
// reads its own auth fields via useAuth() and is rendered as a top-level
// overlay from every post-login branch in App.tsx (disclaimer, department/unit
// picker, dashboard, lock screen) so it's visible wherever the user actually
// lands right after login, not just one specific screen.
const BiometricEnrollmentOffer: React.FC = () => {
  const { offerBiometricEnrollment, enrollBiometric, dismissBiometricOffer } = useAuth();
  if (!offerBiometricEnrollment) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-center">
        <Fingerprint className="w-10 h-10 text-teal-600 mx-auto" />
        <h3 className="text-lg font-bold text-slate-800">Enable Fingerprint Sign-In?</h3>
        <p className="text-sm text-slate-500">
          Skip typing your password next time you open MediWard on this device.
        </p>
        <div className="flex gap-3">
          <button
            onClick={dismissBiometricOffer}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Not now
          </button>
          <button
            onClick={enrollBiometric}
            className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl"
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
};

export default BiometricEnrollmentOffer;
