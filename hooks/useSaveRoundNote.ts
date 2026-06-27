/**
 * hooks/useSaveRoundNote.ts — Task 2
 *
 * Saves round notes with optimistic locking (version column).
 *
 * Flow:
 *   1. First save for a date → INSERT/upsert, capture returned version.
 *   2. Subsequent saves → UPDATE WHERE version = knownVersion.
 *   3. If UPDATE returns 0 rows (version mismatch), fetch server version
 *      and populate `conflict` so the UI can show a diff modal.
 *   4. resolveConflict('mine')  → force-save using server's version number.
 *   5. resolveConflict('theirs') → accept server copy, update local version.
 */

import { useState, useRef, useCallback } from 'react';
import { DailyRound } from '../types';
import {
  upsertRoundVersioned,
  fetchCurrentRound,
} from '../services/roundsService';
import { toast } from '../utils/toast';

export interface RoundConflict {
  patientIpNo: string;
  localRound:  DailyRound & { version: number };
  serverRound: DailyRound & { version: number };
}

interface SaveRoundNoteResult {
  save: (patientIpNo: string, hospitalId: string | undefined, round: DailyRound) => Promise<void>;
  isSaving: boolean;
  conflict: RoundConflict | null;
  resolveConflict: (
    choice: 'mine' | 'theirs',
    hospitalId: string | undefined,
  ) => Promise<void>;
  dismissConflict: () => void;
}

export function useSaveRoundNote(): SaveRoundNoteResult {
  const [isSaving,  setIsSaving]  = useState(false);
  const [conflict,  setConflict]  = useState<RoundConflict | null>(null);

  // Track the last-known server version per patient+date so we can send the
  // correct version in the WHERE clause without reading from the DB first.
  const versionMapRef = useRef<Map<string, number>>(new Map());

  const versionKey = (ipNo: string, date: string) => `${ipNo}::${date}`;

  const save = useCallback(async (
    patientIpNo: string,
    hospitalId: string | undefined,
    round: DailyRound,
  ): Promise<void> => {
    setIsSaving(true);
    try {
      const key            = versionKey(patientIpNo, round.date);
      const currentVersion = versionMapRef.current.get(key);

      const result = await upsertRoundVersioned(patientIpNo, hospitalId, round, currentVersion);

      if (result.conflict) {
        // 0 rows affected — someone else saved between our read and write.
        const serverRound = await fetchCurrentRound(patientIpNo, round.date);
        if (!serverRound) { toast.error('Round note conflict — could not fetch server version.'); return; }
        setConflict({
          patientIpNo,
          localRound:  { ...round, version: currentVersion ?? 0 },
          serverRound,
        });
      } else {
        versionMapRef.current.set(key, result.version!);
      }
    } catch (err) {
      toast.error('Failed to save round note — will retry when online.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const resolveConflict = useCallback(async (
    choice: 'mine' | 'theirs',
    hospitalId: string | undefined,
  ): Promise<void> => {
    if (!conflict) return;
    setIsSaving(true);

    try {
      if (choice === 'mine') {
        // Force-save our content but stamp the server's version so the
        // WHERE clause succeeds (we're intentionally overwriting).
        const round: DailyRound = {
          date:  conflict.localRound.date,
          note:  conflict.localRound.note,
          todos: conflict.localRound.todos,
        };
        const result = await upsertRoundVersioned(
          conflict.patientIpNo, hospitalId, round,
          conflict.serverRound.version, // use server version → WHERE succeeds
        );
        if (!result.conflict) {
          versionMapRef.current.set(
            versionKey(conflict.patientIpNo, round.date),
            result.version!,
          );
          toast.success('Your version saved.');
        }
      } else {
        // Accept server copy — just update our local version reference.
        versionMapRef.current.set(
          versionKey(conflict.patientIpNo, conflict.serverRound.date),
          conflict.serverRound.version,
        );
        toast.info('Using server version.');
      }
    } catch {
      toast.error('Failed to resolve conflict.');
    } finally {
      setIsSaving(false);
      setConflict(null);
    }
  }, [conflict]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return { save, isSaving, conflict, resolveConflict, dismissConflict };
}
