/**
 * SpecialtyDataPanel.tsx
 * Renders specialty-specific clinical fields for a patient based on the
 * active department template. Fields are grouped into collapsible cards.
 * Supports view mode and inline edit mode.
 */

import React, { useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Edit2, Save, X, Plus,
  Stethoscope, Brain, Heart, Activity, Shield, Users,
  FlaskConical, AlertTriangle, ClipboardList, Eye, Wind,
  Scissors, Layers, BarChart2
} from 'lucide-react';
import { SpecialtyFieldGroup, SpecialtyField } from '../types';

// ─── Icon map (Lucide icon names → components) ────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Stethoscope, Brain, Heart, Activity, Shield, Users,
  FlaskConical, AlertTriangle, ClipboardList, Eye, Wind,
  Scissors, Layers, BarChart2,
  // Aliases used in templates
  ShieldAlert: AlertTriangle,
  TestTube: FlaskConical,
  Zap: Activity,
  FileText: ClipboardList,
  Target: Activity,
  Gauge: Activity,
  Diamond: Activity,
  Pipette: Activity,
  Bandage: Shield,
  UtensilsCrossed: Activity,
  Circle: Activity,
  Star: Activity,
  Baby: Users,
  Droplet: Activity,
  TrendingUp: Activity,
  Ear: Activity,
  Pill: Shield,
  User: Users,
  Calendar: ClipboardList,
};

function getGroupIcon(name?: string) {
  if (!name) return Stethoscope;
  return ICON_MAP[name] ?? Stethoscope;
}

// ─── Field renderer ───────────────────────────────────────────────────────────

interface FieldProps {
  field: SpecialtyField;
  value: unknown;
  editing: boolean;
  onChange: (key: string, val: unknown) => void;
}

const FieldView: React.FC<FieldProps> = ({ field, value, editing, onChange }) => {
  const strVal = value != null ? String(value) : '';

  if (!editing) {
    // Read-only display
    if (field.type === 'boolean') {
      return (
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold text-slate-500 min-w-0 flex-1">{field.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${value ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {value ? 'Yes' : 'No'}
          </span>
        </div>
      );
    }
    if (!strVal) {
      return (
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold text-slate-500 flex-1">{field.label}</span>
          <span className="text-xs text-slate-300 italic">—</span>
        </div>
      );
    }
    return (
      <div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{field.label}</span>
        <p className="text-sm text-slate-800 mt-0.5 leading-relaxed">
          {strVal}{field.unit ? ` ${field.unit}` : ''}
        </p>
      </div>
    );
  }

  // Edit mode
  const baseInput = 'w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white';

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(field.key, e.target.checked)}
          className="w-4 h-4 accent-blue-600"
        />
        <span className="text-sm text-slate-700">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">{field.label}</label>
        <select
          value={strVal}
          onChange={e => onChange(field.key, e.target.value)}
          className={baseInput}
        >
          <option value="">— select —</option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">{field.label}</label>
        <textarea
          value={strVal}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${baseInput} resize-y`}
        />
      </div>
    );
  }

  if (field.type === 'score') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">
          {field.label}
          {field.min != null && field.max != null && (
            <span className="text-slate-400 font-normal ml-1">({field.min}–{field.max})</span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={strVal}
            onChange={e => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
            className={`${baseInput} w-24`}
          />
          {strVal && field.min != null && field.max != null && (
            <div className="flex-1 bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((Number(strVal) - field.min) / (field.max - field.min)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">
          {field.label}{field.unit ? <span className="text-slate-400 font-normal ml-1">({field.unit})</span> : null}
        </label>
        <input
          type="number"
          min={field.min}
          max={field.max}
          step="any"
          value={strVal}
          onChange={e => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={field.placeholder}
          className={`${baseInput} w-36`}
        />
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-500 block mb-1">{field.label}</label>
        <input
          type="date"
          value={strVal}
          onChange={e => onChange(field.key, e.target.value)}
          className={`${baseInput} w-44`}
        />
      </div>
    );
  }

  // Default: text
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 block mb-1">{field.label}</label>
      <input
        type="text"
        value={strVal}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={baseInput}
      />
    </div>
  );
};

// ─── Group card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: SpecialtyFieldGroup;
  data: Record<string, unknown>;
  canEdit: boolean;
  onSave: (groupKey: string, groupData: Record<string, unknown>) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, data, canEdit, onSave }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const Icon = getGroupIcon(group.icon);

  // Count filled fields for the summary badge
  const filledCount = group.fields.filter(f => {
    const v = data[f.key];
    return v != null && v !== '' && v !== false;
  }).length;

  const startEdit = () => {
    setDraft({ ...data });
    setEditing(true);
    setOpen(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };

  const handleChange = useCallback((key: string, val: unknown) => {
    setDraft(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = () => {
    onSave(group.key, draft);
    setEditing(false);
    setDraft({});
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={() => { if (!editing) setOpen(o => !o); }}
      >
        <div className="bg-blue-50 p-1.5 rounded-lg shrink-0">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <span className="font-semibold text-slate-800 text-sm flex-1">{group.label}</span>

        {filledCount > 0 && !editing && (
          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
            {filledCount}/{group.fields.length}
          </span>
        )}

        {canEdit && !editing && (
          <button
            onClick={e => { e.stopPropagation(); startEdit(); }}
            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}

        {!editing && (open
          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </div>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4">
          {editing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {group.fields.map(field => (
                  <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <FieldView
                      field={field}
                      value={draft[field.key]}
                      editing={true}
                      onChange={handleChange}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.fields.map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <FieldView
                    field={field}
                    value={data[field.key]}
                    editing={false}
                    onChange={() => {}}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  /** The field groups from the active template (or hospital override). */
  fieldGroups: SpecialtyFieldGroup[];
  /** Current specialty data values for this patient. */
  data: Record<string, unknown>;
  /** Whether the current user can edit. */
  canEdit: boolean;
  /** Called whenever a group is saved — merge groupData into the full specialtyData. */
  onSave: (updatedData: Record<string, unknown>) => void;
  /** Specialty display name (for the panel header). */
  specialtyLabel: string;
  /** Tailwind color prefix for accent, e.g. 'blue', 'emerald'. */
  color?: string;
}

const SpecialtyDataPanel: React.FC<Props> = ({
  fieldGroups,
  data,
  canEdit,
  onSave,
  specialtyLabel,
  color = 'blue',
}) => {
  const handleGroupSave = useCallback((groupKey: string, groupData: Record<string, unknown>) => {
    // Extract only the keys that belong to this group (avoid polluting with stale keys)
    const updated = { ...data, ...groupData };
    onSave(updated);
  }, [data, onSave]);

  if (fieldGroups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-1 w-6 rounded-full bg-${color}-500`} />
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
          {specialtyLabel} — Clinical Data
        </h3>
        {canEdit && (
          <span className="text-[10px] text-slate-400 ml-auto">Click ✎ on any section to edit</span>
        )}
      </div>
      {fieldGroups.map(group => (
        <GroupCard
          key={group.key}
          group={group}
          data={data}
          canEdit={canEdit}
          onSave={handleGroupSave}
        />
      ))}
    </div>
  );
};

export default SpecialtyDataPanel;
