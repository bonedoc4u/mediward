import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AppContext';
import { Stethoscope, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { isBiometricAvailable, loadBiometricCredential, isBiometricCredentialValid } from '../services/biometricAuthService';

const LoginPage: React.FC<{ onPrivacy?: () => void; onTerms?: () => void }> = ({ onPrivacy, onTerms }) => {
  const { login, loginWithBiometric } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Client-side rate limiting: exponential backoff after failed attempts
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [showBiometricButton, setShowBiometricButton] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [available, credential] = await Promise.all([isBiometricAvailable(), loadBiometricCredential()]);
      setShowBiometricButton(available && isBiometricCredentialValid(credential, Date.now()));
    })();
  }, []);

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError('');
    const result = await loginWithBiometric();
    setBiometricLoading(false);
    if (result.success) return;

    switch (result.error) {
      case 'expired':
      case 'Please log in again.':
        // The credential is gone (loginWithBiometric already cleared it) —
        // the expected "fast-login window ran out" case. Fall through
        // silently to the password form below, no error message.
        setShowBiometricButton(false);
        break;
      case 'cancelled':
      case 'unavailable':
        // Credential is still valid; nothing actionable to tell the user —
        // they can retry the fingerprint button or just use the password
        // form below.
        break;
      case 'network':
        // Credential was deliberately preserved specifically so this is
        // retryable — tell the user why it didn't work.
        setError("Couldn't reach the server — check your connection and try again.");
        break;
      default:
        // 'User role not configured. Contact admin.' and any other real
        // rejection — surface it verbatim, same as the password path
        // already does for the same underlying error.
        setError(result.error || 'Fingerprint sign-in failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    // Rate limit check
    const now = Date.now();
    if (lockUntil > now) {
      const secs = Math.ceil((lockUntil - now) / 1000);
      setError(`Too many failed attempts. Please wait ${secs}s before trying again.`);
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (!result.success) {
        const newCount = failCount + 1;
        setFailCount(newCount);
        // Backoff: 3 attempts free, then 5s × 2^(n-3): 5s, 10s, 20s, 40s, 60s max
        if (newCount >= 3) {
          const backoffMs = Math.min(60_000, 5_000 * Math.pow(2, newCount - 3));
          setLockUntil(Date.now() + backoffMs);
        }
        setError(result.error || 'Authentication failed.');
      } else {
        setFailCount(0);
        setLockUntil(0);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-surface-card rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">

        {/* Left Side - Brand
            NOTE: this panel is deliberately always-dark, independent of app theme —
            same pattern as App.tsx's mobile header/sidebar (also left hardcoded
            bg-slate-900). Its bg stays fixed dark in both light and dark app themes,
            so the text/icon colors painted on it (text-blue-300, text-slate-400,
            text-blue-400, text-slate-500 below) are intentionally left as fixed
            light-on-dark colors too, not converted to the theme-reactive
            ink/accent-fg tokens — those tokens are calibrated against this app's
            *light-mode* card backgrounds and would lose contrast against a panel
            that never lightens. See task-2-report.md for the full reasoning. */}
        <div className="hidden md:flex md:w-1/2 bg-slate-900 p-8 text-white flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-accent rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-accent rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-accent p-2 rounded-lg">
                <Stethoscope className="w-6 h-6" />
              </div>
              <h1 className="font-bold text-2xl tracking-tight">MediWard</h1>
            </div>
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight">Clinical Ward Management</h2>
              <p className="text-blue-300 text-sm font-medium">Smart. Simple. Secure.</p>
              <p className="text-slate-400 text-sm leading-relaxed">
                Daily rounds, orders, labs, imaging, and clinical calculations — all in one place.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-12">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <Lock className="w-4 h-4 text-blue-400" />
              <span>Password-Protected Access</span>
            </div>
            <p className="text-[10px] text-slate-500">
              All sessions are time-limited (8hr) with full audit logging. Data persisted locally with auto-save.
            </p>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-12 flex flex-col justify-center">
          {/* Mobile-only brand header */}
          <div className="flex md:hidden items-center gap-2 mb-8">
            <div className="bg-accent p-2 rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-ink">MediWard</span>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-ink">Welcome Back</h3>
            <p className="text-ink-muted text-sm mt-1">Enter your credentials to access the dashboard.</p>
          </div>

          {showBiometricButton && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 border-2 border-accent text-accent-fg font-bold rounded-lg hover:bg-accent-soft disabled:opacity-60 transition-colors"
            >
              <Fingerprint className="w-5 h-5" />
              {biometricLoading ? 'Verifying…' : 'Sign in with Fingerprint'}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-vital-critical-surface text-vital-critical-fg text-sm p-3 rounded-lg flex items-center gap-2 border border-vital-critical-border">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink uppercase">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 border border-line rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                  placeholder="doctor@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-ink uppercase">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  minLength={6}
                  className="w-full pl-10 pr-12 py-3 border border-line rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-ink-muted hover:text-ink rounded-lg"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent hover:bg-accent-pressed text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="mt-6 flex justify-center gap-6 text-xs text-ink-muted">
            {onPrivacy && (
              <button onClick={onPrivacy} className="hover:text-ink transition-colors font-medium">Privacy Policy</button>
            )}
            {onTerms && (
              <button onClick={onTerms} className="hover:text-ink transition-colors font-medium">Terms of Service</button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;
