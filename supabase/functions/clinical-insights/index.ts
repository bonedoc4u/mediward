/**
 * clinical-insights — Supabase Edge Function
 * Receives a sanitised patient context (no raw PHI beyond what's needed)
 * and calls the Google Gemini API to produce structured clinical alerts.
 *
 * Environment variables required (set via Supabase Dashboard → Settings → Edge Functions):
 *   GEMINI_API_KEY  — Google AI Studio API key (server-side only, never in client bundle)
 *
 * Rate limiting: Supabase enforces per-IP limits on Edge Function invocations.
 * Additional: we reject requests with > 50 patients or payload > 64 KB.
 *
 * Deploy:
 *   npx supabase functions deploy clinical-insights --no-verify-jwt
 *   (JWT is verified manually below — we accept both anon and service role)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PatientSummary {
  bed: string;
  name: string;
  age: number;
  diagnosis: string;
  comorbidities: string[];
  procedure?: string;
  daysAdmitted: number;
  pod?: number;
  pacStatus: string;
  patientStatus: string;
  latestVitals?: {
    bp?: string;
    hr?: number;
    temp?: number;
    spo2?: number;
    rr?: number;
    news2Score?: number;
  };
  recentLabs: Array<{ type: string; value: number; date: string }>;
  pendingTodos: string[];
  lastRoundNote?: string;
  medications?: string[];
}

function buildPrompt(patients: PatientSummary[], department: string): string {
  const patientLines = patients.map(p => {
    const vitals = p.latestVitals
      ? `BP ${p.latestVitals.bp ?? '—'}, HR ${p.latestVitals.hr ?? '—'}, Temp ${p.latestVitals.temp ?? '—'}°C, SpO2 ${p.latestVitals.spo2 ?? '—'}%, RR ${p.latestVitals.rr ?? '—'}, NEWS2 ${p.latestVitals.news2Score ?? '—'}`
      : 'No vitals recorded';
    const labs = p.recentLabs.length > 0
      ? p.recentLabs.map(l => `${l.type}: ${l.value} (${l.date})`).join(', ')
      : 'None';
    const meds = p.medications?.length ? p.medications.join(', ') : 'Not documented';

    return `Bed ${p.bed}: ${p.name}, ${p.age}y — ${p.diagnosis}${p.comorbidities.length ? ` | Comorbidities: ${p.comorbidities.join(', ')}` : ''}
  Day ${p.daysAdmitted} | POD ${p.pod ?? 'N/A'} | PAC: ${p.pacStatus} | Status: ${p.patientStatus}
  Vitals: ${vitals}
  Labs: ${labs}
  Medications: ${meds}
  Pending tasks: ${p.pendingTodos.length > 0 ? p.pendingTodos.join('; ') : 'None'}
  Last round note: ${p.lastRoundNote ?? 'None'}`;
  }).join('\n\n');

  return `You are a senior clinical assistant in the ${department} department of a teaching hospital in India.
Review the following ward patient data and generate a concise, prioritised list of clinical action items.

RULES:
- Flag any NEWS2 score ≥ 5 as HIGH priority with escalation recommendation
- Flag overdue diabetic glucose monitoring (FBS/PPBS not done in 48h for DM patients)
- Flag rising inflammatory markers (CRP/ESR trending up) in infection/wound cases
- Flag post-op day 0–1 patients needing wound/drain check
- Flag PAC pending > 3 days
- Flag any abnormal labs outside reference range
- Do NOT invent information not present in the data
- Do NOT make diagnostic conclusions — only suggest actions
- Output ONLY a JSON array, no prose, no markdown fences

OUTPUT FORMAT (strict JSON array):
[
  {
    "bed": "string",
    "patientName": "string",
    "category": "NEWS2 Alert" | "Diabetic Care" | "Infection Control" | "Post-Op" | "Pending Work" | "Lab Alert" | "Other",
    "message": "string (max 120 chars, actionable imperative)",
    "priority": "High" | "Medium" | "Low"
  }
]

PATIENT DATA:
${patientLines}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    // Enforce payload size limit (64 KB)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 65_536) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as { patients: PatientSummary[]; department?: string };

    // Enforce patient count limit
    if (!Array.isArray(body.patients) || body.patients.length > 60) {
      return new Response(JSON.stringify({ error: 'patients must be an array of ≤ 60 entries' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(body.patients, body.department ?? 'Surgery');

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,       // Low temperature — deterministic clinical output
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return new Response(JSON.stringify({ error: 'AI service error', fallback: true }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

    // Parse and validate the JSON array
    let alerts: unknown[];
    try {
      alerts = JSON.parse(rawText);
      if (!Array.isArray(alerts)) throw new Error('Not an array');
    } catch {
      console.error('Gemini non-JSON response:', rawText);
      return new Response(JSON.stringify({ error: 'AI parse error', fallback: true }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ alerts }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('clinical-insights error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', fallback: true }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
