import React, { useState } from 'react';
import { UserX, Download, CheckCircle2, XCircle, AlertTriangle, Search } from 'lucide-react';
import {
  fetchErasePreview, erasePatientData, exportPatientData, ErasePreview,
} from '../../services/patientDataRights';

type Msg = { ok: boolean; text: string } | null;

const inputClass =
  'flex-1 min-w-0 min-h-11 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2';
const errorText = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

const Result: React.FC<{ msg: Msg }> = ({ msg }) => msg && (
  <div
    role={msg.ok ? 'status' : 'alert'}
    className={`flex items-start gap-2 p-3 rounded-lg text-xs font-medium border ${
      msg.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}
  >
    {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
    <span>{msg.text}</span>
  </div>
);

// ─── Erase (DPDP §13) ────────────────────────────────────────────────────────
/**
 * Two steps on purpose. Step 1 finds the patient and shows who it is. Step 2
 * erases only after the admin has retyped the IP number. Erasing cannot be
 * undone, so a mistyped number must never be enough.
 */
export const DpdpErasurePanel: React.FC = () => {
  const [ipNo, setIpNo] = useState('');
  const [patient, setPatient] = useState<ErasePreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const reset = () => { setPatient(null); setTyped(''); };

  const find = async () => {
    if (!ipNo.trim() || busy) return;
    setBusy(true); setMsg(null); reset();
    try {
      setPatient(await fetchErasePreview(ipNo));
    } catch (err: unknown) {
      setMsg({ ok: false, text: errorText(err, 'The patient could not be looked up.') });
    } finally { setBusy(false); }
  };

  const erase = async () => {
    if (!patient || typed.trim() !== patient.ipNo || busy) return;
    setBusy(true); setMsg(null);
    try {
      const done = await erasePatientData(patient.ipNo);
      const skipped = done.filesSkipped > 0
        ? ` ${done.filesSkipped} image link(s) point outside this hospital's storage and were left.` : '';
      setMsg({
        ok: true,
        text: `Patient ${done.ipNo}: personal data erased. ${done.rowsRemoved} linked record(s) and `
          + `${done.filesRemoved} image file(s) removed.${skipped}`,
      });
      reset(); setIpNo('');
    } catch (err: unknown) {
      setMsg({ ok: false, text: errorText(err, 'Nothing was erased. Try again.') });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <UserX className="w-4 h-4 text-red-600" />
        <h2 className="font-bold text-slate-800">Patient Data Erasure (DPDP §13)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">
          For a patient who asks for their data to be erased. Removes the name, mobile, ABHA ID, diagnosis, every
          note, result, chart and image. Keeps an empty record with the IP number, ward, unit and admission and
          discharge dates. Only a discharged patient can be erased. This cannot be undone.
        </p>

        {!patient && (
          <div className="flex gap-2">
            <input
              type="text" value={ipNo} onChange={e => setIpNo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void find(); }}
              aria-label="IP number of the patient to erase"
              placeholder="IP Number (e.g. IP/2024/1234)"
              className={`${inputClass} focus:ring-red-400`}
            />
            <button
              type="button" onClick={() => void find()} disabled={busy || !ipNo.trim()}
              className="shrink-0 min-h-11 flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Search className="w-4 h-4" />
              {busy ? 'Looking…' : 'Find patient'}
            </button>
          </div>
        )}

        {patient && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 break-words">{patient.name}</p>
                <p className="text-xs text-slate-700">
                  {patient.age} y · {patient.gender} · {patient.ward}{patient.bed ? ` · Bed ${patient.bed}` : ''}
                  {patient.unit ? ` · ${patient.unit}` : ''} · {patient.status}
                </p>
                <p className="text-xs text-slate-700 mt-1">
                  IP number <span className="font-mono font-semibold">{patient.ipNo}</span>.{' '}
                  {patient.rowsToRemove} linked record(s) and {patient.imagePaths.length} recorded image(s) will be removed.
                </p>
                {patient.alreadyErased && (
                  <p className="text-xs text-slate-700 mt-1">This record was erased before. Only leftovers will be removed.</p>
                )}
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-800">
              Type the IP number to confirm
              <input
                type="text" value={typed} onChange={e => setTyped(e.target.value)}
                autoComplete="off" autoCapitalize="off" spellCheck={false}
                className={`${inputClass} mt-1 w-full bg-white font-mono focus:ring-red-400`}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button" onClick={() => { reset(); setMsg(null); }} disabled={busy}
                className="flex-1 min-h-11 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button" onClick={() => void erase()} disabled={busy || typed.trim() !== patient.ipNo}
                className="flex-1 min-h-11 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {busy ? 'Erasing…' : 'Erase permanently'}
              </button>
            </div>
          </div>
        )}

        <Result msg={msg} />
      </div>
    </div>
  );
};

// ─── Export (DPDP §16) ───────────────────────────────────────────────────────
export const DpdpPortabilityPanel: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [ipNo, setIpNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const handleExport = async () => {
    if (!ipNo.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      await exportPatientData(ipNo.trim(), hospitalId);
      setMsg({ ok: true, text: `Patient ${ipNo.trim()}: data exported as a JSON file.` });
    } catch (err: unknown) {
      setMsg({ ok: false, text: errorText(err, 'Export failed. Nothing was downloaded.') });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Download className="w-4 h-4 text-teal-600" />
        <h2 className="font-bold text-slate-800">Patient Data Export (DPDP §16)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">
          For a patient who asks for a copy of their data. Downloads one JSON file with the patient record and every
          linked record: rounds, labs, imaging, nursing notes, vitals, medications, wound care, intake and output,
          transfusions, OT list entries, consults and handovers.
        </p>
        <div className="flex gap-2">
          <input
            type="text" value={ipNo} onChange={e => setIpNo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleExport(); }}
            aria-label="IP number of the patient to export"
            placeholder="IP Number (e.g. IP/2024/1234)"
            className={`${inputClass} focus:ring-teal-400`}
          />
          <button
            type="button" onClick={() => void handleExport()} disabled={busy || !ipNo.trim()}
            className="shrink-0 min-h-11 flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            {busy ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
        <Result msg={msg} />
      </div>
    </div>
  );
};
