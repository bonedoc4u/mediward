import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SurgicalHistorySection from '../../components/patient/SurgicalHistorySection';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  bed: '5', ward: 'Ortho A', ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210',
  age: 52, gender: Gender.Male, diagnosis: 'Intertrochanteric fracture', comorbidities: [],
  doa: '2024-01-15', pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

describe('SurgicalHistorySection', () => {
  it('renders nothing when there are no prior surgeries and no completed surgery yet', () => {
    const { container } = render(
      <SurgicalHistorySection patient={makePatient()} canEdit onUpdate={vi.fn()} onAddSurgery={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists prior surgeries once the patient has any', () => {
    const patient = makePatient({
      dos: '2026-07-20', procedure: 'Implant removal',
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
    });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={vi.fn()} onAddSurgery={vi.fn()} />);
    expect(screen.getByText('DHS fixation')).toBeInTheDocument();
    expect(screen.getByText(/2026-06-01/)).toBeInTheDocument();
  });

  it('"Add another surgery" calls onAddSurgery with the entered procedure and date', () => {
    const onAddSurgery = vi.fn();
    const patient = makePatient({ dos: '2026-06-01', procedure: 'DHS fixation' });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={vi.fn()} onAddSurgery={onAddSurgery} />);

    fireEvent.click(screen.getByRole('button', { name: /add another surgery/i }));
    fireEvent.change(screen.getByPlaceholderText(/implant removal/i), { target: { value: 'Revision fixation' } });
    fireEvent.change(screen.getByLabelText(/date of surgery/i), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save surgery/i }));

    expect(onAddSurgery).toHaveBeenCalledWith('IP001', 'Revision fixation', '2026-08-01');
  });

  it('"Plan next surgery" calls onUpdate with plannedDos set and PAC/pre-op state reset', () => {
    // Regression: pacStatus/pacFlow/preOpChecklist are scalar, not archived per
    // surgery — without resetting them here, a patient already PAC Fit and
    // checklisted for surgery 1 would show as cleared for surgery 2 too.
    const onUpdate = vi.fn();
    const patient = makePatient({
      dos: '2026-06-01', procedure: 'DHS fixation', pacStatus: PacStatus.Fit,
      preOpChecklist: [{ id: '0', task: 'Consent', isDone: true }],
    });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={onUpdate} onAddSurgery={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /plan next surgery/i }));
    fireEvent.change(screen.getByLabelText('Plan next surgery date'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm date/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ipNo: 'IP001',
      plannedDos: '2026-09-01',
      pacStatus: PacStatus.Pending,
      pacFlow: undefined,
      preOpChecklist: undefined,
    }));
  });

  it('does not show "Add another surgery" when canEdit is false', () => {
    const patient = makePatient({ dos: '2026-06-01', procedure: 'DHS fixation' });
    render(<SurgicalHistorySection patient={patient} canEdit={false} onUpdate={vi.fn()} onAddSurgery={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /add another surgery/i })).not.toBeInTheDocument();
  });
});
