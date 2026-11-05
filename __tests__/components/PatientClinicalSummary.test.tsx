import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PatientClinicalSummary from '../../components/ward/PatientClinicalSummary';
import { latestRoundNote } from '../../utils/roundNotes';
import { relativeDayLabel, shortDate } from '../../utils/dates';

const base = {
  diagnosis: '# Neck of femur (R)',
  procedure: 'DHS fixation',
  dos: '2026-11-03',
  comorbidities: ['T2DM', 'HTN', 'CKD 3', 'IHD'],
  dailyRounds: [
    { date: '2026-11-04', note: 'Wound dry. Hb 9.2 — repeat today.', todos: [] },
    { date: '2026-11-03', note: 'Post-op review.', todos: [] },
  ],
};

describe('PatientClinicalSummary', () => {
  it('shows every comorbidity, not just the first two', () => {
    // Regression: the mobile card showed 2 and collapsed the rest into "+2 more".
    render(<PatientClinicalSummary patient={base} today="2026-11-05" />);
    const list = screen.getByRole('list', { name: 'Comorbidities' });
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(['T2DM', 'HTN', 'CKD 3', 'IHD']);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('shows the procedure with its surgery date', () => {
    render(<PatientClinicalSummary patient={base} today="2026-11-05" />);
    expect(screen.getByText('DHS fixation')).toHaveTextContent(`DHS fixation · ${shortDate('2026-11-03')}`);
  });

  it('shows the latest round note with a relative day label', () => {
    render(<PatientClinicalSummary patient={base} today="2026-11-05" />);
    expect(screen.getByText('Last note · Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Wound dry. Hb 9.2 — repeat today.')).toBeInTheDocument();
    expect(screen.queryByText('Post-op review.')).not.toBeInTheDocument();
  });

  it('omits the note and procedure rows when there is nothing to show', () => {
    render(
      <PatientClinicalSummary
        patient={{ diagnosis: 'OA knee (R)', procedure: '', dos: '', comorbidities: [], dailyRounds: [] }}
        today="2026-11-05"
      />,
    );
    expect(screen.getByText('OA knee (R)')).toBeInTheDocument();
    expect(screen.queryByText(/Last note/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Comorbidities' })).not.toBeInTheDocument();
  });
});

describe('latestRoundNote', () => {
  it('picks the newest round that has text, skipping to-do-only rounds', () => {
    expect(latestRoundNote([
      { date: '2026-11-03', note: 'Older note', todos: [] },
      { date: '2026-11-05', note: '   ', todos: [] },
      { date: '2026-11-04', note: ' Newest real note ', todos: [] },
    ])).toEqual({ date: '2026-11-04', note: 'Newest real note' });
  });

  it('returns null when there are no notes', () => {
    expect(latestRoundNote([])).toBeNull();
    expect(latestRoundNote(undefined)).toBeNull();
  });
});

describe('relativeDayLabel', () => {
  it('labels today, yesterday (across a month boundary) and older dates', () => {
    expect(relativeDayLabel('2026-11-05', '2026-11-05')).toBe('Today');
    expect(relativeDayLabel('2026-10-31', '2026-11-01')).toBe('Yesterday');
    expect(relativeDayLabel('2026-11-01', '2026-11-05')).toBe(shortDate('2026-11-01'));
  });
});
