import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import {
  enqueue, getQueue, getRetryableQueue, getQueueSize, getMainQueueSize,
  setQueueOwner, getOtherUsersPending, clearMainQueue, clearDeadLetterQueue,
  getDeadLetterQueue, retryDeadLetterOp, incrementAttempts,
} from '../../services/syncQueue';
import { drainQueue } from '../../services/syncReplay';

// Audit DATA-05: the offline queue belonged to nobody. Doctor A's unsent
// changes were sent under whoever signed in next on the same phone.
const DR_A = { id: 'user-a', name: 'Dr. A' };
const DR_B = { id: 'user-b', name: 'Dr. B' };
const round = (ipNo: string) => ({ patient_ip_no: ipNo, date: '2026-11-13', note: 'Wound dry.' });
const stored = () => JSON.parse(localStorage.getItem('mediward_sync_queue') ?? '[]') as Array<{ userId?: string; type: string }>;

beforeEach(() => {
  setQueueOwner(null);
  clearMainQueue();
  clearDeadLetterQueue();
});

describe('offline queue — each change belongs to the user who made it', () => {
  it('stamps a queued change with the signed-in user', () => {
    setQueueOwner(DR_A);
    enqueue('upsert_round', round('TEST-0001'));
    expect(getQueue()[0]).toMatchObject({ userId: 'user-a', userName: 'Dr. A' });
  });

  it("does not replay Dr. A's changes while Dr. B is signed in, and keeps them on the phone", async () => {
    setQueueOwner(DR_A);
    enqueue('upsert_round', round('TEST-0001'));
    enqueue('insert_vital', { patient_ip_no: 'TEST-0002' });
    setQueueOwner(null);                         // A signs out
    setQueueOwner(DR_B);                         // B signs in on the same phone
    enqueue('upsert_round', round('TEST-0003'));

    const sent: string[] = [];
    await drainQueue(async op => { sent.push((op.payload as { patient_ip_no: string }).patient_ip_no); });

    expect(sent).toEqual(['TEST-0003']);                       // only B's own change went out
    expect(getQueueSize()).toBe(0);                            // B has nothing left to send
    expect(stored().map(o => o.userId)).toEqual(['user-a', 'user-a']);   // A's two are still stored
    expect(getOtherUsersPending()).toEqual({ count: 2, names: ['Dr. A'] });
  });

  it("sends Dr. A's changes when Dr. A signs in again", async () => {
    setQueueOwner(DR_A);
    enqueue('upsert_round', round('TEST-0001'));
    setQueueOwner(DR_B);
    expect(getRetryableQueue()).toEqual([]);

    setQueueOwner(DR_A);
    const sent: string[] = [];
    await drainQueue(async op => { sent.push(op.userId ?? '?'); });
    expect(sent).toEqual(['user-a']);
    expect(getMainQueueSize()).toBe(0);
  });

  it('nothing is replayed while nobody is signed in', () => {
    setQueueOwner(DR_A);
    enqueue('upsert_round', round('TEST-0001'));
    setQueueOwner(null);
    expect(getRetryableQueue()).toEqual([]);
    expect(getMainQueueSize()).toBe(1);
  });

  it('a save that fails just after sign-out still belongs to the user who made it', () => {
    setQueueOwner(DR_A);
    setQueueOwner(null);                         // e.g. inactivity logout while a request is in flight
    enqueue('upsert_round', round('TEST-0001'));
    expect(stored()[0].userId).toBe('user-a');
  });

  it("Dr. B's save of a patient does not replace Dr. A's queued save of the same patient", () => {
    setQueueOwner(DR_A);
    enqueue('upsert_patient', { ipNo: 'TEST-0001', name: 'Patient A', diagnosis: 'from A' });
    setQueueOwner(DR_B);
    enqueue('upsert_patient', { ipNo: 'TEST-0001', name: 'Patient A', diagnosis: 'from B' });

    expect(getMainQueueSize()).toBe(2);
    expect(getQueue().map(o => (o.payload as { diagnosis: string }).diagnosis)).toEqual(['from B']);
    // The same user saving twice still keeps only the latest, as before.
    enqueue('upsert_patient', { ipNo: 'TEST-0001', name: 'Patient A', diagnosis: 'from B, again' });
    expect(getMainQueueSize()).toBe(2);
  });

  it('changes queued before owners existed are adopted once, by the next user to sign in — none are lost', async () => {
    // A queue exactly as the previous version of the app stored it: no owner.
    const oldQueue = JSON.stringify([
      { id: 'old-1', seq: 1, type: 'upsert_round', payload: round('TEST-0009'), queuedAt: '2026-11-12T20:00:00.000Z', attempts: 0 },
    ]);
    localStorage.setItem('mediward_sync_queue', oldQueue);
    localStorage.setItem('CapacitorStorage.mediward_sync_queue', oldQueue);   // the durable copy (Preferences)
    vi.resetModules();                                    // the app starts after the update
    const q = await import('../../services/syncQueue');
    await q.initSyncQueue();

    q.setQueueOwner(DR_B);
    expect(q.getQueue().map(o => o.id)).toEqual(['old-1']);
    expect(stored()[0].userId).toBe('user-b');

    q.setQueueOwner(DR_A);                                // adoption happens once; it does not move again
    expect(q.getQueue()).toHaveLength(0);
    expect(stored()[0].userId).toBe('user-b');
    q.clearMainQueue();
  });

  it('an admin pressing Retry on a failed change does not become its author', () => {
    setQueueOwner(DR_A);
    enqueue('upsert_round', round('TEST-0001'));
    const id = getQueue()[0].id;
    for (let i = 0; i < 6; i++) incrementAttempts(id, new Error('refused'));
    expect(getDeadLetterQueue()).toHaveLength(1);

    setQueueOwner(DR_B);
    retryDeadLetterOp(getDeadLetterQueue()[0].id);
    expect(stored()[0].userId).toBe('user-a');
    expect(getQueue()).toHaveLength(0);
  });
});
