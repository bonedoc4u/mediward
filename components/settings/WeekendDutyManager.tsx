/**
 * WeekendDutyManager.tsx — admin screen to assign the weekend emergency-OT duty
 * roster for the coming months. Each Saturday and Sunday gets a unit; the value
 * pre-fills from the saved roster, or the built-in rotation as a fallback.
 * Saved into hospital_config (tenant-scoped) via saveWeekendDuty.
 */
import React, { useMemo, useState } from 'react';
import { ShieldAlert, Save, Loader2 } from 'lucide-react';
import { useConfig } from '../../contexts/AppContext';
import { upcomingWeekends, getWeekendDutyUnit, localYmd } from '../../utils/otSchedule';

const WEEKS_AHEAD = 13; // ~3 months

const WeekendDutyManager: React.FC = () => {
  const { weekendDuty, saveWeekendDuty, unitOptions } = useConfig();
  const units = unitOptions.length > 0 ? unitOptions : ['OR1', 'OR2', 'OR3', 'OR4', 'OR5'];
  const weekends = useMemo(() => upcomingWeekends(WEEKS_AHEAD), []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Effective value for a date: unsaved edit → saved roster → rotation fallback.
  const valueFor = (d: Date): string => {
    const key = localYmd(d);
    return draft[key] ?? weekendDuty[key] ?? getWeekendDutyUnit(d) ?? units[0];
  };
  const setFor = (d: Date, unit: string) => setDraft(prev => ({ ...prev, [localYmd(d)]: unit }));

  const dirty = Object.keys(draft).length > 0;

  const handleSave = async () => {
    setSaving(true);
    // Pin every displayed weekend; keep any existing future entries; drop the past.
    const todayKey = localYmd(new Date());
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(weekendDuty)) if (k >= todayKey) merged[k] = v;
    for (const d of weekends) merged[localYmd(d)] = valueFor(d);
    await saveWeekendDuty(merged);
    setDraft({});
    setSaving(false);
  };

  // Group into [Saturday, Sunday] pairs per week.
  const weeks: Array<{ sat: Date; sun: Date }> = [];
  for (let i = 0; i < weekends.length; i += 2) weeks.push({ sat: weekends[i], sun: weekends[i + 1] });

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="bg-violet-100 p-2 rounded-lg shrink-0">
          <ShieldAlert className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Weekend Duty Roster</h3>
          <p className="text-sm text-slate-500">
            Assign which unit is on emergency-OT (EOT) duty each weekend. Weekends you don't set
            follow the default rotation. Cases dated on a unit's duty weekend appear in its OT list.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {weeks.map(({ sat, sun }) => (
          <div key={localYmd(sat)} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            {[sat, sun].map(d => (
              <div key={localYmd(d)} className="flex items-center gap-2">
                <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{fmt(d)}</span>
                <select
                  value={valueFor(d)}
                  aria-label={`EOT duty unit for ${fmt(d)}`}
                  onChange={e => setFor(d, e.target.value)}
                  className="px-3 py-2 min-h-[40px] border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : dirty ? 'Save roster' : 'Saved'}
        </button>
      </div>
    </div>
  );
};

export default WeekendDutyManager;
