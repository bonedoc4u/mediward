import React, { useMemo } from 'react';
import { Scissors, CalendarCheck, Zap, ShieldAlert, BedDouble } from 'lucide-react';

// ─── Department Schedule ─────────────────────────────────────────────────────
// JS Date.getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

const UNIT_SCHEDULE: Record<string, { admissionDay: number; majorDay: number; minorDay: number }> = {
  OR1: { admissionDay: 1, majorDay: 4, minorDay: 3 }, // Mon admit · Thu major · Wed minor
  OR2: { admissionDay: 2, majorDay: 5, minorDay: 4 }, // Tue admit · Fri major · Thu minor
  OR3: { admissionDay: 3, majorDay: 1, minorDay: 5 }, // Wed admit · Mon major · Fri minor
  OR4: { admissionDay: 4, majorDay: 2, minorDay: 1 }, // Thu admit · Tue major · Mon minor
  OR5: { admissionDay: 5, majorDay: 3, minorDay: 2 }, // Fri admit · Wed major · Tue minor
};

const ALL_UNITS = ['OR1', 'OR2', 'OR3', 'OR4', 'OR5'];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 5-week rotating weekend duty, anchored to Saturday 04-Apr-2026
// Decoded from 3-month duty roster (Apr–Jun 2026)
const SAT_CYCLE = [4, 3, 1, 2, 1]; // OR unit number per week
const SUN_CYCLE = [5, 2, 5, 4, 3];
const ANCHOR_SAT_MS = new Date('2026-04-04').getTime();
const MS_PER_WEEK  = 7 * 86_400_000;

function getWeekendDutyUnit(date: Date): string | null {
  const dow = date.getDay();
  if (dow !== 0 && dow !== 6) return null;
  const sat = new Date(date);
  if (dow === 0) sat.setDate(sat.getDate() - 1); // Sun → back to Sat
  sat.setHours(0, 0, 0, 0);
  const idx = (((Math.round((sat.getTime() - ANCHOR_SAT_MS) / MS_PER_WEEK)) % 5) + 5) % 5;
  return `OR${dow === 6 ? SAT_CYCLE[idx] : SUN_CYCLE[idx]}`;
}

type EventType = 'admission' | 'major' | 'minor' | 'weekend-duty';

interface UnitDay {
  unit: string;
  events: EventType[];
}

function getUnitDay(unit: string, date: Date): UnitDay {
  const dow = date.getDay();
  const s   = UNIT_SCHEDULE[unit];
  const events: EventType[] = [];
  if (s) {
    if (dow === s.admissionDay)         events.push('admission');
    if (dow === s.majorDay)             events.push('major');
    if (dow === s.minorDay)             events.push('minor');
  }
  if (getWeekendDutyUnit(date) === unit) events.push('weekend-duty');
  return { unit, events };
}

