/**
 * HospitalRegisterPage.tsx
 * Onboarding form for a new hospital to sign up for MediWard.
 *
 * Steps:
 *   1 — Hospital details (name, department, preset)
 *   2 — Admin account (name, email, password)
 *
 * On success: shows a "verify your email" or "account ready" message,
 * then redirects to the login page.
 */

import React, { useState } from 'react';
import {
  Stethoscope, Building2, ArrowRight, ArrowLeft, CheckCircle,
  Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2,
} from 'lucide-react';
import { registerHospital } from '../services/hospitalService';

// ─── Department presets ───────────────────────────────────────────────────────
const PRESETS: { label: string; department: string; units: string[]; preOp: string; procedure: string }[] = [
  { label: 'Orthopaedics',         department: 'DEPARTMENT OF ORTHOPAEDICS',           units: ['OR1','OR2','OR3','OR4','OR5'], preOp: 'PAC Status',        procedure: 'OT List'        },
  { label: 'General Surgery',      department: 'DEPARTMENT OF GENERAL SURGERY',        units: ['GS1','GS2','GS3'],            preOp: 'Pre-op Clearance',  procedure: 'OT List'        },
  { label: 'Neurosurgery',         department: 'DEPARTMENT OF NEUROSURGERY',           units: ['NS1','NS2','NS3'],            preOp: 'Pre-op Clearance',  procedure: 'OT List'        },
  { label: 'Cardiothoracic',       department: 'DEPARTMENT OF CARDIOTHORACIC SURGERY', units: ['CT1','CT2'],                  preOp: 'Pre-op Clearance',  procedure: 'OT List'        },
  { label: 'Gynaecology',          department: 'DEPARTMENT OF OBSTETRICS & GYNAECOLOGY', units: ['OB1','OB2','OB3'],          preOp: 'Pre-admission',     procedure: 'OT/Procedure List' },
  { label: 'ENT',                  department: 'DEPARTMENT OF ENT',                   units: ['ENT1','ENT2'],                preOp: 'Pre-op Clearance',  procedure: 'OT List'        },
  { label: 'Urology',              department: 'DEPARTMENT OF UROLOGY',               units: ['UR1','UR2'],                  preOp: 'Pre-op Clearance',  procedure: 'Procedure List' },
  { label: 'Medicine',             department: 'DEPARTMENT OF MEDICINE',              units: ['Unit 1','Unit 2','Unit 3'],   preOp: 'Pre-admission',     procedure: 'Procedure List' },
  { label: 'Cardiology',           department: 'DEPARTMENT OF CARDIOLOGY',            units: ['Cardio 1','Cardio 2'],        preOp: 'Pre-procedure',     procedure: 'Procedure List' },
  { label: 'Paediatrics',          department: 'DEPARTMENT OF PAEDIATRICS',           units: ['Peds 1','Peds 2','Peds 3'],   preOp: 'Pre-admission',     procedure: 'Procedure List' },
];

// ─── Component ────────────────────────────────────────────────────────────────
const HospitalRegisterPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [step, setStep]               = useState<1 | 2>(1);
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment]   = useState('');
  const [units, setUnits]             = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const [adminName, setAdminName]     = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState<{ requiresEmailConfirm: boolean } | null>(null);

  // ─── Preset picker ───────────────────────────────────────────────────────
  const applyPreset = (preset: typeof PRESETS[0]) => {
    setSelectedPreset(preset.label);
    setDepartment(preset.department);
    setUnits(preset.units.join(', '));
  };

  // ─── Step 1 → Step 2 ─────────────────────────────────────────────────────
  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim() || !department.trim()) {
      setError('Please fill in hospital name and department.');
      return;
    }
    setError('');
    setStep(2);
  };

  // ─── Final submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setIsLoading(true);
    setError('');

    const parsedUnits = units
      .split(',')
      .map(u => u.trim())
      .filter(Boolean);

    const result = await registerHospital({
      hospitalName: hospitalName.trim(),
      department:   department.trim(),
      units:        parsedUnits.length > 0 ? parsedUnits : ['Unit 1', 'Unit 2', 'Unit 3'],
      adminName:    adminName.trim(),
      adminEmail:   email.trim(),
      adminPassword: password,
    });

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setDone({ requiresEmailConfirm: result.requiresEmailConfirm });
    }
  };

  // ─── Success screen ───────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 p-4 rounded-full">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Hospital Registered!</h2>
          {done.requiresEmailConfirm ? (
            <>
              <p className="text-slate-500 text-sm mb-2">
                A confirmation email has been sent to <strong>{email}</strong>.
              </p>
              <p className="text-slate-500 text-sm mb-6">
                Verify your email address first, then log in with your credentials.
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm mb-6">
              Your hospital has been set up. You can now log in with your credentials.
            </p>
          )}
          <button
            onClick={onBack}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">

        {/* Left Side — Brand */}
        <div className="md:w-2/5 bg-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Stethoscope className="w-6 h-6" />
              </div>
              <h1 className="font-bold text-2xl tracking-tight">MediWard</h1>
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold leading-tight">Register Your Hospital</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Set up your hospital on MediWard in under 2 minutes. Each hospital gets a fully
                isolated workspace — your patients, staff, and data are completely private.
              </p>
            </div>

            {/* Step indicators */}
            <div className="mt-10 space-y-3">
              {[
                { num: 1, label: 'Hospital Details' },
                { num: 2, label: 'Admin Account'   },
              ].map(s => (
                <div key={s.num} className={`flex items-center gap-3 transition-opacity ${step >= s.num ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step > s.num ? 'bg-green-500' : step === s.num ? 'bg-blue-500' : 'bg-slate-600'}`}>
                    {step > s.num ? '✓' : s.num}
                  </div>
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mt-8">
            <p className="text-[10px] text-slate-500">
              30-day free trial. No credit card required.
            </p>
          </div>
        </div>

        {/* Right Side — Form */}
        <div className="md:w-3/5 p-8 md:p-10 flex flex-col justify-center">

          {/* Step 1 — Hospital Details */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800">Hospital Details</h3>
                <p className="text-slate-500 text-sm mt-1">Tell us about your hospital and department.</p>
              </div>

              <form onSubmit={goToStep2} className="space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 border border-red-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Hospital Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Hospital Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. City Medical Centre"
                      value={hospitalName}
                      onChange={e => setHospitalName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Department Presets */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">Department Preset</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selectedPreset === p.label
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">Click a preset to auto-fill below, or type manually.</p>
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Department</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DEPARTMENT OF MEDICINE"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                {/* Units */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Clinical Units</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit 1, Unit 2, Unit 3"
                    value={units}
                    onChange={e => setUnits(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                  <p className="text-[11px] text-slate-400">Comma-separated. Each unit becomes a separate team view.</p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 mt-2"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-slate-400 hover:text-slate-600 text-sm transition-colors"
                  >
                    Already have an account? Sign in
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Step 2 — Admin Account */}
          {step === 2 && (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(''); }}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-sm mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h3 className="text-xl font-bold text-slate-800">Admin Account</h3>
                <p className="text-slate-500 text-sm mt-1">
                  This will be the primary administrator for <strong>{hospitalName}</strong>.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 border border-red-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Dr. Your Name"
                      value={adminName}
                      onChange={e => setAdminName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="admin@yourhospital.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Register Hospital <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-[11px] text-slate-400 text-center">
                  By registering you agree to use this software responsibly for clinical purposes only.
                </p>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default HospitalRegisterPage;
