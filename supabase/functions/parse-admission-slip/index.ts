// @ts-nocheck — Deno runtime; types not available in the Node/tsc toolchain
/**
 * parse-admission-slip — Supabase Edge Function
 * Receives a base64-encoded image of a hospital case sheet cover and calls
 * the Claude Vision API to extract structured admission data.
 *
 * Environment variables required (set via Supabase Dashboard → Settings → Edge Functions):
 *   ANTHROPIC_API_KEY — Anthropic API key (server-side only, never in client bundle)
 *
 * Deploy:
 *   npx supabase functions deploy parse-admission-slip --no-verify-jwt
 *   (JWT is verified manually below)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const ALLOWED_ORIGINS = [
  'https://mediward.vercel.app',
  'https://mediward.app',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function buildOcrPrompt(presets: string[]): string {
  const presetList = presets.length > 0 ? presets.join(', ') : 'HTN, DM, CAD, CKD, CVA, Hypothyroid, Asthma, COPD';
  return `You are reading the front cover of a hospital case sheet from Government Medical College Kozhikode (or similar Indian government hospital).

ZONE MAP of the case sheet cover:
- TOP RIGHT sticker label — UHID, IPD number, patient name, age, gender, address, phone (sticker phone), AND admission date (look for "Admit Dt:" or "Admission Date:" field on the sticker)
- LEFT MIDDLE THIRD of the page — handwritten comorbidities written by the resident
- RIGHT MIDDLE THIRD of the page — handwritten mobile/phone number written by the admitting doctor or nurse (this is the most current contact number; it may appear as a raw 10-digit number, or labelled "Ph:", "Mob:", "Cell:", "Contact:" etc.)
- BOTTOM printed fields (handwritten) — Name line — age and gender sometimes written inline after name e.g. "BHASKARAN 87|M" or "RAJAN 54/M" or "LEELA 62 F"; also Date of Admission, Ward, Unit, Diagnosis

CRITICAL RULES:
1. # symbol means FRACTURE. #NOF(R) = Fracture Neck of Femur Right. #IT = Intertrochanteric Fracture. Never ignore or misread #.
2. ip_number: extract ONLY the last 5 digits of the IPD number on the sticker (e.g. IPD 202639009 → "39009").
3. date_of_admission: check BOTH the sticker "Admit Dt:" field AND the handwritten Date of Admission line. Prefer handwritten if both exist. Format as DD/MM/YYYY.
4. age: check BOTH the sticker (e.g. "Age 87 Years") AND the handwritten name line (e.g. "BHASKARAN 87|M" → 87). Return numbers only.
5. gender: check BOTH the sticker AND the handwritten name line suffix (|M, /F, or bare M/F). Expand M=Male, F=Female.
6. mobile_number: PRIMARY source is the RIGHT MIDDLE THIRD handwritten number. Secondary source is the sticker phone. If both exist and differ, use the RIGHT MIDDLE THIRD number as mobile_number and put the sticker number in mobile_conflict. Any 10-digit number in the right middle zone is a phone number even if unlabelled.
7. comorbidities: scan the LEFT MIDDLE THIRD zone. Match ONLY from this list: ${presetList}. If something written doesn't match exactly, still include it as-is in the array.
8. mode_of_injury: infer from context if possible. Values: RTA, Slip and Fall, Fall from Height, Trivial Fall, Direct Blow, Sports Injury, Assault, Pathological, Other. Leave empty string if unclear.
9. diagnosis: expand abbreviations, keep (R)/(L) side notation. # means fracture — expand it.

Return ONLY valid JSON, no explanation, no markdown fences:
{"patient_name":"","age":"","gender":"","ip_number":"","date_of_admission":"","mobile_number":"","mobile_conflict":"","diagnosis":"","mode_of_injury":"","comorbidities":[]}`;
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // ─── JWT validation — reject unauthenticated requests ───
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey     = Deno.env.get('SUPABASE_ANON_KEY');
      if (supabaseUrl && anonKey) {
        const sb = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'OCR service not configured — ANTHROPIC_API_KEY missing' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Parse request body ───
    const body = await req.json() as { image: string; mimeType?: string; presets?: string[] };
    const { image, mimeType = 'image/jpeg', presets = [] } = body;

    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'image (base64 string) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Call Claude Vision ───
    const prompt = buildOcrPrompt(presets);

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as string,
                data: image,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'OCR service error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? '{}';

    // ─── Extract JSON from response (Claude may wrap in prose on partial reads) ───
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error('OCR JSON parse error, raw:', rawText);
      // Return empty but valid shape so partial pre-fill still works
      parsed = {
        patient_name: '', age: '', gender: '', ip_number: '',
        date_of_admission: '', mobile_number: '', mobile_conflict: '',
        diagnosis: '', mode_of_injury: '', comorbidities: [],
      };
    }

    // ─── Sanitize: ensure all expected keys exist ───
    const result = {
      patient_name:     String(parsed.patient_name     ?? ''),
      age:              String(parsed.age               ?? ''),
      gender:           String(parsed.gender            ?? ''),
      ip_number:        String(parsed.ip_number         ?? ''),
      date_of_admission: String(parsed.date_of_admission ?? ''),
      mobile_number:    String(parsed.mobile_number     ?? ''),
      mobile_conflict:  String(parsed.mobile_conflict   ?? ''),
      diagnosis:        String(parsed.diagnosis         ?? ''),
      mode_of_injury:   String(parsed.mode_of_injury    ?? ''),
      comorbidities:    Array.isArray(parsed.comorbidities)
                          ? (parsed.comorbidities as unknown[]).map(String).filter(Boolean)
                          : [],
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('parse-admission-slip error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
