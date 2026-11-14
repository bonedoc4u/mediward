/**
 * syncReplay.ts
 * Replays the offline write-ahead queue (see syncQueue.ts) when the network returns.
 *
 * The one rule this file exists to enforce: a queued change leaves the phone
 * ONLY after the server has confirmed it.
 *
 * Why this needs saying: supabase-js does not throw when a request fails. It
 * resolves with `{ error }` — for a refused write (RLS, expired sign-in, bad
 * data) and also for a request that never reached the server (status 0,
 * "TypeError: Failed to fetch"). Code that only `await`s the call therefore
 * sees every failure as success. The replay loop used to do exactly that for
 * round notes, vitals, nursing notes and medication records, then deleted its
 * only copy and showed "All offline changes synced".
 */

import { supabase } from '../lib/supabase';
import {
  QueuedOp, QueuedOpType, getRetryableQueue, dequeue, incrementAttempts, moveToDeadLetter,
} from './syncQueue';
import { saveRoundChecked, toColumns, type RoundRowWrite } from './roundsService';
import { combineNotes } from '../src/features/rounds/roundNotes';

/** Returns true when the error indicates an expired/invalid JWT session. */
export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('jwt') || msg.includes('expired') || msg.includes('unauthorized') || msg.includes('pgrst301');
}

/**
 * Returns true when the request never reached the server (no connection,
 * captive portal, DNS failure). The wording differs per browser engine:
 * Chrome/Android WebView "Failed to fetch", Safari/iOS "Load failed",
 * Firefox "NetworkError when attempting to fetch resource".
 */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('load failed')
    || msg.includes('networkerror')
    || msg.includes('network request failed');
}

/**
 * Returns true when the database refused the write because of the user's
 * ROLE. The role rules in the database raise an error that starts with
 * ROLE_FORBIDDEN; sending the same change again cannot succeed.
 *
 * A plain "row-level security" refusal is deliberately NOT counted: that one
 * also happens for a stale session (no hospital resolved), which a new
 * sign-in cures. Those keep the normal retry path.
 */
export function isRoleRefusal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String((err as { message?: unknown } | null)?.message ?? err);
  return msg.toLowerCase().includes('role_forbidden');
}

/** Queue op types that are a single insert/upsert into one table. */
const SIMPLE_OP_TYPES = [
  'upsert_round', 'insert_vital', 'insert_nursing_note', 'record_med_administration',
] as const;
export type SimpleOpType = typeof SIMPLE_OP_TYPES[number];

export function isSimpleOp(type: QueuedOpType): type is SimpleOpType {
  return (SIMPLE_OP_TYPES as readonly string[]).includes(type);
}

/**
 * Send one queued round.
 *
 * Orders only (no round_note): a plain upsert of the columns, as before.
 *
 * With a note: through the same checked save as a live save. If a colleague
 * changed the note while this one waited on the phone, BOTH are kept — theirs
 * first, then ours — because nobody is looking at the screen during a replay
 * and neither text may be dropped. The combined text is saved against their
 * version, so a third writer in between is still detected (then this throws
 * and the change stays queued).
 */
async function replayRound(row: RoundRowWrite): Promise<void> {
  if (row.round_note === undefined) {
    const { error } = await supabase.from('rounds').upsert(toColumns(row), { onConflict: 'patient_ip_no,date' });
    if (error) throw new Error(`upsert_round: ${error.message}`);
    return;
  }

  const round = { date: row.date, note: row.note, todos: row.todos, roundNote: row.round_note };
  const hospitalId = row.hospital_id ?? undefined;

  const first = await saveRoundChecked(row.patient_ip_no, hospitalId, round, row.base_note_at ?? null);
  if (first.status === 'saved') return;

  const both = { ...round, roundNote: combineNotes(first.server.roundNote, row.round_note) };
  const second = await saveRoundChecked(row.patient_ip_no, hospitalId, both, first.server.roundNoteAt ?? null);
  if (second.status === 'conflict') {
    throw new Error('upsert_round: the note changed again while merging — will retry');
  }
}

/**
 * Send one queued round note / vital / nursing note / medication record.
 * Resolves only when the server accepted the write; throws otherwise, so the
 * caller keeps the change in the queue.
 */
export async function replaySimpleOp(op: QueuedOp): Promise<void> {
  const payload = op.payload as Record<string, unknown>;
  let error: { message: string } | null;

  switch (op.type) {
    case 'upsert_round':
      await replayRound(payload as unknown as RoundRowWrite);
      return;
    case 'insert_vital':
      ({ error } = await supabase.from('patient_vitals').insert(payload));
      break;
    case 'insert_nursing_note':
      ({ error } = await supabase.from('nursing_notes').insert(payload));
      break;
    case 'record_med_administration':
      ({ error } = await supabase.from('med_administrations').insert(payload));
      break;
    default:
      throw new Error(`replaySimpleOp: unsupported op type "${op.type}"`);
  }

  if (error) throw new Error(`${op.type}: ${error.message}`);
}

export interface DrainResult {
  /** Changes the server confirmed; these were removed from the queue. */
  synced: number;
  /**
   * Why the drain stopped before the end of the queue, if it did:
   *  - 'auth'    — sign-in expired; nothing more can succeed until the user signs in again.
   *  - 'network' — a request never reached the server; the rest would fail the same way.
   */
  stoppedBy: 'auth' | 'network' | null;
  /**
   * Changes now in the dead-letter queue: refused more than MAX_ATTEMPTS
   * times, or refused once because of the user's role (`reason: 'role'`).
   */
  dropped: Array<{ opType?: QueuedOpType; label?: string; reason?: 'role' }>;
}

/**
 * Replay every due change in order. `execute` must throw unless the server
 * confirmed the change.
 *
 *  - confirmed            → removed from the queue
 *  - sign-in expired      → kept, drain stops (retrying cannot help)
 *  - network unreachable  → kept WITHOUT using up a retry attempt, drain stops.
 *                           A dead connection says nothing about the change
 *                           itself, so it must never push it towards the
 *                           dead-letter queue.
 *  - refused for the role → straight to the dead-letter queue. The answer
 *                           will be the same every time, so no retries.
 *  - refused by server    → kept with backoff; after MAX_ATTEMPTS it moves to
 *                           the dead-letter queue (still on the phone, shown
 *                           in Settings → Advanced) and is reported in `dropped`.
 */
export async function drainQueue(execute: (op: QueuedOp) => Promise<void>): Promise<DrainResult> {
  const result: DrainResult = { synced: 0, stoppedBy: null, dropped: [] };

  for (const op of getRetryableQueue()) {
    try {
      await execute(op);
      dequeue(op.id);
      result.synced += 1;
    } catch (err) {
      console.error(`[SyncQueue] op ${op.type} failed:`, err);
      if (isAuthError(err)) {
        result.stoppedBy = 'auth';
        break;
      }
      if (isNetworkError(err)) {
        result.stoppedBy = 'network';
        break;
      }
      if (isRoleRefusal(err)) {
        const moved = moveToDeadLetter(op.id, 'role_forbidden: the signed-in role may not make this change');
        if (moved) result.dropped.push({ ...moved, reason: 'role' });
        continue;
      }
      const { dropped, opType, label } = incrementAttempts(op.id, err);
      if (dropped) result.dropped.push({ opType, label });
    }
  }

  return result;
}
