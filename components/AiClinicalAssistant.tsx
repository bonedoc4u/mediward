import React, { useState, useCallback, useEffect } from 'react';
import { Patient, PatientStatus } from '../types';
import { X, Loader2, AlertTriangle, CheckCircle, Brain, RefreshCw, Zap, Cpu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useConfig } from '../contexts/AppContext';
import { buildAiPayload, attachNames, AiAlert as BaseAiAlert } from '../utils/aiPayload';

interface Props {
  patients: Patient[];
  /** Whether the panel is shown. The button that opens it lives in the app header. */
  open: boolean;
  onClose: () => void;
}

type AiAlert = BaseAiAlert & { category: 'Diabetic Care' | 'Infection Control' | 'Pending Work' | 'Other' | string };

/**
 * Rule-based clinical alert engine.
 * Runs entirely client-side — no API key needed.
 * This replaces the previous direct Gemini API call that exposed the key in the browser bundle.
 *
 * For a production AI-powered version, route requests through a backend proxy:
 *   POST /api/clinical-insights { patients: [...] }
 *   -> Server calls Gemini/Claude with API key held server-side
 *   -> Returns structured alerts
 */
function generateRuleBasedAlerts(patients: Patient[]): AiAlert[] {
  const alerts: AiAlert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const activePatients = patients.filter(p => p.patientStatus !== PatientStatus.Discharged);

  for (const p of activePatients) {
    // 1. Diabetic Protocol
    const hasDM = p.comorbidities.some(c => /\bdm\b|diabetes|niddm|iddm/i.test(c)) ||
                  /diabetes|\bdm\b|diabetic/i.test(p.diagnosis);
    if (hasDM) {
      const latestFBS = p.labResults
        .filter(r => r.type === 'FBS')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (!latestFBS || new Date(latestFBS.date) < twoDaysAgo) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Diabetic Care',
          message: `Check FBS/PPBS — Alternate Day Protocol. ${latestFBS ? `Last done: ${latestFBS.date}` : 'No records found.'}`,
          priority: 'High',
        });
      }

      // Check for high glucose
      const recentFBS = p.labResults.filter(r => r.type === 'FBS').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const recentPPBS = p.labResults.filter(r => r.type === 'PPBS').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (recentFBS && recentFBS.value < 70) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Diabetic Care',
          message: `HYPOGLYCAEMIA: FBS ${recentFBS.value} mg/dL on ${recentFBS.date}. Immediate glucose correction required.`,
          priority: 'High',
        });
      }
      if (recentFBS && recentFBS.value > 200) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Diabetic Care',
          message: `FBS critically elevated at ${recentFBS.value} mg/dL on ${recentFBS.date}. Consider insulin adjustment.`,
          priority: 'High',
        });
      }
      if (recentPPBS && recentPPBS.value > 300) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Diabetic Care',
          message: `PPBS critically elevated at ${recentPPBS.value} mg/dL on ${recentPPBS.date}. Review sliding scale.`,
          priority: 'High',
        });
      }
    }

    // 2. Infection Protocol
    const hasInfection = /open\s*#|open fracture|infected|cellulitis|abscess|wound|osteomyelitis/i.test(p.diagnosis);
    if (hasInfection) {
      const latestESR = p.labResults
        .filter(r => r.type === 'ESR')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (!latestESR || new Date(latestESR.date) < threeDaysAgo) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Infection Control',
          message: `Check ESR/CRP — Infection Monitoring Protocol (q3d). ${latestESR ? `Last done: ${latestESR.date}` : 'No baseline values.'}`,
          priority: 'Medium',
        });
      }

      // Rising CRP alert
      const crpValues = p.labResults
        .filter(r => r.type === 'CRP')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (crpValues.length >= 2 && crpValues[0].value > crpValues[1].value) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Infection Control',
          message: `CRP trending UP: ${crpValues[1].value} → ${crpValues[0].value} mg/L. Consider culture/sensitivity and antibiotic review.`,
          priority: 'Medium',
        });
      }
    }

    // 3. Pending Tasks
    const pendingTodos = p.todos.filter(t => !t.isDone);
    if (pendingTodos.length > 0) {
      alerts.push({
        bed: p.bed,
        patientName: p.name,
        category: 'Pending Work',
        message: `${pendingTodos.length} task(s) pending: ${pendingTodos.map(t => t.task).join(', ')}`,
        priority: 'Low',
      });
    }

    // 4. PAC Pending > 3 days
    if (p.pacStatus === 'PAC Pending' && !p.dos) {
      const daysSinceAdm = Math.floor((today.getTime() - new Date(p.doa).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceAdm >= 3) {
        alerts.push({
          bed: p.bed,
          patientName: p.name,
          category: 'Other',
          message: `Anesthesia clearance pending for ${daysSinceAdm} days since admission. Expedite PAC workup.`,
          priority: 'Medium',
        });
      }
    }
  }

  // Sort by priority
  const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
  return alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

