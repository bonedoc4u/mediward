import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, getQueue, dequeue, incrementAttempts, getQueueSize } from '../services/syncQueue';

beforeEach(() => {
  // Clear localStorage queue before each test
  localStorage.removeItem('mediward_sync_queue');
});

describe('syncQueue', () => {
  it('enqueue adds an operation to the queue', () => {
    enqueue('upsert_patient', { ipNo: 'IP001' });
    expect(getQueueSize()).toBe(1);
    const queue = getQueue();
    expect(queue[0].type).toBe('upsert_patient');
    expect(queue[0].attempts).toBe(0);
  });

  it('dequeue removes the operation by id', () => {
    enqueue('insert_lab', { patientId: 'IP001', result: {} });
    enqueue('delete_imaging', 'img-001');
    expect(getQueueSize()).toBe(2);

    const id = getQueue()[0].id;
    dequeue(id);
    expect(getQueueSize()).toBe(1);
    expect(getQueue()[0].type).toBe('delete_imaging');
  });

  it('incrementAttempts drops op after exceeding MAX_ATTEMPTS (5)', () => {
    enqueue('insert_imaging', { patientId: 'IP001', inv: {} });
    const id = getQueue()[0].id;

    // Increment 5 times — op is dropped when attempts > 5
    for (let i = 0; i < 6; i++) {
      incrementAttempts(id);
    }

    expect(getQueueSize()).toBe(0);
  });

  it('multiple ops coexist independently', () => {
    enqueue('upsert_patient', { ipNo: 'IP001' });
    enqueue('upsert_patient', { ipNo: 'IP002' });
    enqueue('upsert_patient', { ipNo: 'IP003' });
    expect(getQueueSize()).toBe(3);
  });
});
