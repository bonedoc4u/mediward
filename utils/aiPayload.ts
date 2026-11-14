/**
 * aiPayload.ts — what the Clinical Assistant sends to the AI (Google Gemini),
 * and how its answer is matched back to the patients.
 *
 * Privacy (audit SEC-05): no name, IP number, mobile or ABHA ID leaves the
 * app. Each patient is sent as "Patient 1", "Patient 2"… The real name is put
 * back on the alerts here, on the phone, after the answer arrives.
 *
 * The reference is sent in the `name` field on purpose: the AI function that
 * is deployed today puts that field into its prompt, so this change alone
 * stops names reaching Google even before the function is redeployed.
 *
 * Free text (diagnosis, last round note, pending orders) is sent because the
 * alerts need it. The patient's own name is replaced in it, but a name typed
 * in some other form, or another person's name, can still pass.
 */
import { Patient, PatientStatus } from '../types';

export interface AiPatientSummary {
  /** "Patient 1", "Patient 2"… Never the real name. */
  ref: string;
  /** Same value as `ref`, for the function version that reads `name`. */
  name: string;
  bed: string;
  age: number;
  diagnosis: string;
  comorbidities: string[];
  procedure?: string;
  daysAdmitted: number;
  pod?: number;
  pacStatus: string;
  patientStatus: string;
  latestVitals?: {
    bp?: string; hr?: number; temp?: number; spo2?: number; rr?: number; news2Score?: number;
  };
  recentLabs: Array<{ type: string; value: number; date: string }>;
  pendingTodos: string[];
  lastRoundNote?: string;
}

/** What the phone keeps to put names back on the answer. Never sent. */
export interface AiPatientKey {
  bed: string;
  name: string;
}

export interface AiAlert {
  bed: string;
  patientName: string;
  category: string;
  message: string;
  priority: 'High' | 'Medium' | 'Low';
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace the patient's own name in free text with their reference: the full
 * name, and each part of it of three letters or more ("Ramesh", "Kumar").
 */
export function scrubName(text: string, name: string, ref: string): string {
  const parts = [name.trim(), ...name.trim().split(/\s+/)]
    .filter(p => p.length >= 3)
    .sort((a, b) => b.length - a.length); // full name first
  return parts.reduce(
    (out, part) => out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, 'giu'), ref),
    text,
  );
}

export function buildAiPayload(
  patients: Patient[],
  today: Date = new Date(),
): { summaries: AiPatientSummary[]; keys: Map<string, AiPatientKey> } {
  const keys = new Map<string, AiPatientKey>();
  const summaries = patients
    .filter(p => p.patientStatus !== PatientStatus.Discharged)
    .map((p, i): AiPatientSummary => {
      const ref = `Patient ${i + 1}`;
      keys.set(ref, { bed: p.bed, name: p.name });
      const clean = (s: string) => scrubName(s, p.name ?? '', ref);

      const vitals = Array.isArray(p.vitals) ? p.vitals : [];
      const latest = vitals[0];
      const doa = new Date(p.doa);
      const daysAdmitted = Math.max(0, Math.floor((today.getTime() - doa.getTime()) / 86_400_000));
      const recentLabs = [...(Array.isArray(p.labResults) ? p.labResults : [])]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8)
        .map(l => ({ type: l.type, value: l.value, date: l.date }));
      const lastRound = [...(Array.isArray(p.dailyRounds) ? p.dailyRounds : [])]
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      return {
        ref,
        name: ref,
        bed: p.bed,
        age: p.age,
        diagnosis: clean(p.diagnosis ?? ''),
        comorbidities: Array.isArray(p.comorbidities) ? p.comorbidities : [],
        procedure: p.procedure ? clean(p.procedure) : undefined,
        daysAdmitted,
        pod: p.pod,
        pacStatus: p.pacStatus,
        patientStatus: p.patientStatus,
        latestVitals: latest ? {
          bp: latest.bpSystolic != null && latest.bpDiastolic != null
            ? `${latest.bpSystolic}/${latest.bpDiastolic}` : undefined,
          hr: latest.heartRate,
          temp: latest.temperature,
          spo2: latest.spo2,
          rr: latest.respiratoryRate,
          news2Score: latest.news2Score,
        } : undefined,
        recentLabs,
        pendingTodos: (Array.isArray(p.todos) ? p.todos : []).filter(t => !t.isDone).map(t => clean(t.task)),
        lastRoundNote: lastRound?.note ? clean(lastRound.note.slice(0, 200)) : undefined,
      };
    });
  return { summaries, keys };
}

const REF_PATTERN = /\bPatient (\d+)\b/g;

/**
 * Put the real names back on the AI's alerts. An alert is matched by the
 * reference it names; failing that, by bed. An alert that matches no patient
 * is dropped rather than shown against the wrong one.
 */
export function attachNames(raw: unknown[], keys: Map<string, AiPatientKey>): AiAlert[] {
  const byBed = new Map([...keys.values()].map(k => [k.bed, k]));
  const named = (text: string) => text.replace(REF_PATTERN, (m) => keys.get(m)?.name ?? m);

  return raw.flatMap((item): AiAlert[] => {
    if (!item || typeof item !== 'object') return [];
    const a = item as Record<string, unknown>;
    const said = String(a.patientName ?? a.ref ?? '');
    const key = keys.get(said.match(/Patient \d+/)?.[0] ?? '') ?? byBed.get(String(a.bed ?? ''));
    if (!key) return [];
    const priority = a.priority === 'High' || a.priority === 'Medium' || a.priority === 'Low' ? a.priority : 'Low';
    return [{
      bed: key.bed,
      patientName: key.name,
      category: String(a.category ?? 'Other'),
      message: named(String(a.message ?? '')),
      priority,
    }];
  });
}
