import React, { useState } from 'react';
import { useAuth } from '../contexts/AppContext';
import { Stethoscope, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

const LoginPage: React.FC<{ onRegister?: () => void }> = ({ onRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Authentication failed.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">

        {/* Left Side - Brand */}
        <div className="hidden md:flex md:w-1/2 bg-slate-900 p-8 text-white flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-blue-600 p-2 rounded-lg">
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
            <div className="bg-blue-600 p-2 rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">MediWard</span>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-slate-800">Welcome Back</h3>
            <p className="text-slate-500 text-sm mt-1">Enter your credentials to access the dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="doctor@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  minLength={6}
                  className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {onRegister && (
            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-slate-500 text-sm">New to MediWard?</p>
              <button
                onClick={onRegister}
                className="mt-1 text-blue-600 hover:text-blue-700 font-semibold text-sm transition-colors"
              >
                Register your hospital →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LoginPage;