const AiClinicalAssistant: React.FC<Props> = ({ patients, open: isOpen, onClose }) => {
  const { department } = useConfig();
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AiAlert[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<'gemini' | 'rules'>('rules');

  const generateInsights = useCallback(async () => {
    setLoading(true);
    setAlerts(null);

    try {
      // No names or IP numbers leave the phone: patients go as "Patient 1"…
      // and the names are put back on the answer (utils/aiPayload.ts).
      const { summaries, keys } = buildAiPayload(patients);

      // Try Gemini Edge Function first
      let usedGemini = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clinical-insights`;

        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ patients: summaries, department }),
          signal: AbortSignal.timeout(15_000), // 15s timeout
        });

        const json = await res.json();
        if (res.ok && Array.isArray(json.alerts) && !json.fallback) {
          setAlerts(attachNames(json.alerts, keys));
          usedGemini = true;
          setAiMode('gemini');
        }
      } catch {
        // Network error or Edge Function not deployed — fall through to rules
      }

      // Fallback: rule-based engine
      if (!usedGemini) {
        await new Promise(resolve => setTimeout(resolve, 400)); // brief UX pause
        setAlerts(generateRuleBasedAlerts(patients));
        setAiMode('rules');
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Clinical Engine Error:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [patients, department]);

  // Opening the panel runs the analysis if there is none yet. (The floating
  // button used to do this in its own tap handler.)
  useEffect(() => {
    if (isOpen && !alerts && !loading) void generateInsights();
  }, [isOpen]);

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'High': return 'bg-red-50 text-red-700 border-red-200';
      case 'Medium': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Low': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-50 text-slate-700';
    }
  };

  const getCategoryIcon = (c: string) => {
    switch (c) {
      case 'Diabetic Care': return <AlertTriangle className="w-4 h-4" />;
      case 'Infection Control': return <AlertTriangle className="w-4 h-4" />;
      case 'Pending Work': return <CheckCircle className="w-4 h-4" />;
      default: return <Brain className="w-4 h-4" />;
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onClose()} />

          <div className="relative w-full max-w-md bg-white flex flex-col shadow-2xl" style={{ height: '100dvh', paddingTop: 'var(--safe-area-top, env(safe-area-inset-top, 0px))', paddingBottom: 'var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))' }}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <Zap className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Clinical Assistant</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    {aiMode === 'gemini'
                      ? <><Zap className="w-3 h-3 text-indigo-500" /> Gemini AI</>
                      : <><Cpu className="w-3 h-3 text-slate-400" /> Rule-Based Protocol Engine</>}
                  </p>
                </div>
              </div>
              <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm">Analyzing patient records...</p>
                </div>
              ) : !alerts ? (
                <div className="text-center p-8">
                  <p className="text-slate-500 mb-4">Scan for missing labs, pending tasks, and protocol violations.</p>
                  <button onClick={generateInsights} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    Analyze Now
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-snug">
                      <strong>Clinical Decision Support Only.</strong> These alerts are generated by rule-based logic and do not replace clinical judgement. Always verify with the treating physician.
                    </p>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {alerts.length} Action Items Found
                    </span>
                    <button onClick={generateInsights} className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>

                  {alerts.length === 0 && (
                    <div className="bg-green-50 border border-green-100 rounded-lg p-6 text-center text-green-800">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      <p className="font-medium">All protocols appear up to date!</p>
                      <p className="text-xs mt-1 opacity-80">No missing labs or pending tasks found.</p>
                    </div>
                  )}

                  {alerts.map((alert, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col gap-2 relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${alert.priority === 'High' ? 'bg-red-500' : alert.priority === 'Medium' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-900 text-white text-xs font-bold px-1.5 py-0.5 rounded">Bed {alert.bed}</span>
                            <span className="font-bold text-slate-800 text-sm">{alert.patientName}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${getPriorityColor(alert.priority)}`}>
                          {alert.priority}
                        </span>
                      </div>
                      <div className="pl-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
                          {getCategoryIcon(alert.category)} {alert.category}
                        </div>
                        <p className="text-sm text-slate-700 leading-snug">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {lastUpdated && !loading && (
              <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 border-t">
                Last analyzed: {lastUpdated}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AiClinicalAssistant;
