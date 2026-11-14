import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { getQueue, clearMainQueue } from '../../services/syncQueue';
import { queuePatientSave, readQueuedPatientSave } from '../../services/patientSaveQueue';
import { Patient } from '../../types';

const patient = (over: Partial<Patient> = {}): Patient => ({
  ipNo: 'TEST-0001', name: 'Patient A', diagnosis: '# NOF right', todos: [], version: 3, ...over,
} as Patient);

beforeEach(() => clearMainQueue());

describe('queuePatientSave', () => {
  it('remembers that an orders-only save must send only the orders', () => {
    queuePatientSave(patient(), ['todos']);
    expect(readQueuedPatientSave(getQueue()[0].payload)).toEqual({ patient: patient(), onlyColumns: ['todos'] });
  });

  it('a full save carries no column limit', () => {
    queuePatientSave(patient());
    expect(readQueuedPatientSave(getQueue()[0].payload).onlyColumns).toBeUndefined();
  });

  // The queue keeps one save per patient. If an orders-only save replaced a
  // waiting full save, the replay would send only the orders and the edited
  // diagnosis would be lost without a trace.
  it('an orders-only save never narrows a full save that is already waiting', () => {
    queuePatientSave(patient({ diagnosis: 'edited offline' }));
    queuePatientSave(patient({ diagnosis: 'edited offline', todos: [{ id: 't1', task: 'X-ray', isDone: false }] }), ['todos']);

    expect(getQueue()).toHaveLength(1);
    const queued = readQueuedPatientSave(getQueue()[0].payload);
    expect(queued.onlyColumns).toBeUndefined();              // still a full save
    expect(queued.patient.diagnosis).toBe('edited offline');
    expect(queued.patient.todos).toHaveLength(1);            // and it holds the new order
  });

  it('a later full save replaces a waiting orders-only save', () => {
    queuePatientSave(patient(), ['todos']);
    queuePatientSave(patient({ diagnosis: 'edited' }));
    expect(getQueue()).toHaveLength(1);
    expect(readQueuedPatientSave(getQueue()[0].payload).onlyColumns).toBeUndefined();
  });

  it('the column limit is not sent to the database as a patient field', () => {
    queuePatientSave(patient(), ['todos']);
    expect(readQueuedPatientSave(getQueue()[0].payload).patient).not.toHaveProperty('onlyColumns');
  });
});
