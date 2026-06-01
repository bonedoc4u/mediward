/**
 * PacFlowChart.tsx
 * Tree layout matching the hand-drawn sketch:
 *
 *   [PAC] ─┬─ [Medicine Fitness] ─┬─ [FBS/PPBS]
 *           │                      └─ [Correct Anaemia]
 *           ├─ [Surgery Fitness]   ─── [...]
 *           └─ [Chest Medicine]    ─── [...]
 *
 * PAC root on the left, branches stack vertically in the middle,
 * sub-items extend right from each branch.
 */

import React, { useState, useRef, useEffect } from 'react';
import { PacFlowBranch, PacFlowData, PacFlowItem } from '../types';
import { Check, Plus, Trash2, HeartPulse, X } from 'lucide-react';

function emptyFlow(): PacFlowData {
  return { seenByAnaesthesia: false, branches: [] };
}

interface Props {
  pacFlow?: PacFlowData;
  onChange: (updated: PacFlowData) => void;
  readOnly?: boolean;
}

// ─── Sub-item chip ────────────────────────────────────────────────────────────
const SubItemChip: React.FC<{
  item: PacFlowItem;
  readOnly: boolean;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ item, readOnly, onToggle, onDelete }) => (
  <div className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
    item.isDone
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
  }`}>
    <button
      onClick={readOnly ? undefined : onToggle}
      disabled={readOnly}
      className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
        item.isDone
          ? 'bg-green-500 border-green-600 text-white'
          : 'border-slate-300 hover:border-blue-400 bg-white'
      }`}
    >
      {item.isDone && <Check className="w-2.5 h-2.5" />}
    </button>
    <span className={item.isDone ? 'line-through opacity-60' : ''}>{item.label}</span>
    {!readOnly && (
      <button
        onClick={onDelete}
        className="ml-0.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

// ─── Branch row ───────────────────────────────────────────────────────────────
const BranchRow: React.FC<{
  branch: PacFlowBranch;
  isLast: boolean;
  readOnly: boolean;
  onToggleDone: () => void;
  onAddItem: (label: string) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onDelete: () => void;
}> = ({ branch, isLast, readOnly, onToggleDone, onAddItem, onToggleItem, onDeleteItem, onDelete }) => {
  const [newItem, setNewItem]         = useState('');
  const [addingItem, setAddingItem]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (addingItem) inputRef.current?.focus(); }, [addingItem]);

  const handleAddItem = () => {
    const t = newItem.trim();
    if (!t) return;
    onAddItem(t);
    setNewItem('');
    // keep input open for rapid entry
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex items-start gap-0">
      {/* ── Trunk connector ── */}
      <div className="flex flex-col items-center shrink-0 w-6 self-stretch">
        {/* Top segment of the vertical trunk line */}
        <div className={`w-px flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-300'}`} />
        {/* Horizontal spur to this branch */}
        <div className="flex items-center w-full">
          <div className="flex-1 h-px bg-slate-300" />
        </div>
        {/* Bottom segment continues trunk downward */}
        <div className={`w-px flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-300'}`} />
      </div>

      {/* ── Branch card ── */}
      <div className={`shrink-0 w-44 rounded-xl border-2 text-sm transition-colors my-2 ${
        branch.isDone ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'
      }`}>
        <div className="px-3 py-2 flex items-center justify-between gap-1">
          <span className={`font-semibold text-xs leading-tight ${branch.isDone ? 'text-green-800' : 'text-slate-800'}`}>
            {branch.label}
          </span>
          {!readOnly && (
            <button onClick={onDelete} className="shrink-0 text-slate-200 hover:text-red-500 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          onClick={readOnly ? undefined : onToggleDone}
          disabled={readOnly}
          className={`w-full flex items-center justify-center gap-1 py-1.5 border-t text-[11px] font-semibold transition-colors ${
            branch.isDone
              ? 'bg-green-500 border-green-400 text-white'
              : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-green-50 hover:text-green-700 hover:border-green-100'
          } ${readOnly ? 'cursor-default' : 'cursor-pointer'} rounded-b-xl`}
        >
          <Check className="w-3 h-3" />
          {branch.isDone ? 'Cleared' : 'Mark cleared'}
        </button>
      </div>

      {/* ── Sub-items connector + list ── */}
      {(branch.items.length > 0 || !readOnly) && (
        <div className="flex items-start gap-0 ml-0">
          {/* Horizontal line from branch to sub-items */}
          <div className="w-4 h-px bg-slate-200 self-center mt-0" style={{ marginTop: '2.1rem' }} />

          <div className="flex flex-col gap-1.5 my-2">
            {branch.items.map(item => (
              <SubItemChip
                key={item.id}
                item={item}
                readOnly={readOnly}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}

            {/* Add sub-item */}
            {!readOnly && (
              addingItem ? (
                <div className="flex items-center gap-1 bg-white border border-blue-200 rounded-lg px-2 py-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddItem();
                      if (e.key === 'Escape') { setAddingItem(false); setNewItem(''); }
                    }}
                    placeholder="Add requirement…"
                    className="text-[11px] w-36 focus:outline-none bg-transparent"
                  />
                  <button onClick={handleAddItem} disabled={!newItem.trim()} className="text-blue-600 disabled:opacity-30">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setAddingItem(false); setNewItem(''); }} className="text-slate-400">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingItem(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-blue-600 border border-dashed border-slate-200 hover:border-blue-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add requirement
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const PacFlowChart: React.FC<Props> = ({ pacFlow, onChange, readOnly = false }) => {
  const flow = pacFlow ?? emptyFlow();
  const [newBranchLabel, setNewBranchLabel] = useState('');
  const [addingBranch, setAddingBranch]     = useState(false);
  const branchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (addingBranch) branchInputRef.current?.focus(); }, [addingBranch]);

  const update = (next: Partial<PacFlowData>) => onChange({ ...flow, ...next });

  const updateBranch = (id: string, patch: Partial<PacFlowBranch>) =>
    update({ branches: flow.branches.map(b => b.id === id ? { ...b, ...patch } : b) });

  const addBranch = () => {
    const label = newBranchLabel.trim();
    if (!label) return;
    update({ branches: [...flow.branches, { id: `b-${Date.now()}`, label, isDone: false, items: [] }] });
    setNewBranchLabel('');
    // keep input open for rapid entry of multiple branches
    requestAnimationFrame(() => branchInputRef.current?.focus());
  };

  const deleteBranch = (id: string) =>
    update({ branches: flow.branches.filter(b => b.id !== id) });

  const addItem = (branchId: string, label: string) => {
    const newItem: PacFlowItem = { id: `i-${Date.now()}`, label, isDone: false };
    updateBranch(branchId, {
      items: [...(flow.branches.find(b => b.id === branchId)?.items ?? []), newItem],
    });
  };

  const toggleItem = (branchId: string, itemId: string) => {
    const branch = flow.branches.find(b => b.id === branchId);
    if (!branch) return;
    const items = branch.items.map(i => i.id === itemId ? { ...i, isDone: !i.isDone } : i);
    updateBranch(branchId, { items });
  };

  const deleteItem = (branchId: string, itemId: string) => {
    const branch = flow.branches.find(b => b.id === branchId);
    if (!branch) return;
    updateBranch(branchId, { items: branch.items.filter(i => i.id !== itemId) });
  };

  const allClear = flow.seenByAnaesthesia && flow.branches.length > 0 && flow.branches.every(b => b.isDone);

  return (
    <div className="space-y-3">
      {allClear && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm font-semibold text-green-800">
          <Check className="w-4 h-4" /> All clearances complete — patient is PAC Fit
        </div>
      )}

      <div className="flex items-start gap-0 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>

        {/* ── PAC Root node ── */}
        <div className="shrink-0 flex items-start gap-0">
          <button
            onClick={readOnly ? undefined : () => update({ seenByAnaesthesia: !flow.seenByAnaesthesia })}
            disabled={readOnly}
            className={`shrink-0 w-28 rounded-xl border-2 p-3 text-center transition-colors self-center ${
              flow.seenByAnaesthesia
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400'
            } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <HeartPulse className={`w-5 h-5 mx-auto mb-1 ${flow.seenByAnaesthesia ? 'text-white' : 'text-blue-500'}`} />
            <p className="text-[11px] font-bold leading-tight">PAC</p>
            <p className={`text-[10px] mt-0.5 ${flow.seenByAnaesthesia ? 'text-blue-200' : 'text-slate-400'}`}>
              {flow.seenByAnaesthesia ? 'Seen ✓' : 'Tap when seen'}
            </p>
          </button>

          {/* Vertical trunk line from PAC to branches */}
          {flow.seenByAnaesthesia && (
            <div className="flex flex-col items-start self-stretch ml-2">
              {/* Tiny horizontal bridge */}
              <div className="w-3 h-px bg-slate-300 self-center" style={{ marginTop: 'calc(50% + 0px)' }} />
            </div>
          )}
        </div>

        {/* ── Branches + sub-items ── */}
        {flow.seenByAnaesthesia && (
          <div className="flex flex-col shrink-0">
            {/* Vertical trunk */}
            <div className="relative flex flex-col">
              {/* The vertical line runs through the left side of this column */}
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-300" />

              {flow.branches.map((branch, idx) => (
                <BranchRow
                  key={branch.id}
                  branch={branch}
                  isLast={idx === flow.branches.length - 1}
                  readOnly={readOnly}
                  onToggleDone={() => updateBranch(branch.id, { isDone: !branch.isDone })}
                  onAddItem={label => addItem(branch.id, label)}
                  onToggleItem={itemId => toggleItem(branch.id, itemId)}
                  onDeleteItem={itemId => deleteItem(branch.id, itemId)}
                  onDelete={() => deleteBranch(branch.id)}
                />
              ))}

              {/* Add branch row */}
              {!readOnly && (
                <div className="flex items-center gap-0 pl-6 py-2">
                  {addingBranch ? (
                    <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-xl px-3 py-1.5 shadow-sm">
                      <input
                        ref={branchInputRef}
                        type="text"
                        value={newBranchLabel}
                        onChange={e => setNewBranchLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addBranch();
                          if (e.key === 'Escape') { setAddingBranch(false); setNewBranchLabel(''); }
                        }}
                        placeholder="e.g. Medicine Fitness…"
                        className="text-xs w-48 focus:outline-none bg-transparent"
                      />
                      <button onClick={addBranch} disabled={!newBranchLabel.trim()} className="text-blue-600 hover:text-blue-800 disabled:opacity-30">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setAddingBranch(false); setNewBranchLabel(''); }} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingBranch(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-300 rounded-xl transition-colors font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {flow.branches.length === 0 ? 'Add PAC requirement' : 'Add branch'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress pills */}
      {flow.seenByAnaesthesia && flow.branches.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {flow.branches.map(b => (
            <span key={b.id} className={`px-2 py-0.5 rounded-full text-[11px] border font-medium ${
              b.isDone
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {b.isDone ? '✓' : '○'} {b.label}
            </span>
          ))}
          <span className="text-[11px] text-slate-400 self-center">
            {flow.branches.filter(b => b.isDone).length}/{flow.branches.length} cleared
          </span>
        </div>
      )}
    </div>
  );
};

export default PacFlowChart;
