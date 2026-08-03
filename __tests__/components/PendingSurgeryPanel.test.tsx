import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import PendingSurgeryPanel from '../../components/otlist/PendingSurgeryPanel';
import { Patient, Gender, PacStatus, PatientStatus } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210', age: 52,
  gender: Gender.Male, ward: 'Ward 22', bed: '5', diagnosis: 'Fracture femur',
  comorbidities: [], doa: '2026-07-26',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

// PendingSurgeryPanel's draggable cards need a DndContext ancestor to call
// useDraggable — a plain, no-op one is enough for these tests.
function renderPanel(pendingPatients: Patient[], onAssign = vi.fn()) {
  render(
    <DndContext>
      <PendingSurgeryPanel pendingPatients={pendingPatients} onAssign={onAssign} />
    </DndContext>,
  );
  return { onAssign };
}

describe('PendingSurgeryPanel', () => {
  it('sorts patients by earliest admission date first', () => {
    renderPanel([
      makePatient({ ipNo: 'IP001', name: 'Later Admit', doa: '2026-07-28' }),
      makePatient({ ipNo: 'IP002', name: 'Earliest Admit', doa: '2026-07-20' }),
      makePatient({ ipNo: 'IP003', name: 'Middle Admit', doa: '2026-07-25' }),
    ]);
    // Query the drag-handle buttons' aria-labels (each names its own patient
    // unambiguously) rather than text content, which would otherwise match
    // both the name's own text node and its nested IP-number <span>.
    const order = screen.getAllByLabelText(/^Drag /).map(el => el.getAttribute('aria-label'));
    expect(order).toEqual(['Drag Earliest Admit', 'Drag Middle Admit', 'Drag Later Admit']);
  });

  it('filters by name or IP number as you search', () => {
    renderPanel([
      makePatient({ ipNo: 'IP001', name: 'Ravi Kumar' }),
      makePatient({ ipNo: 'IP002', name: 'Sarada Nair' }),
    ]);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'Sarada' } });
    // exact: false — the name text sits beside a nested IP-number <span>, so
    // no single element's *own* full text is exactly the bare name.
    expect(screen.queryByText('Ravi Kumar', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('Sarada Nair', { exact: false })).toBeInTheDocument();
  });

  it('calls onAssign when the "+" button is pressed', () => {
    const { onAssign } = renderPanel([makePatient()]);
    fireEvent.click(screen.getByLabelText(/Add Ravi Kumar/i));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign.mock.calls[0][0].ipNo).toBe('IP001');
  });

  it('shows an empty state when there are no pending patients', () => {
    renderPanel([]);
    expect(screen.getByText(/No patients pending surgery/i)).toBeInTheDocument();
  });
});
