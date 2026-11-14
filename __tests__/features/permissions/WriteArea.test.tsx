import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const auth = vi.hoisted(() => ({ role: 'attending' as string }));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test', email: 't@test', role: auth.role, hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 } }),
}));

import WriteArea from '../../../src/features/permissions/WriteArea';

const onSave = vi.fn();
const Screen = (props: { quiet?: boolean; blockTaps?: boolean }) => (
  <WriteArea permission="pac:write" {...props}>
    <button onClick={onSave}>Mark seen</button>
    <input aria-label="Branch name" />
    <p>Cardiology clearance: pending</p>
  </WriteArea>
);

beforeEach(() => onSave.mockClear());

// Audit SEC-06: a control a role cannot use must not look usable.
describe('<WriteArea />', () => {
  it('leaves everything usable for a role with the permission, with no notice', () => {
    auth.role = 'resident';
    render(<Screen />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark seen' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Branch name')).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('disables every control for a role without the permission and says why', () => {
    auth.role = 'attending';
    render(<Screen />);
    expect(screen.getByRole('button', { name: 'Mark seen' })).toBeDisabled();
    expect(screen.getByLabelText('Branch name')).toBeDisabled();
    // (A browser sends no click to a disabled control. The test DOM does not
    // model that for a disabled <fieldset>, so it is checked in a real browser.)
    expect(screen.getByRole('note')).toHaveTextContent('View only. Your role cannot change this.');
  });

  it('keeps the content readable', () => {
    auth.role = 'attending';
    render(<Screen />);
    expect(screen.getByText('Cardiology clearance: pending')).toBeVisible();
  });

  it('"quiet" drops the notice but still disables the controls', () => {
    auth.role = 'attending';
    render(<Screen quiet />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark seen' })).toBeDisabled();
  });

  it('"blockTaps" also switches off taps on rows that are not real buttons', () => {
    auth.role = 'attending';
    render(<Screen blockTaps />);
    expect(screen.getByRole('group')).toHaveClass('pointer-events-none');
  });
});
