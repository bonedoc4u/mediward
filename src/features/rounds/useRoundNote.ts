/**
 * useRoundNote — everything Round Mode knows about today's note for the
 * patient on screen: the text in the box, where that text is (only typed /
 * being sent / on the server / kept on this phone / refused because a
 * colleague wrote first), and the three ways out of a conflict.
 *
 * Rules this hook exists to keep:
 *  1. What is typed is on the phone at once and leaves it only after the
 *     server confirms.
 *  2. A save that is only about orders never sends the note.
 *  3. A note is saved against the version the doctor STARTED from. If someone
 *     changed it since, nothing is written and the doctor chooses.
 */
import { useEffect, useRef, useState } from 'react';
import { DailyRound, Patient } from '../../../types';
import type { RoundSaveResult } from '../../../contexts/PatientContext';
import type { RoundNoteStamp } from '../../../services/roundsService';
import { toast } from '../../../utils/toast';
import {
  NoteSaveState, clearDraft, combineNotes, findPreviousNote, findTodayRound, loadDraft, saveDraft,
} from './roundNotes';

type SaveRound = (
  patientIpNo: string, round: DailyRound, opts?: { quiet?: boolean; baseNoteAt?: string | null },
) => Promise<RoundSaveResult>;

export type ConflictChoice = 'both' | 'mine' | 'theirs';

export interface RoundNoteApi {
  text: string;
  state: NoteSaveState;
  todayRound?: DailyRound;
  previous?: DailyRound;
  /** The colleague's note, while `state` is 'conflict'. */
  conflict?: RoundNoteStamp;
  /** Save state of any patient in this round (for the navigation strip). */
  stateOf: (ipNo: string) => NoteSaveState;
  change: (text: string) => void;
  /** "Done": send the orders, plus the note if it has unsent changes. */
  save: () => void;
  /** Leaving the patient another way: send an unsent note instead of leaving a silent draft. */
  sendIfUnsent: () => void;
  resolve: (choice: ConflictChoice) => void;
}

