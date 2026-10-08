import React from 'react';
import {
  Stethoscope, ClipboardList, CalendarClock, FileText, FlaskConical, WifiOff, ShieldCheck,
} from 'lucide-react';

interface Props {
  onSignIn: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

interface Feature {
  Icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    Icon: ClipboardList,
    title: 'Ward Dashboard',
    description: 'Every patient across every ward, grouped and triaged at a glance — built for a quick scan between beds, not a desk.',
  },
  {
    Icon: Stethoscope,
    title: 'Daily Rounds & Round Mode',
    description: 'A swipe-through, one-patient-at-a-time view for walking rounds, with quick-add shortcuts for the orders written every single day.',
  },
  {
    Icon: CalendarClock,
    title: 'OT List Scheduling',
    description: 'Drag-and-drop operating theatre lists by table and time, auto-populated from the pending-surgery queue.',
  },
  {
    Icon: FileText,
    title: 'Discharge Summaries',
    description: 'Auto-drafted from admission details and days of round notes — including DAMA and death-summary variants — not a blank form.',
  },
  {
    Icon: FlaskConical,
    title: 'Labs & Radiology',
    description: 'Lab value trends over time and side-by-side pre/post-op imaging comparison, right next to the patient record.',
  },
  {
    Icon: WifiOff,
    title: 'Built for Ward Wi-Fi',
    description: 'A Progressive Web App that tolerates the unreliable connectivity of a real hospital ward, not a lab demo.',
  },
];

const LandingPage: React.FC<Props> = ({ onSignIn, onPrivacy, onTerms }) => {
  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* ── Top nav ── */}
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-accent p-1.5 rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">MediWard</span>
          </div>
          <button
            onClick={onSignIn}
            className="min-h-[44px] px-4 bg-accent hover:bg-accent-pressed text-white font-semibold text-sm rounded-lg transition-colors"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-accent rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-accent rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/3 translate-y-1/3" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
            Clinical Ward Management,<br className="hidden sm:block" /> Built for the Bedside
          </h1>
          <p className="mt-4 text-blue-300 font-medium">Smart. Simple. Secure.</p>
          <p className="mt-6 text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            MediWard is a multi-tenant ward management system for orthopaedic units in Indian hospitals.
            Daily rounds, OT scheduling, labs, imaging, and discharge documentation — all in one place,
            used on phones, during actual rounds.
          </p>
          <button
            onClick={onSignIn}
            className="mt-8 min-h-[44px] px-6 bg-accent hover:bg-accent-pressed text-white font-bold rounded-lg transition-colors inline-flex items-center gap-2"
          >
            Sign In to MediWard
          </button>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">Everything a unit needs, in one app</h2>
        <p className="text-ink-muted text-center max-w-xl mx-auto mb-10">
          No separate spreadsheets for the OT list, no paper discharge forms, no hunting for yesterday's labs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ Icon, title, description }) => (
            <div key={title} className="bg-surface-card border border-line rounded-2xl p-6 shadow-card">
              <div className="bg-accent-soft w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-accent-fg" />
              </div>
              <h3 className="font-bold text-ink mb-1.5">{title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Credibility ── */}
      <section className="bg-surface-sunken border-y border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center">
          <div className="inline-flex items-center gap-2 bg-surface-card border border-line rounded-full px-4 py-1.5 mb-4">
            <ShieldCheck className="w-4 h-4 text-accent-fg" />
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Built from the ward, not a lab</span>
          </div>
          <p className="text-ink text-base leading-relaxed">
            MediWard is built and maintained by a solo developer — a practicing orthopaedics resident in India —
            and used daily to run real ward rounds, not as a prototype. Every feature exists because an actual
            shift needed it.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink-muted">
        <span>© {new Date().getFullYear()} MediWard</span>
        <div className="flex items-center gap-4">
          <button onClick={onPrivacy} className="hover:text-accent-fg transition-colors">Privacy Policy</button>
          <button onClick={onTerms} className="hover:text-accent-fg transition-colors">Terms of Service</button>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