/** Days until the next occurrence of a given day-of-week (never 0). */
function daysUntilNext(targetDow: number, from: Date): number {
  const diff = (targetDow - from.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
}

function nextEventDate(targetDow: number, from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + daysUntilNext(targetDow, from));
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const EVENT_PILL: Record<EventType, { label: string; color: string; Icon: React.ComponentType<{className?: string}> }> = {
  admission:      { label: 'Admission + EOT', color: 'bg-teal-600 text-white',    Icon: BedDouble  },
  major:          { label: 'Major OT',        color: 'bg-red-600 text-white',     Icon: Scissors   },
  minor:          { label: 'Minor OT',        color: 'bg-orange-500 text-white',  Icon: Zap        },
  'weekend-duty': { label: 'Weekend Duty',    color: 'bg-violet-600 text-white',  Icon: ShieldAlert },
};

function EventBadge({ type, size = 'normal' }: { type: EventType; size?: 'normal' | 'compact' }) {
  const { label, color, Icon } = EVENT_PILL[type];
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-full px-2.5 py-1 ${color} ${size === 'compact' ? 'text-[10px]' : 'text-xs'}`}>
      <Icon className={size === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {label}
    </span>
  );
}

// ─── Unit-user view (single unit) ────────────────────────────────────────────

function UnitUserSchedule({ unit, date }: { unit: string; date: Date }) {
  const { events } = getUnitDay(unit, date);
  const s = UNIT_SCHEDULE[unit];
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const dutyUnit = isWeekend ? getWeekendDutyUnit(date) : null;

  const hasEvents = events.length > 0;

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-col gap-2 ${
      hasEvents ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${hasEvents ? 'text-slate-400' : 'text-slate-500'}`}>
          {unit} · Today
        </span>
        <span className={`text-xs ${hasEvents ? 'text-slate-400' : 'text-slate-400'}`}>
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
        </span>
      </div>

      {hasEvents ? (
        <div className="flex flex-wrap gap-2">
          {events.map(e => <EventBadge key={e} type={e} />)}
        </div>
      ) : isWeekend ? (
        <div className="text-sm text-slate-500">
          {dutyUnit === unit
            ? <span className="font-semibold text-violet-700">Your unit is on weekend duty</span>
            : <span><span className="font-semibold text-slate-700">{dutyUnit}</span> is on weekend duty today</span>
          }
        </div>
      ) : (
        <div className="text-sm text-slate-500 space-y-0.5">
          <span>No OT or admission today · </span>
          {s && (
            <span>
              Next: <span className="font-semibold text-slate-700">
                {daysUntilNext(s.majorDay, date) <= daysUntilNext(s.minorDay, date)
                  ? `Major OT ${nextEventDate(s.majorDay, date)}`
                  : `Minor OT ${nextEventDate(s.minorDay, date)}`}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin view (all units) ───────────────────────────────────────────────────

function AdminSchedule({ date }: { date: Date }) {
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const dutyUnit  = isWeekend ? getWeekendDutyUnit(date) : null;

  const rows = ALL_UNITS.map(u => getUnitDay(u, date));
  const anyEvents = rows.some(r => r.events.length > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Today's Department Schedule
        </span>
        <span className="text-xs text-slate-400">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {!anyEvents && !isWeekend ? (
        <p className="text-sm text-slate-400 italic">No scheduled OT or admissions today.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {rows.map(({ unit, events }) => {
            const s = UNIT_SCHEDULE[unit];
            // Build "next" label for units with nothing today
            let nextLabel = '';
            if (events.length === 0 && s) {
              const dMaj  = daysUntilNext(s.majorDay,     date);
              const dMin  = daysUntilNext(s.minorDay,     date);
              const dAdm  = daysUntilNext(s.admissionDay, date);
              const least = Math.min(dMaj, dMin, dAdm);
              if (least === dAdm) nextLabel = `Admit ${nextEventDate(s.admissionDay, date)}`;
              else if (least === dMaj) nextLabel = `Maj OT ${nextEventDate(s.majorDay, date)}`;
              else nextLabel = `Min OT ${nextEventDate(s.minorDay, date)}`;
            }
            return (
              <div key={unit}
                className={`rounded-lg border p-2.5 ${events.length > 0 ? 'border-slate-300 bg-slate-50' : 'border-slate-100 bg-slate-50/40'}`}>
                <div className="text-xs font-bold text-slate-600 mb-1.5">{unit}</div>
                {events.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {events.map(e => <EventBadge key={e} type={e} size="compact" />)}
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] text-slate-400 block">No events today</span>
                    {nextLabel && (
                      <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                        Next: {nextLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isWeekend && dutyUnit && (
        <div className="mt-2 flex items-center gap-2 text-xs text-violet-700 font-semibold">
          <ShieldAlert className="w-3.5 h-3.5" />
          Weekend duty: <span className="font-bold">{dutyUnit}</span>
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface TodayScheduleProps {
  userUnit?: string | null;
  isAdmin: boolean;
}

const TodaySchedule: React.FC<TodayScheduleProps> = ({ userUnit, isAdmin }) => {
  const today = useMemo(() => new Date(), []);

  if (isAdmin) return <AdminSchedule date={today} />;
  if (userUnit && UNIT_SCHEDULE[userUnit]) return <UnitUserSchedule unit={userUnit} date={today} />;
  return null; // user has no unit and isn't admin — nothing to show
};

export default TodaySchedule;
