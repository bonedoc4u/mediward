import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Patient } from '../types';
import { useConfig } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { getOTCycleDates } from '../utils/otSchedule';
import { OTPatient, OTType, OTListMeta, getTableOptionsForType, getDefaultCategoryForType, PENDING_ID_PREFIX } from '../utils/otListTypes';
import { buildOTPatientEntry } from '../utils/otListAssign';
import { preferRowCollision } from '../utils/otListCollision';
import { findNewlyPlannedOTAssignments } from '../utils/otListAutoPopulate';
import { fetchOTList, upsertOTListMeta, insertOTListEntry, updateOTListEntry, deleteOTListEntry, reorderOTListEntries } from '../services/otListService';
import { hasPendingSurgery } from '../utils/calculations';
import { exportOTListToExcel, exportOTListToPDF } from '../utils/otListExport';
import { Plus, Calendar, Download, UserPlus, X, RefreshCw, FileSpreadsheet, GripVertical, ShieldAlert } from 'lucide-react';
import OTListTable from './otlist/OTListTable';
import PendingSurgeryPanel from './otlist/PendingSurgeryPanel';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

interface OTListManagementProps {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

const OTListManagement: React.FC<OTListManagementProps> = ({ patients }) => {
  const { unitChiefs, hospitalName, department, weekendDuty } = useConfig();
  const { user, selectedUnit } = useAuth();
  const [activeTab, setActiveTab] = useState<OTType>('Major');

  // Resolve the effective unit: admin's picker selection takes priority over profile unit
  const effectiveUnit = (
    user?.role === 'admin' && selectedUnit && selectedUnit !== 'all'
      ? selectedUnit
      : user?.unit ?? 'OR1'
  ).toUpperCase();

  // OT cycle = the 7 days after this unit's admission day (see getOTCycleDates).
  // Each tab defaults to that cycle's Major / Minor / EOT date.
  const cycle = useMemo(() => getOTCycleDates(effectiveUnit, new Date(), weekendDuty), [effectiveUnit, weekendDuty]);
  const [majorDate, setMajorDate] = useState<string>(cycle.majorDate);
  const [minorDate, setMinorDate] = useState<string>(cycle.minorDate);
  const [eotDate,   setEotDate]   = useState<string>(cycle.eotDate);
  // Re-anchor when the unit changes (any manual date edits reset to the cycle).
  useEffect(() => {
    setMajorDate(cycle.majorDate);
    setMinorDate(cycle.minorDate);
    setEotDate(cycle.eotDate);
  }, [cycle]);

  const selectedDate    = activeTab === 'Major' ? majorDate : activeTab === 'Minor' ? minorDate : eotDate;
  const setSelectedDate = activeTab === 'Major' ? setMajorDate : activeTab === 'Minor' ? setMinorDate : setEotDate;
  const [otList, setOtList] = useState<OTPatient[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which category is the current resolved drag target (for the
  // CategoryDropZone highlight — see handleDragOver for how it's resolved).
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [surgeonUnit, setSurgeonUnit] = useState(effectiveUnit);
  const [surgeon, setSurgeon] = useState('');
  const [otTime, setOtTime] = useState('8.00AM');
  const [otListMetaByType, setOtListMetaByType] = useState<Record<OTType, OTListMeta | null>>({ Major: null, Minor: null, EOT: null });
  const [isLoadingOTList, setIsLoadingOTList] = useState(false);
  // "Have I actually finished loading THIS exact unit/dates combination" —
  // deliberately not just a boolean. isLoadingOTList flips true/false around
  // the fetch, but that's a state update that only takes effect on the next
  // render; the auto-populate effect below runs in the same initial commit
  // and would otherwise see the stale `false` and fire against an empty
  // otList (see that effect's comment for the consequences). Comparing
  // against a key that's only set inside the load effect's own successful
  // `.then` closes that gap, and also covers the case where a date changes
  // mid-flight: the key won't match the new combination until a fresh load
  // for it actually completes.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [otListError, setOtListError] = useState<string | null>(null);
  const saveMetaTimerRef = useRef<Partial<Record<OTType, ReturnType<typeof setTimeout>>>>({});
  // Mirrors otList for handleUpdateEntry's debounced save below, which needs
  // the CURRENT version at fire time (not whatever was captured when the
  // keystroke scheduled the save) — a reorder or another field's save
  // completing in between would otherwise be missed, causing a spurious
  // version-conflict error.
  const otListRef = useRef(otList);
  useEffect(() => { otListRef.current = otList; }, [otList]);
  // Per-entry accumulated field changes awaiting their debounced save, and
  // that entry's pending save timer. Keyed by entry id (not by field) so
  // editing two different fields on the same row within the debounce
  // window merges into one save instead of the second field's keystroke
  // cancelling the first field's still-pending one.
  const pendingEntryChangesRef = useRef<Record<string, Partial<Omit<OTPatient, 'id' | 'otListId' | 'version' | 'otType'>>>>({});
  const saveEntryTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auto-fill surgeon from unit chiefs whenever the unit or chiefs config
  // changes — but only when there's no persisted list yet for this tab; a
  // saved list's own surgeon override always wins over the chief default.
  useEffect(() => {
    if (otListMetaByType[activeTab]) return;
    const key = surgeonUnit.replace(/\s+/g, '').toUpperCase();
    const chief = unitChiefs[key];
    if (chief) setSurgeon(chief);
  }, [surgeonUnit, unitChiefs, activeTab, otListMetaByType]);

  // Load all three tabs' persisted lists whenever the unit or any of their
  // dates changes (not just the active tab — the auto-populate effect below
  // scans all three tabs' dates at once, so loading only the active tab
  // would risk it not knowing an entry already exists in a not-yet-loaded
  // tab and inserting a duplicate).
  useEffect(() => {
    if (!user?.hospitalId) return;
    let cancelled = false;
    const key = `${effectiveUnit}|${majorDate}|${minorDate}|${eotDate}`;
    setIsLoadingOTList(true);
    setOtListError(null);

    const tabs: Array<{ type: OTType; date: string }> = [
      { type: 'Major', date: majorDate },
      { type: 'Minor', date: minorDate },
      { type: 'EOT', date: eotDate },
    ];

    Promise.all(tabs.map(t => fetchOTList(user.hospitalId!, effectiveUnit, t.type, t.date)))
      .then(results => {
        if (cancelled) return;
        setOtList(results.flatMap(r => r.entries));
        setOtListMetaByType({
          Major: results[0].list,
          Minor: results[1].list,
          EOT: results[2].list,
        });
        setLoadedKey(key);
      })
      .catch(err => {
        if (!cancelled) setOtListError(err instanceof Error ? err.message : 'Failed to load OT list');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOTList(false);
      });

    return () => { cancelled = true; };
  }, [user?.hospitalId, effectiveUnit, majorDate, minorDate, eotDate]);

  // Re-point surgeon/unit/time at whichever tab's own saved values exist,
  // whenever the active tab changes or that tab's data just finished loading
  // (the effect above already fetched it — this doesn't re-fetch, just
  // re-syncs the editable fields to match).
  useEffect(() => {
    const meta = otListMetaByType[activeTab];
    if (meta) {
      setSurgeon(meta.surgeon);
      setSurgeonUnit(meta.surgeonUnit);
      setOtTime(meta.otTime);
    } else {
      setSurgeon('');
      setSurgeonUnit(effectiveUnit);
      setOtTime('8.00AM');
    }
  }, [activeTab, otListMetaByType, effectiveUnit]);

  // Clear any pending debounced metadata saves on unmount so they can't fire
  // (and write stale field values) after the component is gone. Iterates
  // every tab's timer, not just one — see saveMetaTimerRef's per-tab keying
  // below.
  useEffect(() => {
    return () => {
      Object.values(saveMetaTimerRef.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      Object.values(saveEntryTimerRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Auto-populate patients whose plannedDos matches any of the three tab
  // dates. Runs after the load effect (Task 4) has populated otList from the
  // database, so the "already present" set findNewlyPlannedOTAssignments
  // checks against correctly reflects everyone already persisted across all
  // three tabs, not just the currently-active one — avoiding a duplicate
  // insert for a patient already assigned in a tab the user hasn't switched
  // to yet this session.
  //
  // Gated on loadedKey matching the current unit/dates combination — NOT on
  // isLoadingOTList being false. isLoadingOTList is set true via
  // setIsLoadingOTList, a state update that only takes effect on the next
  // render; this effect runs in the SAME initial commit as the load effect
  // and would read the old (false) value, firing against an empty otList
  // and inserting duplicates for everyone already persisted. Comparing a
  // key that's only stamped inside the load effect's own successful
  // `.then` closes that gap and also covers a date change landing between
  // the two effects: the key won't match until a fresh load for the new
  // combination actually completes, so this can't write into the wrong
  // date's list using a stale otListMetaByType entry.
  useEffect(() => {
    const currentKey = `${effectiveUnit}|${majorDate}|${minorDate}|${eotDate}`;
    if (!user?.hospitalId || loadedKey !== currentKey) return;
    const tabDates: Array<{ date: string; fallbackType: OTType }> = [
      { date: majorDate, fallbackType: 'Major' },
      { date: minorDate, fallbackType: 'Minor' },
      { date: eotDate,   fallbackType: 'EOT'   },
      // Weekend EOT days when this unit is on weekend duty this cycle.
      ...cycle.eotWeekendDates.map(date => ({ date, fallbackType: 'EOT' as OTType })),
    ];
    const existingIpNos = new Set(otList.map(p => p.ipNo));
    const newlyPlanned = findNewlyPlannedOTAssignments(patients, existingIpNos, tabDates);

    newlyPlanned.forEach(({ patient: p, otType, date }) => {
      const category = getDefaultCategoryForType(otType);
      const existingInCategory = otList.filter(x => x.otType === otType && x.category === category);
      const optimisticEntry = buildOTPatientEntry(p, otType, category, existingInCategory);
      setOtList(prev => [...prev, optimisticEntry]);

      (async () => {
        try {
          let listMeta = otListMetaByType[otType];
          if (!listMeta) {
            listMeta = await upsertOTListMeta(user.hospitalId!, effectiveUnit, otType, date, { surgeon, surgeonUnit, otTime });
            setOtListMetaByType(prev => ({ ...prev, [otType]: listMeta }));
          }
          const saved = await insertOTListEntry(listMeta.id, user.hospitalId!, optimisticEntry);
          setOtList(prev => prev.map(x => (x.id === optimisticEntry.id ? saved : x)));
        } catch (err) {
          setOtList(prev => prev.filter(x => x.id !== optimisticEntry.id));
          setOtListError(err instanceof Error ? err.message : 'Failed to auto-save a planned patient');
        }
      })();
    });
  }, [majorDate, minorDate, eotDate, effectiveUnit, patients, cycle, loadedKey]);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // Require movement of 8px before drag starts (prevents accidental clicks)
        },
    }),
    useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250, // Press and hold for 250ms to start drag
            tolerance: 5, // Allow 5px movement during hold
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter pending patients for import (not yet in the current tab's list)
  const pendingPatients = patients.filter(p =>
    hasPendingSurgery(p) &&
    !otList.some(ot => ot.ipNo === p.ipNo && ot.otType === activeTab)
  );

  // Group items by category for the active tab only
  const groupedItems = useMemo(() => {
    const opts = getTableOptionsForType(activeTab);
    const groups: Record<string, OTPatient[]> = {};
    opts.forEach(opt => { groups[opt] = []; });

    const tabItems = otList.filter(i => i.otType === activeTab);
    const sorted   = [...tabItems].sort((a, b) => a.sequence - b.sequence);

    sorted.forEach(item => {
      const cat = item.category && groups[item.category] !== undefined ? item.category : opts[0];
      groups[cat].push(item);
    });
    return groups;
  }, [otList, activeTab]);

  // closestCenter alone can resolve a drop to a category's <tbody> droppable
  // instead of the specific row under the pointer (see utils/otListCollision
  // for the root cause and why this must be category-aware, not just "any
  // row anywhere" — the latter can silently assign a patient to the wrong
  // OT table). Preferring a same-category row when one exists keeps
  // reorders/assigns landing where the user aimed; falling back to the
  // container is still correct for the empty-category case this mechanism
  // exists for.
  const collisionDetection: CollisionDetection = (args) => {
    const collisions = closestCenter(args);
    return preferRowCollision(collisions, otList);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setDragOverCategory(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the containers (categories)
    const activeItem = otList.find(i => i.id === activeId);
    const overItem = otList.find(i => i.id === overId);

    // Resolved drop-target category — drives the CategoryDropZone highlight
    // for both an existing row being reordered and a pending card being
    // assigned (neither of which is in `otList` as `activeItem` for the
    // latter, so this is computed independently of activeItem).
    const overCategory = overItem ? overItem.category : (getTableOptionsForType(activeTab).includes(overId) ? overId : null);
    setDragOverCategory(overCategory ?? null);

    if (!activeItem) return;

    // If over a container (category header/empty space) or an item in a different category
    const activeCategory = activeItem.category;

    if (activeCategory !== overCategory && overCategory) {
        setOtList((items) => {
            return items.map(item => {
                if (item.id === activeId) {
                    return { ...item, category: overCategory };
                }
                return item;
            });
        });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragOverCategory(null);
    if (!over) return;

    const activeIdStr = active.id as string;

    // A drag that started on a pending-panel card is an *assign*, not a
    // reorder — build a new entry in whichever category it was dropped on.
    if (activeIdStr.startsWith(PENDING_ID_PREFIX)) {
      const ipNo = activeIdStr.slice(PENDING_ID_PREFIX.length);
      const patient = patients.find(p => p.ipNo === ipNo);
      if (!patient) return;

      const overId = over.id as string;
      const overItem = otList.find(i => i.id === overId);
      const targetCategory = overItem
        ? overItem.category
        : (getTableOptionsForType(activeTab).includes(overId) ? overId : null);
      if (!targetCategory) return;

      void assignPatientToCategory(patient, targetCategory);
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = otList.findIndex((item) => item.id === active.id);
      const newIndex = otList.findIndex((item) => item.id === over.id);

      // Defensive: active.id should always resolve to a row already in
      // `otList` on this branch (the pending-prefix case returns earlier
      // above), but if it ever didn't, skip rather than let the
      // `otList[oldIndex]` access below produce `undefined` and crash the
      // resequence step further down.
      if (oldIndex !== -1) {
        let newItems: OTPatient[];
        if (newIndex === -1) {
          // `over` resolved to a category container (the tbody's own
          // droppable id, e.g. an empty category) rather than a specific
          // row — collisionDetection above already prefers a same-category
          // row when one exists, so this only happens for the true
          // empty-category case. Explicitly append the dragged item to the
          // end of `otList` instead of relying on arrayMove's implicit
          // "negative index counts back from the end" behaviour, so this
          // branch is visible as intentional rather than an accident of
          // how arrayMove handles -1.
          const movedItem = otList[oldIndex];
          newItems = [...otList.filter((_, i) => i !== oldIndex), movedItem];
        } else {
          newItems = arrayMove(otList, oldIndex, newIndex);
        }

        const opts = getTableOptionsForType(activeTab);
        const groups: Record<string, OTPatient[]> = {};
        opts.forEach(opt => { groups[opt] = []; });

        newItems.filter(i => i.otType === activeTab).forEach(item => {
          const cat = item.category && groups[item.category] !== undefined ? item.category : opts[0];
          groups[cat].push(item);
        });

        const resequenced: OTPatient[] = [];
        Object.keys(groups).forEach(cat => {
          groups[cat].forEach((item, index) => {
            resequenced.push({ ...item, sequence: index + 1 });
          });
        });

        // Merge back with items from other tabs unchanged, then persist.
        const otherTabItems = newItems.filter(i => i.otType !== activeTab);
        setOtList([...otherTabItems, ...resequenced]);

        // Reordering doesn't roll back on failure — a stale/failed reorder
        // only risks a temporarily-odd order, never lost data, so a
        // rollback here would add complexity for a low-stakes failure mode.
        // An error still shows. Entries that haven't round-tripped through
        // insertOTListEntry yet (no version) have nothing to persist to.
        const persistable = resequenced
          .filter(item => item.version != null)
          .map(item => ({ id: item.id, sequence: item.sequence, category: item.category ?? '' }));
        if (persistable.length > 0) {
          // A reorder bumps each row's version server-side (the optimistic-
          // lock trigger fires on every update) — merge the returned
          // versions back in, or the next field edit to any of these rows
          // would carry a stale version and be rejected as a false conflict.
          reorderOTListEntries(persistable)
            .then(updated => {
              const versionById = new Map(updated.map(u => [u.id, u.version]));
              setOtList(prev => prev.map(p => (versionById.has(p.id) ? { ...p, version: versionById.get(p.id)! } : p)));
            })
            .catch(err => {
              setOtListError(err instanceof Error ? err.message : 'Failed to save new order');
            });
        }
      }
    }
  };

  // A cancelled drag (Escape key, or an interrupted touch gesture) fires
  // neither onDragEnd's "drop" path nor its "!over" early return in every
  // case — without this, activeId/dragOverCategory could be left set,
  // leaving the DragOverlay or the category highlight stuck until the next
  // drag starts.
  const handleDragCancel = () => {
    setActiveId(null);
    setDragOverCategory(null);
  };

  const saveOTListMeta = async (next: { surgeon: string; surgeonUnit: string; otTime: string }) => {
    if (!user?.hospitalId) return;
    try {
      const meta = await upsertOTListMeta(user.hospitalId, effectiveUnit, activeTab, selectedDate, next);
      setOtListMetaByType(prev => ({ ...prev, [activeTab]: meta }));
    } catch (err) {
      setOtListError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // Debounced wrapper around saveOTListMeta — only actual keystrokes (via the
  // three onChange handlers below) should schedule a save. Programmatic
  // field changes (e.g. the re-sync effect firing on tab switch) call
  // setSurgeon/setSurgeonUnit/setOtTime directly and never go through this,
  // so they can't trigger a spurious write. A ref (not state) holds the
  // timer so rescheduling doesn't itself cause a re-render.
  // Keyed per-tab (otType) rather than a single shared timer: without this,
  // typing in Major then switching to Minor and typing there would let
  // Minor's keystroke clearTimeout Major's still-pending save, silently
  // dropping Major's edit with no error shown.
  const saveOTListMetaDebounced = (otType: OTType, next: { surgeon: string; surgeonUnit: string; otTime: string }) => {
    const existing = saveMetaTimerRef.current[otType];
    if (existing) clearTimeout(existing);
    saveMetaTimerRef.current[otType] = setTimeout(() => {
      void saveOTListMeta(next);
    }, 500);
  };

  // Shared by the "+" button and drag-to-assign so persistence logic exists
  // in exactly one place (both used to build the entry inline separately).
  // Optimistically appends to local state, then persists — rolling the
  // optimistic entry back out on failure.
  const assignPatientToCategory = async (patient: Patient, category: string) => {
    if (!user?.hospitalId) return;
    const existingInCategory = otList.filter(p => p.otType === activeTab && p.category === category);
    const optimisticEntry = buildOTPatientEntry(patient, activeTab, category, existingInCategory);
    setOtList(prev => [...prev, optimisticEntry]);

    try {
      let listMeta = otListMetaByType[activeTab];
      if (!listMeta) {
        listMeta = await upsertOTListMeta(user.hospitalId, effectiveUnit, activeTab, selectedDate, { surgeon, surgeonUnit, otTime });
        setOtListMetaByType(prev => ({ ...prev, [activeTab]: listMeta }));
      }
      const saved = await insertOTListEntry(listMeta.id, user.hospitalId, optimisticEntry);
      setOtList(prev => prev.map(p => (p.id === optimisticEntry.id ? saved : p)));
    } catch (err) {
      setOtList(prev => prev.filter(p => p.id !== optimisticEntry.id));
      setOtListError(err instanceof Error ? err.message : 'Failed to save assignment');
    }
  };

  const handleAssignPatient = (patient: Patient, category: string = getDefaultCategoryForType(activeTab)) => {
    void assignPatientToCategory(patient, category);
  };

  const handleRemove = (id: string) => {
    const removed = otList.find(p => p.id === id);
    setOtList(prev => prev.filter(p => p.id !== id));
    if (!removed?.version) return; // never persisted yet — nothing to delete server-side
    deleteOTListEntry(id).catch(err => {
      setOtList(prev => [...prev, removed]);
      setOtListError(err instanceof Error ? err.message : 'Failed to delete');
    });
  };

  const handleClearList = () => {
      if (window.confirm('Are you sure you want to clear the entire list?')) {
          setOtList([]);
      }
  };

  const handleAddManualEntry = () => {
    const defaultCategory = getDefaultCategoryForType(activeTab);
    const existingInTab   = otList.filter(p => p.otType === activeTab && p.category === defaultCategory);
    const maxSeq          = Math.max(0, ...existingInTab.map(p => p.sequence));
    const newEntry: OTPatient = {
      id: crypto.randomUUID(),
      sequence: maxSeq + 1,
      ipNo: '', name: '', age: '', gender: 'M',
      ward: '', unit: surgeonUnit,
      diagnosis: '', procedure: '',
      side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '',
      category: defaultCategory,
      otType: activeTab,
    };
    setOtList(prev => [...prev, newEntry]);
  };

  const handleExportExcel = () => {
    exportOTListToExcel(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
  };

  const handleExportPDF = () => {
    exportOTListToPDF(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
  };

  const handleUpdateEntry = (id: string, field: keyof OTPatient, value: string) => {
    const target = otList.find(p => p.id === id);
    if (!target) return;

    const newSequence = field === 'category'
      ? Math.max(0, ...otList.filter(p => p.category === value && p.id !== id).map(p => p.sequence)) + 1
      : undefined;

    setOtList(prev => {
        if (field === 'category') {
             return prev.map(p => p.id === id ? { ...p, [field]: value, sequence: newSequence! } : p);
        }
        return prev.map(p => p.id === id ? { ...p, [field]: value } : p);
    });

    // An entry that hasn't round-tripped through insertOTListEntry yet
    // (e.g. edited in the same instant it was added, before the insert
    // response returned) has no version to check against — skip persisting
    // this specific edit rather than guess at one. The field is already
    // reflected locally; a known, narrow gap rather than queuing edits to
    // retry (see the design spec's Non-goals on offline queueing).
    if (target.version == null || !target.otListId) return;

    type EditableOTPatientFields = Partial<Omit<OTPatient, 'id' | 'otListId' | 'version' | 'otType'>>;
    const changes: EditableOTPatientFields = field === 'category'
      ? { category: value, sequence: newSequence! } as EditableOTPatientFields
      : { [field]: value } as EditableOTPatientFields;

    const persistEntry = (entryId: string, entryChanges: EditableOTPatientFields) => {
      const current = otListRef.current.find(p => p.id === entryId);
      if (!current || current.version == null) return;
      updateOTListEntry(entryId, current.version, entryChanges)
        .then(saved => {
          setOtListError(null);
          setOtList(prev => prev.map(p => (p.id === entryId ? { ...p, version: saved.version, otListId: saved.otListId } : p)));
        })
        .catch(err => {
          if (err instanceof Error && err.message.startsWith('CONCURRENT_EDIT')) {
            setOtListError('That entry was just updated by someone else — refreshing.');
            if (user?.hospitalId) {
              fetchOTList(user.hospitalId, effectiveUnit, activeTab, selectedDate)
                .then(({ entries }) => {
                  setOtList(prev => [...prev.filter(p => p.otType !== activeTab), ...entries]);
                  setOtListError(null);
                })
                .catch(() => { /* refetch failed; the conflict notice stays visible so the user knows to reload */ });
            }
          } else {
            setOtListError(err instanceof Error ? err.message : 'Failed to save change');
          }
        });
    };

    if (field === 'category') {
      persistEntry(id, changes);
      return;
    }

    // Debounced and accumulated per entry (not per field): text fields
    // (anesthesia, implants, remarks, etc.) previously persisted on every
    // keystroke, sending a new versioned write per character — at any real
    // typing speed the version captured at keystroke N was already stale by
    // the time it reached the server, throwing a false "someone else
    // updated this" conflict and reverting whatever was typed since.
    // Accumulating into one pending-changes bucket per entry (rather than a
    // separate timer per field) also stops a second field's keystroke from
    // cancelling a first field's still-pending save on the same row.
    // Reading the version fresh from otListRef at fire time (not the value
    // captured when the timer was scheduled) means a reorder, or another
    // field's own debounced save completing in the meantime, is picked up
    // correctly instead of causing a spurious conflict.
    pendingEntryChangesRef.current[id] = { ...pendingEntryChangesRef.current[id], ...changes };
    const existingTimer = saveEntryTimerRef.current[id];
    if (existingTimer) clearTimeout(existingTimer);
    saveEntryTimerRef.current[id] = setTimeout(() => {
      const accumulated = pendingEntryChangesRef.current[id];
      delete pendingEntryChangesRef.current[id];
      delete saveEntryTimerRef.current[id];
      if (accumulated) persistEntry(id, accumulated);
    }, 500);
  };

  // The patient behind a pending-card drag, if that's what's currently
  // active — same id-parsing lookup handleDragEnd uses — so the DragOverlay
  // can show who is being dragged instead of a generic grip icon.
  const activePendingPatient = activeId && activeId.startsWith(PENDING_ID_PREFIX)
    ? patients.find(p => p.ipNo === activeId.slice(PENDING_ID_PREFIX.length))
    : null;

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OT List Management</h1>
          <p className="text-slate-500">Plan and manage surgical lists for Major, Minor and Emergency OT</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
          <Calendar className="w-5 h-5 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="outline-none text-slate-700 font-medium bg-transparent"
          />
        </div>
      </div>

      {otListError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {otListError}
        </div>
      )}
      {isLoadingOTList && (
        <div className="text-sm text-slate-500">Loading OT list…</div>
      )}

      {/* Weekend EOT duty hint — shown on the EOT tab when this unit is on weekend duty this cycle */}
      {activeTab === 'EOT' && cycle.eotWeekendDates.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {effectiveUnit} is on weekend duty this cycle — weekend EOT:{' '}
          {cycle.eotWeekendDates
            .map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
            .join(', ')}
          . Cases dated on these days appear in this list.
        </div>
      )}

      {/* List Meta — Surgeon / Unit / Time (editable, used in exports) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Surgeon</label>
          <input
            type="text"
            value={surgeon}
            onChange={e => {
              setSurgeon(e.target.value);
              saveOTListMetaDebounced(activeTab, { surgeon: e.target.value, surgeonUnit, otTime });
            }}
            placeholder="Surgeon name…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Unit</label>
          <input
            type="text"
            value={surgeonUnit}
            onChange={e => {
              setSurgeonUnit(e.target.value);
              saveOTListMetaDebounced(activeTab, { surgeon, surgeonUnit: e.target.value, otTime });
            }}
            placeholder="e.g. OR 1"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Time</label>
          <input
            type="text"
            value={otTime}
            onChange={e => {
              setOtTime(e.target.value);
              saveOTListMetaDebounced(activeTab, { surgeon, surgeonUnit, otTime: e.target.value });
            }}
            placeholder="e.g. 8.00AM"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['Major', 'Minor', 'EOT'] as OTType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab
                ? tab === 'EOT'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'bg-white text-teal-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {tab === 'EOT' ? 'EOT List' : `${tab} OT List`}
          </button>
        ))}
      </div>

      {/* Actions Toolbar */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleAddManualEntry}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors border border-slate-300"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </button>

        <button
          onClick={handleClearList}
          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Clear List
        </button>

        <div className="ml-auto flex gap-2">
            <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
            </button>

            <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
            <Download className="w-4 h-4" />
            Export PDF
            </button>
        </div>
      </div>

      {/* OT List Table + Pending Panel with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <OTListTable
              activeTab={activeTab}
              groupedItems={groupedItems}
              onUpdateEntry={handleUpdateEntry}
              onRemove={handleRemove}
              dragOverCategory={dragOverCategory}
            />
          </div>

          {/* Tablet/desktop: persistent inline panel */}
          <div className="hidden lg:block">
            <PendingSurgeryPanel pendingPatients={pendingPatients} onAssign={handleAssignPatient} />
          </div>
        </div>

        <DragOverlay>
            {activePendingPatient ? (
                <div className="p-2 bg-white rounded shadow-lg border border-slate-200 cursor-grabbing max-w-[220px] truncate">
                    <span className="font-medium text-slate-900 text-sm">{activePendingPatient.name}</span>
                </div>
            ) : activeId ? (
                <div className="p-2 bg-white rounded shadow-lg border border-slate-200 cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-slate-600" />
                </div>
            ) : null}
        </DragOverlay>
      </DndContext>

      {/* Phone: floating button + bottom drawer (dragging onto a hidden table
          doesn't make sense once the drawer covers it, so this is a "+"-button-only
          surface on phone — matches the drag cards' existing tap-to-add fallback).
          bottom uses --fab-bottom (index.css) instead of a fixed Tailwind
          offset so it clears App.tsx's fixed mobile bottom-nav bar, which
          renders after this and would otherwise paint over most of it. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed right-6 z-40 flex items-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-full shadow-lg"
        style={{ bottom: 'var(--fab-bottom)' }}
      >
        <UserPlus className="w-5 h-5" />
        Pending ({pendingPatients.length})
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-900">Pending Surgery</h2>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 overflow-y-auto">
              <PendingSurgeryPanel
                pendingPatients={pendingPatients}
                onAssign={patient => { handleAssignPatient(patient); setMobileOpen(false); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OTListManagement;