export function useRoundNote(
  patient: Patient | undefined,
  today: string,
  saveRound: SaveRound,
  /** Called when a conflict comes back for a patient the doctor has already left. */
  onConflictElsewhere: (target: Patient, theirs: RoundNoteStamp) => void,
): RoundNoteApi {
  const [text, setText] = useState('');
  const [states, setStates] = useState<Record<string, NoteSaveState>>({});
  const [conflicts, setConflicts] = useState<Record<string, RoundNoteStamp>>({});

  /** Per patient: the round_note_at the doctor started typing from (null = there was no note). */
  const baseRef = useRef<Record<string, string | null>>({});
  /** Patients whose note is on its way right now. A ref: "Done" saves and navigates in one tick. */
  const inFlightRef = useRef<Set<string>>(new Set());
  const onScreenRef = useRef<string | null>(null);
  onScreenRef.current = patient?.ipNo ?? null;

  const ipNo = patient?.ipNo;
  const todayRound = patient ? findTodayRound(patient.dailyRounds, today) : undefined;
  const previous = patient ? findPreviousNote(patient.dailyRounds, today) : undefined;
  const serverNote = todayRound?.roundNote ?? '';
  const state: NoteSaveState = ipNo ? (states[ipNo] ?? 'clean') : 'clean';
  const setState = (ip: string, next: NoteSaveState) => setStates(s => ({ ...s, [ip]: next }));

  // Patient (or day) changed: fill the box. A draft on this phone wins over
  // the server copy — it is newer. Not re-run on server refreshes: that would
  // overwrite typing.
  useEffect(() => {
    if (!patient) return;
    const draft = loadDraft(today, patient.ipNo);
    if (draft && draft.text !== serverNote) {
      setText(draft.text);
      baseRef.current[patient.ipNo] = draft.baseNoteAt;
      setStates(s => (s[patient.ipNo] === 'queued' || s[patient.ipNo] === 'conflict' ? s : { ...s, [patient.ipNo]: 'dirty' }));
    } else {
      setText(serverNote);
    }
  }, [patient?.ipNo, today]);

  // The server copy CHANGED for the patient on screen while nothing unsent is
  // in the box (our own save came back, or a refresh brought a colleague's
  // note): show it. Never on mount or patient change — the effect above owns those.
  const lastServerRef = useRef<{ ipNo: string | null; note: string }>({ ipNo: null, note: '' });
  useEffect(() => {
    const prev = lastServerRef.current;
    lastServerRef.current = { ipNo: patient?.ipNo ?? null, note: serverNote };
    if (!patient || prev.ipNo !== patient.ipNo || prev.note === serverNote) return;
    if (state === 'clean' || state === 'saved') setText(serverNote);
  }, [patient?.ipNo, serverNote]);

  const change = (next: string) => {
    if (!patient) return;
    const ip = patient.ipNo;
    setText(next);
    if (state === 'conflict') {
      // Still unresolved: keep the newest wording safe, stay in conflict.
      saveDraft(today, ip, { text: next, baseNoteAt: baseRef.current[ip] ?? null });
      return;
    }
    if (next.trim() === serverNote.trim()) {
      clearDraft(today, ip);
      delete baseRef.current[ip];
      setState(ip, 'clean');
      return;
    }
    // First keystroke of an edit: remember which version it starts from.
    if (!(ip in baseRef.current)) baseRef.current[ip] = todayRound?.roundNoteAt ?? null;
    saveDraft(today, ip, { text: next, baseNoteAt: baseRef.current[ip] });   // survives a call, a crash, a dead battery
    setState(ip, 'dirty');
  };

  const persist = (target: Patient, noteText: string, withNote: boolean, baseOverride?: string | null) => {
    const ip = target.ipNo;
    const round: DailyRound = { date: today, note: target.diagnosis, todos: target.todos };
    let baseNoteAt: string | null = null;
    if (withNote) {
      round.roundNote = noteText.trim();
      baseNoteAt = baseOverride !== undefined ? baseOverride : (baseRef.current[ip] ?? null);
      inFlightRef.current.add(ip);
      setState(ip, 'saving');
    }

    void saveRound(ip, round, { quiet: true, baseNoteAt }).then(result => {
      inFlightRef.current.delete(ip);
      if (!withNote) {
        if (result.status === 'queued') {
          toast.warning('Orders kept on this phone — they will be sent when the connection returns.');
        }
        return;
      }
      if (result.status === 'saved') {
        clearDraft(today, ip);            // the draft stays until the server has the note
        delete baseRef.current[ip];
        setConflicts(c => { const { [ip]: _gone, ...rest } = c; return rest; });
        setState(ip, 'saved');
      } else if (result.status === 'queued') {
        setState(ip, 'queued');
      } else {
        // Refused: a colleague's note is on the server. Ours stays on the
        // phone; whatever is saved next is saved against THEIR version.
        baseRef.current[ip] = result.server.roundNoteAt ?? null;
        saveDraft(today, ip, { text: noteText, baseNoteAt: baseRef.current[ip] });
        setConflicts(c => ({ ...c, [ip]: result.server }));
        setState(ip, 'conflict');
        if (onScreenRef.current !== ip) onConflictElsewhere(target, result.server);
      }
    });
  };

  const save = () => {
    if (!patient) return;
    persist(patient, text, state === 'dirty' || state === 'queued');
  };

  const sendIfUnsent = () => {
    if (patient && state === 'dirty' && !inFlightRef.current.has(patient.ipNo)) persist(patient, text, true);
  };

  const resolve = (choice: ConflictChoice) => {
    if (!patient) return;
    const ip = patient.ipNo;
    const theirs = conflicts[ip];
    if (!theirs) return;

    if (choice === 'theirs') {
      clearDraft(today, ip);
      delete baseRef.current[ip];
      setConflicts(c => { const { [ip]: _gone, ...rest } = c; return rest; });
      setText(theirs.roundNote);
      setState(ip, 'clean');
      return;
    }
    const next = choice === 'both' ? combineNotes(theirs.roundNote, text) : text;
    setText(next);
    // Saved against their version, not forced: a third writer is still caught.
    persist(patient, next, true, theirs.roundNoteAt ?? null);
  };

  return {
    text, state, todayRound, previous,
    conflict: ipNo && state === 'conflict' ? conflicts[ipNo] : undefined,
    stateOf: ip => states[ip] ?? 'clean',
    change, save, sendIfUnsent, resolve,
  };
}
