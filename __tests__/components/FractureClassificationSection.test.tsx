import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FractureClassificationSection from '../../components/patient/FractureClassificationSection';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  bed: '5', ward: 'Ortho A', ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210',
  age: 52, gender: Gender.Male, diagnosis: 'Intertrochanteric fracture', comorbidities: [],
  doa: '2024-01-15', pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

describe('FractureClassificationSection', () => {
  it('renders nothing when there are no fractures and the user cannot edit', () => {
    const { container } = render(
      <FractureClassificationSection patient={makePatient()} canEdit={false} onUpdate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Add fracture" even with zero fractures when the user can edit', () => {
    // Unlike SurgicalHistorySection (where "add another" only makes sense once
    // a first surgery already exists), there's no such gate here — a patient
    // with zero fractures who canEdit should still be able to add their first.
    render(<FractureClassificationSection patient={makePatient()} canEdit onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add fracture/i })).toBeInTheDocument();
  });

  it('lists an existing fracture and its classifications', () => {
    const patient = makePatient({
      fractures: [{
        id: 'f1', region: 'nof', side: 'right',
        classifications: [{ system: 'Garden', grade: 'IV' }, { system: 'Pauwels', grade: 'III' }],
      }],
    });
    render(<FractureClassificationSection patient={patient} canEdit onUpdate={vi.fn()} />);
    expect(screen.getByText(/Neck of Femur/i)).toBeInTheDocument();
    expect(screen.getByText(/Garden.*IV/i)).toBeInTheDocument();
    expect(screen.getByText(/Pauwels.*III/i)).toBeInTheDocument();
  });

  it('"Add fracture" creates a new fracture entry via onUpdate', () => {
    const onUpdate = vi.fn();
    render(<FractureClassificationSection patient={makePatient()} canEdit onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /add fracture/i }));
    fireEvent.click(screen.getByRole('button', { name: /select region/i }));
    fireEvent.click(screen.getByRole('option', { name: /neck of femur/i }));
    fireEvent.click(screen.getByRole('button', { name: /save fracture/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ipNo: 'IP001',
      fractures: [expect.objectContaining({ region: 'nof', classifications: [] })],
    }));
  });

  it('"Add classification" appends a classification to the right fracture via onUpdate', () => {
    const onUpdate = vi.fn();
    const patient = makePatient({
      fractures: [{ id: 'f1', region: 'nof', classifications: [] }],
    });
    render(<FractureClassificationSection patient={patient} canEdit onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /add classification/i }));
    fireEvent.click(screen.getByRole('button', { name: /select system/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: /select grade/i }));
    fireEvent.click(screen.getByRole('option', { name: 'IV' }));
    fireEvent.click(screen.getByRole('button', { name: /save classification/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ipNo: 'IP001',
      fractures: [expect.objectContaining({
        id: 'f1', region: 'nof',
        classifications: [{ system: 'Garden', grade: 'IV' }],
      })],
    }));
  });

  it('does not show "Add fracture" when canEdit is false', () => {
    render(<FractureClassificationSection patient={makePatient({
      fractures: [{ id: 'f1', region: 'nof', classifications: [] }],
    })} canEdit={false} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /add fracture/i })).not.toBeInTheDocument();
  });
});
