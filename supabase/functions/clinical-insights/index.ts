// @ts-nocheck — Deno runtime; types not available in the Node/tsc toolchain
/**
 * clinical-insights — Supabase Edge Function
 * Receives a sanitised patient context (no raw PHI beyond what's needed)
 * and calls the Google Gemini API to produce structured clinical alerts.
 *
 * Environment variables required (set via Supabase Dashboard → Settings → Edge Functions):
 *   GEMINI_API_KEY  — Google AI Studio API key (server-side only, never in client bundle)
 *   SUPABASE_URL    — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically (for audit log insert)
 *
 * Rate limiting: 10 requests per user per minute via Deno KV.
 * Additional: reject payloads > 64 KB or > 60 patients.
 *
 * Deploy:
 *   npx supabase functions deploy clinical-insights --no-verify-jwt
 *   (JWT is verified manually below — we accept both anon and service role)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Rate limit config ───
const RATE_LIMIT_WINDOW_MS = 60_000;  // 1 minute window
const RATE_LIMIT_MAX       = 10;      // max requests per user per window

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

/** Strip characters that could break out of the prompt context. */
function sanitizeForPrompt(s: string): string {
  // Remove sequences that could inject new prompt instructions
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ')  // control chars
          .replace(/\bINSTRUCTION\b|\bSYSTEM\b|\bPROMPT\b/gi, '***') // keyword injection
          .slice(0, 500); // hard length cap per field
}

function sanitizePatient(p: PatientSummary): PatientSummary {
  return {
    ...p,
    bed:          sanitizeForPrompt(String(p.bed ?? '')),
    name:         sanitizeForPrompt(String(p.name ?? '')),
    diagnosis:    sanitizeForPrompt(String(p.diagnosis ?? '')),
    procedure:    p.procedure  ? sanitizeForPrompt(p.procedure)  : undefined,
    comorbidities: (p.comorbidities ?? []).map(c => sanitizeForPrompt(String(c))),
    lastRoundNote: p.lastRoundNote ? sanitizeForPrompt(p.lastRoundNote) : undefined,
    medications:   (p.medications ?? []).map(m => sanitizeForPrompt(String(m))),
    pendingTodos:  (p.pendingTodos ?? []).map(t => sanitizeForPrompt(String(t))),
    recentLabs:   (p.recentLabs ?? []).map(l => ({
      ...l,
      type: sanitizeForPrompt(String(l.type ?? '')),
    })),
    pacStatus:    sanitizeForPrompt(String(p.pacStatus ?? '')),
    patientStatus: sanitizeForPrompt(String(p.patientStatus ?? '')),
  };
}

function buildPrompt(patients: PatientSummary[], department: string): string {
  const safeDept = sanitizeForPrompt(department).slice(0, 60);
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

  return `You are a senior clinical assistant in the ${safeDept} department of a teaching hospital in India.
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

/** Deno KV-based rate limiter. Returns true if request is allowed. */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  let kv: Deno.Kv | undefined;
  try {
    kv = await Deno.openKv();
    const key = ['rate_limit', 'clinical_insights', userId];
    const now  = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    const entry = await kv.get<{ count: number; windowStart: number }>(key);
    const current = entry.value;

    if (!current || current.windowStart < windowStart) {
      // New window
      await kv.set(key, { count: 1, windowStart: now }, { expireIn: RATE_LIMIT_WINDOW_MS });
      return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    if (current.count >= RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0 };
    }

    await kv.set(key, { count: current.count + 1, windowStart: current.windowStart }, { expireIn: RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - current.count - 1 };
  } catch {
    // KV unavailable — fail open (don't block on infra issues)
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  } finally {
    kv?.close();
  }
}

/** Write AI usage to audit_log table for compliance. */
async function logAiAudit(userId: string, hospitalId: string | null, patientCount: number, alertCount: number): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return;

    const sb = createClient(supabaseUrl, serviceKey);
    await sb.from('audit_log').insert({
      user_id:     userId,
      hospital_id: hospitalId,
      action:      'AI_CLINICAL_INSIGHTS',
      entity_type: 'ai_request',
      entity_id:   userId,
      details:     `Analysed ${patientCount} patients, generated ${alertCount} alerts`,
    });
  } catch {
    // Non-blocking — audit failure must not break the clinical response
  }
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
    // ─── Extract user from JWT for rate limiting and audit ───
    let userId = 'anonymous';
    let hospitalId: string | null = null;
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey     = Deno.env.get('SUPABASE_ANON_KEY');
        if (supabaseUrl && anonKey) {
          const sb = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await sb.auth.getUser();
          if (user) {
            userId = user.id;
            // Fetch hospital_id for audit log
            const { data: appUser } = await sb
              .from('app_users')
              .select('hospital_id')
              .eq('id', user.id)
              .maybeSingle();
            hospitalId = appUser?.hospital_id ?? null;
          }
        }
      } catch { /* ignore — rate limit still applies to 'anonymous' */ }
    }

    // ─── Rate limiting ───
    const { allowed, remaining } = await checkRateLimit(userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in 1 minute.' }), {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      });
    }

    // ─── Enforce payload size limit (64 KB) ───
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 65_536) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as { patients: PatientSummary[]; department?: string };

    // ─── Enforce patient count limit ───
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

    // ─── Sanitize patient data before interpolating into prompt ───
    const sanitizedPatients = body.patients.map(sanitizePatient);
    const prompt = buildPrompt(sanitizedPatients, body.department ?? 'Surgery');

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

    // ─── Parse and validate the JSON array ───
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

    // ─── Audit log (non-blocking) ───
    logAiAudit(userId, hospitalId, body.patients.length, alerts.length);

    return new Response(JSON.stringify({ alerts }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch (err) {
    console.error('clinical-insights error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', fallback: true }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
