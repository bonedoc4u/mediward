import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Check, Trash2 } from 'lucide-react';
import { UNIT_SCHEDULE, getWeekendDutyUnit, WeekendDutyMap } from '../utils/otSchedule';
import { useConfig } from '../contexts/AppContext';

// JS Date.getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
type OTType = 'major' | 'minor' | 'eot' | null;

function getOTType(unit: string | undefined, date: Date, dutyMap: WeekendDutyMap): OTType {
  const dow = date.getDay();
  // Weekend = EOT, but only when THIS unit is on weekend duty (roster or rotation).
  if (dow === 0 || dow === 6) {
    return unit && getWeekendDutyUnit(date, dutyMap) === unit.toUpperCase() ? 'eot' : null;
  }
  if (!unit) return null;
  const s = UNIT_SCHEDULE[unit];
  if (!s) return null;
  if (dow === s.majorDay)     return 'major';
  if (dow === s.minorDay)     return 'minor';
  if (dow === s.admissionDay) return 'eot';
  return null;
}

const OT_STYLES: Record<Exclude<OTType, null>, { label: string; cell: string; badge: string }> = {
  major: { label: 'MAJ', cell: 'bg-red-50 hover:bg-red-100 border-red-200',    badge: 'bg-red-600 text-white'     },
  minor: { label: 'MIN', cell: 'bg-orange-50 hover:bg-orange-100 border-orange-200', badge: 'bg-orange-500 text-white' },
  eot:   { label: 'EOT', cell: 'bg-blue-50 hover:bg-blue-100 border-blue-200', badge: 'bg-teal-600 text-white'    },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

interface Props {
  unit?: string | null;
  value: string;          // YYYY-MM-DD or ''
  minDate: string;        // YYYY-MM-DD
  onSelect: (date: string) => void;
  onCancel: () => void;
  /** Clear the currently-assigned date. Shown only when a date is already set. */
  onClear?: () => void;
}

const OTDatePicker: React.FC<Props> = ({ unit, value, minDate, onSelect, onCancel, onClear }) => {
  const { weekendDuty } = useConfig();
  const ref = useRef<HTMLDivElement>(null);

  const initial = value
    ? new Date(value + 'T00:00:00')
    : new Date(minDate + 'T00:00:00');

  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected,  setSelected]  = useState(value || '');

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const minMs = new Date(minDate + 'T00:00:00').getTime();

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDayClick = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d.getTime() < minMs) return;
    const ymd = toYMD(d);
    setSelected(ymd);
  };

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  const unitLabel = unit && UNIT_SCHEDULE[unit] ? unit : null;

  return (
    <div
      ref={ref}
      className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-80 max-w-full"
    >
      {/* Unit label + legend */}
      {unitLabel && (
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{unitLabel} OT Days</span>
          <div className="flex items-center gap-1 ml-auto">
            {(['major','minor','eot'] as const).map(t => (
              <span key={t} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${OT_STYLES[t].badge}`}>
                {OT_STYLES[t].label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <span className="text-sm font-bold text-slate-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const date    = new Date(viewYear, viewMonth, day);
          const ymd     = toYMD(date);
          const isPast  = date.getTime() < minMs;
          const isSel   = ymd === selected;
          const otType  = getOTType(unit ?? undefined, date, weekendDuty);
          const style   = otType ? OT_STYLES[otType] : null;

          return (
            <button
              key={day}
              onClick={() => !isPast && handleDayClick(day)}
              disabled={isPast}
              className={`
                relative flex flex-col items-center justify-start rounded-lg border py-1 px-0.5
                transition-colors text-center
                ${isPast
                  ? 'opacity-30 cursor-not-allowed border-transparent'
                  : isSel
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : style
                      ? `${style.cell} border cursor-pointer`
                      : 'hover:bg-slate-100 border-transparent cursor-pointer'
                }
              `}
            >
              <span className={`text-xs font-semibold leading-none ${isSel ? 'text-white' : isPast ? 'text-slate-400' : 'text-slate-800'}`}>
                {day}
              </span>
              {otType && !isSel && (
                <span className={`mt-0.5 text-[8px] font-bold leading-none px-0.5 rounded ${style!.badge}`}>
                  {style!.label}
                </span>
              )}
              {otType && isSel && (
                <span className="mt-0.5 text-[8px] font-bold leading-none text-slate-300">
                  {style!.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1">
          <button onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded hover:bg-slate-100 transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          {value && onClear && (
            <button onClick={onClear} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        {selected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {new Date(selected + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OTDatePicker;
